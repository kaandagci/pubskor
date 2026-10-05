// Tek telefonla puanlamanın taslağı. Her dokunuşta cihaza yazılır; sekme kapansa da kaldığı yerden sürer.
import { signal } from '@preact/signals';
import type { KindId, MetricId } from '../../shared/metrics';
import type { OrderItem, Participant, Sheet, VenueInput } from '../../shared/types';
import { idb } from '../lib/storage';
import type { PendingPhoto } from './outbox';

export interface Draft {
    crewId: string;
    visitId: string;
    venue: VenueInput;
    /** Ekipte zaten var olan mekan seçildiyse kimliği. */
    venueId: string | null;
    date: string;
    participants: Participant[];
    metrics: MetricId[];
    kinds: KindId[];
    items: OrderItem[];
    sheets: Record<string, Sheet>;
    notes: string;
    spend: number | null;
    photos: PendingPhoto[];
    /** Hangi kişi, hangi kriter, hangi aşama. */
    cursor: { p: number; m: number; phase: 'handoff' | 'rate' | 'review' };
    startedAt: number;
}

export const draft = signal<Draft | null>(null);
let loadedFor: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const key = (crewId: string) => 'draft:' + crewId;

export async function loadDraft(crewId: string | null) {
    if (!crewId) { draft.value = null; loadedFor = null; return; }
    if (loadedFor === crewId) return;
    loadedFor = crewId;
    const d = await idb.get<Draft>(key(crewId));
    if (loadedFor === crewId) draft.value = d && d.crewId === crewId ? d : null;
}

export function setDraft(next: Draft | null, immediate = false) {
    draft.value = next;
    if (timer) clearTimeout(timer);
    const write = () => {
        if (next) void idb.set(key(next.crewId), next);
        else if (loadedFor) void idb.del(key(loadedFor));
    };
    if (immediate || !next) write(); else timer = setTimeout(write, 250);
}

export function updateDraft(fn: (d: Draft) => Draft | void) {
    const cur = draft.value;
    if (!cur) return;
    const copy: Draft = structuredClone(cur);
    const res = fn(copy);
    setDraft(res ?? copy);
}

export function clearDraft() {
    setDraft(null);
}
