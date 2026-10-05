import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { GROUP_LABEL, METRIC_BY_ID, orderMetrics, weightShare, type MetricId } from '../../shared/metrics';
import { NA, analyze, isCell } from '../../shared/scoring';
import type { Participant, Sheet } from '../../shared/types';
import { LIMITS } from '../../shared/validate';
import { fmtScore } from '../lib/format';
import { dative, locative } from '../lib/tr';
import { draft, setDraft, updateDraft, clearDraft } from '../state/draft';
import { enqueue } from '../state/outbox';
import { confirmSheet, haptic, openSheet, toast } from '../state/ui';
import { Avatar } from '../components/Avatar';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, X, METRIC_ICONS } from '../components/icons';
import { ItemsEditor } from '../components/Items';
import { PhotoPicker } from '../components/PhotoPicker';
import { ScaleInput } from '../components/ScaleInput';
import { AsyncButton, Field, TopBar } from '../components/ui';

export const activeMetrics = (metrics: readonly MetricId[]) => orderMetrics(metrics).map(id => METRIC_BY_ID[id]);

// ----- Tek kişinin puanlaması (tek telefon ve canlı masa ortak) -----

interface RaterProps {
    person: Participant;
    sheet: Sheet;
    metrics: readonly MetricId[];
    index: number;
    onIndex: (i: number) => void;
    onChange: (mid: MetricId, v: number | undefined) => void;
    onDone: () => void;
    onExit: () => void;
    badge?: ComponentChildren;
}

export function Rater({ person, sheet, metrics, index, onIndex, onChange, onDone, onExit, badge }: RaterProps) {
    const list = activeMetrics(metrics);
    const i = Math.min(index, list.length - 1);
    const m = list[i];
    const Icon = METRIC_ICONS[m.id];
    const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    const group = GROUP_LABEL[m.group];

    const next = () => {
        if (timer.current) clearTimeout(timer.current);
        setDir('fwd');
        if (i >= list.length - 1) onDone(); else onIndex(i + 1);
    };
    const prev = () => {
        if (timer.current) clearTimeout(timer.current);
        setDir('back');
        if (i === 0) onExit(); else onIndex(i - 1);
    };
    const pick = (v: number | undefined) => {
        onChange(m.id, v);
        if (v !== undefined) {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(next, 260); // seçince bir sonraki kritere kendiliğinden geç
        }
    };

    return (
        <div class="rate">
            <div class="rate-top">
                <button class="icon-btn" onClick={prev} aria-label={i === 0 ? 'Çık' : 'Önceki kriter'}><ArrowLeft /></button>
                <div class="rate-who"><Avatar p={person} size="sm" /><span class="truncate">{person.name} puanlıyor</span></div>
                {badge}
            </div>
            <div class="rate-progress" aria-hidden="true">
                {list.map((x, k) => {
                    const v = sheet[x.id];
                    return <span key={x.id} class={k === i ? 'current' : v === NA ? 'na' : isCell(v) ? 'done' : ''} onClick={() => { setDir(k < i ? 'back' : 'fwd'); onIndex(k); }} />;
                })}
            </div>
            <div class={`rate-card ${dir === 'back' ? 'back' : ''}`} key={m.id}>
                <div class="rate-icon"><Icon /></div>
                <div class="rate-step">KRİTER {i + 1} / {list.length} · {group.toLocaleUpperCase('tr')} · AĞIRLIK %{weightShare(m.id, metrics)}</div>
                <h1 class="rate-title">{m.label}</h1>
                <p class="rate-hint">{m.hint}</p>
                <ScaleInput value={sheet[m.id]} onChange={pick} label={`${person.name}, ${m.label}`} />
            </div>
            <div class="rate-nav">
                <button class="btn btn-secondary" onClick={prev}><ChevronLeft />{i === 0 ? 'Çık' : 'Geri'}</button>
                <button class="btn btn-primary" style={{ flex: 1 }} onClick={next}>
                    {i >= list.length - 1 ? <><Check />Bitir</> : isCell(sheet[m.id]) ? <>Sonraki<ChevronRight /></> : <>Atla<ChevronRight /></>}
                </button>
            </div>
        </div>
    );
}

// ----- Puan ızgarası (inceleme ve düzenleme) -----

export function editCell(person: Participant, mid: MetricId, value: number | undefined, onChange: (v: number | undefined) => void) {
    const m = METRIC_BY_ID[mid];
    openSheet({
        title: `${person.name} · ${m.short}`,
        render: close => (
            <div>
                <p class="muted small">{m.label} — {m.hint}</p>
                <ScaleInput value={value} label={`${person.name}, ${m.label}`} onChange={v => { onChange(v); haptic(); setTimeout(close, 180); }} />
            </div>
        )
    });
}

export function ScoreGrid({ participants, sheets, metrics, onCell }: {
    participants: Participant[];
    sheets: Record<string, Sheet>;
    metrics: readonly MetricId[];
    onCell: (pid: string, mid: MetricId, v: number | undefined) => void;
}) {
    const a = analyze({ participants, sheets, metrics });
    return (
        <div class="grid-wrap">
            <table class="sgrid">
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Kriter</th>
                        {participants.map(p => <th key={p.id}><span class="stack" style={{ alignItems: 'center', gap: '4px' }}><Avatar p={p} size="sm" /><span class="truncate" style={{ maxWidth: '52px' }}>{p.name}</span></span></th>)}
                    </tr>
                </thead>
                <tbody>
                    {activeMetrics(metrics).map(m => {
                        return (
                            <tr key={m.id}>
                                <th>{m.short}<small>{GROUP_LABEL[m.group]} · %{weightShare(m.id, metrics)}</small></th>
                                {participants.map(p => {
                                    const v = sheets[p.id]?.[m.id];
                                    const cls = !isCell(v) ? 'missing' : v === NA ? 'na' : a.conflicts.includes(m.id) ? 'conflict' : '';
                                    return (
                                        <td key={p.id}>
                                            <button class={`cell ${cls}`} style={{ margin: '0 auto' }} aria-label={`${p.name}, ${m.label}: ${v == null ? 'boş' : v === NA ? 'fikri yok' : v}`}
                                                onClick={() => editCell(p, m.id, v, nv => onCell(p.id, m.id, nv))}>
                                                {v == null ? '+' : v === NA ? 'yok' : v}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Kişi skoru</th>
                        {participants.map(p => <td key={p.id} class="num">{fmtScore(a.perParticipant[p.id])}</td>)}
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

// ----- Tek telefon akışı -----

export function RateFlow() {
    const { route } = useLocation();
    const d = draft.value;
    useEffect(() => { if (!d) route('/', true); }, [d]);
    if (!d) return null;

    const people = d.participants;
    const cur = d.cursor;
    const person = people[Math.min(cur.p, people.length - 1)];
    const setCursor = (c: Partial<typeof cur>) => updateDraft(x => { x.cursor = { ...x.cursor, ...c }; });

    const finishPerson = () => {
        if (cur.p < people.length - 1) setCursor({ p: cur.p + 1, m: 0, phase: 'handoff' });
        else setCursor({ phase: 'review' });
        window.scrollTo(0, 0);
    };

    if (cur.phase === 'handoff') {
        const prev = cur.p > 0 ? people[cur.p - 1] : null;
        return (
            <div class="rate">
                <div class="rate-top">
                    <button class="icon-btn" aria-label="Çık" onClick={() => route('/')}><X /></button>
                    <span class="grow" />
                    <span class="badge">{cur.p + 1} / {people.length} kişi</span>
                </div>
                <div class="handoff">
                    {prev && <span class="badge badge-ok"><Check />{prev.name} bitirdi</span>}
                    <Avatar p={person} size="xl" />
                    <h1>Sıra {locative(person.name)}</h1>
                    <p>Telefonu {dative(person.name)} ver. Puanlar kaydedilene kadar kimse başkasının puanını görmez.</p>
                </div>
                <div class="stack gap-8">
                    <button class="btn btn-primary btn-lg" onClick={() => setCursor({ phase: 'rate', m: 0 })}>Başla</button>
                    {people.length > 1 && (
                        <button class="btn btn-ghost" onClick={async () => {
                            if (!(await confirmSheet({ title: `${person.name} masadan çıkarılsın mı?`, body: 'Bu kişi bu ziyarette puan vermeyecek.', confirm: 'Çıkar', danger: true }))) return;
                            updateDraft(x => {
                                x.participants = x.participants.filter(p => p.id !== person.id);
                                delete x.sheets[person.id];
                                if (x.cursor.p >= x.participants.length) x.cursor = { p: x.participants.length - 1, m: 0, phase: 'review' };
                            });
                        }}>{person.name} puanlamayacak</button>
                    )}
                    {cur.p > 0 && <button class="btn btn-ghost" onClick={() => setCursor({ phase: 'review' })}>Tabloya geç</button>}
                </div>
            </div>
        );
    }

    if (cur.phase === 'rate') {
        return (
            <Rater
                person={person}
                sheet={d.sheets[person.id] ?? {}}
                metrics={d.metrics}
                index={cur.m}
                onIndex={m => setCursor({ m })}
                onChange={(mid, v) => updateDraft(x => {
                    const s = (x.sheets[person.id] ??= {});
                    if (v === undefined) delete s[mid]; else s[mid] = v;
                })}
                onDone={finishPerson}
                onExit={() => (people.length > 1 ? setCursor({ phase: 'handoff' }) : route('/'))}
                badge={people.length > 1 ? <span class="badge">{cur.p + 1} / {people.length}</span> : undefined}
            />
        );
    }

    return <Review />;
}

function Review() {
    const { route } = useLocation();
    const d = draft.value!;
    const a = analyze({ participants: d.participants, sheets: d.sheets, metrics: d.metrics });
    const missing = a.needed - a.filled;

    const save = async () => {
        if (a.score == null) { toast('En az bir gerçek puan gerekli', 'error'); return; }
        if (missing) {
            const ok = await confirmSheet({ title: `${missing} puan eksik`, body: 'Boş kalan hücreler “fikrim yok” sayılarak kaydedilsin mi?', confirm: 'Yok say ve kaydet' });
            if (!ok) return;
        }
        const sheets: Record<string, Sheet> = {};
        for (const p of d.participants) {
            const s: Sheet = { ...(d.sheets[p.id] ?? {}) };
            for (const id of d.metrics) if (!isCell(s[id])) s[id] = NA;
            sheets[p.id] = s;
        }
        await enqueue({
            crewId: d.crewId,
            method: 'POST',
            visit: {
                id: d.visitId, venueId: d.venueId ?? undefined, venue: d.venueId ? undefined : d.venue,
                date: d.date, participants: d.participants, sheets, metrics: d.metrics, kinds: d.kinds, items: d.items,
                notes: d.notes, photos: [], spend: d.spend, source: 'single'
            },
            photos: d.photos
        });
        const id = d.visitId;
        clearDraft();
        route(`/sonuc/${id}`, true);
    };

    return (
        <>
            <TopBar title="Gözden geçir" back={false}
                left={<button class="icon-btn" aria-label="Puanlamaya dön" onClick={() => updateDraft(x => { x.cursor = { p: x.participants.length - 1, m: 0, phase: 'rate' }; })}><ArrowLeft /></button>}
                actions={<button class="btn btn-sm btn-ghost" onClick={async () => {
                    if (await confirmSheet({ title: 'Puanlama silinsin mi?', body: 'Bu ziyaretin tüm puanları silinir.', confirm: 'Sil', danger: true })) { clearDraft(); route('/', true); }
                }}>Sil</button>}
            />
            <main class="page no-tabbar">
                <div class="card card-pad-lg">
                    <div class="row between">
                        <div style={{ minWidth: 0 }}>
                            <div class="eyebrow">{d.venue.name}</div>
                            <div class="score-big mt-8"><span class="value">{fmtScore(a.score)}</span></div>
                        </div>
                        {missing > 0 ? <span class="badge badge-warn">{missing} eksik</span> : <span class="badge badge-ok"><Check />Tamam</span>}
                    </div>
                    <p class="small muted mt-8">{missing ? 'Eksikler kayıtta “fikrim yok” sayılır. Hücreye dokunarak düzeltebilirsin.' : 'Skor masa kaydedilince herkese açılır.'}</p>
                </div>

                <div class="section">
                    <div class="section-head"><h2>Puan tablosu</h2><span class="small faint">Düzeltmek için dokun</span></div>
                    <div class="card card-pad" style={{ paddingLeft: '12px', paddingRight: '12px' }}>
                        <ScoreGrid participants={d.participants} sheets={d.sheets} metrics={d.metrics}
                            onCell={(pid, mid, v) => updateDraft(x => { const s = (x.sheets[pid] ??= {}); if (v === undefined) delete s[mid]; else s[mid] = v; })} />
                    </div>
                </div>

                <div class="section">
                    <div class="section-head"><h2>Sipariş defteri</h2><span class="small faint">Ne içtiniz, ne yediniz?</span></div>
                    <ItemsEditor items={d.items} kinds={d.kinds} venueId={d.venueId} onChange={items => updateDraft(x => { x.items = items; })} />
                </div>

                <div class="section">
                    <div class="section-head"><h2>Notlar</h2></div>
                    <textarea class="textarea" placeholder="Ne içtiniz, neler dikkatinizi çekti?" maxLength={LIMITS.notes} value={d.notes}
                        onInput={e => { const v = (e.target as HTMLTextAreaElement).value; updateDraft(x => { x.notes = v; }); }} />
                </div>

                <div class="section">
                    <div class="section-head"><h2>Fotoğraflar</h2><span class="small faint">{d.photos.length}/{LIMITS.photos}</span></div>
                    <PhotoPicker saved={[]} added={d.photos} onChange={(_s, added) => updateDraft(x => { x.photos = added; })} />
                </div>

                <div class="section">
                    <Field label="Kişi başı harcama (isteğe bağlı)" hint="Fiyat/performans karşılaştırması için">
                        <div class="input-icon">
                            <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontWeight: 600 }}>₺</span>
                            <input class="input" type="number" inputMode="numeric" min={0} placeholder="0" value={d.spend ?? ''} style={{ paddingLeft: '34px' }}
                                onInput={e => { const v = (e.target as HTMLInputElement).value; updateDraft(x => { x.spend = v === '' ? null : Math.max(0, Math.round(Number(v))); }); }} />
                        </div>
                    </Field>
                </div>
            </main>
            <div class="actionbar"><div class="actionbar-inner">
                <AsyncButton class="btn btn-primary btn-lg" onClick={save} disabled={a.score == null}><Check />Kaydet ve skoru aç</AsyncButton>
            </div></div>
        </>
    );
}

export { setDraft };
