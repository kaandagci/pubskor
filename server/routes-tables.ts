// Canlı masa: herkes kendi telefonundan kendi puan kağıdını doldurur, kurucu masayı kapatınca ziyaret oluşur.
// Her kişinin kağıdı ayrı blobda durur; böylece aynı anda puan veren kişiler birbirinin yazımını ezmez.
import { newId, normalizeCode, secret, ID_RE } from '../shared/ids';
import { NA, isCell, sheetFilled } from '../shared/scoring';
import { isValidDate } from '../shared/text';
import type { Participant, Sheet, TableSetup, TableStatus, TableView } from '../shared/types';
import { LIMITS, validPersonName, validateKinds, validateMetrics, validateParticipants, validateSheet, validateVenueInput, validateVisitInput } from '../shared/validate';
import { authMember, checkMember, loadCrew, memberOfUser, mutateCrew, parseToken, safeEq, seatToken, sha, type Ctx } from './crew';
import type { IdentityUser } from './identity';
import { HttpError, json, readJSON, sleep } from './http';
import { activity, insertVisit } from './routes-visits';
import { istanbulDay, partyHash, recordActivity, removeActivity } from './popular';
import { publishCrew } from './public-feed';
import { publicModeOf } from '../shared/public';

const TABLE_TTL = 12 * 3600 * 1000;

interface Claim { tokenHash: string | null; member: string | null; at: number }

interface TableDoc {
    v: 1;
    code: string;
    crewId: string;
    crewName: string;
    hostId: string;
    status: TableStatus;
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    setup: TableSetup;
    claims: Record<string, Claim>;
    /** Masaya bağlanmış üyelerin eski cihaz anahtarı özetleri (her istekte ekip belgesini okumamak için). */
    memberHashes: Record<string, string>;
    /** Masaya hesabıyla bağlanmış üyeler: üye kimliği → hesap kimliği. */
    memberUsers?: Record<string, string>;
    visitId: string | null;
    result: { score: number | null; venueName: string } | null;
}

interface SheetDoc { sheet: Sheet; done: boolean; updatedAt: number }

const tableKey = (code: string) => `table/${code}`;
const sheetKey = (code: string, pid: string) => `table/${code}/s/${pid}`;

async function loadTable(ctx: Ctx, rawCode: string) {
    const code = normalizeCode(rawCode);
    if (!ID_RE.table.test(code)) throw new HttpError(404, 'Masa bulunamadı');
    const e = await ctx.kv.getJSON<TableDoc>(tableKey(code));
    if (!e) throw new HttpError(404, 'Masa bulunamadı');
    if (e.data.status === 'open' && e.data.expiresAt < ctx.now()) e.data.status = 'cancelled';
    return e;
}

async function mutateTable<T>(ctx: Ctx, code: string, fn: (t: TableDoc) => T): Promise<{ table: TableDoc; result: T }> {
    for (let i = 0; i < 8; i++) {
        const e = await loadTable(ctx, code);
        const result = fn(e.data);
        e.data.updatedAt = ctx.now();
        const w = await ctx.kv.setJSON(tableKey(e.data.code), e.data, { onlyIfMatch: e.etag });
        if (w.modified) return { table: e.data, result };
        await sleep(15 + Math.random() * 50 * (i + 1));
    }
    throw new HttpError(503, 'Masa şu an çok yoğun, tekrar dene');
}

interface Who { seat: string | null; memberId: string | null; isHost: boolean }

/** İsteği yapanın masadaki kimliği. Doğrulanamazsa anonim (yalnızca katılma ekranını görür). */
function identify(req: Request, t: TableDoc, user: IdentityUser | null): Who {
    const token = parseToken(req);
    const anon: Who = { seat: null, memberId: null, isHost: false };
    if (!token) {
        const memberId = user ? Object.entries(t.memberUsers ?? {}).find(([, uid]) => uid === user.id)?.[0] : undefined;
        if (!memberId) return anon;
        const p = t.setup.participants.find(x => x.memberId === memberId);
        return { seat: p?.id ?? null, memberId, isHost: memberId === t.hostId };
    }
    if (token.kind === 'seat') {
        const c = t.claims[token.pid];
        if (token.code !== t.code || !c?.tokenHash || !safeEq(sha(token.secret), c.tokenHash)) return anon;
        return { seat: token.pid, memberId: null, isHost: false };
    }
    if (token.crewId !== t.crewId) return anon;
    const h = t.memberHashes[token.memberId];
    if (!h || !safeEq(sha(token.secret), h)) return anon;
    const p = t.setup.participants.find(x => x.memberId === token.memberId);
    return { seat: p?.id ?? null, memberId: token.memberId, isHost: token.memberId === t.hostId };
}

function requireOpen(t: TableDoc) {
    if (t.status !== 'open') throw new HttpError(409, t.status === 'closed' ? 'Masa kapandı' : 'Masa iptal edildi', { code: 'table_' + t.status });
}

function requireHost(who: Who) {
    if (!who.isHost) throw new HttpError(403, 'Bunu yalnızca masayı açan kişi yapabilir');
}

async function readSheets(ctx: Ctx, t: TableDoc): Promise<Record<string, SheetDoc | null>> {
    const out: Record<string, SheetDoc | null> = {};
    await Promise.all(t.setup.participants.map(async p => {
        out[p.id] = (await ctx.kv.getJSON<SheetDoc>(sheetKey(t.code, p.id)))?.data ?? null;
    }));
    return out;
}

function buildView(t: TableDoc, docs: Record<string, SheetDoc | null>, who: Who): TableView {
    const participant = who.seat !== null || who.isHost;
    const reveal = participant && (t.status === 'closed' || !t.setup.blind);
    const mine: Record<string, Sheet> = {};
    if (who.seat) mine[who.seat] = docs[who.seat]?.sheet ?? {};
    if (who.isHost && t.status === 'open') {
        // Telefonu olmayanların kağıdını kurucu doldurabilir
        t.setup.participants.forEach(p => { if (!t.claims[p.id]) mine[p.id] = docs[p.id]?.sheet ?? {}; });
    }
    return {
        code: t.code, crewId: t.crewId, crewName: t.crewName, hostId: t.hostId, status: t.status,
        createdAt: t.createdAt, expiresAt: t.expiresAt, setup: t.setup,
        seats: t.setup.participants.map(p => ({
            pid: p.id,
            claimed: !!t.claims[p.id],
            filled: sheetFilled(docs[p.id]?.sheet, t.setup.metrics),
            done: !!docs[p.id]?.done,
            updatedAt: docs[p.id]?.updatedAt ?? 0
        })),
        mySeat: who.seat,
        isHost: who.isHost,
        sheets: reveal ? Object.fromEntries(t.setup.participants.map(p => [p.id, docs[p.id]?.sheet ?? {}])) : null,
        mine,
        visitId: participant ? t.visitId : null,
        result: t.result
    };
}

function validateSetup(b: Record<string, unknown>, base?: TableSetup): TableSetup {
    const venueR = b.venue !== undefined ? validateVenueInput(b.venue) : base ? { ok: true as const, value: base.venue } : validateVenueInput(undefined);
    if (!venueR.ok) throw new HttpError(400, venueR.error);
    const partsR = b.participants !== undefined ? validateParticipants(b.participants) : base ? { ok: true as const, value: base.participants } : validateParticipants(undefined);
    if (!partsR.ok) throw new HttpError(400, partsR.error);
    const date = b.date !== undefined ? b.date : base?.date;
    if (!isValidDate(date)) throw new HttpError(400, 'Geçersiz tarih');
    let metrics = base?.metrics ?? [];
    if (b.metrics !== undefined || !base) {
        const mr = validateMetrics(b.metrics);
        if (!mr.ok) throw new HttpError(400, mr.error);
        metrics = mr.value;
    }
    const kinds = validateKinds(b.kinds !== undefined ? b.kinds : base?.kinds, metrics);
    const venueId = b.venueId !== undefined
        ? (typeof b.venueId === 'string' && ID_RE.venue.test(b.venueId) ? b.venueId : null)
        : base?.venueId ?? null;
    return {
        venue: venueR.value, venueId, date, participants: partsR.value, metrics, kinds,
        blind: typeof b.blind === 'boolean' ? b.blind : base?.blind ?? true,
        openSeats: typeof b.openSeats === 'boolean' ? b.openSeats : base?.openSeats ?? true
    };
}

export async function createTable(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const { crew, member, user } = await authMember(ctx, req);
    const setup = validateSetup((b.setup ?? {}) as Record<string, unknown>);
    if (setup.venueId && !crew.venues.some(v => v.id === setup.venueId)) setup.venueId = null;
    const ids = new Set(crew.members.filter(m => !m.removed).map(m => m.id));
    setup.participants = setup.participants.map(p => ({ ...p, memberId: p.memberId && ids.has(p.memberId) ? p.memberId : null }));
    const now = ctx.now();
    const claims: Record<string, Claim> = {};
    const hostSeat = setup.participants.find(p => p.memberId === member.id);
    if (hostSeat) claims[hostSeat.id] = { tokenHash: null, member: member.id, at: now };
    let doc: TableDoc | null = null;
    for (let i = 0; i < 5 && !doc; i++) {
        const code = newId.table();
        const d: TableDoc = {
            v: 1, code, crewId: crew.id, crewName: crew.name, hostId: member.id, status: 'open',
            createdAt: now, updatedAt: now, expiresAt: now + TABLE_TTL, setup, claims,
            memberHashes: member.tokenHash ? { [member.id]: member.tokenHash } : {},
            memberUsers: user ? { [member.id]: user.id } : {}, visitId: null, result: null
        };
        if ((await ctx.kv.setJSON(tableKey(code), d, { onlyIfNew: true })).modified) doc = d;
    }
    if (!doc) throw new HttpError(503, 'Masa kodu üretilemedi, tekrar dene');
    const t = doc;
    await mutateCrew(ctx, crew.id, c => {
        c.tables.push({ code: t.code, venueName: t.setup.venue.name, hostId: member.id, createdAt: now, expiresAt: t.expiresAt });
    });
    // Masa açıldı: grup bugün bu mekanda (anonim, puansız)
    const placeId = (setup.venueId ? crew.venues.find(v => v.id === setup.venueId)?.placeId : null) ?? setup.venue.placeId;
    if (placeId && publicModeOf(crew) !== 'off') {
        await recordActivity(ctx.kv, { day: istanbulDay(now), party: partyHash(ctx.statsSalt, 'crew', crew.id), placeId, score: null, kinds: setup.kinds, now });
    }
    return json({ view: buildView(t, {}, { seat: hostSeat?.id ?? null, memberId: member.id, isHost: true }) }, 201);
}

export async function getTable(ctx: Ctx, req: Request, p: Record<string, string>) {
    const { data: t } = await loadTable(ctx, p.code);
    const who = identify(req, t, await ctx.identity.user(req));
    const docs = who.seat || who.isHost ? await readSheets(ctx, t) : {};
    return json(buildView(t, docs, who));
}

export async function joinTable(ctx: Ctx, req: Request, p: Record<string, string>) {
    const b = await readJSON(req);
    const first = await loadTable(ctx, p.code);
    requireOpen(first.data);
    const token = parseToken(req);
    const user = token ? null : await ctx.identity.user(req);

    // Ekip üyesi (hesabıyla ya da eski cihaz anahtarıyla): ekip belgesinden doğrula, masaya bağla
    let m: { id: string; name: string; color: number; tokenHash: string | null } | null = null;
    if (token?.kind === 'member' && token.crewId === first.data.crewId) {
        const entry = await loadCrew(ctx, token.crewId);
        m = entry && checkMember(entry.data, token);
        if (!m) throw new HttpError(401, 'Bu cihazın ekip erişimi geçersiz', { code: 'token_invalid' });
    } else if (user) {
        const entry = await loadCrew(ctx, first.data.crewId);
        m = entry ? memberOfUser(entry.data, user.id) : null;
    }
    if (m) {
        const mm = m;
        const { table } = await mutateTable(ctx, p.code, t => {
            requireOpen(t);
            const m = mm;
            if (user) t.memberUsers = { ...(t.memberUsers ?? {}), [m.id]: user.id };
            else t.memberHashes[m.id] = m.tokenHash!;
            let seat = t.setup.participants.find(x => x.memberId === m.id);
            const wanted = typeof b.pid === 'string' ? t.setup.participants.find(x => x.id === b.pid) : undefined;
            if (!seat && wanted && !wanted.memberId && !t.claims[wanted.id]) {
                wanted.memberId = m.id; seat = wanted;
            }
            if (!seat) {
                if (!t.setup.openSeats && m.id !== t.hostId) throw new HttpError(403, 'Masa yeni katılımcıya kapalı');
                seat = addParticipant(t, m.name, m.id, m.color);
            }
            t.claims[seat.id] = { tokenHash: null, member: m.id, at: ctx.now() };
        });
        const who = identify(req, table, user);
        return json({ view: buildView(table, await readSheets(ctx, table), who) });
    }

    // Misafir: koltuk seç ya da kendini ekle, koltuk jetonu al
    const s = secret();
    const { table, result: pid } = await mutateTable(ctx, p.code, t => {
        requireOpen(t);
        let seat: Participant | undefined;
        if (typeof b.pid === 'string') {
            seat = t.setup.participants.find(x => x.id === b.pid);
            if (!seat) throw new HttpError(404, 'Bu kişi masada yok');
            if (t.claims[seat.id]) throw new HttpError(409, `${seat.name} başka bir telefonda puanlıyor`, { code: 'seat_taken' });
        } else {
            if (!t.setup.openSeats) throw new HttpError(403, 'Masa yeni katılımcıya kapalı');
            const r = validPersonName(b.name);
            if (!r.ok) throw new HttpError(400, r.error);
            seat = addParticipant(t, r.value, null, null);
        }
        t.claims[seat.id] = { tokenHash: sha(s), member: null, at: ctx.now() };
        return seat.id;
    });
    const seatTok = seatToken(table.code, pid, s);
    return json({ seatToken: seatTok, view: buildView(table, await readSheets(ctx, table), { seat: pid, memberId: null, isHost: false }) });
}

function addParticipant(t: TableDoc, name: string, memberId: string | null, color: number | null): Participant {
    if (t.setup.participants.length >= LIMITS.participants) throw new HttpError(409, 'Masa dolu');
    if (t.setup.participants.some(x => x.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) {
        throw new HttpError(409, `"${name}" masada zaten var; listeden kendini seç`, { code: 'name_taken' });
    }
    const used = new Set(t.setup.participants.map(x => x.color));
    let c = color ?? -1;
    if (c < 0 || used.has(c)) { c = 0; while (used.has(c) && c < LIMITS.colors - 1) c++; }
    const p: Participant = { id: memberId ?? newId.guest(), name, color: c, memberId };
    t.setup.participants.push(p);
    return p;
}

export async function putSheet(ctx: Ctx, req: Request, p: Record<string, string>) {
    const b = await readJSON(req);
    const { data: t } = await loadTable(ctx, p.code);
    requireOpen(t);
    const who = identify(req, t, await ctx.identity.user(req));
    const participant = t.setup.participants.find(x => x.id === p.pid);
    if (!participant) throw new HttpError(404, 'Bu kişi masada yok');
    const allowed = who.seat === p.pid || (who.isHost && !t.claims[p.pid]);
    if (!allowed) throw new HttpError(403, 'Bu kağıdı düzenleyemezsin', { code: 'seat_lost' });
    const sheet = validateSheet(b.sheet, t.setup.metrics);
    const filled = sheetFilled(sheet, t.setup.metrics);
    const total = t.setup.metrics.length;
    const doc: SheetDoc = { sheet, done: !!b.done && filled === total, updatedAt: ctx.now() };
    await ctx.kv.setJSON(sheetKey(t.code, p.pid), doc);
    return json({ ok: true, done: doc.done, updatedAt: doc.updatedAt });
}

export async function patchTable(ctx: Ctx, req: Request, p: Record<string, string>) {
    const b = await readJSON(req);
    const first = await loadTable(ctx, p.code);
    const user = await ctx.identity.user(req);
    requireHost(identify(req, first.data, user));
    let removed: string[] = [];
    const { table } = await mutateTable(ctx, p.code, t => {
        requireOpen(t);
        const before = t.setup.participants.map(x => x.id);
        const next = validateSetup(b, t.setup);
        // Üye bağlantıları istemciden değiştirilemez: mevcut katılımcınınkini koru
        next.participants = next.participants.map(np => {
            const old = t.setup.participants.find(x => x.id === np.id);
            return { ...np, memberId: old ? old.memberId ?? null : null };
        });
        removed = before.filter(id => !next.participants.some(x => x.id === id));
        removed.forEach(id => { delete t.claims[id]; });
        t.setup = next;
    });
    await Promise.allSettled(removed.map(id => ctx.kv.delete(sheetKey(table.code, id))));
    if (b.venue !== undefined) {
        await mutateCrew(ctx, table.crewId, c => {
            const ref = c.tables.find(x => x.code === table.code);
            if (ref) ref.venueName = table.setup.venue.name;
        }).catch(() => undefined);
    }
    return json({ view: buildView(table, await readSheets(ctx, table), identify(req, table, user)) });
}

export async function releaseSeat(ctx: Ctx, req: Request, p: Record<string, string>) {
    const first = await loadTable(ctx, p.code);
    const user = await ctx.identity.user(req);
    requireHost(identify(req, first.data, user));
    const { table } = await mutateTable(ctx, p.code, t => { requireOpen(t); delete t.claims[p.pid]; });
    return json({ view: buildView(table, await readSheets(ctx, table), identify(req, table, user)) });
}

/** Masayı kapatır ve ziyareti oluşturur. Ziyaret kimliği masaya bağlı olduğu için tekrar denemek güvenlidir. */
export async function finishTable(ctx: Ctx, req: Request, p: Record<string, string>) {
    const b = await readJSON(req);
    const { data: t } = await loadTable(ctx, p.code);
    const who = identify(req, t, await ctx.identity.user(req));
    requireHost(who);
    if (t.status === 'closed' && t.visitId) return json({ visitId: t.visitId, view: buildView(t, await readSheets(ctx, t), who) });
    requireOpen(t);
    const docs = await readSheets(ctx, t);
    const sheets: Record<string, Sheet> = {};
    for (const part of t.setup.participants) {
        const s: Sheet = { ...(docs[part.id]?.sheet ?? {}) };
        if (b.fillMissing === true) {
            for (const id of t.setup.metrics) if (!isCell(s[id])) s[id] = NA;
        }
        sheets[part.id] = s;
    }
    const visitId = `pub_t${t.code}${t.createdAt.toString(36)}`;
    const v = validateVisitInput({
        id: visitId, venueId: t.setup.venueId ?? undefined, venue: t.setup.venueId ? undefined : t.setup.venue,
        date: t.setup.date, participants: t.setup.participants, sheets, metrics: t.setup.metrics, kinds: t.setup.kinds, source: 'live'
    });
    if (!v.ok) throw new HttpError(400, v.error, { code: 'incomplete' });
    const venueName = t.setup.venue.name;
    const { crew: savedCrew } = await mutateCrew(ctx, t.crewId, crew => {
        if (!crew.members.some(m => m.id === who.memberId && !m.removed)) throw new HttpError(403, 'Artık bu ekibin üyesi değilsin');
        const clean = { ...v.value };
        if (clean.venueId && !crew.venues.some(x => x.id === clean.venueId)) { clean.venueId = null; clean.venue = t.setup.venue; }
        insertVisit(crew, clean, who.memberId!, ctx.now());
        crew.tables = crew.tables.filter(x => x.code !== t.code);
    });
    const { table } = await mutateTable(ctx, t.code, x => {
        x.status = 'closed'; x.visitId = visitId; x.result = { score: v.value.score, venueName };
    });
    const saved = savedCrew.visits.find(x => x.id === visitId);
    if (saved) {
        await activity(ctx, savedCrew, saved.venueId, saved.date);
        await publishCrew(ctx, savedCrew);
    }
    return json({ visitId, view: buildView(table, docs, who) });
}

export async function cancelTable(ctx: Ctx, req: Request, p: Record<string, string>) {
    const first = await loadTable(ctx, p.code);
    const user = await ctx.identity.user(req);
    requireHost(identify(req, first.data, user));
    const { table } = await mutateTable(ctx, p.code, t => { if (t.status === 'open') t.status = 'cancelled'; });
    const after = await mutateCrew(ctx, table.crewId, c => { c.tables = c.tables.filter(x => x.code !== table.code); }).catch(() => null);
    await Promise.allSettled(table.setup.participants.map(x => ctx.kv.delete(sheetKey(table.code, x.id))));
    // İptal edilen masanın "buradayım" kaydını, o gün başka ziyaret yoksa geri al
    const placeId = (table.setup.venueId ? after?.crew.venues.find(v => v.id === table.setup.venueId)?.placeId : null) ?? table.setup.venue.placeId;
    if (after && placeId) {
        const venueId = after.crew.venues.find(v => v.placeId === placeId)?.id;
        if (venueId) await activity(ctx, after.crew, venueId, istanbulDay(table.createdAt));
        else await removeActivity(ctx.kv, { day: istanbulDay(table.createdAt), party: partyHash(ctx.statsSalt, 'crew', after.crew.id), placeId });
    }
    return json({ ok: true });
}
