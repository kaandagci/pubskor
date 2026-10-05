// Popüler mekanlar: ekiplerin ziyaretlerinden ve "Buradayım" kayıtlarından anonim sayım.
//
// Gizlilik: Gruplar (ekip ya da kişi) gizli bir tuzla HMAC'lenmiş kısa özetlerle tutulur; ad, kimlik ya da
// konum saklanmaz. Bir mekan ancak en az K farklı gruptan kayıt aldıysa listelenir (k-anonimlik).
// Ham kayıtlar 60, günlük özetler 90 gün sonra silinir. Ekip kurucusu katkıyı kapatabilir.
//
// Depolama:  act/<gün>/<grup>  →  { places: { <mekan>: { s: skor|null, k: türler, t: zaman } } }
//            agg/<gün>         →  günlük özet (dün ve öncesi donmuş)
//            popular/ist       →  istemcinin okuduğu sonuç (zamanlanmış fonksiyon 30 dk'da bir yazar)
import { createHmac } from 'node:crypto';
import type { CatalogPlace } from '../shared/places';
import type { VenueKind } from '../shared/metrics';
import { sleep } from './http';
import type { KV } from './kv';

export const K_MIN = 3;
const RAW_DAYS = 60;
const AGG_DAYS = 90;
const TOP = 300;

export interface ActDoc { v: 1; places: Record<string, { s: number | null; k: string[]; t: number }> }
interface DayAgg { v: 1; day: string; final: boolean; places: Record<string, { p: string[]; sum: number; n: number }> }

export interface PopularItem {
    id: string; name: string; kind: VenueKind; lat: number; lng: number; district: string;
    /** Farklı grup sayısı. */
    groups: number;
    /** Ortalama Pub Skor puanı (puanlı kayıt yoksa null). */
    score: number | null;
    /** Yalnızca haftalık listede: geçen haftaya göre grup farkı. */
    trend?: number | null;
}

export interface PopularDoc {
    v: 1;
    updatedAt: number;
    k: number;
    windows: { day: PopularItem[]; week: PopularItem[]; month: PopularItem[] };
    /** Son 90 gün topluluk puanı (yalnızca en az K grup puanlamışsa). */
    scores: Record<string, { score: number; groups: number }>;
}

export const POPULAR_KEY = 'popular/ist';

/** İstanbul saatine göre gün (YYYY-AA-GG). */
export function istanbulDay(ms: number): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

export function dayMinus(day: string, n: number): string {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
}

export const partyHash = (salt: string, kind: 'crew' | 'user', id: string) =>
    createHmac('sha256', salt).update(`${kind}:${id}`).digest('base64url').slice(0, 16);

const actKey = (day: string, party: string) => `act/${day}/${party}`;

async function mutateAct(kv: KV, key: string, fn: (d: ActDoc) => boolean) {
    for (let i = 0; i < 6; i++) {
        const e = await kv.getJSON<ActDoc>(key);
        const doc: ActDoc = e?.data ?? { v: 1, places: {} };
        if (!fn(doc)) return;
        const w = Object.keys(doc.places).length === 0
            ? (await kv.delete(key), { modified: true })
            : await kv.setJSON(key, doc, e ? { onlyIfMatch: e.etag } : { onlyIfNew: true });
        if (w.modified) return;
        await sleep(10 + Math.random() * 40);
    }
}

/** Bir grubun o gün bir mekanda bulunduğunu (ve varsa puanını) kaydeder. Hata isteği bozmasın diye yutulur. */
export async function recordActivity(kv: KV, a: { day: string; party: string; placeId: string; score: number | null; kinds: string[]; now: number }) {
    try {
        await mutateAct(kv, actKey(a.day, a.party), d => {
            const cur = d.places[a.placeId];
            // Puanlı kayıt puansız "buradayım"ın üzerine yazar; puansız kayıt puanlıyı silmez
            d.places[a.placeId] = { s: a.score ?? cur?.s ?? null, k: [...new Set([...(cur?.k ?? []), ...a.kinds])].slice(0, 8), t: a.now };
            return true;
        });
    } catch (e) { console.error('Etkinlik kaydedilemedi', e); }
}

export async function removeActivity(kv: KV, a: { day: string; party: string; placeId: string }) {
    try {
        await mutateAct(kv, actKey(a.day, a.party), d => {
            if (!d.places[a.placeId]) return false;
            delete d.places[a.placeId];
            return true;
        });
    } catch (e) { console.error('Etkinlik silinemedi', e); }
}

/** Grubun bugün kaç farklı mekana "buradayım" dediği (kötüye kullanım sınırı). */
export async function activityCount(kv: KV, day: string, party: string): Promise<number> {
    return Object.keys((await kv.getJSON<ActDoc>(actKey(day, party)))?.data.places ?? {}).length;
}

// ----- Toplama -----

async function buildDay(kv: KV, day: string, final: boolean): Promise<DayAgg> {
    const keys = await kv.list(`act/${day}/`);
    const agg: DayAgg = { v: 1, day, final, places: {} };
    const docs = await Promise.all(keys.map(k => kv.getJSON<ActDoc>(k).then(e => [k.split('/')[2], e?.data] as const)));
    for (const [party, doc] of docs) {
        if (!doc) continue;
        for (const [placeId, x] of Object.entries(doc.places)) {
            const a = (agg.places[placeId] ??= { p: [], sum: 0, n: 0 });
            if (!a.p.includes(party)) a.p.push(party);
            if (x.s != null) { a.sum += x.s; a.n += 1; }
        }
    }
    return agg;
}

async function dayAgg(kv: KV, day: string, today: string): Promise<DayAgg> {
    const recent = day >= dayMinus(today, 1);
    if (!recent) {
        const e = await kv.getJSON<DayAgg>(`agg/${day}`);
        if (e?.data.final) return e.data;
    }
    const agg = await buildDay(kv, day, !recent);
    if (Object.keys(agg.places).length || !recent) await kv.setJSON(`agg/${day}`, agg);
    return agg;
}

function windowOf(aggs: DayAgg[]) {
    const m = new Map<string, { parties: Set<string>; sum: number; n: number }>();
    for (const a of aggs) for (const [id, x] of Object.entries(a.places)) {
        const e = m.get(id) ?? { parties: new Set<string>(), sum: 0, n: 0 };
        x.p.forEach(p => e.parties.add(p));
        e.sum += x.sum; e.n += x.n;
        m.set(id, e);
    }
    return m;
}

/**
 * Son 90 günün özetlerinden gün / hafta / ay listelerini ve topluluk puanlarını üretir, popular/ist'e yazar.
 * `lookup` mekan kimliğinden ad ve konumu bulur (katalog + topluluk mekanları).
 */
export async function aggregate(kv: KV, now: number, lookup: (id: string) => CatalogPlace | null | undefined): Promise<PopularDoc> {
    const today = istanbulDay(now);
    const days = Array.from({ length: AGG_DAYS }, (_, i) => dayMinus(today, i));
    const aggs: DayAgg[] = [];
    for (let i = 0; i < days.length; i += 15) aggs.push(...await Promise.all(days.slice(i, i + 15).map(d => dayAgg(kv, d, today))));

    const toItems = (w: ReturnType<typeof windowOf>, prev?: ReturnType<typeof windowOf>): PopularItem[] => {
        const out: PopularItem[] = [];
        for (const [id, x] of w) {
            if (x.parties.size < K_MIN) continue;
            const p = lookup(id);
            if (!p) continue;
            const before = prev?.get(id)?.parties.size ?? 0;
            out.push({
                id, name: p.name, kind: p.kind, lat: p.lat, lng: p.lng, district: p.district, groups: x.parties.size,
                score: x.n ? Math.round((x.sum / x.n) * 10) / 10 : null,
                ...(prev ? { trend: x.parties.size - before } : {})
            });
        }
        return out.sort((a, b) => b.groups - a.groups || (b.score ?? 0) - (a.score ?? 0)).slice(0, TOP);
    };

    const all = windowOf(aggs);
    const scores: PopularDoc['scores'] = {};
    for (const [id, x] of [...all].filter(([, x]) => x.n >= K_MIN && x.parties.size >= K_MIN).sort((a, b) => b[1].parties.size - a[1].parties.size).slice(0, 3000)) {
        scores[id] = { score: Math.round((x.sum / x.n) * 10) / 10, groups: x.parties.size };
    }
    const doc: PopularDoc = {
        v: 1, updatedAt: now, k: K_MIN,
        windows: {
            day: toItems(windowOf(aggs.slice(0, 1))),
            week: toItems(windowOf(aggs.slice(0, 7)), windowOf(aggs.slice(7, 14))),
            month: toItems(windowOf(aggs.slice(0, 30)))
        },
        scores
    };
    await kv.setJSON(POPULAR_KEY, doc);

    // Saklama süreleri: eski ham kayıtları ve özetleri sil (her çalışmada birkaç günlük pencere)
    for (let i = RAW_DAYS + 1; i <= RAW_DAYS + 5; i++) {
        const keys = await kv.list(`act/${dayMinus(today, i)}/`);
        await Promise.allSettled(keys.map(k => kv.delete(k)));
    }
    for (let i = AGG_DAYS + 1; i <= AGG_DAYS + 5; i++) await kv.delete(`agg/${dayMinus(today, i)}`).catch(() => undefined);
    return doc;
}

// ----- Ekip ziyaretlerinden kayıt -----

interface CrewLike {
    id: string;
    shareStats?: boolean;
    venues: { id: string; placeId?: string | null }[];
    visits: { venueId: string; date: string; deletedAt?: number | null; score: number | null; kinds: string[] }[];
}

/**
 * Bir ekibin bir mekan + gün çifti için anonim kaydını ekip belgesiyle eşitler: o gün o mekanda silinmemiş
 * ziyaret varsa ortalama puanla kaydeder, yoksa kaydı geri alır. Ekip katkıyı kapattıysa ya da mekan
 * kataloğa bağlı değilse hiçbir şey yapmaz.
 */
export async function syncCrewActivity(kv: KV, salt: string, crew: CrewLike, venueId: string, date: string, now: number) {
    const placeId = crew.venues.find(v => v.id === venueId)?.placeId;
    if (!placeId) return;
    const today = istanbulDay(now);
    if (date < dayMinus(today, RAW_DAYS) || date > dayMinus(today, -1)) return;
    const party = partyHash(salt, 'crew', crew.id);
    const same = crew.visits.filter(v => !v.deletedAt && v.date === date && crew.venues.find(x => x.id === v.venueId)?.placeId === placeId);
    if (crew.shareStats === false || !same.length) { await removeActivity(kv, { day: date, party, placeId }); return; }
    const scored = same.map(v => v.score).filter((s): s is number => s != null);
    const score = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
    await recordActivity(kv, { day: date, party, placeId, score, kinds: [...new Set(same.flatMap(v => v.kinds))], now });
}
