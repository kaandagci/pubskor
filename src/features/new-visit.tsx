import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { newId } from '../../shared/ids';
import { GROUP_LABEL, KINDS, METRIC_BY_ID, defaultKindsFor, metricsFor, venueKindLabel, type KindId, type MetricId } from '../../shared/metrics';
import { foldKey, todayLocal } from '../../shared/text';
import type { Participant, TableView } from '../../shared/types';
import { LIMITS } from '../../shared/validate';
import { mutate } from '../state/crew';
import { activeMembers, me, snapshot, venueById, visits } from '../state/data';
import { draft, setDraft } from '../state/draft';
import { confirmSheet, online, toast } from '../state/ui';
import { Avatar } from '../components/Avatar';
import { Check, ChevronRight, MapPin, Pencil, Plus, Radio, SlidersHorizontal, Smartphone, X, KIND_ICONS, METRIC_ICONS } from '../components/icons';
import { AsyncButton, Field, Switch, TopBar } from '../components/ui';
import { VenuePicker, presetChoice, type VenueChoice } from './venue-picker';

type Step = 0 | 1 | 2;

export function NewVisit() {
    const { route, query } = useLocation();
    const preset = query.mekan ? venueById.value.get(query.mekan) : undefined;
    // Mekan sayfasından "burada puanla" ile gelindiyse (katalog mekanı) bir kez kullan
    const [fromPlace] = useState(() => { const c = presetChoice.value; presetChoice.value = null; return c; });
    const [step, setStep] = useState<Step>(preset || fromPlace ? 1 : 0);
    const [venue, setVenue] = useState<VenueChoice | null>(preset ? { venueId: preset.id, venue: { id: preset.id, name: preset.name, area: preset.area } } : fromPlace);
    const [date, setDate] = useState(todayLocal());
    const [selected, setSelected] = useState<Set<string>>(new Set(me.value ? [me.value.id] : []));
    const [touched, setTouched] = useState(false);
    // Ekip verisi sayfa açıldıktan sonra yüklenirse "Sen"i yine de seçili getir
    useEffect(() => { if (!touched && me.value && !selected.size) setSelected(new Set([me.value.id])); }, [me.value?.id]);
    const [guests, setGuests] = useState<string[]>([]);
    const [guestName, setGuestName] = useState('');
    const [kinds, setKinds] = useState<KindId[]>(defaultKindsFor(preset?.kind ?? fromPlace?.venue.kind));
    const [off, setOff] = useState<Set<MetricId>>(new Set());
    const [showMetrics, setShowMetrics] = useState(false);
    const [mode, setMode] = useState<'live' | 'single'>(online.value ? 'live' : 'single');
    const [blind, setBlind] = useState(true);
    const [openSeats, setOpenSeats] = useState(true);

    const members = activeMembers.value;
    const metrics = metricsFor(kinds).filter(id => !off.has(id));
    const pickVenue = (c: VenueChoice) => {
        setVenue(c);
        const known = c.venueId ? venueById.value.get(c.venueId) : undefined;
        setKinds(defaultKindsFor(known?.kind ?? c.venue.kind));
        setOff(new Set());
        setStep(1);
    };
    const toggleKind = (k: KindId) => setKinds(kinds.includes(k) ? kinds.filter(x => x !== k) : [...kinds, k]);
    const count = selected.size + guests.length;

    // Daha önce masaya gelmiş misafir isimleri (hızlı ekleme)
    const pastGuests = useMemo(() => {
        const seen = new Map<string, string>();
        for (const v of visits.value) for (const p of v.participants) if (!p.memberId && !seen.has(foldKey(p.name))) seen.set(foldKey(p.name), p.name);
        const taken = new Set([...guests.map(foldKey), ...members.map(m => foldKey(m.name))]);
        return [...seen.entries()].filter(([k]) => !taken.has(k)).map(([, n]) => n).slice(0, 8);
    }, [visits.value, guests, members]);

    const toggle = (id: string) => {
        setTouched(true);
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelected(next);
    };
    const addGuest = (raw: string) => {
        const name = raw.trim().slice(0, LIMITS.personName);
        if (!name) return;
        const all = [...members.filter(m => selected.has(m.id)).map(m => m.name), ...guests];
        if (all.some(n => n.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) { toast(`${name} zaten masada`, 'info'); return; }
        const member = members.find(m => m.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'));
        if (member) { toggle(member.id); setGuestName(''); return; }
        if (count >= LIMITS.participants) { toast(`Masada en fazla ${LIMITS.participants} kişi olabilir`, 'error'); return; }
        setGuests([...guests, name]);
        setGuestName('');
    };

    const buildParticipants = (): Participant[] => {
        const list: Participant[] = members.filter(m => selected.has(m.id)).map(m => ({ id: m.id, name: m.name, color: m.color, memberId: m.id }));
        const used = new Set(list.map(p => p.color));
        for (const g of guests) {
            let c = 0;
            while (used.has(c) && c < 7) c++;
            used.add(c);
            list.push({ id: newId.guest(), name: g, color: c, memberId: null });
        }
        return list;
    };

    const start = async () => {
        if (!venue || !snapshot.value) return;
        const participants = buildParticipants();
        if (!participants.length) { toast('Masaya en az bir kişi ekle', 'error'); return; }
        if (mode === 'single') {
            if (draft.value && !(await confirmSheet({ title: 'Yarım kalan puanlama silinsin mi?', body: `“${draft.value.venue.name}” için kaydedilmemiş bir puanlama var.`, confirm: 'Sil ve başla', danger: true }))) return;
            setDraft({
                crewId: snapshot.value.id, visitId: newId.visit(), venue: venue.venue, venueId: venue.venueId,
                date, participants, metrics, kinds, items: [], sheets: Object.fromEntries(participants.map(p => [p.id, {}])),
                notes: '', spend: null, photos: [],
                cursor: { p: 0, m: 0, phase: participants.length > 1 ? 'handoff' : 'rate' },
                startedAt: Date.now()
            }, true);
            route('/puanla', true);
            return;
        }
        try {
            const r = await mutate<{ view: TableView }>('POST', '/api/tables', {
                setup: { venue: venue.venue, venueId: venue.venueId, date, participants, metrics, kinds, blind, openSeats }
            });
            route(`/masa/${r.view.code}`, true);
        } catch (e) {
            toast(e instanceof Error ? e.message : 'Masa açılamadı', 'error');
        }
    };

    const titles = ['Nerede?', 'Masada kimler var?', 'Nasıl puanlayacaksınız?'];

    return (
        <>
            <TopBar back={step === 0 ? '/' : false}
                left={step > 0 ? <button class="icon-btn" aria-label="Geri" onClick={() => setStep((step - 1) as Step)}><ChevronRight style={{ transform: 'rotate(180deg)' }} /></button> : undefined}
                title={<div class="steps" style={{ maxWidth: '160px', margin: '0 auto' }}>{[0, 1, 2].map(i => <span key={i} class={i <= step ? 'on' : ''} />)}</div>}
                actions={<a class="icon-btn" href="/" aria-label="Vazgeç"><X /></a>}
                center
            />
            <main class="page no-tabbar">
                <div class="page-head"><h1 class="display">{titles[step]}</h1></div>

                {step === 0 && <VenuePicker onPick={pickVenue} />}

                {step === 1 && venue && (
                    <>
                        <button class="card card-pad row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setStep(0)}>
                            <span class="b-icon" style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)' }}><MapPin size={20} /></span>
                            <span class="grow"><b class="display" style={{ fontSize: '18px' }}>{venue.venue.name}</b><span class="small faint" style={{ display: 'block' }}>{[venueKindLabel(venue.venueId ? venueById.value.get(venue.venueId)?.kind : venue.venue.kind), venue.venue.area || (venue.venueId ? 'Ekibin mekanı' : 'Yeni mekan')].filter(Boolean).join(' · ')}</span></span>
                            <Pencil size={18} class="faint" />
                        </button>

                        <div class="section">
                            <div class="section-head"><h2>Ekipten</h2><span class="small faint">{count} kişi</span></div>
                            <div class="row-wrap" style={{ gap: '4px' }}>
                                {members.map(m => (
                                    <button key={m.id} class="person-toggle" aria-pressed={selected.has(m.id)} onClick={() => toggle(m.id)}>
                                        <Avatar p={m} size="lg" />
                                        {selected.has(m.id) && <span class="check"><Check /></span>}
                                        <span class="truncate" style={{ maxWidth: '100%' }}>{m.id === me.value?.id ? 'Sen' : m.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div class="section">
                            <div class="section-head"><h2>Misafirler</h2></div>
                            {guests.length > 0 && (
                                <div class="row-wrap mb-12">
                                    {guests.map(g => (
                                        <span class="chip" key={g}>{g}<button aria-label={`${g} kişisini çıkar`} onClick={() => setGuests(guests.filter(x => x !== g))}><X /></button></span>
                                    ))}
                                </div>
                            )}
                            <form class="row" onSubmit={e => { e.preventDefault(); addGuest(guestName); }}>
                                <input class="input grow" placeholder="Misafir adı" value={guestName} maxLength={LIMITS.personName} onInput={e => setGuestName((e.target as HTMLInputElement).value)} />
                                <button class="btn btn-secondary" type="submit" disabled={!guestName.trim()} aria-label="Ekle"><Plus /></button>
                            </form>
                            {pastGuests.length > 0 && (
                                <div class="row-wrap mt-12">
                                    {pastGuests.map(n => <button key={n} class="chip" onClick={() => addGuest(n)}><Plus />{n}</button>)}
                                </div>
                            )}
                        </div>

                        <div class="section">
                            <Field label="Tarih"><input class="input" type="date" value={date} max={todayLocal()} onInput={e => { const v = (e.target as HTMLInputElement).value; if (v) setDate(v); }} /></Field>
                        </div>

                        <div class="section">
                            <div class="section-head"><h2>Ne içiyorsunuz, ne yiyorsunuz?</h2></div>
                            <p class="hint mb-12">Seçtiklerine göre o türün kriterleri eklenir. Masada içmeyenler o kriterlerde “fikrim yok” der.</p>
                            <div class="row-wrap">
                                {KINDS.map(k => {
                                    const Icon = KIND_ICONS[k.id];
                                    return <button key={k.id} class="chip" aria-pressed={kinds.includes(k.id)} onClick={() => toggleKind(k.id)}><Icon />{k.label}</button>;
                                })}
                            </div>
                        </div>

                        <div class="section">
                            <button class="list-item card" style={{ borderRadius: 'var(--r-lg)' }} onClick={() => setShowMetrics(!showMetrics)}>
                                <span class="li-icon"><SlidersHorizontal /></span>
                                <span class="li-body"><span class="li-title">Kriterler</span><span class="li-sub">{metrics.length} kriter puanlanacak{off.size ? ` · ${off.size} kapalı` : ''}</span></span>
                                <ChevronRight class="chev" style={{ transform: showMetrics ? 'rotate(90deg)' : '' }} />
                            </button>
                            {showMetrics && (
                                <div class="mt-12">
                                    <p class="hint mb-12">Bu ziyarette değerlendirilemeyecek kriterleri kapat (örn. ikram gelmedi). Ağırlıklar kalanlara dağıtılır.</p>
                                    <div class="row-wrap">
                                        {metricsFor(kinds).map(id => {
                                            const m = METRIC_BY_ID[id];
                                            const on = !off.has(id);
                                            const Icon = METRIC_ICONS[id];
                                            return (
                                                <button key={id} class="chip" aria-pressed={on} title={GROUP_LABEL[m.group]} onClick={() => {
                                                    const next = new Set(off);
                                                    if (on) { if (metrics.length <= 1) return; next.add(id); } else next.delete(id);
                                                    setOff(next);
                                                }}><Icon />{m.short}</button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {step === 2 && (
                    <>
                        <button class="mode-card" aria-pressed={mode === 'live'} disabled={!online.value} onClick={() => setMode('live')}>
                            <span class="m-icon"><Radio /></span>
                            <span>
                                <h3>Canlı masa <span class="badge badge-accent" style={{ marginLeft: '6px' }}>Önerilen</span></h3>
                                <p>Herkes kendi telefonundan QR kodla katılıp kendi puanını verir. İlerlemeyi canlı görürsünüz.</p>
                                {!online.value && <p class="small" style={{ color: 'var(--warn)' }}>İnternet gerekiyor</p>}
                            </span>
                        </button>
                        <button class="mode-card" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>
                            <span class="m-icon"><Smartphone /></span>
                            <span>
                                <h3>Tek telefon</h3>
                                <p>Telefon elden ele dolaşır; herkes sırası gelince puanlar. İnternetsiz de çalışır.</p>
                            </span>
                        </button>
                        {mode === 'live' && (
                            <div class="list mt-16">
                                <div class="list-item">
                                    <span class="li-body"><span class="li-title">Kör puanlama</span><span class="li-sub" style={{ whiteSpace: 'normal' }}>Puanlar masa kapanana kadar gizli kalır; kimse kimseden etkilenmez.</span></span>
                                    <Switch checked={blind} onChange={setBlind} label="Kör puanlama" />
                                </div>
                                <div class="list-item">
                                    <span class="li-body"><span class="li-title">QR ile katılan kendini ekleyebilsin</span><span class="li-sub" style={{ whiteSpace: 'normal' }}>Kapalıysa yalnızca listedeki kişiler katılabilir.</span></span>
                                    <Switch checked={openSeats} onChange={setOpenSeats} label="Açık koltuk" />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
            {step > 0 && (
                <div class="actionbar"><div class="actionbar-inner">
                    {step === 1 && <button class="btn btn-primary btn-lg" disabled={count === 0} onClick={() => setStep(2)}>Devam<ChevronRight /></button>}
                    {step === 2 && <AsyncButton class="btn btn-primary btn-lg" onClick={start}>{mode === 'live' ? 'Masayı aç' : 'Puanlamaya başla'}</AsyncButton>}
                </div></div>
            )}
        </>
    );
}
