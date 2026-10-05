// Mekan kataloğu (İstanbul): kayıt biçimi, geohash karoları, ad eşleştirme ve arama puanı.
// Katalog Overture Maps verisinden üretilir (scripts/places/build-istanbul.mjs). İstemci ve sunucu ortak kullanır.
import { isVenueKind, type VenueKind } from './metrics';
import { geohash } from './geohash';
import { foldKey } from './text';

export interface CatalogPlace {
    id: string;
    name: string;
    kind: VenueKind;
    lat: number;
    lng: number;
    district: string;
    address: string;
    phone: string;
    web: string;
    /** Overture kategori kodu (ör. "cocktail_bar"). */
    cat: string;
    /** Bilinirlik (0-100): kaynak güveni + iletişim bilgisi. İlçe listelerinde sıralama için. */
    q?: number;
    /** Kullanıcılar "alkol servisi yok / kapandı" bildirdi: önerilmez. */
    hidden?: boolean;
    /** Topluluk kaydı mı (Google aramasıyla eklenmiş, kullanıcı onaylı)? */
    community?: boolean;
    gplace?: string | null;
}

export type CatalogRow = [string, string, string, number, number, string, string, string, string, string, number?];

export interface CatalogFile {
    v: 1;
    city: string;
    release: string;
    generatedAt: string;
    count: number;
    fields: string[];
    rows: CatalogRow[];
}

export const PLACE_ID_RE = /^pl_[0-9A-Za-z]{10}$/;
export const COMMUNITY_ID_RE = /^pc_[\w-]{12}$/;
export const isPlaceId = (v: unknown): v is string => typeof v === 'string' && (PLACE_ID_RE.test(v) || COMMUNITY_ID_RE.test(v));

export function fromRow(r: CatalogRow): CatalogPlace {
    return {
        id: r[0], name: r[1], kind: isVenueKind(r[2]) ? r[2] : 'diger', lat: r[3], lng: r[4],
        district: r[5], address: r[6], phone: r[7], web: r[8], cat: r[9], q: r[10] ?? 50
    };
}

export const toRow = (p: CatalogPlace): CatalogRow => [p.id, p.name, p.kind, p.lat, p.lng, p.district, p.address, p.phone, p.web, p.cat, p.q ?? 50];

/** Bildirim nedenleri: iki farklı hesap aynı nedeni bildirirse mekan önerilerden düşer. */
export const REPORT_REASONS = { no_alcohol: 'Alkol servisi yok', closed: 'Kapandı', wrong: 'Bilgiler yanlış' } as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export const REPORT_HIDE_AT = 2;

// ----- Geohash karoları -----

export { TILE_PRECISION, geohash } from './geohash';
const CELL = { lat: 180 / 2 ** 15, lng: 360 / 2 ** 15 };

/** Bir noktanın çevresindeki (yarıçap metre) karo anahtarları. */
export function tilesAround(lat: number, lng: number, radius: number): string[] {
    const dLat = radius / 111320;
    const dLng = radius / (111320 * Math.cos((lat * Math.PI) / 180));
    const out = new Set<string>();
    for (let y = lat - dLat; y <= lat + dLat + CELL.lat; y += CELL.lat) {
        for (let x = lng - dLng; x <= lng + dLng + CELL.lng; x += CELL.lng) {
            out.add(geohash(Math.min(y, lat + dLat), Math.min(x, lng + dLng)));
        }
    }
    return [...out];
}

export function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// ----- Ad benzerliği ve eşleştirme -----

/** Mekan adlarında ayırt edici olmayan sözcükler. */
const GENERIC = new Set(['bar', 'pub', 'cafe', 'kafe', 'restaurant', 'restoran', 'lokanta', 'lokantasi', 'meyhane', 'meyhanesi', 'the',
    'istanbul', 'kitchen', 'bistro', 'and', 've', 'coffee', 'kahve', 'kahvesi', 'cocktail', 'kokteyl', 'wine', 'sarap', 'beer', 'bira',
    'house', 'evi', 'sube', 'subesi', 'kadikoy', 'besiktas', 'beyoglu', 'taksim', 'moda']);

const tokens = (s: string) => foldKey(s).split(' ').filter(t => t && !GENERIC.has(t));

/** 0..1 arası ad benzerliği ("Karga" ≈ "Karga Bar", "Fahri Konsolos" ≈ "Fahri Konsolos Kadıköy"). */
export function nameSimilarity(a: string, b: string): number {
    const ka = foldKey(a), kb = foldKey(b);
    if (!ka || !kb) return 0;
    if (ka === kb) return 1;
    const ta = tokens(a), tb = tokens(b);
    if (!ta.length || !tb.length) return ka.includes(kb) || kb.includes(ka) ? 0.7 : 0;
    const sa = ta.join(' '), sb = tb.join(' ');
    if (sa === sb) return 0.95;
    const setB = new Set(tb);
    const common = ta.filter(t => setB.has(t)).length;
    const overlap = common / Math.min(ta.length, tb.length);
    if (overlap === 1) return 0.85;
    return overlap * 0.7;
}

/** Ad ve konuma göre katalogdaki karşılığı bulur (yoksa null). */
export function matchPlace<T extends { name: string; lat: number; lng: number }>(
    target: { name: string; lat: number; lng: number }, candidates: readonly T[]
): T | null {
    let best: T | null = null, bestScore = 0;
    for (const c of candidates) {
        const d = meters(target, c);
        if (d > 250) continue;
        const sim = nameSimilarity(target.name, c.name);
        const ok = (sim >= 0.85 && d <= 250) || (sim >= 0.6 && d <= 120);
        if (!ok) continue;
        const score = sim - d / 1000;
        if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
}

// ----- Arama -----

const NIGHT_KINDS = new Set<VenueKind>(['pub', 'bar', 'kokteyl', 'meyhane', 'sarap', 'brewpub']);

export interface SearchIndexEntry { key: string; words: string[]; districtKey: string }

export function indexEntry(p: Pick<CatalogPlace, 'name' | 'district'>): SearchIndexEntry {
    const key = foldKey(p.name);
    return { key, words: key.split(' '), districtKey: foldKey(p.district) };
}

/**
 * Arama puanı (0 = eşleşmedi). Tam ad > ad öneki > kelime öneki > içinde geçme.
 * Çok kelimeli sorguda her kelime ad ya da ilçede kelime öneki olarak geçmeli ("karga kadikoy").
 */
export function searchScore(q: string, qWords: string[], e: SearchIndexEntry): number {
    if (!q) return 0;
    if (e.key === q) return 100;
    if (e.key.startsWith(q)) return 80;
    if (qWords.length === 1) {
        if (e.words.some(w => w.startsWith(q))) return 60;
        if (q.length >= 4 && e.key.includes(q)) return 35;
        return 0;
    }
    const pool = [...e.words, ...e.districtKey.split(' ')];
    if (qWords.every(t => pool.some(w => w.startsWith(t)))) return 55;
    if (e.key.includes(q)) return 40;
    return 0;
}

export function rankBoost(p: Pick<CatalogPlace, 'kind' | 'lat' | 'lng'>, near: { lat: number; lng: number } | null): number {
    let b = NIGHT_KINDS.has(p.kind) ? 8 : p.kind === 'restoran' ? 3 : 0;
    if (near) b -= Math.min(30, (meters(near, p) / 1000) * 2.5);
    return b;
}

export const isNightKind = (k: VenueKind) => NIGHT_KINDS.has(k);

// ----- Dış bağlantılar (anahtarsız Google Maps adresleri) -----

export function mapsSearchUrl(p: { name: string; address?: string; district?: string; area?: string; gplace?: string | null }): string {
    const q = [p.name, p.address, p.district ?? p.area, 'İstanbul'].filter(Boolean).join(', ');
    const u = new URL('https://www.google.com/maps/search/');
    u.searchParams.set('api', '1');
    u.searchParams.set('query', q);
    if (p.gplace) u.searchParams.set('query_place_id', p.gplace);
    return u.toString();
}

export function mapsDirectionsUrl(p: { name: string; address?: string; district?: string; area?: string; gplace?: string | null }): string {
    const q = [p.name, p.address, p.district ?? p.area, 'İstanbul'].filter(Boolean).join(', ');
    const u = new URL('https://www.google.com/maps/dir/');
    u.searchParams.set('api', '1');
    u.searchParams.set('destination', q);
    if (p.gplace) u.searchParams.set('destination_place_id', p.gplace);
    return u.toString();
}

/** Overture kategori kodunun kısa Türkçe karşılığı (mekan sayfasında alt başlık). */
const CAT_TR: Record<string, string> = {
    pub: 'Pub', irish_pub: 'İrlanda pub', gastropub: 'Gastropub', beer_bar: 'Bira barı', beer_garden: 'Bira bahçesi', brewery: 'Bira fabrikası',
    cocktail_bar: 'Kokteyl bar', speakeasy: 'Speakeasy', wine_bar: 'Şarap barı', winery: 'Şarap evi', whiskey_bar: 'Viski barı',
    lounge: 'Lounge', dance_club: 'Gece kulübü', music_venue: 'Canlı müzik', karaoke_venue: 'Karaoke', hookah_bar: 'Nargile kafe',
    seafood_restaurant: 'Balık restoranı', turkish_restaurant: 'Türk mutfağı', steakhouse: 'Et restoranı', doner_kebab_restaurant: 'Döner / kebap',
    barbecue_restaurant: 'Mangal / ızgara', pizza_restaurant: 'Pizza', burger_restaurant: 'Burger', italian_restaurant: 'İtalyan',
    mediterranean_restaurant: 'Akdeniz mutfağı', breakfast_and_brunch_restaurant: 'Kahvaltı', sushi_restaurant: 'Suşi', asian_restaurant: 'Asya mutfağı',
    coffee_shop: 'Kahveci', cafe: 'Kafe', fast_food_restaurant: 'Hızlı yemek', chicken_restaurant: 'Tavuk', soup_restaurant: 'Çorbacı',
    middle_eastern_restaurant: 'Orta Doğu mutfağı', greek_restaurant: 'Yunan mutfağı', vegetarian_restaurant: 'Vejetaryen', diner: 'Lokanta'
};
export const catLabel = (cat: string | null | undefined) => (cat && CAT_TR[cat]) || '';
