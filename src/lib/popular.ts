// Popüler mekanlar: sunucudaki anonim listeyi çeker, cihazda saklar (çevrimdışı açılış), istemcide filtreler.
// Konum sunucuya gönderilmez: mesafe ve semt filtresi burada uygulanır.
import { signal } from '@preact/signals';
import type { PopularDoc, PopularItem } from '../../server/popular';
import { request } from './api';
import { idb } from './storage';

export type { PopularDoc, PopularItem };
export type Window = 'day' | 'week' | 'month';

export const popular = signal<PopularDoc | null>(null);
let fetchedAt = 0;
let inflight: Promise<void> | null = null;

export function loadPopular(force = false): Promise<void> {
    if (!force && Date.now() - fetchedAt < 120_000 && popular.value) return Promise.resolve();
    inflight ??= (async () => {
        if (!popular.value) popular.value = (await idb.get<PopularDoc>('popular')) ?? null;
        try {
            const d = await request<PopularDoc>('GET', '/api/popular', { timeout: 10000 });
            popular.value = d;
            fetchedAt = Date.now();
            void idb.set('popular', d);
        } catch { /* çevrimdışı: kopyayla devam */ } finally { inflight = null; }
    })();
    return inflight;
}

/** Bir mekanın topluluk istatistiği (yoksa null). */
export function placeStats(id: string) {
    const d = popular.value;
    if (!d) return null;
    const find = (w: Window) => d.windows[w].find(x => x.id === id) ?? null;
    const s = { day: find('day'), week: find('week'), month: find('month'), score: d.scores[id] ?? null };
    return s.day || s.week || s.month || s.score ? s : null;
}
