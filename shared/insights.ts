// Mekan profilleri, sıralamalar ve kişisel istatistikler. Saf fonksiyonlar; istemcide hesaplanır.
import { GROUPS, METRICS, METRIC_BY_ID, type GroupId, type KindId, type MetricId } from './metrics';
import { analyze, isScore, type Analysis } from './scoring';
import { foldKey } from './text';
import type { OrderItem, Participant, Venue, Visit } from './types';

const cache = new WeakMap<Visit, Analysis>();
/** Ziyaret analizi; ziyaret nesneleri değişmez kabul edildiği için önbelleğe alınır. */
export function analysisOf(v: Visit): Analysis {
    let a = cache.get(v);
    if (!a) { a = analyze(v); cache.set(v, a); }
    return a;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const personKey = (p: Pick<Participant, 'memberId' | 'name'>) => (p.memberId ? 'm:' + p.memberId : 'g:' + foldKey(p.name));

// ----- Mekanlar -----

export interface VenueSummary {
    venue: Venue;
    /** Yeniden eskiye. */
    visits: Visit[];
    count: number;
    avg: number | null;
    best: number | null;
    last: string | null;
    /** Eskiden yeniye skor dizisi. */
    trend: { date: string; score: number }[];
    metricAvg: Partial<Record<MetricId, number>>;
    groups: Partial<Record<GroupId, number>>;
    /** Bu mekanda içilen/yenen türler (ziyaret sayısıyla). */
    kinds: Partial<Record<KindId, number>>;
    /** Sipariş defterinden öne çıkanlar (en çok "harika" alan kalemler). */
    favorites: { name: string; kind: KindId; top: number; count: number; price: number | null }[];
    strengths: MetricId[];
    weaknesses: MetricId[];
    /** Ortalama görüş ayrılığı (kriter başına en yüksek-en düşük puan farkı). */
    controversy: number | null;
    spend: number | null;
}

export function summarizeVenue(venue: Venue, visits: Visit[]): VenueSummary {
    const list = visits.filter(v => v.venueId === venue.id && !v.deletedAt).sort(byDateDesc);
    const scores = list.map(v => v.score).filter((s): s is number => s != null);
    const metricAvg: Partial<Record<MetricId, number>> = {};
    const spreads: number[] = [];
    for (const m of METRICS) {
        const xs: number[] = [];
        for (const v of list) {
            const a = analysisOf(v);
            const x = a.metricAvg[m.id];
            if (x != null) xs.push(x);
            const sp = a.metricSpread[m.id];
            if (sp != null && v.participants.length > 1) spreads.push(sp);
        }
        const avg = mean(xs);
        if (avg != null) metricAvg[m.id] = avg;
    }
    const groups: Partial<Record<GroupId, number>> = {};
    for (const g of GROUPS) {
        let s = 0, w = 0;
        for (const m of METRICS) if (m.group === g.id && metricAvg[m.id] != null) { s += metricAvg[m.id]! * m.weight; w += m.weight; }
        if (w) groups[g.id] = s / w;
    }
    const kinds: Partial<Record<KindId, number>> = {};
    for (const v of list) for (const k of v.kinds ?? []) kinds[k] = (kinds[k] ?? 0) + 1;
    const ranked = (Object.keys(metricAvg) as MetricId[]).sort((a, b) => metricAvg[b]! - metricAvg[a]!);
    const spends = list.map(v => v.spend).filter((x): x is number => typeof x === 'number' && x > 0);
    return {
        venue, visits: list, count: list.length,
        avg: mean(scores),
        best: scores.length ? Math.max(...scores) : null,
        last: list[0]?.date ?? null,
        trend: list.filter(v => v.score != null).map(v => ({ date: v.date, score: v.score! })).reverse(),
        metricAvg, groups, kinds,
        favorites: favoriteItems(list),
        strengths: ranked.length >= 4 ? ranked.slice(0, 2) : [],
        weaknesses: ranked.length >= 4 ? ranked.slice(-2).reverse() : [],
        controversy: mean(spreads),
        spend: mean(spends)
    };
}

function favoriteItems(list: Visit[]): VenueSummary['favorites'] {
    const map = new Map<string, { name: string; kind: KindId; top: number; count: number; prices: number[] }>();
    for (const v of list) {
        for (const it of (v.items ?? []) as OrderItem[]) {
            const key = foldKey(it.name);
            const e = map.get(key) ?? { name: it.name, kind: it.kind, top: 0, count: 0, prices: [] };
            e.count++;
            if (it.verdict === 'top') e.top++;
            if (it.verdict === 'bad') e.top -= 1;
            if (it.price != null) e.prices.push(it.price);
            map.set(key, e);
        }
    }
    return [...map.values()]
        .filter(e => e.top > 0)
        .sort((a, b) => b.top - a.top || b.count - a.count)
        .slice(0, 5)
        .map(e => ({ name: e.name, kind: e.kind, top: e.top, count: e.count, price: e.prices.length ? e.prices[e.prices.length - 1] : null }));
}

export function summarizeVenues(venues: Venue[], visits: Visit[]): VenueSummary[] {
    const byVenue = new Map<string, Visit[]>();
    for (const v of visits) {
        if (v.deletedAt) continue;
        const arr = byVenue.get(v.venueId);
        if (arr) arr.push(v); else byVenue.set(v.venueId, [v]);
    }
    return venues.map(ven => summarizeVenue(ven, byVenue.get(ven.id) ?? []));
}

export type RankKey = 'overall' | GroupId | MetricId;

export function rankValue(s: VenueSummary, by: RankKey): number | null {
    if (by === 'overall') return s.avg;
    if (GROUPS.some(g => g.id === by)) return s.groups[by as GroupId] ?? null;
    return s.metricAvg[by as MetricId] ?? null;
}

export function rankVenues(list: VenueSummary[], by: RankKey): { s: VenueSummary; value: number }[] {
    return list
        .map(s => ({ s, value: rankValue(s, by) }))
        .filter((x): x is { s: VenueSummary; value: number } => x.value != null && x.s.count > 0)
        .sort((a, b) => b.value - a.value || b.s.count - a.s.count || a.s.venue.name.localeCompare(b.s.venue.name, 'tr'));
}

// ----- Kişiler -----

export interface PersonSummary {
    key: string;
    name: string;
    color: number;
    memberId: string | null;
    visits: number;
    /** Verdiği puanların ortalaması. */
    given: number | null;
    /** Aynı ziyaret ve kriterde masanın geri kalanına göre ortalama fark: + cömert, − sert. */
    bias: number | null;
    metricBias: Partial<Record<MetricId, number>>;
    /** Masaya göre en sert olduğu kriter. */
    pickiest: MetricId | null;
    /** Masaya göre en yumuşak olduğu kriter. */
    softest: MetricId | null;
    favorite: { venueId: string; score: number } | null;
    naRate: number;
    agreement: Record<string, { similarity: number; shared: number }>;
}

const MIN_SHARED = 6;

export function summarizePeople(visits: Visit[]): PersonSummary[] {
    type Acc = {
        key: string; name: string; color: number; memberId: string | null; lastSeen: string;
        visits: number; given: number[]; diffs: number[]; na: number; cells: number;
        metricDiffs: Partial<Record<MetricId, number[]>>;
        venues: Map<string, number[]>;
        pairs: Map<string, number[]>;
    };
    const people = new Map<string, Acc>();
    const live = visits.filter(v => !v.deletedAt);

    for (const v of live) {
        const keys = v.participants.map(personKey);
        v.participants.forEach((p, i) => {
            const key = keys[i];
            let acc = people.get(key);
            if (!acc) {
                acc = { key, name: p.name, color: p.color, memberId: p.memberId ?? null, lastSeen: v.date, visits: 0, given: [], diffs: [], na: 0, cells: 0, metricDiffs: {}, venues: new Map(), pairs: new Map() };
                people.set(key, acc);
            }
            if (v.date >= acc.lastSeen) { acc.lastSeen = v.date; acc.name = p.name; acc.color = p.color; }
            acc.visits++;
            const personal: number[] = [];
            for (const mid of v.metrics) {
                const m = METRIC_BY_ID[mid];
                if (!m) continue;
                const mine = v.sheets[p.id]?.[m.id];
                acc.cells++;
                if (!isScore(mine)) { if (mine === 0) acc.na++; continue; }
                acc.given.push(mine); personal.push(mine);
                const others: number[] = [];
                v.participants.forEach((q, j) => {
                    if (j === i) return;
                    const theirs = v.sheets[q.id]?.[m.id];
                    if (!isScore(theirs)) return;
                    others.push(theirs);
                    const pk = keys[j];
                    const arr = acc!.pairs.get(pk);
                    if (arr) arr.push(Math.abs(mine - theirs)); else acc!.pairs.set(pk, [Math.abs(mine - theirs)]);
                });
                const o = mean(others);
                if (o != null) {
                    acc.diffs.push(mine - o);
                    (acc.metricDiffs[m.id] ??= []).push(mine - o);
                }
            }
            const pAvg = analysisOf(v).perParticipant[p.id];
            if (pAvg != null) {
                const arr = acc.venues.get(v.venueId);
                if (arr) arr.push(pAvg); else acc.venues.set(v.venueId, [pAvg]);
            }
        });
    }

    return [...people.values()].map(acc => {
        const metricBias: Partial<Record<MetricId, number>> = {};
        for (const [mid, xs] of Object.entries(acc.metricDiffs) as [MetricId, number[]][]) {
            if (xs.length >= 2) metricBias[mid] = mean(xs)!;
        }
        const mb = (Object.keys(metricBias) as MetricId[]).sort((a, b) => metricBias[a]! - metricBias[b]!);
        let favorite: PersonSummary['favorite'] = null;
        for (const [venueId, xs] of acc.venues) {
            const s = mean(xs)!;
            if (!favorite || s > favorite.score) favorite = { venueId, score: s };
        }
        const agreement: PersonSummary['agreement'] = {};
        for (const [k, xs] of acc.pairs) {
            if (xs.length < MIN_SHARED) continue;
            agreement[k] = { similarity: Math.round(100 * (1 - mean(xs)! / 9)), shared: xs.length };
        }
        return {
            key: acc.key, name: acc.name, color: acc.color, memberId: acc.memberId,
            visits: acc.visits,
            given: mean(acc.given),
            bias: acc.diffs.length >= MIN_SHARED ? mean(acc.diffs) : null,
            metricBias,
            pickiest: mb.length >= 3 && metricBias[mb[0]]! < 0 ? mb[0] : null,
            softest: mb.length >= 3 && metricBias[mb[mb.length - 1]]! > 0 ? mb[mb.length - 1] : null,
            favorite,
            naRate: acc.cells ? acc.na / acc.cells : 0,
            agreement
        };
    }).sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name, 'tr'));
}

export interface Pair { a: PersonSummary; b: PersonSummary; similarity: number; shared: number }

export interface Highlights {
    generous: PersonSummary | null;
    harsh: PersonSummary | null;
    twins: Pair | null;
    rivals: Pair | null;
    top: VenueSummary | null;
    mostVisited: VenueSummary | null;
    controversial: VenueSummary | null;
    totals: { visits: number; venues: number; people: number; avg: number | null };
}

export function pairs(people: PersonSummary[]): Pair[] {
    const byKey = new Map(people.map(p => [p.key, p]));
    const out: Pair[] = [];
    for (const a of people) {
        for (const [k, v] of Object.entries(a.agreement)) {
            const b = byKey.get(k);
            if (b && a.key < b.key) out.push({ a, b, similarity: v.similarity, shared: v.shared });
        }
    }
    return out.sort((x, y) => y.similarity - x.similarity);
}

export function highlights(people: PersonSummary[], venues: VenueSummary[], visits: Visit[]): Highlights {
    const live = visits.filter(v => !v.deletedAt);
    const regulars = people.filter(p => p.visits >= 2 && p.bias != null);
    const byBias = [...regulars].sort((a, b) => b.bias! - a.bias!);
    const ps = pairs(people);
    const visited = venues.filter(v => v.count > 0);
    const scores = live.map(v => v.score).filter((s): s is number => s != null);
    return {
        generous: byBias.length >= 2 && byBias[0].bias! > 0.15 ? byBias[0] : null,
        harsh: byBias.length >= 2 && byBias[byBias.length - 1].bias! < -0.15 ? byBias[byBias.length - 1] : null,
        twins: ps.length >= 2 ? ps[0] : null,
        rivals: ps.length >= 2 ? ps[ps.length - 1] : null,
        top: rankVenues(visited, 'overall')[0]?.s ?? null,
        mostVisited: visited.length ? [...visited].sort((a, b) => b.count - a.count || (b.avg ?? 0) - (a.avg ?? 0))[0] : null,
        controversial: visited.filter(v => v.controversy != null).sort((a, b) => b.controversy! - a.controversy!)[0] ?? null,
        totals: { visits: live.length, venues: visited.length, people: people.length, avg: mean(scores) }
    };
}

export function byDateDesc(a: Visit, b: Visit): number {
    return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
}
