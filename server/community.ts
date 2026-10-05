// Topluluk mekanları: katalogda olmayan, kullanıcıların eklediği mekanlar (tek belge, ETag ile güncellenir).
import type { CatalogPlace } from '../shared/places';
import type { KV } from './kv';

export const COMMUNITY_KEY = 'places/community';

export interface CommunityDoc {
    v: 1;
    places: (CatalogPlace & { createdAt: number; createdBy: string; hidden?: boolean })[];
}

/** Topluluk mekanlarını okur; sıcak fonksiyonda 60 sn önbellekte tutar. */
export function communityLoader(kv: KV, ttl = 60_000) {
    let cache: { at: number; places: CatalogPlace[] } | null = null;
    return async (): Promise<CatalogPlace[]> => {
        if (cache && Date.now() - cache.at < ttl) return cache.places;
        const e = await kv.getJSON<CommunityDoc>(COMMUNITY_KEY).catch(() => null);
        const places = (e?.data.places ?? []).filter(p => !p.hidden).map(({ createdAt, createdBy, hidden, ...p }) => ({ ...p, community: true }));
        cache = { at: Date.now(), places };
        return places;
    };
}
