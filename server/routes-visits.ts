// Ziyaretler, mekanlar, fotoğraflar, paylaşım bağlantıları ve v7 içe aktarma.
import { ID_RE, newId } from '../shared/ids';
import { fromLegacy, legacyPhotoId } from '../shared/legacy';
import { analyze } from '../shared/scoring';
import { foldKey } from '../shared/text';
import { isVenueKind } from '../shared/metrics';
import { isPlaceId } from '../shared/places';
import { cleanLine } from '../shared/text';
import type { Participant, SharedVisit, Venue, VenueInput, Visit } from '../shared/types';
import { LIMITS, validateTags, validateVenueInput, validateVisitInput, type CleanVisitInput } from '../shared/validate';
import { authMember, loadCrew, requireOwner, safeEq, snapshot, type CrewDoc, type Ctx } from './crew';
import { HttpError, json, readBinary, readJSON } from './http';
import { syncCrewActivity } from './popular';
import { withCrew } from './routes-crew';

/** Anonim popülerlik kaydını eşitler (ekip katkıyı kapattıysa geri alır). */
export const activity = (ctx: Ctx, crew: CrewDoc, venueId: string, date: string) =>
    syncCrewActivity(ctx.kv, ctx.statsSalt, crew, venueId, date, ctx.now());

// ----- Mekan çözümleme -----

/** Gelen mekanı ekipteki mevcut mekanla eşleştirir ya da yenisini oluşturur. Mekan kimliğini döner. */
export function resolveVenue(crew: CrewDoc, input: { venueId: string | null; venue: VenueInput | null }, by: string, now: number): string {
    if (input.venueId) {
        if (!crew.venues.some(v => v.id === input.venueId)) throw new HttpError(400, 'Mekan bulunamadı');
        return input.venueId;
    }
    const vi = input.venue!;
    const same = crew.venues.find(v => v.id === vi.id)
        ?? (vi.placeId ? crew.venues.find(v => v.placeId === vi.placeId) : undefined)
        ?? (vi.osm ? crew.venues.find(v => v.osm === vi.osm) : undefined)
        ?? crew.venues.find(v => foldKey(v.name) === foldKey(vi.name) && (!v.area || !vi.area || foldKey(v.area) === foldKey(vi.area ?? '')));
    if (same) {
        // Eksik konum bilgisini tamamla
        if (same.lat == null && vi.lat != null) { same.lat = vi.lat; same.lng = vi.lng; }
        if (!same.osm && vi.osm) same.osm = vi.osm;
        if (!same.placeId && vi.placeId) same.placeId = vi.placeId;
        if (!same.area && vi.area) same.area = vi.area;
        if (!same.address && vi.address) same.address = vi.address;
        if ((!same.kind || same.kind === 'diger') && vi.kind && vi.kind !== 'diger') same.kind = vi.kind;
        return same.id;
    }
    if (crew.venues.length >= LIMITS.venues) throw new HttpError(507, 'Mekan sınırına ulaşıldı');
    const venue: Venue = {
        id: vi.id, name: vi.name, kind: vi.kind ?? 'diger', area: vi.area ?? '', address: vi.address ?? '',
        lat: vi.lat ?? null, lng: vi.lng ?? null, osm: vi.osm ?? null, placeId: vi.placeId ?? null,
        tags: [], wish: null, createdAt: now, createdBy: by
    };
    crew.venues.push(venue);
    return venue.id;
}

/** Katılımcıların üye bağlantılarını ekibe göre düzeltir (ekipte olmayan üye kimliği misafire döner). */
function linkParticipants(crew: CrewDoc, list: Participant[]): Participant[] {
    const ids = new Set(crew.members.map(m => m.id));
    return list.map(p => ({ ...p, memberId: p.memberId && ids.has(p.memberId) ? p.memberId : null }));
}

export function insertVisit(crew: CrewDoc, c: CleanVisitInput, by: string, now: number): { visit: Visit; duplicate: boolean } {
    const existing = crew.visits.find(v => v.id === c.id);
    if (existing) return { visit: existing, duplicate: true }; // çevrimdışı kuyruğun tekrar denemesi
    if (crew.visits.filter(v => !v.deletedAt).length >= LIMITS.visits) throw new HttpError(507, 'Arşiv dolu');
    const venueId = resolveVenue(crew, c, by, now);
    clearWish(crew, venueId);
    const visit: Visit = {
        id: c.id, venueId, date: c.date,
        participants: linkParticipants(crew, c.participants),
        sheets: c.sheets, metrics: c.metrics, kinds: c.kinds, items: c.items,
        notes: c.notes, photos: c.photos, spend: c.spend,
        score: c.score, source: c.source,
        createdAt: now, createdBy: by, updatedAt: now, updatedBy: by, deletedAt: null, shareId: null
    };
    crew.visits.push(visit);
    return { visit, duplicate: false };
}

/** Gidilen mekan "gidilecekler" listesinden düşer. */
function clearWish(crew: CrewDoc, venueId: string) {
    const v = crew.venues.find(x => x.id === venueId);
    if (v?.wish) v.wish = null;
}

function findVisit(crew: CrewDoc, id: string): Visit {
    const v = crew.visits.find(x => x.id === id);
    if (!v) throw new HttpError(404, 'Ziyaret bulunamadı');
    return v;
}

// ----- Ziyaretler -----

export async function createVisit(ctx: Ctx, req: Request) {
    const r0 = validateVisitInput(await readJSON(req));
    if (!r0.ok) throw new HttpError(400, r0.error);
    const r = await withCrew(ctx, req, (crew, me) => insertVisit(crew, r0.value, me.id, ctx.now()));
    if (!r.result.duplicate) await activity(ctx, r.crew, r.result.visit.venueId, r.result.visit.date);
    return json({ visitId: r.result.visit.id, duplicate: r.result.duplicate, snapshot: r.snap() }, r.result.duplicate ? 200 : 201);
}

export async function updateVisit(ctx: Ctx, req: Request, p: Record<string, string>) {
    const body = await readJSON(req);
    const r0 = validateVisitInput({ ...body, id: p.id });
    if (!r0.ok) throw new HttpError(400, r0.error);
    const c = r0.value;
    let removedPhotos: string[] = [];
    let before: { venueId: string; date: string } | null = null;
    const r = await withCrew(ctx, req, (crew, me) => {
        const v = findVisit(crew, p.id);
        if (v.deletedAt) throw new HttpError(410, 'Bu ziyaret silinmiş');
        before = { venueId: v.venueId, date: v.date };
        if (c.baseUpdatedAt != null && c.baseUpdatedAt !== v.updatedAt) {
            throw new HttpError(409, 'Bu ziyaret sen düzenlerken başka biri tarafından güncellendi', { code: 'conflict', current: v });
        }
        const now = ctx.now();
        removedPhotos = v.photos.map(x => x.id).filter(id => !c.photos.some(x => x.id === id));
        Object.assign(v, {
            venueId: resolveVenue(crew, c, me.id, now), date: c.date,
            participants: linkParticipants(crew, c.participants),
            sheets: c.sheets, metrics: c.metrics, kinds: c.kinds, items: c.items,
            notes: c.notes, photos: c.photos, spend: c.spend, score: c.score,
            updatedAt: now, updatedBy: me.id
        });
        return v;
    });
    await Promise.allSettled(removedPhotos.filter(id => id.startsWith('ph_')).map(id => ctx.kv.delete('photo/' + id)));
    const old = before as { venueId: string; date: string } | null;
    if (old && (old.venueId !== r.result.venueId || old.date !== r.result.date)) await activity(ctx, r.crew, old.venueId, old.date);
    await activity(ctx, r.crew, r.result.venueId, r.result.date);
    return json({ visitId: r.result.id, snapshot: r.snap() });
}

export async function deleteVisit(ctx: Ctx, req: Request, p: Record<string, string>) {
    const r = await withCrew(ctx, req, (crew, me) => {
        const v = findVisit(crew, p.id);
        if (!v.deletedAt) { v.deletedAt = ctx.now(); v.updatedBy = me.id; }
        const sid = v.shareId; v.shareId = null;
        return { sid, venueId: v.venueId, date: v.date };
    });
    if (r.result.sid) await ctx.kv.delete('share/' + r.result.sid);
    await activity(ctx, r.crew, r.result.venueId, r.result.date);
    return json({ snapshot: r.snap() });
}

export async function restoreVisit(ctx: Ctx, req: Request, p: Record<string, string>) {
    const r = await withCrew(ctx, req, (crew, me) => {
        const v = findVisit(crew, p.id);
        v.deletedAt = null; v.updatedBy = me.id;
        return v;
    });
    await activity(ctx, r.crew, r.result.venueId, r.result.date);
    return json({ snapshot: r.snap() });
}

// ----- Mekanlar -----

/** Mekanın adını, türünü, konumunu ve etiketlerini günceller (yalnızca gönderilen alanlar). */
export async function updateVenue(ctx: Ctx, req: Request, p: Record<string, string>) {
    const b = await readJSON(req);
    let loc: VenueInput | null = null;
    if (b.name !== undefined || b.lat !== undefined || b.area !== undefined) {
        const r = validateVenueInput({ name: b.name ?? 'x', ...b, id: p.id });
        if (!r.ok) throw new HttpError(400, r.error);
        loc = r.value;
    }
    const r = await withCrew(ctx, req, crew => {
        const v = crew.venues.find(x => x.id === p.id);
        if (!v) throw new HttpError(404, 'Mekan bulunamadı');
        if (loc) {
            if (b.name !== undefined) v.name = loc.name;
            if (b.area !== undefined) v.area = loc.area ?? '';
            if (b.address !== undefined) v.address = loc.address ?? '';
            if (b.lat !== undefined || b.lng !== undefined) { v.lat = loc.lat ?? null; v.lng = loc.lng ?? null; }
            if (b.osm !== undefined) v.osm = loc.osm ?? null;
        }
        // Kataloğa bağlama (istemci arka planda eşleştirir); yalnızca biçim kontrolü
        if (b.placeId !== undefined) {
            if (b.placeId !== null && !isPlaceId(b.placeId)) throw new HttpError(400, 'Geçersiz mekan kimliği');
            v.placeId = (b.placeId as string | null) ?? null;
        }
        if (b.kind !== undefined && isVenueKind(b.kind)) v.kind = b.kind;
        if (b.tags !== undefined) v.tags = validateTags(b.tags);
    });
    // Mekan kataloğa yeni bağlandıysa son ziyaretleri anonim popülerliğe ekle
    if (b.placeId) {
        const dates = new Set(r.crew.visits.filter(v => v.venueId === p.id && !v.deletedAt).map(v => v.date));
        for (const d of dates) await activity(ctx, r.crew, p.id, d);
    }
    return json({ snapshot: r.snap() });
}

/** Gidilecekler listesine mekan ekler (mekan yoksa oluşturur) ya da notunu günceller. */
export async function wishVenue(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const note = cleanLine(b.note, LIMITS.wishNote);
    let input: { venueId: string | null; venue: VenueInput | null };
    if (typeof b.venueId === 'string') input = { venueId: b.venueId, venue: null };
    else {
        const vr = validateVenueInput(b.venue);
        if (!vr.ok) throw new HttpError(400, vr.error);
        input = { venueId: null, venue: vr.value };
    }
    const r = await withCrew(ctx, req, (crew, me) => {
        const id = resolveVenue(crew, input, me.id, ctx.now());
        const v = crew.venues.find(x => x.id === id)!;
        v.wish = { by: me.id, at: v.wish?.at ?? ctx.now(), note };
        return id;
    });
    return json({ venueId: r.result, snapshot: r.snap() });
}

export async function unwishVenue(ctx: Ctx, req: Request, p: Record<string, string>) {
    const r = await withCrew(ctx, req, crew => {
        const v = crew.venues.find(x => x.id === p.id);
        if (!v) throw new HttpError(404, 'Mekan bulunamadı');
        v.wish = null;
        // Hiç ziyaret edilmemiş ve listeden çıkarılan mekan ekipte kalmasın
        if (!crew.visits.some(x => x.venueId === v.id)) crew.venues = crew.venues.filter(x => x.id !== v.id);
    });
    return json({ snapshot: r.snap() });
}

/** Yanlışlıkla iki kez açılmış mekanı diğerine birleştirir. */
export async function mergeVenue(ctx: Ctx, req: Request, p: Record<string, string>) {
    const b = await readJSON(req);
    const into = typeof b.into === 'string' ? b.into : '';
    const r = await withCrew(ctx, req, crew => {
        const from = crew.venues.find(x => x.id === p.id), to = crew.venues.find(x => x.id === into);
        if (!from || !to || from.id === to.id) throw new HttpError(400, 'Birleştirilecek mekanlar geçersiz');
        crew.visits.forEach(v => { if (v.venueId === from.id) v.venueId = to.id; });
        if (to.lat == null && from.lat != null) { to.lat = from.lat; to.lng = from.lng; }
        crew.venues = crew.venues.filter(x => x.id !== from.id);
    });
    return json({ snapshot: r.snap() });
}

export async function deleteVenue(ctx: Ctx, req: Request, p: Record<string, string>) {
    const r = await withCrew(ctx, req, crew => {
        if (crew.visits.some(v => v.venueId === p.id && !v.deletedAt)) throw new HttpError(409, 'Bu mekanın ziyaretleri var; önce onları sil ya da başka mekana birleştir');
        crew.venues = crew.venues.filter(x => x.id !== p.id);
    });
    return json({ snapshot: r.snap() });
}

// ----- Paylaşım -----

interface ShareOpts { names: boolean; photos: boolean; notes: boolean }

/**
 * Herkese açık bağlantı oluşturur. Varsayılan olarak kişi adları, fotoğraflar ve notlar gizlidir;
 * sipariş defteri (marka adları içerebilir) hiçbir zaman paylaşılmaz.
 */
export async function shareVisit(ctx: Ctx, req: Request, p: Record<string, string>) {
    const b = await readJSON(req);
    const opts: ShareOpts = { names: b.names === true, photos: b.photos === true, notes: b.notes === true };
    const { crew, member } = await authMember(ctx, req);
    const v = findVisit(crew, p.id);
    if (v.deletedAt) throw new HttpError(410, 'Bu ziyaret silinmiş');
    if (v.shareId) {
        await ctx.kv.setJSON('share/' + v.shareId, { crewId: crew.id, visitId: v.id, createdAt: ctx.now(), opts });
        return json({ shareId: v.shareId, snapshot: snapshot(crew, member.id, ctx.now()) });
    }
    const sid = newId.share();
    await ctx.kv.setJSON('share/' + sid, { crewId: crew.id, visitId: v.id, createdAt: ctx.now(), opts }, { onlyIfNew: true });
    const r = await withCrew(ctx, req, crew => {
        const x = findVisit(crew, p.id);
        if (!x.shareId) x.shareId = sid;
        return x.shareId;
    });
    if (r.result !== sid) await ctx.kv.delete('share/' + sid);
    return json({ shareId: r.result, snapshot: r.snap() });
}

export async function unshareVisit(ctx: Ctx, req: Request, p: Record<string, string>) {
    const r = await withCrew(ctx, req, crew => {
        const v = findVisit(crew, p.id);
        const sid = v.shareId; v.shareId = null;
        return sid;
    });
    if (r.result) await ctx.kv.delete('share/' + r.result);
    return json({ snapshot: r.snap() });
}

export async function getShare(ctx: Ctx, _req: Request, p: Record<string, string>) {
    if (!ID_RE.share.test(p.sid)) throw new HttpError(404, 'Paylaşım bulunamadı');
    const s = await ctx.kv.getJSON<{ crewId: string; visitId: string; opts?: ShareOpts }>('share/' + p.sid);
    const entry = s ? await loadCrew(ctx, s.data.crewId) : null;
    const visit = entry?.data.visits.find(v => v.id === s!.data.visitId && v.shareId === p.sid && !v.deletedAt);
    const venue = visit && entry!.data.venues.find(x => x.id === visit.venueId);
    if (!visit || !venue) throw new HttpError(404, 'Bu paylaşım kaldırılmış');
    const opts: ShareOpts = s!.data.opts ?? { names: false, photos: false, notes: false };
    const out: SharedVisit = {
        crewName: entry!.data.name,
        venue: { ...venue, wish: null, createdBy: null },
        visit: {
            ...visit,
            participants: visit.participants.map((x, i) => ({ ...x, memberId: null, name: opts.names ? x.name : `Kişi ${i + 1}` })),
            photos: opts.photos ? visit.photos : [],
            notes: opts.notes ? visit.notes : '',
            items: [],
            createdBy: null, updatedBy: null
        }
    };
    return json(out, 200, { 'cache-control': 'public, max-age=60' });
}

// ----- Fotoğraflar -----

const PHOTO_TYPES: Record<string, (b: Uint8Array) => boolean> = {
    'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    'image/webp': b => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45,
    'image/png': b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
};

export async function uploadPhoto(ctx: Ctx, req: Request, p: Record<string, string>) {
    if (!/^ph_[\w-]{22}$/.test(p.pid)) throw new HttpError(400, 'Geçersiz fotoğraf kimliği');
    const { crew, member } = await authMember(ctx, req);
    const type = (req.headers.get('content-type') || '').split(';')[0].trim();
    const check = PHOTO_TYPES[type];
    if (!check) throw new HttpError(415, 'Fotoğraf JPEG, WebP ya da PNG olmalı');
    const buf = await readBinary(req, LIMITS.photoBytes);
    if (buf.byteLength < 12 || !check(new Uint8Array(buf, 0, 12))) throw new HttpError(400, 'Geçersiz fotoğraf');
    const w = Math.min(20000, Math.max(1, Number(req.headers.get('x-photo-width')) || 1));
    const h = Math.min(20000, Math.max(1, Number(req.headers.get('x-photo-height')) || 1));
    const r = await ctx.kv.setBinary('photo/' + p.pid, buf, { type, w, h, crewId: crew.id, by: member.id, at: ctx.now() }, { onlyIfNew: true });
    if (!r.modified) {
        // Aynı kimlik zaten yüklüyse (kuyruk tekrarı) ve aynı ekibe aitse başarı say
        const cur = await ctx.kv.getBinary('photo/' + p.pid);
        if (!cur || cur.meta.crewId !== crew.id) throw new HttpError(409, 'Bu fotoğraf kimliği kullanımda');
    }
    return json({ id: p.pid, w, h }, 201);
}

export async function getPhoto(ctx: Ctx, _req: Request, p: Record<string, string>) {
    const headers = { 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' };
    if (/^ph_[\w-]{22}$/.test(p.pid)) {
        const e = await ctx.kv.getBinary('photo/' + p.pid);
        if (e) return new Response(e.data, { headers: { ...headers, 'content-type': String(e.meta.type || 'image/jpeg') } });
    } else if (/^L_pub_[\w-]{4,40}$/.test(p.pid) && ctx.legacy) {
        const ab = await ctx.legacy.photos.getBinary(p.pid.slice(2));
        if (ab) return new Response(ab, { headers: { ...headers, 'content-type': 'image/jpeg' } });
    }
    throw new HttpError(404, 'Fotoğraf bulunamadı');
}

// ----- v7 ortak arşivinden içe aktarma -----

function checkAdmin(ctx: Ctx, req: Request, b?: Record<string, unknown>) {
    if (!ctx.adminKey) return;
    const given = req.headers.get('x-admin-key') || (typeof b?.adminKey === 'string' ? b.adminKey : '');
    if (!safeEq(given, ctx.adminKey)) throw new HttpError(403, 'Yönetici anahtarı gerekli', { code: 'admin_required' });
}

export async function legacyStatus(ctx: Ctx, req: Request) {
    const { crew, member } = await authMember(ctx, req);
    requireOwner(member);
    if (!ctx.legacy) return json({ available: 0, imported: !!crew.legacyImported, needsKey: false });
    const keys = await ctx.legacy.visits.list();
    return json({ available: keys.length, imported: !!crew.legacyImported, needsKey: !!ctx.adminKey });
}

const IMPORT_BATCH = 40;

export async function legacyImport(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const { member } = await authMember(ctx, req);
    requireOwner(member);
    checkAdmin(ctx, req, b);
    if (!ctx.legacy) throw new HttpError(404, 'Eski arşiv bulunamadı');
    const cursor = Math.max(0, Number(b.cursor) || 0);
    const keys = (await ctx.legacy.visits.list()).sort();
    const batch = keys.slice(cursor, cursor + IMPORT_BATCH);
    const raws = await Promise.all(batch.map(k => ctx.legacy!.visits.getJSON(k).catch(() => null)));
    const converted = raws.map(fromLegacy).filter((x): x is NonNullable<typeof x> => !!x);
    const done = cursor + IMPORT_BATCH >= keys.length;
    const r = await withCrew(ctx, req, crew => importLegacyInto(crew, converted, member.id, ctx.now(), done));
    return json({ next: done ? null : cursor + IMPORT_BATCH, total: keys.length, imported: r.result, snapshot: r.snap() });
}

/** Dönüştürülmüş v7 kayıtlarını ekibe ekler; üye adlarıyla eşleşen katılımcıları üyeye bağlar. */
export function importLegacyInto(crew: CrewDoc, list: NonNullable<ReturnType<typeof fromLegacy>>[], by: string, now: number, finished: boolean): number {
    const memberByName = new Map(crew.members.filter(m => !m.removed).map(m => [foldKey(m.name), m.id]));
    let n = 0;
    for (const L of list) {
        if (crew.visits.some(v => v.id === L.id)) continue;
        const participants = L.participants.map(p => ({ ...p, memberId: memberByName.get(foldKey(p.name)) ?? null }));
        const a = analyze({ participants, sheets: L.sheets, metrics: L.metrics });
        if (a.score == null) continue;
        const venueId = resolveVenue(crew, { venueId: null, venue: { id: newId.venue(), name: L.name, area: L.location, kind: 'pub' } }, by, now);
        crew.visits.push({
            id: L.id, venueId, date: L.date, participants, sheets: L.sheets, metrics: L.metrics, kinds: ['bira'], items: [],
            notes: L.notes, photos: L.hasPhoto ? [{ id: legacyPhotoId(L.id), w: 800, h: 600 }] : [],
            spend: null, score: a.score, source: 'legacy',
            createdAt: L.createdAt, createdBy: by, updatedAt: L.updatedAt, updatedBy: by, deletedAt: null, shareId: null
        });
        n++;
    }
    if (finished) crew.legacyImported = true;
    return n;
}
