import { useMemo, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { newId } from '../../shared/ids';
import { KINDS, metricsFor, orderMetrics, venueKindLabel, type KindId, type MetricId } from '../../shared/metrics';
import { NA, analyze, isCell } from '../../shared/scoring';
import { todayLocal } from '../../shared/text';
import type { OrderItem, Participant, Photo, Sheet, VenueInput, Visit } from '../../shared/types';
import { LIMITS } from '../../shared/validate';
import { fmtScore } from '../lib/format';
import { activeMembers, snapshot, venueById, visits } from '../state/data';
import { enqueue, flush, forceRetry, outbox, type PendingPhoto } from '../state/outbox';
import { confirmSheet, openSheet, toast } from '../state/ui';
import { Avatar } from '../components/Avatar';
import { ItemsEditor } from '../components/Items';
import { KIND_ICONS, MapPin, Pencil, Plus, X } from '../components/icons';
import { PhotoPicker } from '../components/PhotoPicker';
import { AsyncButton, Empty, Field, TopBar } from '../components/ui';
import { ScoreGrid } from './rate';
import { VenuePicker, type VenueChoice } from './venue-picker';

interface EditState {
    venue: VenueChoice;
    date: string;
    participants: Participant[];
    sheets: Record<string, Sheet>;
    kinds: KindId[];
    metrics: MetricId[];
    items: OrderItem[];
    notes: string;
    spend: number | null;
    saved: Photo[];
    added: PendingPhoto[];
}

function initial(v: Visit): EditState {
    const venue = venueById.value.get(v.venueId);
    return {
        venue: { venueId: v.venueId, venue: { id: v.venueId, name: venue?.name ?? 'Mekan', kind: venue?.kind, area: venue?.area } },
        date: v.date,
        participants: v.participants.map(p => ({ ...p })),
        sheets: structuredClone(v.sheets),
        kinds: [...v.kinds],
        metrics: [...v.metrics],
        items: v.items.map(i => ({ ...i })),
        notes: v.notes,
        spend: v.spend ?? null,
        saved: v.photos.map(p => ({ ...p })),
        added: []
    };
}

export function VisitEdit() {
    const { params } = useRoute();
    const { route } = useLocation();
    const v = visits.value.find(x => x.id === params.id);
    const [s, setS] = useState<EditState | null>(() => (v ? initial(v) : null));
    const [guest, setGuest] = useState('');
    const a = useMemo(() => (s ? analyze({ participants: s.participants, sheets: s.sheets, metrics: s.metrics }) : null), [s]);
    if (!v || !s || !a) return <><TopBar back="/" /><main class="page"><Empty title="Ziyaret bulunamadı" /></main></>;

    const set = (patch: Partial<EditState>) => setS({ ...s, ...patch });
    const toggleKind = (k: KindId) => {
        const kinds = s.kinds.includes(k) ? s.kinds.filter(x => x !== k) : [...s.kinds, k];
        // Tür eklenince kriterleri eklenir; çıkarılınca o türün kriterleri düşer (ortak kriterler korunur)
        const wanted = new Set(metricsFor(kinds));
        const core = metricsFor([]);
        const metrics = orderMetrics([...s.metrics.filter(id => wanted.has(id) || core.includes(id)), ...metricsFor(kinds).filter(id => !metricsFor(s.kinds).includes(id))]);
        set({ kinds, metrics });
    };
    const members = activeMembers.value.filter(m => !s.participants.some(p => p.memberId === m.id));
    const addPerson = (p: Participant) => {
        if (s.participants.length >= LIMITS.participants) { toast('Masa dolu', 'error'); return; }
        if (s.participants.some(x => x.name.toLocaleLowerCase('tr') === p.name.toLocaleLowerCase('tr'))) { toast(`${p.name} zaten masada`, 'info'); return; }
        set({ participants: [...s.participants, p], sheets: { ...s.sheets, [p.id]: {} } });
    };
    const removePerson = async (p: Participant) => {
        if (s.participants.length <= 1) return;
        if (!(await confirmSheet({ title: `${p.name} çıkarılsın mı?`, body: 'Bu kişinin puanları da silinir.', confirm: 'Çıkar', danger: true }))) return;
        const sheets = { ...s.sheets }; delete sheets[p.id];
        set({ participants: s.participants.filter(x => x.id !== p.id), sheets });
    };
    const changeVenue = () => openSheet({ title: 'Mekanı değiştir', render: close => <VenuePicker onPick={c => { set({ venue: c }); close(); }} /> });

    const save = async () => {
        if (a.score == null) { toast('En az bir gerçek puan gerekli', 'error'); return; }
        const missing = a.needed - a.filled;
        if (missing && !(await confirmSheet({ title: `${missing} puan eksik`, body: 'Boş hücreler “fikrim yok” sayılsın mı?', confirm: 'Yok say ve kaydet' }))) return;
        const sheets: Record<string, Sheet> = {};
        for (const p of s.participants) {
            const sh: Sheet = { ...(s.sheets[p.id] ?? {}) };
            for (const id of s.metrics) if (!isCell(sh[id])) sh[id] = NA;
            sheets[p.id] = sh;
        }
        const onServer = snapshot.value?.visits.some(x => x.id === v.id);
        await enqueue({
            crewId: snapshot.value!.id,
            method: onServer ? 'PUT' : 'POST',
            visit: {
                id: v.id, venueId: s.venue.venueId ?? undefined, venue: s.venue.venueId ? undefined : (s.venue.venue as VenueInput),
                date: s.date, participants: s.participants, sheets, metrics: s.metrics, kinds: s.kinds, items: s.items,
                notes: s.notes, photos: s.saved, spend: s.spend, source: v.source, baseUpdatedAt: onServer ? v.updatedAt : undefined
            },
            photos: s.added
        });
        await flush();
        const item = outbox.value.find(x => x.visit.id === v.id);
        if (item?.error?.code === 'conflict') {
            const force = await confirmSheet({ title: 'Başka biri bu ziyareti düzenledi', body: 'Sen düzenlerken ziyaret güncellendi. Kendi sürümünle üzerine yazmak ister misin?', confirm: 'Üzerine yaz', cancel: 'Benimkini bırak' });
            if (force) { await forceRetry(v.id); await flush(); }
        } else if (item && !item.error) toast('Bağlantı gelince gönderilecek', 'info');
        else if (!item) toast('Kaydedildi');
        route(`/ziyaret/${v.id}`, true);
    };

    return (
        <>
            <TopBar title="Ziyareti düzenle" back={`/ziyaret/${v.id}`} />
            <main class="page no-tabbar">
                <button class="card card-pad row" style={{ width: '100%', textAlign: 'left' }} onClick={changeVenue}>
                    <MapPin size={20} style={{ color: 'var(--accent)' }} />
                    <span class="grow"><b class="display" style={{ fontSize: '18px' }}>{s.venue.venue.name}</b><span class="small faint" style={{ display: 'block' }}>{[venueKindLabel(s.venue.venue.kind), s.venue.venue.area].filter(Boolean).join(' · ') || 'Mekanı değiştir'}</span></span>
                    <Pencil size={18} class="faint" />
                </button>
                <div class="section">
                    <Field label="Tarih"><input class="input" type="date" value={s.date} max={todayLocal()} onInput={e => { const d = (e.target as HTMLInputElement).value; if (d) set({ date: d }); }} /></Field>
                </div>

                <div class="section">
                    <div class="section-head"><h2>Ne içildi, ne yendi?</h2></div>
                    <div class="row-wrap">
                        {KINDS.map(k => { const I = KIND_ICONS[k.id]; return <button key={k.id} class="chip" aria-pressed={s.kinds.includes(k.id)} onClick={() => toggleKind(k.id)}><I />{k.label}</button>; })}
                    </div>
                </div>

                <div class="section">
                    <div class="section-head"><h2>Masa</h2><span class="small faint">{s.participants.length} kişi</span></div>
                    <div class="row-wrap">
                        {s.participants.map(p => (
                            <span class="chip" key={p.id} style={{ paddingLeft: '4px' }}><Avatar p={p} size="sm" />{p.name}
                                {s.participants.length > 1 && <button aria-label={`${p.name} kişisini çıkar`} onClick={() => removePerson(p)}><X /></button>}
                            </span>
                        ))}
                    </div>
                    {members.length > 0 && (
                        <div class="row-wrap mt-12">
                            {members.map(m => <button class="chip" key={m.id} onClick={() => addPerson({ id: m.id, name: m.name, color: m.color, memberId: m.id })}><Plus />{m.name}</button>)}
                        </div>
                    )}
                    <form class="row mt-12" onSubmit={e => { e.preventDefault(); const n = guest.trim(); if (n) { addPerson({ id: newId.guest(), name: n.slice(0, LIMITS.personName), color: s.participants.length % 8, memberId: null }); setGuest(''); } }}>
                        <input class="input grow" placeholder="Misafir ekle" value={guest} maxLength={LIMITS.personName} onInput={e => setGuest((e.target as HTMLInputElement).value)} />
                        <button class="btn btn-secondary" type="submit" disabled={!guest.trim()} aria-label="Ekle"><Plus /></button>
                    </form>
                </div>

                <div class="section">
                    <div class="section-head"><h2>Puanlar</h2><span class="small faint">Skor {fmtScore(a.score)}{a.needed - a.filled ? ` · ${a.needed - a.filled} eksik` : ''}</span></div>
                    <div class="card card-pad" style={{ paddingLeft: '12px', paddingRight: '12px' }}>
                        <ScoreGrid participants={s.participants} sheets={s.sheets} metrics={s.metrics} onCell={(pid, mid, val) => {
                            const sheets = { ...s.sheets, [pid]: { ...(s.sheets[pid] ?? {}) } };
                            if (val === undefined) delete sheets[pid][mid]; else sheets[pid][mid] = val;
                            set({ sheets });
                        }} />
                    </div>
                </div>

                <div class="section">
                    <div class="section-head"><h2>Sipariş defteri</h2></div>
                    <ItemsEditor items={s.items} kinds={s.kinds} venueId={s.venue.venueId} onChange={items => set({ items })} />
                </div>

                <div class="section">
                    <div class="section-head"><h2>Notlar</h2></div>
                    <textarea class="textarea" maxLength={LIMITS.notes} value={s.notes} onInput={e => set({ notes: (e.target as HTMLTextAreaElement).value })} />
                </div>

                <div class="section">
                    <div class="section-head"><h2>Fotoğraflar</h2><span class="small faint">{s.saved.length + s.added.length}/{LIMITS.photos}</span></div>
                    <PhotoPicker saved={s.saved} added={s.added} onChange={(saved, added) => set({ saved, added })} />
                </div>

                <div class="section">
                    <Field label="Kişi başı harcama (₺)">
                        <input class="input" type="number" inputMode="numeric" min={0} value={s.spend ?? ''} onInput={e => { const val = (e.target as HTMLInputElement).value; set({ spend: val === '' ? null : Math.max(0, Math.round(Number(val))) }); }} />
                    </Field>
                </div>
            </main>
            <div class="actionbar"><div class="actionbar-inner">
                <AsyncButton class="btn btn-primary btn-lg" onClick={save}>Kaydet</AsyncButton>
            </div></div>
        </>
    );
}
