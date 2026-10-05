// Hesap: Netlify Identity (e-posta + şifre, Google). Oturum tarayıcıda (localStorage) tutulur;
// API isteklerine Identity erişim anahtarı "Authorization: Bearer" olarak eklenir ve süresi dolunca yenilenir.
// Yerel geliştirmede Identity olmadığından e-postayla anında giriş yapan sahte bir sağlayıcı kullanılır.
import { signal } from '@preact/signals';
import GoTrue, { type User } from 'gotrue-js';
import { local } from './storage';

export interface AuthUser { id: string; email: string; name: string; provider: string }

const DEV = import.meta.env.DEV;

let gotrue: GoTrue | null = null;
const client = () => (gotrue ??= new GoTrue({ APIUrl: `${location.origin}/.netlify/identity`, setCookie: false }));

const fromGotrue = (u: User): AuthUser => ({
    id: u.id,
    email: u.email,
    name: String(u.user_metadata?.full_name ?? u.user_metadata?.name ?? ''),
    provider: String(u.app_metadata?.provider ?? 'email')
});

interface DevSession { token: string; user: AuthUser }

function initialUser(): AuthUser | null {
    if (DEV) return local.get<DevSession | null>('dev-auth', null)?.user ?? null;
    try { const u = client().currentUser(); return u ? fromGotrue(u) : null; } catch { return null; }
}

/** Giriş yapmış hesap (yoksa null). */
export const authUser = signal<AuthUser | null>(initialUser());

/** API isteği için geçerli erişim anahtarı (gerekirse yenilenir). */
export async function authToken(): Promise<string | null> {
    if (DEV) return local.get<DevSession | null>('dev-auth', null)?.token ?? null;
    const u = client().currentUser();
    if (!u) return null;
    try { return await u.jwt(); } catch {
        // Yenileme anahtarı geçersiz (şifre değişti, hesap silindi): oturumu kapat
        try { u.clearSession(); } catch { /* yok say */ }
        authUser.value = null;
        return null;
    }
}

/** Identity hata mesajlarını Türkçeleştirir. */
export function authMessage(e: unknown): string {
    const raw = (e as { json?: { error_description?: string; msg?: string } })?.json;
    const msg = String(raw?.error_description ?? raw?.msg ?? (e instanceof Error ? e.message : '') ?? '');
    if (/not confirmed/i.test(msg)) return 'E-postanı henüz doğrulamadın. Gelen kutundaki bağlantıya dokun.';
    if (/invalid|no user found|password/i.test(msg) && /login|grant|user|password/i.test(msg)) return 'E-posta ya da şifre hatalı';
    if (/already been registered|already registered|exists/i.test(msg)) return 'Bu e-postayla zaten bir hesap var. Giriş yap ya da şifreni sıfırla.';
    if (/signups not allowed|disabled/i.test(msg)) return 'Kayıtlar şu an kapalı';
    if (/at least|too short/i.test(msg)) return 'Şifre en az 8 karakter olmalı';
    if (/rate limit|too many/i.test(msg)) return 'Çok fazla deneme; biraz sonra tekrar dene';
    if (/failed to fetch|network/i.test(msg)) return 'Bağlantı yok; internetini kontrol et';
    if (/404|not found/i.test(msg)) return 'Hesap sistemi henüz açılmamış. Site yöneticisi Netlify Identity\'yi etkinleştirmeli.';
    return msg || 'Bir sorun oluştu, tekrar dene';
}

export async function login(email: string, password: string): Promise<AuthUser> {
    if (DEV) return devLogin(email, '');
    const u = fromGotrue(await client().login(email.trim(), password, true));
    authUser.value = u;
    return u;
}

/** Kayıt. E-posta doğrulaması açıksa `confirm: true` döner (kullanıcı bağlantıya dokunmalı). */
export async function signup(email: string, password: string, name: string): Promise<{ confirm: boolean }> {
    if (DEV) { await devLogin(email, name); return { confirm: false }; }
    const r = await client().signup(email.trim(), password, { full_name: name.trim() });
    if (r.confirmed_at) { await login(email, password); return { confirm: false }; }
    return { confirm: true };
}

/** Google ile giriş: Identity'nin Google sayfasına gider, dönüşte `handleCallback` oturumu açar. */
export function googleLogin() {
    if (DEV) { void devLogin('google.kullanici@example.com', 'Google Kullanıcısı').then(() => location.assign('/')); return; }
    location.assign(client().loginExternalUrl('google'));
}

export async function requestRecovery(email: string) {
    if (DEV) return;
    await client().requestPasswordRecovery(email.trim());
}

export async function setPassword(password: string) {
    if (DEV) return;
    const u = client().currentUser();
    if (!u) throw new Error('Oturum yok');
    await u.update({ password });
}

export async function logout() {
    if (DEV) local.del('dev-auth');
    else {
        const u = client().currentUser();
        try { await u?.logout(); } catch { u?.clearSession(); }
    }
    authUser.value = null;
}

export type CallbackType = 'oauth' | 'confirmation' | 'recovery' | 'error' | null;

/**
 * Identity bağlantılarından dönüşü işler (adres çubuğundaki #confirmation_token, #recovery_token,
 * Google dönüşü #access_token). Açılışta bir kez çağrılır; adresi temizler.
 */
export async function handleCallback(): Promise<{ type: CallbackType; error?: string }> {
    const hash = location.hash.slice(1);
    if (!/(access_token|confirmation_token|recovery_token|error)=/.test(hash) || DEV) return { type: null };
    const p = new URLSearchParams(hash);
    history.replaceState(null, '', location.pathname + location.search);
    try {
        if (p.get('error')) return { type: 'error', error: p.get('error_description') ?? 'Giriş iptal edildi' };
        if (p.get('confirmation_token')) {
            authUser.value = fromGotrue(await client().confirm(p.get('confirmation_token')!, true));
            return { type: 'confirmation' };
        }
        if (p.get('recovery_token')) {
            authUser.value = fromGotrue(await client().recover(p.get('recovery_token')!, true));
            return { type: 'recovery' };
        }
        if (p.get('access_token')) {
            const u = await client().createUser({
                access_token: p.get('access_token')!, refresh_token: p.get('refresh_token') ?? '',
                expires_in: Number(p.get('expires_in') ?? 3600), expires_at: Date.now() + Number(p.get('expires_in') ?? 3600) * 1000,
                token_type: 'bearer'
            }, true);
            authUser.value = fromGotrue(u);
            return { type: 'oauth' };
        }
    } catch (e) {
        return { type: 'error', error: /expired|invalid/i.test(authMessage(e)) ? 'Bağlantının süresi dolmuş. Yeniden iste.' : authMessage(e) };
    }
    return { type: null };
}

async function devLogin(email: string, name: string): Promise<AuthUser> {
    const r = await fetch('/api/dev/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, name }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? 'Giriş yapılamadı');
    const u: AuthUser = { id: '', email: d.user.email, name: d.user.name, provider: 'email' };
    local.set('dev-auth', { token: d.token, user: u } satisfies DevSession);
    authUser.value = u;
    return u;
}
