// Hesabın ekip üyelikleri (sunucudaki /api/me listesinin cihazdaki kopyası; çevrimdışı açılış için) ve canlı
// masa koltuk jetonları. Eski sürümden kalan, henüz hesaba bağlanmamış üyeliklerde cihaz anahtarı (token) olur.
import { computed, signal } from '@preact/signals';
import { local } from '../lib/storage';

export interface Membership {
    crewId: string;
    crewName: string;
    memberId: string;
    /** Yalnızca eski sürümden kalan, hesaba bağlanmamış üyelik. */
    token?: string;
    role?: 'owner' | 'member';
    addedAt: number;
}

export const memberships = signal<Membership[]>(local.get<Membership[]>('memberships', []).filter(m => m && m.crewId));
export const activeCrewId = signal<string | null>(local.get<string | null>('active', null));
if (!memberships.value.some(m => m.crewId === activeCrewId.value)) activeCrewId.value = memberships.value[0]?.crewId ?? null;

export const activeMembership = computed(() => memberships.value.find(m => m.crewId === activeCrewId.value) ?? null);

function persist() {
    local.set('memberships', memberships.value);
    local.set('active', activeCrewId.value);
}

export function addMembership(m: Omit<Membership, 'addedAt'>) {
    memberships.value = [...memberships.value.filter(x => x.crewId !== m.crewId), { ...m, addedAt: Date.now() }];
    activeCrewId.value = m.crewId;
    persist();
}

export function updateMembership(crewId: string, patch: Partial<Membership>) {
    let changed = false;
    memberships.value = memberships.value.map(m => {
        if (m.crewId !== crewId) return m;
        const next = { ...m, ...patch };
        if (JSON.stringify(next) !== JSON.stringify(m)) changed = true;
        return next;
    });
    if (changed) persist();
}

export function removeMembership(crewId: string) {
    memberships.value = memberships.value.filter(m => m.crewId !== crewId);
    if (activeCrewId.value === crewId) activeCrewId.value = memberships.value[0]?.crewId ?? null;
    persist();
}

export function setActiveCrew(crewId: string) {
    if (!memberships.value.some(m => m.crewId === crewId)) return;
    activeCrewId.value = crewId;
    persist();
}

/** Ekip isteği seçenekleri: hesapla (X-Crew-Id) ya da eski cihaz anahtarıyla. */
export const crewAuth = (m: Membership) => ({ crew: m.crewId, token: m.token ?? null });

/** Eski sürümden kalan, hesaba bağlanmamış üyelikler. */
export const legacyMemberships = () => memberships.value.filter(m => !!m.token);

/** Sunucudaki hesap üyelikleriyle cihazdaki listeyi eşitler (bağlanmamış eski üyelikler korunur). */
export function setAccountMemberships(list: { crewId: string; crewName: string; memberId: string; role: 'owner' | 'member' }[]) {
    const prev = new Map(memberships.value.map(m => [m.crewId, m]));
    const next: Membership[] = list.map(c => ({ ...c, addedAt: prev.get(c.crewId)?.addedAt ?? Date.now() }));
    for (const m of memberships.value) if (m.token && !next.some(x => x.crewId === m.crewId)) next.push(m);
    memberships.value = next;
    if (!next.some(m => m.crewId === activeCrewId.value)) activeCrewId.value = next[0]?.crewId ?? null;
    persist();
}

/** Çıkışta cihazdaki hesap üyeliklerini unutur. */
export function clearMemberships() {
    memberships.value = [];
    activeCrewId.value = null;
    persist();
}

// ----- Canlı masa koltukları (misafir olarak katılınan masalar) -----

export interface Seat { pid: string; token: string; at: number }

export function seatFor(code: string): Seat | null {
    return local.get<Record<string, Seat>>('seats', {})[code] ?? null;
}

export function saveSeat(code: string, seat: Omit<Seat, 'at'>) {
    const all = local.get<Record<string, Seat>>('seats', {});
    // eski koltukları temizle (2 günden eski)
    for (const [k, v] of Object.entries(all)) if (Date.now() - v.at > 2 * 86400000) delete all[k];
    all[code] = { ...seat, at: Date.now() };
    local.set('seats', all);
}

export function dropSeat(code: string) {
    const all = local.get<Record<string, Seat>>('seats', {});
    delete all[code];
    local.set('seats', all);
}
