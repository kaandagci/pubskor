// Ekip kurma, davet, katılma ve üye yönetimi.
import { newId, secret } from '../shared/ids';
import { cleanLine, foldKey } from '../shared/text';
import { LIMITS, validColor, validPersonName } from '../shared/validate';
import {
    authMember, checkMember, claimGuest, crewKey, freeColor, guestList, loadCrew, memberToken, mutateCrew,
    parseToken, requireOwner, safeEq, sha, snapshot, type CrewDoc, type Ctx, type MemberRecord
} from './crew';
import { HttpError, json, readJSON } from './http';

const nameTaken = (crew: CrewDoc, name: string, exceptId?: string) =>
    crew.members.some(m => !m.removed && m.id !== exceptId && m.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'));

function validCrewName(v: unknown): string {
    const name = cleanLine(v, LIMITS.crewName);
    if (!name) throw new HttpError(400, 'Ekip adı gerekli');
    return name;
}

function personName(v: unknown): string {
    const r = validPersonName(v);
    if (!r.ok) throw new HttpError(400, r.error);
    return r.value;
}

export async function createCrew(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const crewName = validCrewName(b.crewName);
    const name = personName(b.name);
    const now = ctx.now();
    const s = secret();
    const member: MemberRecord = { id: newId.member(), name, color: validColor(b.color, 0), role: 'owner', joinedAt: now, tokenHash: sha(s) };
    const crew: CrewDoc = {
        v: 1, id: newId.crew(), name: crewName, createdAt: now, updatedAt: now, rev: 1,
        invite: secret(24), members: [member], venues: [], visits: [], tables: []
    };
    const w = await ctx.kv.setJSON(crewKey(crew.id), crew, { onlyIfNew: true });
    if (!w.modified) throw new HttpError(409, 'Tekrar dene');
    return json({ token: memberToken(crew.id, member.id, s), snapshot: snapshot(crew, member.id, now) }, 201);
}

function checkInvite(crew: CrewDoc, invite: unknown) {
    if (typeof invite !== 'string' || !safeEq(invite, crew.invite)) {
        throw new HttpError(403, 'Davet bağlantısı geçersiz ya da yenilenmiş', { code: 'invite_invalid' });
    }
}

export async function previewCrew(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const entry = typeof b.crewId === 'string' ? await loadCrew(ctx, b.crewId) : null;
    if (!entry) throw new HttpError(404, 'Ekip bulunamadı');
    const crew = entry.data;
    checkInvite(crew, b.invite);
    // Bu cihaz zaten üyeyse doğrudan girebilir
    const already = checkMember(crew, parseToken(req));
    return json({
        crewId: crew.id,
        name: crew.name,
        visits: crew.visits.filter(v => !v.deletedAt).length,
        members: crew.members.filter(m => !m.removed).map(m => ({ id: m.id, name: m.name, color: m.color })),
        guests: guestList(crew).slice(0, 30),
        alreadyMember: already ? already.id : null
    });
}

export async function joinCrew(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    if (typeof b.crewId !== 'string') throw new HttpError(400, 'Ekip belirtilmedi');
    const name = personName(b.name);
    const guestKey = typeof b.guestKey === 'string' ? foldKey(b.guestKey) : '';
    const s = secret();
    const { crew, result: member } = await mutateCrew(ctx, b.crewId, crew => {
        checkInvite(crew, b.invite);
        if (crew.members.filter(m => !m.removed).length >= LIMITS.members) throw new HttpError(409, 'Ekip dolu');
        if (nameTaken(crew, name)) throw new HttpError(409, `"${name}" adında bir üye zaten var. Başka bir isim seç.`, { code: 'name_taken' });
        const m: MemberRecord = {
            id: newId.member(), name, color: validColor(b.color, freeColor(crew)), role: 'member',
            joinedAt: ctx.now(), tokenHash: sha(s)
        };
        crew.members.push(m);
        if (guestKey) claimGuest(crew, guestKey, m.id);
        return m;
    });
    return json({ token: memberToken(crew.id, member.id, s), snapshot: snapshot(crew, member.id, ctx.now()) }, 201);
}

export async function getCrew(ctx: Ctx, req: Request) {
    const { crew, member } = await authMember(ctx, req);
    const etag = `W/"r${crew.rev}-${member.id}"`;
    if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag, 'cache-control': 'no-store' } });
    return json(snapshot(crew, member.id, ctx.now()), 200, { etag });
}

/** Üyeyi doğrulayıp ekip belgesini günceller, yeni görüntüyü döner. */
export async function withCrew<T>(ctx: Ctx, req: Request, fn: (crew: CrewDoc, me: MemberRecord) => T) {
    const { crew: first, member: me } = await authMember(ctx, req);
    const { crew, result } = await mutateCrew(ctx, first.id, crew => {
        const fresh = crew.members.find(m => m.id === me.id && !m.removed);
        if (!fresh || fresh.tokenHash !== me.tokenHash) throw new HttpError(401, 'Bu cihazın ekip erişimi geçersiz', { code: 'token_invalid' });
        return fn(crew, fresh);
    });
    return { crew, me, result, snap: () => snapshot(crew, me.id, ctx.now()) };
}

export async function updateCrew(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const name = validCrewName(b.name);
    const r = await withCrew(ctx, req, (crew, me) => { requireOwner(me); crew.name = name; });
    return json({ snapshot: r.snap() });
}

export async function rotateInvite(ctx: Ctx, req: Request) {
    const r = await withCrew(ctx, req, (crew, me) => { requireOwner(me); crew.invite = secret(24); });
    return json({ snapshot: r.snap() });
}

export async function updateMe(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const r = await withCrew(ctx, req, (crew, me) => {
        if (b.name !== undefined) {
            const name = personName(b.name);
            if (nameTaken(crew, name, me.id)) throw new HttpError(409, `"${name}" adında bir üye zaten var`);
            me.name = name;
        }
        if (b.color !== undefined) me.color = validColor(b.color, me.color);
    });
    return json({ snapshot: r.snap() });
}

export async function rotateMyToken(ctx: Ctx, req: Request) {
    const s = secret();
    const r = await withCrew(ctx, req, (_crew, me) => { me.tokenHash = sha(s); });
    return json({ token: memberToken(r.crew.id, r.me.id, s), snapshot: snapshot(r.crew, r.me.id, ctx.now()) });
}

/** Kurucu, cihazını kaybeden bir üyeye yeni giriş bağlantısı üretir. */
export async function relinkMember(ctx: Ctx, req: Request, p: Record<string, string>) {
    const s = secret();
    const r = await withCrew(ctx, req, (crew, me) => {
        requireOwner(me);
        const m = crew.members.find(x => x.id === p.mid && !x.removed);
        if (!m) throw new HttpError(404, 'Üye bulunamadı');
        m.tokenHash = sha(s);
        return m;
    });
    return json({ token: memberToken(r.crew.id, r.result.id, s), snapshot: r.snap() });
}

export async function removeMember(ctx: Ctx, req: Request, p: Record<string, string>) {
    const r = await withCrew(ctx, req, (crew, me) => {
        const self = p.mid === me.id;
        if (!self) requireOwner(me);
        const m = crew.members.find(x => x.id === p.mid && !x.removed);
        if (!m) throw new HttpError(404, 'Üye bulunamadı');
        m.removed = true; m.tokenHash = null;
        if (m.role === 'owner') {
            m.role = 'member';
            const heir = crew.members.filter(x => !x.removed).sort((a, b) => a.joinedAt - b.joinedAt)[0];
            if (heir) heir.role = 'owner';
        }
        return self;
    });
    return json(r.result ? { left: true } : { snapshot: r.snap() });
}

export async function makeOwner(ctx: Ctx, req: Request, p: Record<string, string>) {
    const r = await withCrew(ctx, req, (crew, me) => {
        requireOwner(me);
        const m = crew.members.find(x => x.id === p.mid && !x.removed);
        if (!m) throw new HttpError(404, 'Üye bulunamadı');
        if (m.id === me.id) return;
        m.role = 'owner'; me.role = 'member';
    });
    return json({ snapshot: r.snap() });
}

export async function claim(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const key = typeof b.guestKey === 'string' ? foldKey(b.guestKey) : '';
    if (!key) throw new HttpError(400, 'Misafir seçilmedi');
    const r = await withCrew(ctx, req, (crew, me) => {
        const target = typeof b.memberId === 'string' && b.memberId !== me.id ? b.memberId : me.id;
        if (target !== me.id) requireOwner(me);
        if (!crew.members.some(m => m.id === target && !m.removed)) throw new HttpError(404, 'Üye bulunamadı');
        return claimGuest(crew, key, target);
    });
    return json({ claimed: r.result, snapshot: r.snap() });
}

export async function deleteCrew(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const { crew, member } = await authMember(ctx, req);
    requireOwner(member);
    if (typeof b.confirm !== 'string' || b.confirm.trim().toLocaleLowerCase('tr') !== crew.name.toLocaleLowerCase('tr')) {
        throw new HttpError(400, 'Onay için ekip adını aynen yaz');
    }
    const photoIds = crew.visits.flatMap(v => v.photos.map(p => p.id)).filter(id => id.startsWith('ph_'));
    const shareIds = crew.visits.map(v => v.shareId).filter((s): s is string => !!s);
    await ctx.kv.delete(crewKey(crew.id));
    await Promise.allSettled([...photoIds.map(id => ctx.kv.delete('photo/' + id)), ...shareIds.map(id => ctx.kv.delete('share/' + id))]);
    return json({ deleted: true });
}
