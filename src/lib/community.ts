// Topluluk: diğer ekiplerin puanları (akış, sıralama, mekan) ve ekibe özel öneriler.
// Son akış ve sıralama cihazda saklanır (çevrimdışı açılışta boş kalmasın).
import { signal } from '@preact/signals';
import type { PublicFeed, PublicPlaceView, PublicRankItem, PublicVisit, Recommendations } from '../../shared/public';
import type { Membership } from '../state/session';
import { crewAuth } from '../state/session';
import { request } from './api';
import { idb } from './storage';

export type { PublicPlaceView, PublicRankItem, PublicVisit, Recommendations };

const FRESH = 60_000;

export const communityFeed = signal<{ items: PublicVisit[]; next: number | null } | null>(null);
export const communityRanking = signal<PublicRankItem[] | null>(null);
export const communityError = signal<string | null>(null);

let feedAt = 0, rankAt = 0;
let feedReq: Promise<void> | null = null, rankReq: Promise<void> | null = null;

export function loadFeed(force = false): Promise<void> {
    if (!force && communityFeed.value && Date.now() - feedAt < FRESH) return Promise.resolve();
    feedReq ??= (async () => {
        if (!communityFeed.value) communityFeed.value = (await idb.get<PublicFeed>('community-feed')) ?? null;
        try {
            const d = await request<PublicFeed>('GET', '/api/community/feed?limit=40', { timeout: 12000 });
            communityFeed.value = d;
            communityError.value = null;
            feedAt = Date.now();
            void idb.set('community-feed', d);
        } catch (e) {
            communityError.value = e instanceof Error ? e.message : 'Yüklenemedi';
        } finally { feedReq = null; }
    })();
    return feedReq;
}

export async function loadMoreFeed(): Promise<void> {
    const cur = communityFeed.value;
    if (!cur || cur.next == null || feedReq) return;
    feedReq = (async () => {
        try {
            const d = await request<PublicFeed>('GET', `/api/community/feed?limit=40&offset=${cur.next}`, { timeout: 12000 });
            const seen = new Set(cur.items.map(x => x.id));
            communityFeed.value = { items: [...cur.items, ...d.items.filter(x => !seen.has(x.id))], next: d.next };
        } finally { feedReq = null; }
    })();
    return feedReq;
}

export function loadRanking(force = false): Promise<void> {
    if (!force && communityRanking.value && Date.now() - rankAt < FRESH) return Promise.resolve();
    rankReq ??= (async () => {
        if (!communityRanking.value) communityRanking.value = (await idb.get<PublicRankItem[]>('community-ranking')) ?? null;
        try {
            const d = await request<{ items: PublicRankItem[] }>('GET', '/api/community/ranking', { timeout: 12000 });
            communityRanking.value = d.items;
            communityError.value = null;
            rankAt = Date.now();
            void idb.set('community-ranking', d.items);
        } catch (e) {
            communityError.value = e instanceof Error ? e.message : 'Yüklenemedi';
        } finally { rankReq = null; }
    })();
    return rankReq;
}

export const getPlaceView = (placeId: string) =>
    request<PublicPlaceView>('GET', `/api/community/places/${encodeURIComponent(placeId)}`, { timeout: 12000 });

export const getRecommendations = (m: Membership) =>
    request<Recommendations>('GET', '/api/crew/recommendations', { ...crewAuth(m), timeout: 15000 });
