// Gelen veriyi doğrular ve temizler. Sunucu istemciye güvenmez; istemci de aynı kuralları erken uyarı için kullanır.
import { isKindId, isMetricId, isVenueKind, isVenueTag, kindsOf, orderMetrics, type KindId, type MetricId, type VenueTag } from './metrics';
import { analyze, isCell } from './scoring';
import { ID_RE } from './ids';
import { cleanLine, cleanText, isValidDate } from './text';
import type { OrderItem, Participant, Photo, Sheet, VenueInput, Verdict, VisitInput, VisitSource } from './types';

export const LIMITS = {
    crewName: 40,
    personName: 24,
    venueName: 80,
    area: 80,
    address: 160,
    notes: 3000,
    wishNote: 200,
    participants: 12,
    photos: 6,
    items: 40,
    itemName: 60,
    members: 40,
    visits: 3000,
    venues: 1500,
    colors: 8,
    photoBytes: 1_600_000
} as const;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

export function validPersonName(v: unknown): Result<string> {
    const name = cleanLine(v, LIMITS.personName);
    return name ? ok(name) : err('İsim gerekli');
}

export function validColor(v: unknown, fallback = 0): number {
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < LIMITS.colors ? v : fallback;
}

export function validateParticipants(list: unknown): Result<Participant[]> {
    if (!Array.isArray(list) || list.length < 1) return err('Masada en az bir kişi olmalı');
    if (list.length > LIMITS.participants) return err(`Masada en fazla ${LIMITS.participants} kişi olabilir`);
    const out: Participant[] = [];
    const ids = new Set<string>(), names = new Set<string>();
    for (const raw of list) {
        const p = (raw ?? {}) as Record<string, unknown>;
        const id = typeof p.id === 'string' ? p.id : '';
        const name = cleanLine(p.name, LIMITS.personName);
        if (!ID_RE.participant.test(id) || ids.has(id)) return err('Geçersiz katılımcı');
        if (!name) return err('Katılımcı adı boş olamaz');
        const key = name.toLocaleLowerCase('tr');
        if (names.has(key)) return err(`"${name}" masada iki kez var`);
        ids.add(id); names.add(key);
        const memberId = typeof p.memberId === 'string' && ID_RE.member.test(p.memberId) ? p.memberId : null;
        out.push({ id, name, color: validColor(p.color, out.length % LIMITS.colors), memberId });
    }
    return ok(out);
}

export function validateMetrics(v: unknown): Result<MetricId[]> {
    if (!Array.isArray(v)) return err('Kriter listesi eksik');
    const list = orderMetrics(v.filter(isMetricId));
    return list.length ? ok(list) : err('En az bir kriter seçilmeli');
}

export function validateKinds(v: unknown, metrics: readonly MetricId[]): KindId[] {
    const given = Array.isArray(v) ? v.filter(isKindId) : [];
    const set = new Set<KindId>([...given, ...kindsOf(metrics)]);
    return [...set];
}

export function validateTags(v: unknown): VenueTag[] {
    return Array.isArray(v) ? [...new Set(v.filter(isVenueTag))] : [];
}

export function validateSheet(v: unknown, metrics: readonly MetricId[]): Sheet {
    const src = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const allowed = new Set<string>(metrics);
    const out: Sheet = {};
    for (const [k, val] of Object.entries(src)) {
        if (isMetricId(k) && allowed.has(k) && isCell(val)) out[k] = val;
    }
    return out;
}

export function validateSheets(v: unknown, pids: string[], metrics: readonly MetricId[]): Record<string, Sheet> {
    const src = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const out: Record<string, Sheet> = {};
    pids.forEach(pid => { out[pid] = validateSheet(src[pid], metrics); });
    return out;
}

const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const VERDICTS: Verdict[] = ['top', 'ok', 'bad'];

export function validateItems(v: unknown): Result<OrderItem[]> {
    if (v == null) return ok([]);
    if (!Array.isArray(v)) return err('Geçersiz sipariş listesi');
    if (v.length > LIMITS.items) return err(`En fazla ${LIMITS.items} sipariş kalemi eklenebilir`);
    const out: OrderItem[] = [], seen = new Set<string>();
    for (const raw of v) {
        const it = (raw ?? {}) as Record<string, unknown>;
        const id = typeof it.id === 'string' && /^i_[\w-]{4,24}$/.test(it.id) ? it.id : null;
        const name = cleanLine(it.name, LIMITS.itemName);
        if (!id || seen.has(id) || !name) continue;
        seen.add(id);
        const price = num(it.price, 0, 1_000_000);
        out.push({
            id, name,
            kind: isKindId(it.kind) ? it.kind : 'yemek',
            price: price == null ? null : Math.round(price),
            verdict: VERDICTS.includes(it.verdict as Verdict) ? (it.verdict as Verdict) : null
        });
    }
    return ok(out);
}

export function validateVenueInput(v: unknown): Result<VenueInput> {
    const s = (v ?? {}) as Record<string, unknown>;
    if (typeof s.id !== 'string' || !ID_RE.venue.test(s.id)) return err('Geçersiz mekan kimliği');
    const name = cleanLine(s.name, LIMITS.venueName);
    if (!name) return err('Mekan adı gerekli');
    const lat = num(s.lat, -90, 90), lng = num(s.lng, -180, 180);
    const osm = typeof s.osm === 'string' && /^(node|way|relation)\/\d{1,15}$/.test(s.osm) ? s.osm : null;
    return ok({
        id: s.id, name,
        kind: isVenueKind(s.kind) ? s.kind : 'diger',
        area: cleanLine(s.area, LIMITS.area),
        address: cleanLine(s.address, LIMITS.address),
        lat: lat != null && lng != null ? Math.round(lat * 1e6) / 1e6 : null,
        lng: lat != null && lng != null ? Math.round(lng * 1e6) / 1e6 : null,
        osm
    });
}

export function validatePhotos(v: unknown): Result<Photo[]> {
    if (v == null) return ok([]);
    if (!Array.isArray(v)) return err('Geçersiz fotoğraf listesi');
    if (v.length > LIMITS.photos) return err(`En fazla ${LIMITS.photos} fotoğraf eklenebilir`);
    const out: Photo[] = [], seen = new Set<string>();
    for (const raw of v) {
        const p = (raw ?? {}) as Record<string, unknown>;
        if (typeof p.id !== 'string' || !ID_RE.photo.test(p.id) || seen.has(p.id)) return err('Geçersiz fotoğraf');
        seen.add(p.id);
        out.push({ id: p.id, w: Math.round(num(p.w, 1, 20000) ?? 1), h: Math.round(num(p.h, 1, 20000) ?? 1) });
    }
    return ok(out);
}

export interface CleanVisitInput {
    id: string;
    venueId: string | null;
    venue: VenueInput | null;
    date: string;
    participants: Participant[];
    sheets: Record<string, Sheet>;
    metrics: MetricId[];
    kinds: KindId[];
    items: OrderItem[];
    notes: string;
    photos: Photo[];
    spend: number | null;
    source: VisitSource;
    score: number;
    baseUpdatedAt: number | null;
}

/** Ziyaret girdisini doğrular; skor burada yeniden hesaplanır (istemcinin gönderdiği skor dikkate alınmaz). */
export function validateVisitInput(body: unknown): Result<CleanVisitInput> {
    const b = (body ?? {}) as Partial<VisitInput> & Record<string, unknown>;
    if (typeof b.id !== 'string' || !ID_RE.visit.test(b.id)) return err('Geçersiz ziyaret kimliği');
    let venue: VenueInput | null = null;
    let venueId: string | null = null;
    if (typeof b.venueId === 'string' && ID_RE.venue.test(b.venueId)) venueId = b.venueId;
    else if (b.venue) {
        const r = validateVenueInput(b.venue);
        if (!r.ok) return r;
        venue = r.value;
    } else return err('Mekan seçilmedi');
    if (!isValidDate(b.date)) return err('Geçersiz tarih');

    const parts = validateParticipants(b.participants);
    if (!parts.ok) return parts;
    const metrics = validateMetrics(b.metrics);
    if (!metrics.ok) return metrics;
    const pids = parts.value.map(p => p.id);
    const sheets = validateSheets(b.sheets, pids, metrics.value);
    const a = analyze({ participants: parts.value, sheets, metrics: metrics.value });
    if (!a.complete || a.score == null) {
        return err(a.score == null ? 'En az bir gerçek puan gerekli' : `${a.needed - a.filled} puan eksik`);
    }
    const photos = validatePhotos(b.photos);
    if (!photos.ok) return photos;
    const items = validateItems(b.items);
    if (!items.ok) return items;
    const source: VisitSource = b.source === 'live' || b.source === 'legacy' ? b.source : 'single';
    return ok({
        id: b.id, venueId, venue, date: b.date, participants: parts.value, sheets,
        metrics: metrics.value,
        kinds: validateKinds(b.kinds, metrics.value),
        items: items.value,
        notes: cleanText(b.notes, LIMITS.notes),
        photos: photos.value,
        spend: num(b.spend, 0, 1_000_000),
        source,
        score: a.score,
        baseUpdatedAt: typeof b.baseUpdatedAt === 'number' ? b.baseUpdatedAt : null
    });
}
