// Mekan kataloğu istemcisi: statik karolardan yakındakiler, sunucudan adla arama, mekan bilgisi.
// Konum sunucuya gönderilmez; karolar adresten seçilir, aramada konum ~1 km'ye yuvarlanır.
import { inIstanbul } from '../../shared/istanbul';
import { venueKindLabel } from '../../shared/metrics';
import { catLabel, fromRow, meters, tilesAround, type CatalogPlace, type CatalogRow } from '../../shared/places';
import { request } from './api';
import type { LatLng, Place } from './geo';

const tileCache = new Map<string, Promise<CatalogPlace[]>>();

// Kullanıcı bildirimiyle gizlenen mekanlar (alkol servisi yok / kapandı): önerilerde gösterilmez
let hiddenIds: Promise<Set<string>> | null = null;
export function hiddenPlaces(): Promise<Set<string>> {
    hiddenIds ??= request<{ ids: string[] }>('GET', '/api/places/hidden', { timeout: 6000 })
        .then(r => new Set(r.ids))
        .catch(() => { hiddenIds = null; return new Set<string>(); });
    return hiddenIds;
}
export const forgetHidden = () => { hiddenIds = null; };

function loadTile(key: string): Promise<CatalogPlace[]> {
    let p = tileCache.get(key);
    if (!p) {
        p = fetch(`/places/ist/${key}.json`)
            .then(r => (r.ok ? r.json() : { rows: [] }))
            .then((d: { rows?: CatalogRow[] }) => (d.rows ?? []).map(fromRow))
            .catch(() => { tileCache.delete(key); return [] as CatalogPlace[]; });
        tileCache.set(key, p);
    }
    return p;
}

/** Bir noktanın çevresindeki katalog mekanları (mesafeye göre sıralı). */
export async function catalogAround(pos: LatLng, radius = 800): Promise<(CatalogPlace & { distance: number })[]> {
    if (!inIstanbul(pos.lat, pos.lng)) return [];
    const [tiles, hidden] = await Promise.all([Promise.all(tilesAround(pos.lat, pos.lng, radius).map(loadTile)), hiddenPlaces()]);
    const out: (CatalogPlace & { distance: number })[] = [];
    for (const list of tiles) for (const p of list) {
        if (hidden.has(p.id)) continue;
        const d = meters(pos, p);
        if (d <= radius) out.push({ ...p, distance: d });
    }
    return out.sort((a, b) => a.distance - b.distance);
}

/** Katalogda adla arama (sunucu). */
export async function searchCatalog(q: string, near?: LatLng | null, signal?: AbortSignal): Promise<CatalogPlace[]> {
    const params = new URLSearchParams({ q });
    if (near && inIstanbul(near.lat, near.lng)) {
        params.set('lat', near.lat.toFixed(2));
        params.set('lng', near.lng.toFixed(2));
    }
    const r = await request<{ results: CatalogPlace[] }>('GET', `/api/places/search?${params}`, { signal, timeout: 8000 });
    return r?.results ?? [];
}

export const placeCache = new Map<string, CatalogPlace>();

export async function getPlace(id: string): Promise<CatalogPlace | null> {
    if (placeCache.has(id)) return placeCache.get(id)!;
    try {
        const r = await request<{ place: CatalogPlace }>('GET', `/api/places/${encodeURIComponent(id)}`);
        placeCache.set(id, r.place);
        return r.place;
    } catch { return null; }
}

/** Bir ilçedeki mekanlar (bilinirliğe göre sıralı, sayfalı). */
export async function browsePlaces(district: string, kinds: string[], offset = 0, limit = 40): Promise<{ total: number; places: CatalogPlace[] }> {
    const params = new URLSearchParams({ district, offset: String(offset), limit: String(limit) });
    if (kinds.length) params.set('kinds', kinds.join(','));
    return request('GET', `/api/places/browse?${params}`, { timeout: 10000 });
}

let meta: Promise<{ count: number; districts: Record<string, number> }> | null = null;
/** Katalog özeti: toplam ve ilçe başına mekan sayısı (statik dosya). */
export function catalogMeta() {
    meta ??= fetch('/places/ist/meta.json').then(r => r.json()).catch(() => { meta = null; return { count: 0, districts: {} }; });
    return meta;
}

export async function reportPlace(id: string, reason: 'no_alcohol' | 'closed' | 'wrong') {
    const r = await request<{ ok: boolean; hidden?: boolean; already?: boolean }>('POST', `/api/places/${encodeURIComponent(id)}/report`, { body: { reason } });
    placeCache.delete(id);
    if (r.hidden) forgetHidden();
    return r;
}

/** Katalog kaydını mekan seçicinin satır biçimine çevirir. */
export function toPlace(p: CatalogPlace, pos?: LatLng | null): Place {
    return {
        name: p.name, area: p.district, address: p.address, lat: p.lat, lng: p.lng, osm: null,
        kind: '', venueKind: p.kind, placeId: p.id,
        label: catLabel(p.cat) || venueKindLabel(p.kind),
        distance: pos ? meters(pos, p) : undefined
    };
}
