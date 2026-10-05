// Hesap profili: ad, renk, onaylar ve hesabın ekipleri (dizin). Yetki her zaman ekip belgesindeki
// üye kaydından (userId) gelir; buradaki ekip listesi yalnızca "ekiplerim" listesini hızlı kurmak için.
import { HttpError, sleep } from './http';
import type { Ctx } from './crew';
import type { IdentityUser } from './identity';

export interface UserDoc {
    v: 1;
    id: string;
    email: string;
    name: string;
    color: number;
    createdAt: number;
    updatedAt: number;
    crews: { crewId: string; memberId: string; joinedAt: number }[];
    /** Onay zaman damgaları: 18 yaş beyanı, kullanım koşulları, aydınlatma metni. */
    consents: { adult: number; terms: number; privacy: number };
}

const USER_ID_RE = /^[\w-]{6,64}$/;
export const userKey = (id: string) => `user/${id}`;

export async function loadUser(ctx: Ctx, id: string) {
    if (!USER_ID_RE.test(id)) return null;
    return ctx.kv.getJSON<UserDoc>(userKey(id));
}

/** Kullanıcı belgesini koşullu günceller (çakışmada taze belgeyle tekrar dener). */
export async function mutateUser<T>(ctx: Ctx, id: string, fn: (u: UserDoc) => T): Promise<{ user: UserDoc; result: T }> {
    for (let i = 0; i < 6; i++) {
        const e = await loadUser(ctx, id);
        if (!e) throw new HttpError(404, 'Profil bulunamadı', { code: 'no_profile' });
        const result = fn(e.data);
        e.data.updatedAt = ctx.now();
        const w = await ctx.kv.setJSON(userKey(id), e.data, { onlyIfMatch: e.etag });
        if (w.modified) return { user: e.data, result };
        await sleep(15 + Math.random() * 40 * (i + 1));
    }
    throw new HttpError(503, 'Şu an çok yoğun, birazdan tekrar dene');
}

/** Profili oluşturur (yoksa). İlk girişte ad ve onaylarla çağrılır. */
export async function createUser(ctx: Ctx, iu: IdentityUser, name: string, color: number): Promise<UserDoc> {
    const now = ctx.now();
    const doc: UserDoc = {
        v: 1, id: iu.id, email: iu.email, name, color, createdAt: now, updatedAt: now, crews: [],
        consents: { adult: now, terms: now, privacy: now }
    };
    const w = await ctx.kv.setJSON(userKey(iu.id), doc, { onlyIfNew: true });
    if (!w.modified) {
        const e = await loadUser(ctx, iu.id);
        if (e) return e.data;
        throw new HttpError(409, 'Tekrar dene');
    }
    return doc;
}

/** Profili zorunlu kılar: hesap var ama profil tamamlanmamışsa 403 (istemci tamamlama ekranını açar). */
export async function requireProfile(ctx: Ctx, iu: IdentityUser): Promise<UserDoc> {
    const e = await loadUser(ctx, iu.id);
    if (!e) throw new HttpError(403, 'Önce profilini tamamla', { code: 'no_profile' });
    return e.data;
}

export async function indexCrew(ctx: Ctx, userId: string, crewId: string, memberId: string) {
    await mutateUser(ctx, userId, u => {
        u.crews = u.crews.filter(c => c.crewId !== crewId);
        u.crews.push({ crewId, memberId, joinedAt: ctx.now() });
    }).catch(() => undefined);
}

export async function unindexCrew(ctx: Ctx, userId: string, crewId: string) {
    await mutateUser(ctx, userId, u => { u.crews = u.crews.filter(c => c.crewId !== crewId); }).catch(() => undefined);
}
