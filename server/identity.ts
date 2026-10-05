// Hesap doğrulama. Üretimde Netlify Identity (e-posta + şifre, Google): istemci Identity erişim anahtarını
// (JWT) "Authorization: Bearer" başlığıyla gönderir, sunucu anahtarı Identity'ye sorarak doğrular.
// Yerel geliştirme ve testlerde imzalı "dev." anahtarları kullanılır. Arayüz sayesinde başka bir kimlik
// sağlayıcısına geçmek yalnızca yeni bir uygulama yazmayı gerektirir.
import { createHash, createHmac } from 'node:crypto';
import { safeEq } from './crew';

export interface IdentityUser {
    id: string;
    email: string;
    name: string;
    provider: string;
}

export interface Identity {
    /** İsteği yapan hesap (yoksa ya da anahtar geçersizse null). */
    user(req: Request): Promise<IdentityUser | null>;
    /** Hesabı kimlik sağlayıcısından siler (hesap silme). */
    deleteUser(id: string): Promise<void>;
    /** Yalnızca geliştirme: e-postayla anında giriş anahtarı üretir. */
    devLogin?(email: string, name: string): string;
}

const JWT_RE = /^[\w-]+\.[\w-]+\.[\w-]+$/;

export function bearer(req: Request): string | null {
    const m = /^Bearer\s+(\S{10,4000})$/i.exec(req.headers.get('authorization') || '');
    return m ? m[1] : null;
}

function claims(jwt: string): Record<string, unknown> | null {
    try { return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')); } catch { return null; }
}

const toUser = (u: Record<string, any>): IdentityUser => ({
    id: String(u.id ?? u.sub),
    email: String(u.email ?? ''),
    name: String(u.user_metadata?.full_name ?? u.user_metadata?.name ?? '').slice(0, 40),
    provider: String(u.app_metadata?.provider ?? 'email')
});

/**
 * Netlify Identity: anahtar, sitenin /.netlify/identity/user ucuna sorularak doğrulanır.
 * Doğrulanan anahtarlar sıcak fonksiyonda en fazla 5 dakika (ve süresi dolana kadar) bellekte tutulur.
 */
export function netlifyIdentity(siteUrl?: string): Identity {
    const cache = new Map<string, { user: IdentityUser; until: number }>();
    const base = (req: Request) => `${siteUrl || new URL(req.url).origin}/.netlify/identity`;
    return {
        async user(req) {
            const jwt = bearer(req);
            if (!jwt || !JWT_RE.test(jwt)) return null;
            const key = createHash('sha256').update(jwt).digest('base64url');
            const now = Date.now();
            const hit = cache.get(key);
            if (hit && hit.until > now) return hit.user;
            const exp = Number(claims(jwt)?.exp ?? 0) * 1000;
            if (exp && exp < now) return null;
            let res: Response;
            try {
                res = await fetch(`${base(req)}/user`, { headers: { authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(6000) });
            } catch {
                return null;
            }
            if (!res.ok) return null;
            const user = toUser(await res.json());
            if (cache.size > 2000) cache.clear();
            cache.set(key, { user, until: Math.min(exp || now + 300_000, now + 300_000) });
            return user;
        },
        async deleteUser(id) {
            const { admin } = await import('@netlify/identity');
            await admin.deleteUser(id);
        }
    };
}

/**
 * Yerel geliştirme ve testler: "dev.<veri>.<imza>" anahtarları. Üretimde hiç kullanılmaz
 * (Netlify fonksiyonları yalnızca netlifyIdentity ile kurulur).
 */
export function devIdentity(secret = 'pubskor-dev'): Identity {
    const sign = (data: string) => createHmac('sha256', secret).update(data).digest('base64url').slice(0, 32);
    const deleted = new Set<string>();
    return {
        async user(req) {
            const tok = bearer(req);
            if (!tok?.startsWith('dev.')) return null;
            const [, data, sig] = tok.split('.');
            if (!data || !sig || !safeEq(sig, sign(data))) return null;
            try {
                const u = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as IdentityUser;
                return deleted.has(u.id) ? null : u;
            } catch { return null; }
        },
        async deleteUser(id) { deleted.add(id); },
        devLogin(email, name) {
            const id = 'dev-' + createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 24);
            const data = Buffer.from(JSON.stringify({ id, email, name, provider: 'email' } satisfies IdentityUser)).toString('base64url');
            return `dev.${data}.${sign(data)}`;
        }
    };
}
