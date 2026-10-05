// Hesap durumu: giriş, profil, ekiplerim ve eski cihaz üyeliklerinin hesaba taşınması.
import { computed, signal } from '@preact/signals';
import { ApiError, request } from '../lib/api';
import { authUser, logout as authLogout } from '../lib/auth';
import { idb, local } from '../lib/storage';
import { syncCrew } from './crew';
import { clearMemberships, legacyMemberships, memberships, setAccountMemberships } from './session';
import { toast } from './ui';

export interface Profile { id: string; email: string; name: string; color: number; provider: string; createdAt: number }
export interface MyCrew { crewId: string; crewName: string; memberId: string; role: 'owner' | 'member' }

/** 'unknown': henüz sorulmadı; 'none': profil yok (tamamlama ekranı); 'ready': profil var. */
export const profileStatus = signal<'unknown' | 'loading' | 'none' | 'ready' | 'offline'>('unknown');
export const profile = signal<Profile | null>(local.get<Profile | null>('profile', null));
/** Profil yoksa Identity'den gelen ad/e-posta (tamamlama ekranında önerilir). */
export const identityHint = signal<{ email: string; name: string } | null>(null);

export const loggedIn = computed(() => !!authUser.value);

let loading: Promise<void> | null = null;

/** /api/me: profil ve ekipler. Profil yoksa 'none'. Ağ yoksa cihazdaki kopyayla devam eder. */
export function loadMe(): Promise<void> {
    if (!authUser.value) { profileStatus.value = 'unknown'; return Promise.resolve(); }
    loading ??= (async () => {
        if (profileStatus.value === 'unknown') profileStatus.value = profile.value ? 'ready' : 'loading';
        try {
            const r = await request<{ profile: Profile; crews: MyCrew[] }>('GET', '/api/me');
            profile.value = r.profile;
            local.set('profile', r.profile);
            profileStatus.value = 'ready';
            setAccountMemberships(r.crews);
            await attachLegacy();
        } catch (e) {
            if (e instanceof ApiError && e.code === 'no_profile') {
                // Kayıt formunda onaylar alındıysa (e-posta doğrulamasından sonra da) profili hemen oluştur
                const pending = local.get<{ name: string; color: number; adult: boolean; terms: boolean } | null>('pending-profile', null);
                if (pending?.adult && pending.terms) {
                    try { await completeProfile(pending); local.del('pending-profile'); return; } catch { /* aşağıda tamamlama ekranı */ }
                }
                identityHint.value = (e.data?.identity as { email: string; name: string }) ?? null;
                profile.value = null;
                local.del('profile');
                profileStatus.value = 'none';
            } else if (e instanceof ApiError && e.status === 401) {
                await logout(true);
            } else {
                profileStatus.value = profile.value ? 'ready' : 'offline';
            }
        } finally {
            loading = null;
        }
    })();
    return loading;
}

/** İlk girişte profili oluşturur. */
export async function completeProfile(input: { name: string; color: number; adult: boolean; terms: boolean }) {
    const r = await request<{ profile: Profile; crews: MyCrew[] }>('POST', '/api/me', { body: input });
    profile.value = r.profile;
    local.set('profile', r.profile);
    profileStatus.value = 'ready';
    setAccountMemberships(r.crews);
    await attachLegacy();
}

export async function updateProfile(patch: { name?: string; color?: number }) {
    const r = await request<{ profile: Profile; crews: MyCrew[] }>('PATCH', '/api/me', { body: patch });
    profile.value = r.profile;
    local.set('profile', r.profile);
}

/** Bu cihazdaki eski (hesapsız) ekip üyeliklerini hesaba bağlar. Bir kez, otomatik çalışır. */
async function attachLegacy() {
    const legacy = legacyMemberships();
    if (!legacy.length) return;
    try {
        const r = await request<{ results: { crewId: string | null; status: string }[] }>('POST', '/api/me/attach', { body: { tokens: legacy.map(m => m.token) } });
        const ok = r.results.filter(x => x.status === 'ok').length;
        const already = r.results.filter(x => x.status === 'already').length;
        // Bağlanan, zaten bağlı olan ya da geçersiz anahtarları cihazdan sil; hesap listesinden tazele
        memberships.value = memberships.value.map(m => ({ ...m, token: undefined }));
        const me = await request<{ profile: Profile; crews: MyCrew[] }>('GET', '/api/me');
        setAccountMemberships(me.crews);
        void syncCrew({ force: true });
        if (ok) toast(ok === 1 ? 'Ekibin hesabına taşındı' : `${ok} ekibin hesabına taşındı`);
        else if (already) toast('Bu ekipler zaten hesabında');
    } catch {
        // Bir dahaki açılışta tekrar denenir
    }
}

/** Çıkış: oturumu kapatır, cihazdaki ekip kopyalarını temizler. */
export async function logout(silent = false) {
    await authLogout();
    for (const m of memberships.value) void idb.del('crew:' + m.crewId);
    clearMemberships();
    profile.value = null;
    local.del('profile');
    profileStatus.value = 'unknown';
    if (!silent) toast('Çıkış yapıldı');
}
