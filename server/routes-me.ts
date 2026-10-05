// Hesap: profil, ekiplerim, eski cihaz üyeliklerini hesaba bağlama ve hesap silme.
import { cleanLine } from '../shared/text';
import { validColor, validPersonName } from '../shared/validate';
import { checkMember, loadCrew, mutateCrew, parseToken, requireUser, type Ctx } from './crew';
import { HttpError, json, readJSON } from './http';
import { purgeCrew } from './routes-crew';
import { createUser, indexCrew, loadUser, mutateUser, userKey } from './users';

export interface MyCrew { crewId: string; crewName: string; memberId: string; role: 'owner' | 'member' }

const ANON = 'Silinmiş üye';

function personName(v: unknown): string {
    const r = validPersonName(v);
    if (!r.ok) throw new HttpError(400, r.error);
    return r.value;
}

/** Profil ve geçerli ekip üyelikleri. Profil yoksa 404 + no_profile (istemci tamamlama ekranını açar). */
export async function getMe(ctx: Ctx, req: Request) {
    const user = await requireUser(ctx, req);
    const e = await loadUser(ctx, user.id);
    if (!e) return json({ error: 'Profil yok', code: 'no_profile', identity: { email: user.email, name: user.name, provider: user.provider } }, 404);
    const doc = e.data;
    const crews: MyCrew[] = [];
    const stale: string[] = [];
    await Promise.all(doc.crews.map(async c => {
        const ce = await loadCrew(ctx, c.crewId);
        const m = ce?.data.members.find(x => x.id === c.memberId && x.userId === user.id && !x.removed);
        if (ce && m) crews.push({ crewId: ce.data.id, crewName: ce.data.name, memberId: m.id, role: m.role });
        else stale.push(c.crewId);
    }));
    if (stale.length) await mutateUser(ctx, user.id, u => { u.crews = u.crews.filter(c => !stale.includes(c.crewId)); }).catch(() => undefined);
    const order = new Map(doc.crews.map((c, i) => [c.crewId, i]));
    crews.sort((a, b) => (order.get(a.crewId) ?? 0) - (order.get(b.crewId) ?? 0));
    return json({ profile: { id: doc.id, email: user.email || doc.email, name: doc.name, color: doc.color, provider: user.provider, createdAt: doc.createdAt }, crews });
}

/** İlk girişte profil oluşturur (ad, renk ve onaylar). */
export async function createMe(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const user = await requireUser(ctx, req);
    if (b.adult !== true || b.terms !== true) throw new HttpError(400, '18 yaş beyanı ve kullanım koşullarının onayı gerekli');
    await createUser(ctx, user, personName(b.name), validColor(b.color, 0));
    return getMe(ctx, req);
}

export async function updateMeProfile(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const user = await requireUser(ctx, req);
    await mutateUser(ctx, user.id, u => {
        if (b.name !== undefined) u.name = personName(b.name);
        if (b.color !== undefined) u.color = validColor(b.color, u.color);
        if (user.email) u.email = user.email;
    });
    return getMe(ctx, req);
}

/**
 * Bu cihazdaki eski ekip anahtarlarını (m1.…) hesaba bağlar. Bağlanan üyenin cihaz anahtarı geçersiz olur;
 * erişim artık hesap üzerinden. Her anahtar için sonuç döner.
 */
export async function attachTokens(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const user = await requireUser(ctx, req);
    if (!(await loadUser(ctx, user.id))) throw new HttpError(403, 'Önce profilini tamamla', { code: 'no_profile' });
    const tokens = Array.isArray(b.tokens) ? b.tokens.filter((t): t is string => typeof t === 'string').slice(0, 20) : [];
    const results: { crewId: string | null; status: 'ok' | 'invalid' | 'taken' | 'already' }[] = [];
    for (const raw of tokens) {
        const tok = parseToken(new Request('http://x', { headers: { authorization: 'Bearer ' + raw } }));
        if (!tok || tok.kind !== 'member') { results.push({ crewId: null, status: 'invalid' }); continue; }
        const entry = await loadCrew(ctx, tok.crewId);
        const m0 = entry && checkMember(entry.data, tok);
        if (!entry || !m0) { results.push({ crewId: tok.crewId, status: 'invalid' }); continue; }
        try {
            const r = await mutateCrew(ctx, tok.crewId, crew => {
                const m = crew.members.find(x => x.id === m0.id && !x.removed);
                if (!m || m.tokenHash !== m0.tokenHash) return 'invalid' as const;
                if (m.userId && m.userId !== user.id) return 'taken' as const;
                const other = crew.members.find(x => x.userId === user.id && !x.removed && x.id !== m.id);
                if (other) return 'already' as const;
                m.userId = user.id;
                m.tokenHash = null;
                return 'ok' as const;
            });
            if (r.result === 'ok') await indexCrew(ctx, user.id, tok.crewId, m0.id);
            results.push({ crewId: tok.crewId, status: r.result });
        } catch {
            results.push({ crewId: tok.crewId, status: 'invalid' });
        }
    }
    return json({ results });
}

/**
 * Hesabı siler: her ekipte üye kaydı ve ziyaretlerdeki adı anonimleştirilir, kurucuysa kurucluk en eski
 * üyeye geçer, ekipte kimse kalmazsa ekip tamamen silinir. Sonra profil ve kimlik hesabı silinir.
 */
export async function deleteMe(ctx: Ctx, req: Request) {
    const b = await readJSON(req);
    const user = await requireUser(ctx, req);
    if (cleanLine(b.confirm, 20).toLocaleUpperCase('tr') !== 'SİL') throw new HttpError(400, 'Onay için SİL yaz');
    const doc = (await loadUser(ctx, user.id))?.data;
    for (const c of doc?.crews ?? []) {
        try {
            const r = await mutateCrew(ctx, c.crewId, crew => {
                const m = crew.members.find(x => x.userId === user.id && !x.removed);
                if (!m) return crew.members.some(x => !x.removed);
                m.removed = true; m.userId = null; m.tokenHash = null; m.name = ANON;
                for (const v of crew.visits) for (const p of v.participants) if (p.memberId === m.id) p.name = ANON;
                if (m.role === 'owner') {
                    m.role = 'member';
                    const heir = crew.members.filter(x => !x.removed).sort((a, b) => a.joinedAt - b.joinedAt)[0];
                    if (heir) heir.role = 'owner';
                }
                return crew.members.some(x => !x.removed);
            });
            if (!r.result) await purgeCrew(ctx, r.crew);
        } catch (e) {
            if (!(e instanceof HttpError && e.status === 404)) throw e;
        }
    }
    await ctx.kv.delete(userKey(user.id));
    let identityDeleted = true;
    try { await ctx.identity.deleteUser(user.id); } catch (e) { identityDeleted = false; console.error('Kimlik hesabı silinemedi', e); }
    return json({ deleted: true, identityDeleted });
}

/** Yalnızca yerel geliştirme: e-postayla anında giriş (şifre yok). */
export async function devLogin(ctx: Ctx, req: Request) {
    if (!ctx.dev || !ctx.identity.devLogin) throw new HttpError(404, 'Bulunamadı');
    const b = await readJSON(req);
    const email = cleanLine(b.email, 120).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Geçerli bir e-posta yaz');
    const name = cleanLine(b.name, 40) || email.split('@')[0];
    return json({ token: ctx.identity.devLogin(email, name), user: { email, name } });
}
