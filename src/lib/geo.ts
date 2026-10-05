// Konum ve mekan arama (İstanbul dışı ya da katalogda olmayan mekanlar için yedek): yakındaki mekanlar
// OpenStreetMap/Overpass'tan, adla arama Photon'dan (anahtarsız, ücretsiz). İstanbul'da önce kendi kataloğumuz
// kullanılır (src/lib/places.ts). İstekler yalnızca kullanıcı istediğinde atılır.
import { isAlcoholOsm } from '../../shared/alcohol';
import type { VenueKind } from '../../shared/metrics';

export interface Place {
    name: string;
    area: string;
    address: string;
    lat: number;
    lng: number;
    osm: string | null;
    /** OSM amenity değeri (katalog kayıtlarında boş). */
    kind: string;
    distance?: number;
    /** Katalog kaydı ise: mekan türü, katalog kimliği ve gösterilecek kategori adı. */
    venueKind?: VenueKind;
    placeId?: string | null;
    label?: string;
}

export interface LatLng { lat: number; lng: number }

const KIND_LABEL: Record<string, string> = {
    pub: 'Pub', bar: 'Bar', biergarten: 'Bira bahçesi', restaurant: 'Restoran', cafe: 'Kafe', nightclub: 'Gece kulübü',
    brewery: 'Bira fabrikası', fast_food: 'Hızlı yemek'
};
export const kindLabel = (k: string) => KIND_LABEL[k] ?? '';
const KIND_RANK: Record<string, number> = { pub: 0, bar: 0, biergarten: 0, brewery: 1, nightclub: 2, restaurant: 3, cafe: 4 };

let lastPos: LatLng | null = null;
export const lastPosition = () => lastPos;

export function getPosition(timeout = 10000): Promise<LatLng> {
    return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) { reject(new Error('Bu cihaz konum desteklemiyor')); return; }
        navigator.geolocation.getCurrentPosition(
            p => { lastPos = { lat: p.coords.latitude, lng: p.coords.longitude }; resolve(lastPos); },
            e => reject(new Error(e.code === 1 ? 'Konum izni verilmedi' : 'Konum alınamadı')),
            { enableHighAccuracy: true, timeout, maximumAge: 60000 }
        );
    });
}

export function distance(a: LatLng, b: LatLng): number {
    const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

async function fetchJSON(url: string, init?: RequestInit, ms = 12000): Promise<any> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        const r = await fetch(url, { ...init, signal: ctrl.signal });
        if (!r.ok) throw new Error(String(r.status));
        return await r.json();
    } finally { clearTimeout(t); }
}

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

export async function nearby(pos: LatLng, radius = 700): Promise<Place[]> {
    // Yalnızca içki mekanları (restoranlar adında meyhane / bar vb. geçiyorsa aşağıda süzülür)
    const q = `[out:json][timeout:12];(` +
        `node(around:${radius},${pos.lat},${pos.lng})[amenity~"^(pub|bar|biergarten|restaurant|nightclub)$"][name];` +
        `way(around:${radius},${pos.lat},${pos.lng})[amenity~"^(pub|bar|biergarten|restaurant|nightclub)$"][name];` +
        `node(around:${radius},${pos.lat},${pos.lng})[craft=brewery][name];` +
        `);out center 80;`;
    let data: any = null;
    for (const url of OVERPASS) {
        try { data = await fetchJSON(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded' } }); break; } catch { /* sonraki sunucu */ }
    }
    if (!data) throw new Error('Yakındaki mekanlar alınamadı');
    const area = await reverseArea(pos).catch(() => '');
    const out: Place[] = [];
    for (const el of data.elements ?? []) {
        const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
        const t = el.tags ?? {};
        if (lat == null || !t.name) continue;
        const kind = t.amenity ?? (t.craft === 'brewery' ? 'brewery' : '');
        if (!isAlcoholOsm(kind, t.name)) continue;
        out.push({
            name: t.name, kind, lat, lng, osm: `${el.type}/${el.id}`,
            area: t['addr:suburb'] || t['addr:district'] || area || t['addr:city'] || '',
            address: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '),
            distance: distance(pos, { lat, lng })
        });
    }
    // Yakınlık esas; pub/bar türleri restoran ve kafelerin önüne çıksın diye türe göre metre cezası
    const rank = (p: Place) => p.distance! + (KIND_RANK[p.kind] ?? 5) * 150;
    return out.sort((a, b) => rank(a) - rank(b)).slice(0, 40);
}

function photonArea(p: Record<string, string>): string {
    return p.county || p.district || p.city || p.state || '';
}

export async function reverseArea(pos: LatLng): Promise<string> {
    const d = await fetchJSON(`https://photon.komoot.io/reverse?lat=${pos.lat}&lon=${pos.lng}&limit=1`);
    return photonArea(d.features?.[0]?.properties ?? {});
}

/** Yazarken arama (Photon). Yanıt 6 sn içinde gelmezse hata verir; arayüz yedek aramaya geçer. */
export async function searchPlaces(q: string, near?: LatLng | null, signal?: AbortSignal): Promise<Place[]> {
    const params = new URLSearchParams({ q, limit: '10' });
    if (near) { params.set('lat', String(near.lat)); params.set('lon', String(near.lng)); }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    signal?.addEventListener('abort', () => ctrl.abort());
    let d: any;
    try {
        const r = await fetch(`https://photon.komoot.io/api/?${params.toString().replace(/\+/g, '%20')}`, { signal: ctrl.signal });
        if (!r.ok) throw new Error('Arama yapılamadı');
        d = await r.json();
    } finally { clearTimeout(timer); }
    const types: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };
    return (d.features ?? []).filter((f: any) => f.properties?.name && isAlcoholOsm(f.properties.osm_key === 'amenity' || f.properties.osm_key === 'craft' ? f.properties.osm_value : '', f.properties.name)).map((f: any): Place => {
        const p = f.properties;
        const [lng, lat] = f.geometry.coordinates;
        return {
            name: p.name, lat, lng,
            osm: types[p.osm_type] && p.osm_id ? `${types[p.osm_type]}/${p.osm_id}` : null,
            kind: p.osm_key === 'amenity' ? p.osm_value : p.osm_value === 'brewery' ? 'brewery' : '',
            area: photonArea(p),
            address: [p.street, p.housenumber].filter(Boolean).join(' '),
            distance: near ? distance(near, { lat, lng }) : undefined
        };
    });
}

/**
 * Yedek arama (OpenStreetMap Nominatim). Kullanım kuralları gereği yalnızca kullanıcı "Ara"ya basınca
 * çağrılır; yazarken otomatik tamamlama için kullanılmaz.
 */
export async function searchNominatim(q: string, near?: LatLng | null): Promise<Place[]> {
    const params = new URLSearchParams({ format: 'jsonv2', q, limit: '10', addressdetails: '1', 'accept-language': 'tr' });
    if (near) {
        const d = 0.25;
        params.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
    }
    const res = await fetchJSON(`https://nominatim.openstreetmap.org/search?${params.toString().replace(/\+/g, '%20')}`, undefined, 10000);
    return (res as any[]).filter(x => x.name && isAlcoholOsm(x.category === 'amenity' || x.category === 'craft' ? x.type : '', x.name)).map((x): Place => {
        const a = x.address ?? {};
        const lat = Number(x.lat), lng = Number(x.lon);
        return {
            name: x.name, lat, lng,
            osm: x.osm_type && x.osm_id ? `${x.osm_type}/${x.osm_id}` : null,
            kind: x.category === 'amenity' ? x.type : x.category === 'craft' && x.type === 'brewery' ? 'brewery' : '',
            area: a.city_district || a.town || a.county || a.suburb || a.city || '',
            address: [a.road, a.house_number].filter(Boolean).join(' '),
            distance: near ? distance(near, { lat, lng }) : undefined
        };
    });
}
