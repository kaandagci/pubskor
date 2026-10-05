// Etkin ekibin verisi: önce cihazdaki kopyadan anında açılır, sonra sunucudan tazelenir (ETag ile).
import { signal } from '@preact/signals';
import type { CrewSnapshot } from '../../shared/types';
import { ApiError, request } from '../lib/api';
import { idb } from '../lib/storage';
import { activeMembership, crewAuth, removeMembership, updateMembership } from './session';
import { toast } from './ui';

export const snapshot = signal<CrewSnapshot | null>(null);
export const crewStatus = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
export const lastSync = signal(0);
export const syncError = signal<string | null>(null);

let loadedFor: string | null = null;
let inflight: Promise<void> | null = null;

export function applySnapshot(s: CrewSnapshot) {
    const m = activeMembership.value;
    if (m && s.id === m.crewId) {
        snapshot.value = s;
        crewStatus.value = 'ready';
        if (s.name !== m.crewName || s.me !== m.memberId) updateMembership(s.id, { crewName: s.name, memberId: s.me });
    }
    void idb.set('crew:' + s.id, s);
}

/** Ekip seçimi değişince önbellekten yükler ve sunucudan tazeler. */
export async function syncCrew(opts: { force?: boolean } = {}): Promise<void> {
    const m = activeMembership.value;
    if (!m) { snapshot.value = null; loadedFor = null; crewStatus.value = 'idle'; return; }
    if (loadedFor !== m.crewId) {
        loadedFor = m.crewId;
        const cached = await idb.get<CrewSnapshot>('crew:' + m.crewId);
        if (activeMembership.value?.crewId !== m.crewId) return;
        snapshot.value = cached ?? null;
        crewStatus.value = cached ? 'ready' : 'loading';
    }
    if (inflight && !opts.force) return inflight;
    const crewId = m.crewId;
    inflight = (async () => {
        try {
            const cur = snapshot.value;
            const etag = cur && cur.id === crewId ? `W/"r${cur.rev}-${cur.me}"` : undefined;
            const s = await request<CrewSnapshot | null>('GET', '/api/crew', { ...crewAuth(m), headers: etag ? { 'if-none-match': etag } : {} });
            if (activeMembership.value?.crewId !== crewId) return;
            if (s) applySnapshot(s);
            syncError.value = null;
            lastSync.value = Date.now();
            if (crewStatus.value !== 'ready') crewStatus.value = snapshot.value ? 'ready' : 'error';
        } catch (e) {
            if (handleAuthError(e, crewId)) return;
            syncError.value = e instanceof Error ? e.message : 'Eşitlenemedi';
            if (!snapshot.value) crewStatus.value = 'error';
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}

/** Jeton geçersizse ya da ekip silindiyse üyeliği bu cihazdan kaldırır. */
export function handleAuthError(e: unknown, crewId: string): boolean {
    if (!(e instanceof ApiError) || e.status !== 401) return false;
    if (e.code === 'login_required') return false; // hesap oturumu düştü: üyelik silinmez, giriş istenir
    const m = activeMembership.value;
    const name = m?.crewId === crewId ? m.crewName : 'ekip';
    removeMembership(crewId);
    void idb.del('crew:' + crewId);
    if (loadedFor === crewId) { loadedFor = null; snapshot.value = null; crewStatus.value = 'idle'; }
    toast(e.code === 'crew_gone' ? `“${name}” ekibi artık yok` : `“${name}” ekibine erişimin sona erdi`, 'error');
    return true;
}

/** Ekip üzerinde değişiklik yapan istek; dönen güncel görüntüyü uygular. */
export async function mutate<T = { snapshot?: CrewSnapshot }>(method: string, path: string, body?: unknown): Promise<T> {
    const m = activeMembership.value;
    if (!m) throw new ApiError('Önce bir ekibe katıl', 401);
    try {
        const r = await request<T & { snapshot?: CrewSnapshot }>(method, path, { ...crewAuth(m), body });
        if (r?.snapshot) applySnapshot(r.snapshot);
        return r;
    } catch (e) {
        handleAuthError(e, m.crewId);
        throw e;
    }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Görünürken 30 sn'de bir, sekmeye dönüldüğünde hemen tazeler. */
export function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => { if (!document.hidden) void syncCrew(); }, 30000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && Date.now() - lastSync.value > 8000) void syncCrew();
    });
    window.addEventListener('online', () => void syncCrew());
}

export function forgetCrewCache(crewId: string) {
    void idb.del('crew:' + crewId);
    if (loadedFor === crewId) { loadedFor = null; snapshot.value = null; }
}
