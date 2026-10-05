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

// ----- Kullanıcı bildirimleri ("alkol servisi yok", "kapandı") -----

export const REPORTS_KEY = 'places/reports';

export interface ReportsDoc {
    v: 1;
    /** mekan → neden → bildiren hesapların özetleri */
    places: Record<string, Partial<Record<string, string[]>>>;
}

/** Önerilmeyecek mekanlar: herhangi bir nedeni en az `at` farklı hesap bildirmiş. */
export function hiddenFrom(doc: ReportsDoc | null | undefined, at: number): Set<string> {
    const out = new Set<string>();
    for (const [id, reasons] of Object.entries(doc?.places ?? {})) {
        if (Object.values(reasons).some(list => (list?.length ?? 0) >= at)) out.add(id);
    }
    return out;
}

/** Gizlenen mekanları okur; sıcak fonksiyonda 60 sn önbellekte tutar. */
export function hiddenLoader(kv: KV, at: number, ttl = 60_000) {
    let cache: { at: number; ids: Set<string> } | null = null;
    const load = async (): Promise<Set<string>> => {
        if (cache && Date.now() - cache.at < ttl) return cache.ids;
        const e = await kv.getJSON<ReportsDoc>(REPORTS_KEY).catch(() => null);
        cache = { at: Date.now(), ids: hiddenFrom(e?.data, at) };
        return cache.ids;
    };
    load.reset = () => { cache = null; };
    return load;
}
