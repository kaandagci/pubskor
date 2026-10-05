// Ekranların okuduğu türetilmiş veri: sunucu görüntüsü + gönderilmeyi bekleyen ziyaretler.
import { computed } from '@preact/signals';
import { kindsOf } from '../../shared/metrics';
import { analyze } from '../../shared/scoring';
import { byDateDesc, highlights, summarizePeople, summarizeVenues, type PersonSummary, type VenueSummary } from '../../shared/insights';
import type { Member, Venue, Visit } from '../../shared/types';
import { snapshot } from './crew';
import { outbox, type OutboxItem } from './outbox';

export { snapshot };

export const me = computed<Member | null>(() => {
    const s = snapshot.value;
    return s ? s.members.find(m => m.id === s.me) ?? null : null;
});
export const isOwner = computed(() => me.value?.role === 'owner');
export const activeMembers = computed(() => (snapshot.value?.members ?? []).filter(m => !m.removed));
export const membersById = computed(() => new Map((snapshot.value?.members ?? []).map(m => [m.id, m])));

const crewOutbox = computed<OutboxItem[]>(() => {
    const id = snapshot.value?.id;
    return id ? outbox.value.filter(x => x.crewId === id) : [];
});

export const pendingIds = computed(() => new Set(crewOutbox.value.map(x => x.visit.id)));
export const failedItems = computed(() => crewOutbox.value.filter(x => x.error));

function pendingVisit(item: OutboxItem, base: Visit | undefined): Visit {
    const v = item.visit;
    const metrics = v.metrics;
    return {
        id: v.id,
        venueId: v.venueId ?? v.venue!.id,
        date: v.date,
        participants: v.participants,
        sheets: v.sheets,
        metrics,
        kinds: v.kinds ?? kindsOf(metrics),
        items: v.items ?? [],
        notes: v.notes ?? '',
        photos: [...(v.photos ?? []).filter(p => !item.photos.some(x => x.id === p.id)), ...item.photos.map(p => ({ id: p.id, w: p.w, h: p.h }))],
        spend: v.spend ?? null,
        score: analyze({ participants: v.participants, sheets: v.sheets, metrics }).score,
        source: v.source ?? 'single',
        createdAt: base?.createdAt ?? item.queuedAt,
        createdBy: base?.createdBy ?? snapshot.value?.me ?? null,
        updatedAt: item.queuedAt,
        deletedAt: null,
        shareId: base?.shareId ?? null
    };
}

/** Silinmişler dahil tüm ziyaretler (bekleyenler üstüne yazılmış). */
export const allVisits = computed<Visit[]>(() => {
    const base = snapshot.value?.visits ?? [];
    const pend = crewOutbox.value;
    if (!pend.length) return base;
    const byId = new Map(base.map(v => [v.id, v]));
    for (const item of pend) byId.set(item.visit.id, pendingVisit(item, byId.get(item.visit.id)));
    return [...byId.values()];
});

export const visits = computed<Visit[]>(() => allVisits.value.filter(v => !v.deletedAt).sort(byDateDesc));
export const deletedVisits = computed<Visit[]>(() => allVisits.value.filter(v => v.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)));

export const venues = computed<Venue[]>(() => {
    const base = snapshot.value?.venues ?? [];
    const extra: Venue[] = [];
    for (const item of crewOutbox.value) {
        const vi = item.visit.venue;
        if (vi && !base.some(v => v.id === vi.id) && !extra.some(v => v.id === vi.id)) {
            extra.push({ id: vi.id, name: vi.name, kind: vi.kind ?? 'diger', area: vi.area ?? '', address: vi.address ?? '', lat: vi.lat ?? null, lng: vi.lng ?? null, osm: vi.osm ?? null, tags: [], wish: null, createdAt: item.queuedAt });
        }
    }
    return extra.length ? [...base, ...extra] : base;
});

export const venueById = computed(() => new Map(venues.value.map(v => [v.id, v])));
export const venueSummaries = computed<VenueSummary[]>(() => summarizeVenues(venues.value, visits.value));
export const summaryById = computed(() => new Map(venueSummaries.value.map(s => [s.venue.id, s])));
export const people = computed<PersonSummary[]>(() => summarizePeople(visits.value));
export const crewHighlights = computed(() => highlights(people.value, venueSummaries.value, visits.value));

export const venueName = (id: string) => venueById.value.get(id)?.name ?? 'Bilinmeyen mekan';

/** Gidilecekler: listeye eklenmiş mekanlar (en yeni üstte). */
export const wishlist = computed<Venue[]>(() => venues.value.filter(v => v.wish).sort((a, b) => (b.wish!.at ?? 0) - (a.wish!.at ?? 0)));
