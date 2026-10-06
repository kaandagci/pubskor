// Topluluk akışı, sıralaması ve öneriler: ekiplerin kataloğa bağlı mekanlardaki ziyaret skorları.
//
// Depolama: public/visits → { crews: { <grup>: { name|null, alias } }, visits: [{ id, g, p, s, d, t }] }
//   g: ekip kimliğinin gizli tuzla HMAC'i (ekip kimliği dışarı çıkmaz), p: mekan (pl_/pc_), s: genel skor,
//   d: ziyaret günü, t: kaydın oluşturulma zamanı (yalnızca gecikme ve sıralama için; dışarı verilmez).
// Kişi adı, puan kağıdı, not, fotoğraf, içki ya da harcama bilgisi bu belgeye hiç yazılmaz.
// Ekip belgesi tek doğruluk kaynağıdır: her değişiklikte ekibin tüm kayıtları baştan üretilir (idempotent).
import { createHmac } from 'node:crypto';
import { REPORT_HIDE_AT, isPlaceId } from '../shared/places';
import {
    PUBLIC_DELAY_MS, aliasFor, publicModeOf, publicNameOk,
    type PublicCrew, type PublicFeed, type PublicPlaceInfo, type PublicPlaceView, type PublicRankItem, type Recommendation, type Recommendations
} from '../shared/public';
import { round1 } from '../shared/text';
import { communityLoader, hiddenLoader } from './community';
import type { CrewDoc, Ctx } from './crew';
import { sleep } from './http';
import type { KV } from './kv';
import { loadUser } from './users';

export const PUBLIC_KEY = 'public/visits';
const MAX_ENTRIES = 20_000;

interface Entry { id: string; g: string; p: string; s: number; d: string; t: number }
interface CrewInfo { name: string | null; alias: string }
export interface PublicDoc {
    v: 1;
    updatedAt: number;
    /** Tüm ekiplerden ilk toplu üretim yapıldı mı (eski ziyaretler dahil). */
    built?: number;
    crews: Record<string, CrewInfo>;
    visits: Entry[];
}

type CrewSource = Pick<CrewDoc, 'id' | 'name' | 'venues' | 'visits' | 'publicMode' | 'shareStats'>;

const hmac = (salt: string, s: string, n: number) => createHmac('sha256', salt).update(s).digest('base64url').slice(0, n);
export const crewGroup = (salt: string, crewId: string) => hmac(salt, 'pub:' + crewId, 12);
const newestFirst = (a: Entry, b: Entry) => b.d.localeCompare(a.d) || b.t - a.t;
const empty = (): PublicDoc => ({ v: 1, updatedAt: 0, crews: {}, visits: [] });

/** Ekip belgesinden herkese açık kayıtları üretir; ekip topluluğa kapalıysa boş. */
export function crewEntries(salt: string, crew: CrewSource): { g: string; info: CrewInfo | null; entries: Entry[] } {
    const g = crewGroup(salt, crew.id);
    const mode = publicModeOf(crew);
    if (mode === 'off') return { g, info: null, entries: [] };
    const placeOf = new Map(crew.venues.map(v => [v.id, v.placeId]));
    const entries: Entry[] = [];
    for (const v of crew.visits) {
        if (v.deletedAt || v.score == null) continue;
        const p = placeOf.get(v.venueId);
        if (!isPlaceId(p)) continue; // elle eklenen (kataloğa bağlı olmayan) yerler hiçbir zaman paylaşılmaz
        entries.push({ id: hmac(salt, `v:${crew.id}:${v.id}`, 14), g, p, s: round1(v.score), d: v.date, t: v.createdAt });
    }
    return { g, info: { name: mode === 'named' && publicNameOk(crew.name) ? crew.name : null, alias: aliasFor(crew.id) }, entries };
}

async function mutatePublic(kv: KV, fn: (d: PublicDoc) => boolean) {
    for (let i = 0; i < 8; i++) {
        const e = await kv.getJSON<PublicDoc>(PUBLIC_KEY);
        const doc = e?.data ?? empty();
        if (!fn(doc)) return;
        const w = await kv.setJSON(PUBLIC_KEY, doc, e ? { onlyIfMatch: e.etag } : { onlyIfNew: true });
        if (w.modified) { docCache.delete(kv); return; }
        await sleep(10 + Math.random() * 50 * (i + 1));
    }
    throw new Error('Topluluk akışı yoğunluk nedeniyle güncellenemedi');
}

const sameSet = (a: Entry[], b: Entry[]) => {
    const key = (l: Entry[]) => JSON.stringify([...l].sort((x, y) => (x.id < y.id ? -1 : 1)).map(e => [e.id, e.p, e.s, e.d, e.t]));
    return a.length === b.length && key(a) === key(b);
};

/** Ekibin herkese açık kayıtlarını ekip belgesiyle eşitler. Hata, asıl isteği bozmasın diye yutulur. */
export async function publishCrew(ctx: Ctx, crew: CrewSource) {
    try {
        const { g, info, entries } = crewEntries(ctx.statsSalt, crew);
        await mutatePublic(ctx.kv, doc => {
            const mine = doc.visits.filter(e => e.g === g);
            if (sameSet(mine, entries) && JSON.stringify(doc.crews[g] ?? null) === JSON.stringify(info)) return false;
            doc.visits = [...doc.visits.filter(e => e.g !== g), ...entries].sort(newestFirst).slice(0, MAX_ENTRIES);
            if (info) doc.crews[g] = info; else delete doc.crews[g];
            doc.updatedAt = ctx.now();
            return true;
        });
    } catch (e) { console.error('Topluluk akışı eşitlenemedi', e); }
}

/** Ekip silinince ya da topluluğa kapatılınca tüm kayıtlarını kaldırır. */
export const unpublishCrew = (ctx: Ctx, crew: CrewSource) => publishCrew(ctx, { ...crew, publicMode: 'off' });

/**
 * İlk açılışta (ya da belge hiç yokken) tüm ekiplerden akışı baştan üretir: özellik gelmeden önce yapılmış
 * puanlar da görünsün. Sonraki değişiklikler ekip bazında eşitlenir.
 */
async function buildAll(ctx: Ctx) {
    const keys = await ctx.kv.list('crew/');
    const parts: ReturnType<typeof crewEntries>[] = [];
    for (let i = 0; i < keys.length; i += 20) {
        const docs = await Promise.all(keys.slice(i, i + 20).map(k => ctx.kv.getJSON<CrewDoc>(k).catch(() => null)));
        for (const e of docs) if (e?.data?.id) parts.push(crewEntries(ctx.statsSalt, e.data));
    }
    await mutatePublic(ctx.kv, doc => {
        if (doc.built) return false;
        const crews: PublicDoc['crews'] = {};
        for (const p of parts) if (p.info) crews[p.g] = p.info;
        doc.crews = crews;
        doc.visits = parts.flatMap(p => p.entries).sort(newestFirst).slice(0, MAX_ENTRIES);
        doc.built = doc.updatedAt = ctx.now();
        return true;
    });
}

// ----- Okuma -----

const docCache = new WeakMap<KV, { at: number; doc: PublicDoc }>();
const building = new WeakMap<KV, Promise<void>>();

async function readDoc(ctx: Ctx): Promise<PublicDoc> {
    const c = docCache.get(ctx.kv);
    if (c && Date.now() - c.at < 15_000) return c.doc;
    let doc = (await ctx.kv.getJSON<PublicDoc>(PUBLIC_KEY))?.data ?? null;
    if (!doc?.built) {
        let p = building.get(ctx.kv);
        if (!p) { p = buildAll(ctx).finally(() => building.delete(ctx.kv)); building.set(ctx.kv, p); }
        await p.catch(e => console.error('Topluluk akışı üretilemedi', e));
        doc = (await ctx.kv.getJSON<PublicDoc>(PUBLIC_KEY))?.data ?? empty();
    }
    docCache.set(ctx.kv, { at: Date.now(), doc });
    return doc;
}

const loaders = new WeakMap<KV, { community: ReturnType<typeof communityLoader>; hidden: ReturnType<typeof hiddenLoader> }>();

/** Mekan bilgisi katalogdan (ya da topluluk mekanlarından) gelir; ekiplerin verdiği adlar dışarı çıkmaz. */
async function placeResolver(ctx: Ctx): Promise<(id: string) => PublicPlaceInfo | null> {
    let l = loaders.get(ctx.kv);
    if (!l) { l = { community: communityLoader(ctx.kv), hidden: hiddenLoader(ctx.kv, REPORT_HIDE_AT) }; loaders.set(ctx.kv, l); }
    const [community, hidden] = await Promise.all([l.community(), l.hidden()]);
    const byId = new Map(community.map(p => [p.id, p]));
    const cache = new Map<string, PublicPlaceInfo | null>();
    return id => {
        if (cache.has(id)) return cache.get(id)!;
        const p = hidden.has(id) ? null : ctx.placeLookup?.(id) ?? byId.get(id) ?? null;
        const out = p ? { placeId: p.id, name: p.name, kind: p.kind, district: p.district, lat: p.lat, lng: p.lng } : null;
        cache.set(id, out);
        return out;
    };
}

/** İsteği yapan hesabın ekipleri (kendi puanlarını gecikmesiz görür ve "sizin ekip" olarak işaretlenir). */
async function viewerGroups(ctx: Ctx, req: Request): Promise<Set<string>> {
    const user = await ctx.identity.user(req).catch(() => null);
    if (!user) return new Set();
    const u = await loadUser(ctx, user.id).catch(() => null);
    return new Set((u?.data.crews ?? []).map(c => crewGroup(ctx.statsSalt, c.crewId)));
}

async function visibleView(ctx: Ctx, req: Request) {
    const [doc, resolve, mine] = await Promise.all([readDoc(ctx), placeResolver(ctx), viewerGroups(ctx, req)]);
    const now = ctx.now();
    const visible = doc.visits.filter(e => mine.has(e.g) || now - e.t >= PUBLIC_DELAY_MS);
    const crew = (g: string): PublicCrew | null => {
        const c = doc.crews[g];
        return c ? { label: c.name ?? c.alias, anon: !c.name, ...(mine.has(g) ? { mine: true } : {}) } : null;
    };
    return { visible, resolve, crew, mine };
}

export async function feed(ctx: Ctx, req: Request, offset: number, limit: number): Promise<PublicFeed> {
    const { visible, resolve, crew } = await visibleView(ctx, req);
    const items: PublicFeed['items'] = [];
    let i = offset;
    for (; i < visible.length && items.length < limit; i++) {
        const e = visible[i];
        const place = resolve(e.p), c = crew(e.g);
        if (place && c) items.push({ ...place, id: e.id, score: e.s, date: e.d, crew: c });
    }
    return { items, next: i < visible.length ? i : null };
}

/** Mekan → ekip → ortalama. Bir ekibin çok sayıda ziyareti sonucu tek başına belirlemesin diye ekip başına bir oy. */
function byPlaceCrew(entries: Entry[]) {
    const m = new Map<string, Map<string, { sum: number; n: number; last: string; lastScore: number }>>();
    for (const e of entries) {
        const crews = m.get(e.p) ?? new Map();
        const c = crews.get(e.g);
        if (c) { c.sum += e.s; c.n++; if (e.d > c.last) { c.last = e.d; c.lastScore = e.s; } } else crews.set(e.g, { sum: e.s, n: 1, last: e.d, lastScore: e.s });
        m.set(e.p, crews);
    }
    return m;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export async function ranking(ctx: Ctx, req: Request): Promise<PublicRankItem[]> {
    const { visible, resolve } = await visibleView(ctx, req);
    const rows: (PublicRankItem & { key: number })[] = [];
    const all: number[] = [];
    const grouped = byPlaceCrew(visible);
    for (const crews of grouped.values()) for (const c of crews.values()) all.push(c.sum / c.n);
    const prior = all.length ? mean(all) : 7;
    for (const [p, crews] of grouped) {
        const place = resolve(p);
        if (!place) continue;
        const avgs = [...crews.values()].map(c => c.sum / c.n);
        const visits = [...crews.values()].reduce((a, c) => a + c.n, 0);
        const last = [...crews.values()].reduce((a, c) => (c.last > a ? c.last : a), '');
        // Sıralama: az ekipli mekanların puanı topluluk ortalamasına doğru çekilir (tek ekibin 10'u en üste fırlamasın)
        const key = (2 * prior + avgs.reduce((a, b) => a + b, 0)) / (2 + avgs.length);
        rows.push({ ...place, score: round1(mean(avgs)), crews: avgs.length, visits, last, key });
    }
    return rows.sort((a, b) => b.key - a.key || b.crews - a.crews).slice(0, 300).map(({ key, ...r }) => r);
}

export async function placeView(ctx: Ctx, req: Request, placeId: string): Promise<PublicPlaceView> {
    const { visible, resolve, crew } = await visibleView(ctx, req);
    const empty: PublicPlaceView = { placeId, score: null, crews: 0, visits: 0, byCrew: [] };
    if (!resolve(placeId)) return empty;
    const crews = byPlaceCrew(visible.filter(e => e.p === placeId)).get(placeId);
    if (!crews) return empty;
    const byCrew: PublicPlaceView['byCrew'] = [];
    for (const [g, c] of crews) {
        const label = crew(g);
        if (label) byCrew.push({ crew: label, avg: round1(c.sum / c.n), visits: c.n, last: c.last, lastScore: c.lastScore });
    }
    byCrew.sort((a, b) => b.last.localeCompare(a.last));
    return {
        placeId, score: byCrew.length ? round1(mean(byCrew.map(c => c.avg))) : null, crews: byCrew.length,
        visits: byCrew.reduce((a, c) => a + c.visits, 0), byCrew: byCrew.slice(0, 50)
    };
}

/**
 * Zevke göre öneri (ekip tabanlı işbirlikçi filtreleme): ekibin puanladığı mekanlarda size benzer puan veren
 * ekiplerin, sizin gitmediğiniz mekanlara verdiği puanlardan tahmin. Benzer ekip yoksa topluluk ortalaması.
 */
export async function recommend(ctx: Ctx, req: Request, crew: CrewDoc): Promise<Recommendations> {
    const { visible, resolve } = await visibleView(ctx, req);
    const own = new Map<string, number[]>();
    const placeOf = new Map(crew.venues.map(v => [v.id, v.placeId]));
    for (const v of crew.visits) {
        const p = placeOf.get(v.venueId);
        if (v.deletedAt || v.score == null || !isPlaceId(p)) continue;
        own.set(p, [...(own.get(p) ?? []), v.score]);
    }
    const mineAvg = new Map([...own].map(([p, s]) => [p, mean(s)]));
    const me = crewGroup(ctx.statsSalt, crew.id);

    // Diğer ekiplerin mekan ortalamaları
    const others = new Map<string, Map<string, number>>();
    for (const [p, crews] of byPlaceCrew(visible.filter(e => e.g !== me))) {
        for (const [g, c] of crews) {
            const m = others.get(g) ?? new Map<string, number>();
            m.set(p, c.sum / c.n);
            others.set(g, m);
        }
    }
    const ownMean = mineAvg.size ? mean([...mineAvg.values()]) : null;

    // Benzerlik: ortak mekanlardaki ortalama fark (0 → 1, 4 puan ve üstü fark → 0), az ortak mekanda güven düşük
    const sim = new Map<string, { s: number; raw: number; mean: number }>();
    let compared = 0;
    for (const [g, m] of others) {
        const common = [...m.keys()].filter(p => mineAvg.has(p));
        const gMean = mean([...m.values()]);
        if (!common.length) { sim.set(g, { s: 0, raw: 0, mean: gMean }); continue; }
        compared++;
        const raw = Math.max(0, 1 - mean(common.map(p => Math.abs(m.get(p)! - mineAvg.get(p)!))) / 4);
        sim.set(g, { s: raw * Math.min(1, common.length / 3), raw, mean: gMean });
    }

    const candidates = new Map<string, { g: string; r: number }[]>();
    for (const [g, m] of others) for (const [p, r] of m) if (!mineAvg.has(p)) candidates.set(p, [...(candidates.get(p) ?? []), { g, r }]);

    const items: (Recommendation & { key: number })[] = [];
    for (const [p, raters] of candidates) {
        const place = resolve(p);
        if (!place) continue;
        const avg = mean(raters.map(x => x.r));
        let wsum = 0, acc = 0, similar = 0;
        for (const { g, r } of raters) {
            const s = sim.get(g)!;
            if (s.s <= 0 || ownMean == null) continue;
            wsum += s.s; acc += s.s * (r - s.mean);
            if (s.raw >= 0.75) similar++; // ortak mekanlarda ortalama en fazla 1 puan fark
        }
        const cf = wsum > 0 ? ownMean! + acc / wsum : avg;
        const predicted = Math.min(10, Math.max(1, (wsum * cf + 0.5 * avg) / (wsum + 0.5)));
        items.push({ ...place, predicted: round1(predicted), avg: round1(avg), crews: raters.length, similar, key: predicted - 0.6 / Math.sqrt(raters.length) });
    }
    return {
        items: items.sort((a, b) => b.key - a.key).slice(0, 20).map(({ key, ...r }) => r),
        compared, rated: mineAvg.size
    };
}
