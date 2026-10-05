// Mekan kataloğu API'si: adla arama, mekan bilgisi, topluluk mekanları ve Google ile yedek arama.
// Katalog dosyası bu fonksiyona gömülüdür (ana API fonksiyonu ağırlaşmasın diye ayrı fonksiyon).
import { districtFromText, inIstanbul, nearestDistrict } from '../shared/istanbul';
import { isVenueKind } from '../shared/metrics';
import {
    fromRow, indexEntry, isPlaceId, matchPlace, meters, rankBoost, searchScore,
    type CatalogFile, type CatalogPlace, type SearchIndexEntry
} from '../shared/places';
import { cleanLine, foldKey } from '../shared/text';
import { COMMUNITY_KEY, type CommunityDoc } from './community';
import { HttpError, fail, json, readJSON, sleep } from './http';
import type { Identity } from './identity';
import type { KV } from './kv';

export interface PlacesCtx {
    /** Topluluk mekanlarını döndürür (kullanıcıların eklediği, katalogda olmayan mekanlar). */
    community: () => Promise<CatalogPlace[]>;
    /** Topluluk mekanı eklemek için (yoksa ekleme kapalı). */
    kv?: KV;
    identity?: Identity;
    now?: () => number;
}

/** Bir hesabın 24 saatte ekleyebileceği topluluk mekanı. */
const COMMUNITY_DAILY = 10;

interface Indexed { places: CatalogPlace[]; index: SearchIndexEntry[]; byId: Map<string, CatalogPlace> }

export function buildIndex(catalog: CatalogFile): Indexed {
    const places = catalog.rows.map(fromRow);
    return { places, index: places.map(indexEntry), byId: new Map(places.map(p => [p.id, p])) };
}

const num = (v: string | null) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** Sorguya en uygun mekanlar (puan + tür + yakınlık). */
export function searchPlaces(idx: Indexed, extra: CatalogPlace[], qRaw: string, near: { lat: number; lng: number } | null, limit = 15): CatalogPlace[] {
    const q = foldKey(qRaw);
    if (q.length < 2) return [];
    const words = q.split(' ');
    const hits: { p: CatalogPlace; s: number }[] = [];
    const consider = (p: CatalogPlace, e: SearchIndexEntry) => {
        const s = searchScore(q, words, e);
        if (s > 0) hits.push({ p, s: s + rankBoost(p, near) });
    };
    for (let i = 0; i < idx.places.length; i++) consider(idx.places[i], idx.index[i]);
    for (const p of extra) consider(p, indexEntry(p));
    hits.sort((a, b) => b.s - a.s);
    return hits.slice(0, limit).map(h => h.p);
}

export function createPlacesApp(catalog: CatalogFile, ctx: PlacesCtx) {
    let idx: Indexed | null = null;
    const index = () => (idx ??= buildIndex(catalog));
    const now = ctx.now ?? Date.now;

    /**
     * Katalogda olmayan mekanı topluluk listesine ekler. Konum kullanıcının cihazından gelir.
     * Yakında aynı adlı bir katalog ya da topluluk mekanı varsa yenisi açılmaz, o döner.
     */
    async function addCommunity(req: Request): Promise<Response> {
        if (!ctx.kv || !ctx.identity) throw new HttpError(404, 'Bulunamadı');
        const user = await ctx.identity.user(req);
        if (!user) throw new HttpError(401, 'Önce giriş yap', { code: 'login_required' });
        const b = await readJSON(req);
        const name = cleanLine(b.name, 80);
        const lat = Number(b.lat), lng = Number(b.lng);
        if (name.length < 2) throw new HttpError(400, 'Mekan adı gerekli');
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inIstanbul(lat, lng)) throw new HttpError(400, 'Topluluk mekanları şimdilik yalnızca İstanbul için');
        const kind = isVenueKind(b.kind) ? b.kind : 'diger';
        const target = { name, lat, lng };
        const near = index().places.filter(p => Math.abs(p.lat - lat) < 0.003 && Math.abs(p.lng - lng) < 0.004);
        const hit = matchPlace(target, near);
        if (hit) return json({ place: hit, existing: true });
        const district = districtFromText(cleanLine(b.district, 40)) ?? nearestDistrict(lat, lng);
        for (let i = 0; i < 6; i++) {
            const e = await ctx.kv.getJSON<CommunityDoc>(COMMUNITY_KEY);
            const doc: CommunityDoc = e?.data ?? { v: 1, places: [] };
            const same = matchPlace(target, doc.places.filter(p => !p.hidden && meters(p, target) < 250));
            if (same) { const { createdAt, createdBy, hidden, ...p } = same; return json({ place: { ...p, community: true }, existing: true }); }
            const t = now();
            const mine = doc.places.filter(p => p.createdBy === user.id && t - p.createdAt < 86_400_000).length;
            if (mine >= COMMUNITY_DAILY) throw new HttpError(429, 'Bugün yeterince mekan ekledin; yarın tekrar dene');
            if (doc.places.length >= 20_000) throw new HttpError(507, 'Topluluk listesi dolu');
            const place: CatalogPlace = {
                id: 'pc_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12), name, kind,
                lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5,
                district: district.name, address: cleanLine(b.address, 90), phone: '', web: '', cat: '', community: true
            };
            doc.places.push({ ...place, createdAt: t, createdBy: user.id });
            const w = await ctx.kv.setJSON(COMMUNITY_KEY, doc, e ? { onlyIfMatch: e.etag } : { onlyIfNew: true });
            if (w.modified) return json({ place, existing: false }, 201);
            await sleep(20 + Math.random() * 60);
        }
        throw new HttpError(503, 'Şu an çok yoğun, tekrar dene');
    }

    return async function handle(req: Request): Promise<Response> {
        const url = new URL(req.url);
        const path = url.pathname.replace(/\/$/, '');
        try {
            if (req.method === 'GET' && path === '/api/places/search') {
                const lat = num(url.searchParams.get('lat')), lng = num(url.searchParams.get('lng'));
                const near = lat != null && lng != null ? { lat, lng } : null;
                const q = (url.searchParams.get('q') ?? '').slice(0, 80);
                const results = searchPlaces(index(), await ctx.community(), q, near);
                return json({ results }, 200, { 'cache-control': 'public, max-age=300' });
            }
            if (req.method === 'POST' && path === '/api/places/community') return await addCommunity(req);
            if (req.method === 'GET' && path === '/api/places/community') {
                return json({ places: await ctx.community() }, 200, { 'cache-control': 'public, max-age=120' });
            }
            if (req.method === 'GET' && path === '/api/places/meta') {
                return json({ city: catalog.city, release: catalog.release, generatedAt: catalog.generatedAt, count: catalog.count }, 200, { 'cache-control': 'public, max-age=3600' });
            }
            const m = /^\/api\/places\/([\w-]+)$/.exec(path);
            if (req.method === 'GET' && m) {
                if (!isPlaceId(m[1])) throw new HttpError(404, 'Mekan bulunamadı');
                const p = index().byId.get(m[1]) ?? (await ctx.community()).find(x => x.id === m[1]);
                if (!p) throw new HttpError(404, 'Mekan bulunamadı');
                return json({ place: p }, 200, { 'cache-control': 'public, max-age=3600' });
            }
            return fail(404, 'Bulunamadı');
        } catch (e) {
            if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
            console.error('Mekan API hatası', req.method, path, e);
            return fail(500, 'Sunucu hatası, birazdan tekrar dene');
        }
    };
}
