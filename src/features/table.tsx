import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { newId, normalizeCode } from '../../shared/ids';
import { analyze, sheetFilled } from '../../shared/scoring';
import type { Participant, Sheet, TableView } from '../../shared/types';
import { LIMITS } from '../../shared/validate';
import { ApiError, request } from '../lib/api';
import { copyText, shareNative } from '../lib/share';
import { local } from '../lib/storage';
import { syncCrew } from '../state/crew';
import { dropSeat, memberships, saveSeat, seatFor } from '../state/session';
import { confirmSheet, haptic, online, openSheet, toast } from '../state/ui';
import { Avatar } from '../components/Avatar';
import { Check, Copy, Ellipsis, Eye, EyeOff, Lock, Plus, QrCode, Share2, Smartphone, Trash2, UserPlus, X } from '../components/icons';
import { QR } from '../components/QR';
import { AsyncButton, Empty, Loading, Switch, TopBar } from '../components/ui';
import { Rater } from './rate';
import { RevealView, bestLine } from './reveal';
import { authUser } from '../lib/auth';

const POLL_MS = 2500;

function tokenFor(code: string, crewId: string | null): string | null {
    const seat = seatFor(code);
    if (seat) return seat.token;
    if (crewId) return memberships.value.find(m => m.crewId === crewId)?.token ?? null;
    return null;
}

const draftKey = (code: string, pid: string) => `seatdraft:${code}:${pid}`;

export function LiveTable() {
    const { params } = useRoute();
    const { route } = useLocation();
    const code = normalizeCode(params.code ?? '');
    const [view, setView] = useState<TableView | null>(null);
    const [error, setError] = useState<{ status: number; message: string } | null>(null);
    const [crewId, setCrewId] = useState<string | null>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [cursor, setCursor] = useState<Record<string, number>>({});
    const [drafts, setDraftsState] = useState<Record<string, Sheet>>({});
    // Otomatik ilerleme zamanlayıcıları eski render'ın kapanışından çağrılabilir; en güncel kağıt hep buradan okunur
    const draftsRef = useRef<Record<string, Sheet>>({});
    const setDrafts = (d: Record<string, Sheet>) => { draftsRef.current = d; setDraftsState(d); };
    const pushTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const joining = useRef(false);

    const token = tokenFor(code, crewId);

    const load = async () => {
        try {
            const v = await request<TableView>('GET', `/api/tables/${code}`, { token: tokenFor(code, crewId) });
            setError(null);
            if (!crewId) setCrewId(v.crewId);
            // Ekip üyesiysek ve henüz masaya bağlı değilsek kendiliğinden bağlan
            const member = memberships.value.find(m => m.crewId === v.crewId);
            if (member && !seatFor(code) && !v.mySeat && !v.isHost && v.status === 'open' && !joining.current) {
                joining.current = true;
                try {
                    const r = await request<{ view: TableView }>('POST', `/api/tables/${code}/join`, { token: member.token, body: {} });
                    setView(r.view);
                    return;
                } catch (e) {
                    if (e instanceof ApiError && e.status === 403) toast(e.message, 'info');
                } finally { joining.current = false; }
            }
            setView(v);
        } catch (e) {
            if (e instanceof ApiError && !e.offline) setError({ status: e.status, message: e.message });
        }
    };

    useEffect(() => {
        void load();
        const id = setInterval(() => { if (!document.hidden) void load(); }, editing ? POLL_MS * 2.4 : POLL_MS);
        return () => clearInterval(id);
    }, [code, crewId, editing]);

    // Masa kapanınca ekip verisini tazele (yeni ziyaret görünsün)
    const status = view?.status;
    useEffect(() => { if (status === 'closed') { void syncCrew({ force: true }); haptic(30); } }, [status]);

    // Sunucudaki kağıtları yerel taslaklarla birleştir (yerel olan öncelikli)
    useEffect(() => {
        if (!view) return;
        const next = { ...draftsRef.current };
        let changed = false;
        for (const [pid, sheet] of Object.entries(view.mine)) {
            if (next[pid]) continue;
            next[pid] = local.get<Sheet | null>(draftKey(code, pid), null) ?? sheet;
            changed = true;
        }
        if (changed) setDrafts(next);
    }, [view?.mine]);

    const pushSheet = (pid: string, sheet: Sheet, done: boolean) => {
        clearTimeout(pushTimers.current[pid]);
        pushTimers.current[pid] = setTimeout(async () => {
            try {
                await request('PUT', `/api/tables/${code}/sheets/${encodeURIComponent(pid)}`, { token, body: { sheet, done } });
                local.del(draftKey(code, pid));
            } catch (e) {
                if (e instanceof ApiError && e.code === 'seat_lost') { toast('Bu koltuk başka bir telefona verildi', 'error'); dropSeat(code); setEditing(null); }
                // Ağ hatasında taslak yerelde kalır; sonraki değişiklikte ya da bitirince tekrar gönderilir
            }
        }, done ? 0 : 500);
    };

    if (error) {
        return (
            <>
                <TopBar back="/" />
                <main class="page no-tabbar"><Empty title={error.status === 404 ? 'Masa bulunamadı' : 'Masaya ulaşılamadı'} action={<a class="btn btn-secondary" href="/">Ana sayfa</a>}>
                    {error.status === 404 ? 'Kodu kontrol et; masa kapanmış ya da süresi dolmuş olabilir.' : error.message}
                </Empty></main>
            </>
        );
    }
    if (!view) return <Loading label="Masaya bağlanılıyor" />;

    const metrics = view.setup.metrics;
    const total = metrics.length;
    const person = (pid: string) => view.setup.participants.find(p => p.id === pid);

    // ----- Kapanmış masa: açılış -----
    if (view.status === 'closed') {
        if (!view.sheets) {
            return <main class="page no-tabbar"><Empty title="Masa kapandı" action={<a class="btn btn-secondary" href="/">Ana sayfa</a>}>Sonuç: {view.result?.venueName} · {view.result?.score?.toFixed(1)}</Empty></main>;
        }
        const a = analyze({ participants: view.setup.participants, sheets: view.sheets, metrics });
        const isMember = memberships.value.some(m => m.crewId === view.crewId);
        return (
            <RevealView venueName={view.setup.venue.name} score={view.result?.score ?? a.score} participants={view.setup.participants} perParticipant={a.perParticipant}
                best={bestLine({ metrics }, a.metricAvg)}
                actions={isMember && view.visitId ? <>
                    <button class="btn btn-primary btn-lg" onClick={() => route(`/ziyaret/${view.visitId}`, true)}>Ziyareti gör</button>
                    <a class="btn btn-ghost" href="/">Ana sayfa</a>
                </> : authUser.value ? <>
                    <a class="btn btn-primary btn-lg" href="/ekip/kur">Kendi ekibini kur</a>
                    <a class="btn btn-ghost" href="/">Ana sayfa</a>
                </> : <>
                    <a class="btn btn-primary btn-lg" href="/kayit">Hesap oluştur</a>
                    <p class="small muted">Ücretsiz hesapla kendi ekibini kur; bu masanın ekibi seni davet ederse geçmiş puanların profiline bağlanır.</p>
                </>}
            />
        );
    }
    if (view.status === 'cancelled') {
        return <><TopBar back="/" /><main class="page no-tabbar"><Empty title="Masa kapatıldı" action={<a class="btn btn-secondary" href="/">Ana sayfa</a>}>Bu masa iptal edildi ya da süresi doldu.</Empty></main></>;
    }

    // ----- Anonim: kim olduğunu seç -----
    if (!view.mySeat && !view.isHost) return <JoinPicker view={view} onJoined={v => setView(v)} />;

    // ----- Puanlama ekranı -----
    if (editing) {
        const p = person(editing);
        if (!p) { setEditing(null); return null; }
        const sheet = drafts[editing] ?? {};
        return (
            <Rater
                person={p}
                sheet={sheet}
                metrics={metrics}
                index={cursor[editing] ?? 0}
                onIndex={i => setCursor({ ...cursor, [editing]: i })}
                onChange={(mid, v) => {
                    const next = { ...(draftsRef.current[editing] ?? {}) };
                    if (v === undefined) delete next[mid]; else next[mid] = v;
                    setDrafts({ ...draftsRef.current, [editing]: next });
                    local.set(draftKey(code, editing), next);
                    pushSheet(editing, next, false);
                }}
                onDone={() => {
                    const latest = draftsRef.current[editing] ?? {};
                    const filled = sheetFilled(latest, metrics);
                    pushSheet(editing, latest, filled === total);
                    if (filled < total) toast(`${total - filled} kriter boş kaldı; istersen sonra doldurabilirsin`, 'info');
                    else toast(`${p.name} bitirdi`);
                    setEditing(null);
                }}
                onExit={() => setEditing(null)}
                badge={<span class="badge"><Lock />{view.setup.blind ? 'Kör' : 'Açık'}</span>}
            />
        );
    }

    return <Lobby view={view} token={token} drafts={drafts} onRate={pid => { setEditing(pid); window.scrollTo(0, 0); }} onView={setView} />;
}

function shareTable(view: TableView) {
    const url = `${location.origin}/m/${view.code}`;
    openSheet({
        title: 'Masaya davet et',
        render: () => (
            <div class="center">
                <QR value={url} label={`Masa kodu ${view.code}`} />
                <div class="table-code mt-16">{view.code}</div>
                <p class="muted small mt-8">Telefon kamerasıyla QR’ı okutan ya da <b>{location.host}/m/{view.code}</b> adresini açan masaya katılır.</p>
                <div class="row mt-16">
                    <button class="btn btn-secondary grow" onClick={async () => toast((await copyText(url)) ? 'Bağlantı kopyalandı' : url)}><Copy />Kopyala</button>
                    <button class="btn btn-primary grow" onClick={() => shareNative({ title: `${view.setup.venue.name} masası`, text: 'Pub Skor masasına katıl:', url })}><Share2 />Paylaş</button>
                </div>
            </div>
        )
    });
}

function Lobby({ view, token, drafts, onRate, onView }: { view: TableView; token: string | null; drafts: Record<string, Sheet>; onRate: (pid: string) => void; onView: (v: TableView) => void }) {
    const { route } = useLocation();
    const metrics = view.setup.metrics;
    const total = metrics.length;
    const seats = view.seats;
    const doneCount = seats.filter(s => s.done).length;
    const mine = view.mySeat;
    const myFilled = mine ? sheetFilled(drafts[mine] ?? view.mine[mine], metrics) : 0;
    const myDone = mine ? seats.find(s => s.pid === mine)?.done : false;
    const host = view.isHost;

    const patch = async (body: Record<string, unknown>) => {
        try {
            const r = await request<{ view: TableView }>('PATCH', `/api/tables/${view.code}`, { token, body });
            onView(r.view);
        } catch (e) { toast(e instanceof Error ? e.message : 'Güncellenemedi', 'error'); }
    };

    const finish = async () => {
        const missing = seats.reduce((n, s) => n + (total - s.filled), 0);
        let fillMissing = false;
        if (missing > 0) {
            const ok = await confirmSheet({ title: `${missing} puan eksik`, body: 'Eksik hücreler “fikrim yok” sayılarak masa kapatılsın mı?', confirm: 'Kapat ve skoru aç' });
            if (!ok) return;
            fillMissing = true;
        } else if (!(await confirmSheet({ title: 'Masa kapatılsın mı?', body: 'Skor herkese açılır ve ziyaret ekibe kaydedilir.', confirm: 'Skoru aç' }))) return;
        try {
            const r = await request<{ view: TableView }>('POST', `/api/tables/${view.code}/finish`, { token, body: { fillMissing } });
            onView(r.view);
        } catch (e) { toast(e instanceof Error ? e.message : 'Masa kapatılamadı', 'error'); }
    };

    const cancel = async () => {
        if (!(await confirmSheet({ title: 'Masa iptal edilsin mi?', body: 'Verilen puanlar silinir, ziyaret kaydedilmez.', confirm: 'İptal et', danger: true }))) return;
        try {
            await request('DELETE', `/api/tables/${view.code}`, { token });
            toast('Masa iptal edildi', 'info');
            void syncCrew({ force: true });
            route('/', true);
        } catch (e) { toast(e instanceof Error ? e.message : 'İptal edilemedi', 'error'); }
    };

    const settings = () => openSheet({
        title: 'Masa ayarları',
        render: close => <TableSettings view={view} patch={patch} close={close} cancel={() => { close(); void cancel(); }} />
    });

    const seatMenu = (p: Participant) => openSheet({
        title: p.name,
        render: close => (
            <div class="menu">
                {!seats.find(s => s.pid === p.id)?.claimed && <button class="menu-item" onClick={() => { close(); onRate(p.id); }}><Smartphone />Onun yerine bu telefondan puanla</button>}
                {seats.find(s => s.pid === p.id)?.claimed && p.memberId !== view.hostId && (
                    <button class="menu-item" onClick={async () => {
                        close();
                        try { const r = await request<{ view: TableView }>('POST', `/api/tables/${view.code}/seats/${encodeURIComponent(p.id)}/release`, { token }); onView(r.view); toast('Koltuk serbest bırakıldı', 'info'); }
                        catch (e) { toast(e instanceof Error ? e.message : 'Yapılamadı', 'error'); }
                    }}><X />Koltuğu serbest bırak<span class="mi-sub">Telefonu kapandıysa başka telefondan devam edebilir</span></button>
                )}
                <button class="menu-item danger" onClick={() => { close(); void patch({ participants: view.setup.participants.filter(x => x.id !== p.id) }); }}><Trash2 />Masadan çıkar</button>
            </div>
        )
    });

    return (
        <>
            <TopBar back="/" title={<span><span class="live-dot" style={{ marginRight: '8px' }} />Canlı masa</span>}
                actions={<>
                    <button class="icon-btn" aria-label="Davet et" onClick={() => shareTable(view)}><QrCode /></button>
                    {host && <button class="icon-btn" aria-label="Masa ayarları" onClick={settings}><Ellipsis /></button>}
                </>} />
            <main class="page no-tabbar">
                <div class="card card-pad-lg">
                    <div class="eyebrow">{view.crewName}</div>
                    <h1 class="display mt-8" style={{ fontSize: '30px' }}>{view.setup.venue.name}</h1>
                    <div class="row mt-12" style={{ gap: '8px', flexWrap: 'wrap' }}>
                        <span class="badge">{view.setup.blind ? <EyeOff /> : <Eye />}{view.setup.blind ? 'Kör puanlama' : 'Puanlar açık'}</span>
                        <span class="badge">{total} kriter</span>
                        <button class="badge badge-accent" onClick={() => shareTable(view)}><QrCode />Kod {view.code}</button>
                    </div>
                    <div class="mt-16" style={{ height: '6px', borderRadius: '6px', background: 'var(--surface-3)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(doneCount / Math.max(1, seats.length)) * 100}%`, background: 'var(--tier-legend)', transition: 'width .5s var(--ease)' }} />
                    </div>
                    <p class="small muted mt-8">{doneCount} / {seats.length} kişi bitirdi</p>
                </div>

                {mine && (
                    <div class="card card-pad mt-12 row">
                        <div class={`ring ${myDone ? 'done' : ''}`} style={{ '--p': (myFilled / total) * 100 }}>{myDone ? <Check /> : <span class="tiny num">{myFilled}</span>}</div>
                        <div class="grow">
                            <b>{myDone ? 'Puanların gönderildi' : myFilled ? 'Puanlamaya devam et' : 'Sıra sende'}</b>
                            <div class="small muted">{myDone ? (view.setup.blind ? 'Masa kapanınca herkesin puanı açılır' : 'Masanın puanları aşağıda') : `${total} kriter · yaklaşık 1 dakika`}</div>
                        </div>
                        <button class={`btn ${myDone ? 'btn-secondary' : 'btn-primary'}`} onClick={() => onRate(mine)}>{myDone ? 'Düzelt' : myFilled ? 'Devam' : 'Başla'}</button>
                    </div>
                )}

                <section class="section">
                    <div class="section-head"><h2>Masadakiler</h2>{host && view.setup.participants.length < LIMITS.participants && <button class="link-btn small" onClick={() => addPersonSheet(view, patch)}><UserPlus size={15} style={{ verticalAlign: '-2px' }} /> Ekle</button>}</div>
                    <div class="list">
                        {view.setup.participants.map(p => {
                            const s = seats.find(x => x.pid === p.id)!;
                            const isMe = p.id === mine;
                            const state = s.done ? 'Bitirdi' : s.filled ? `${s.filled}/${total} puanladı` : s.claimed ? 'Katıldı, başlamadı' : 'Telefonu bağlı değil';
                            return (
                                <div class="seat" key={p.id}>
                                    <div class={`ring ${s.done ? 'done' : ''}`} style={{ '--p': (s.filled / total) * 100 }}>{s.done ? <Check /> : <Avatar p={p} size="sm" />}</div>
                                    <div class="grow" style={{ minWidth: 0 }}>
                                        <b class="truncate" style={{ display: 'block' }}>{p.name}{isMe ? ' (sen)' : ''}{!p.memberId ? <span class="faint small"> · misafir</span> : null}</b>
                                        <span class="small muted">{state}</span>
                                    </div>
                                    {!view.setup.blind && view.sheets && s.filled > 0 && <span class="num small">{analyze({ participants: [p], sheets: view.sheets, metrics }).perParticipant[p.id]?.toFixed(1)}</span>}
                                    {host && !isMe && <button class="icon-btn" aria-label={`${p.name} seçenekleri`} onClick={() => seatMenu(p)}><Ellipsis /></button>}
                                </div>
                            );
                        })}
                    </div>
                    {!online.value && <p class="hint mt-8">Çevrimdışısın; puanların bağlantı gelince gönderilecek.</p>}
                </section>
                {!host && <p class="small faint center mt-24">Masayı açan kişi herkes bitirince skoru açacak.</p>}
            </main>
            {host && (
                <div class="actionbar"><div class="actionbar-inner">
                    <AsyncButton class="btn btn-primary btn-lg" onClick={finish}>{doneCount === seats.length ? 'Skoru aç' : `Masayı kapat (${doneCount}/${seats.length})`}</AsyncButton>
                </div></div>
            )}
        </>
    );
}

function addPersonSheet(view: TableView, patch: (b: Record<string, unknown>) => Promise<void>) {
    let name = '';
    openSheet({
        title: 'Masaya kişi ekle',
        render: close => (
            <form onSubmit={async e => {
                e.preventDefault();
                const n = name.trim().slice(0, LIMITS.personName);
                if (!n) return;
                const used = new Set(view.setup.participants.map(p => p.color));
                let c = 0; while (used.has(c) && c < 7) c++;
                await patch({ participants: [...view.setup.participants, { id: newId.guest(), name: n, color: c, memberId: null }] });
                close();
            }}>
                <input class="input" placeholder="Adı" maxLength={LIMITS.personName} autoFocus onInput={e => { name = (e.target as HTMLInputElement).value; }} />
                <p class="hint mt-8">Telefonu yoksa sen onun yerine puanlayabilirsin.</p>
                <button class="btn btn-primary btn-block mt-16" type="submit"><Plus />Ekle</button>
            </form>
        )
    });
}

function TableSettings({ view, patch, close, cancel }: { view: TableView; patch: (b: Record<string, unknown>) => Promise<void>; close: () => void; cancel: () => void }) {
    const [blind, setBlind] = useState(view.setup.blind);
    const [openSeats, setOpenSeats] = useState(view.setup.openSeats);
    return (
        <div>
            <div class="list">
                <div class="list-item">
                    <span class="li-body"><span class="li-title">Kör puanlama</span><span class="li-sub" style={{ whiteSpace: 'normal' }}>Puanlar masa kapanana kadar gizli</span></span>
                    <Switch checked={blind} label="Kör puanlama" onChange={v => { setBlind(v); void patch({ blind: v }); }} />
                </div>
                <div class="list-item">
                    <span class="li-body"><span class="li-title">Yeni katılımcıya açık</span><span class="li-sub" style={{ whiteSpace: 'normal' }}>QR ile gelen kendini ekleyebilir</span></span>
                    <Switch checked={openSeats} label="Yeni katılımcıya açık" onChange={v => { setOpenSeats(v); void patch({ openSeats: v }); }} />
                </div>
            </div>
            <button class="btn btn-danger btn-block mt-16" onClick={cancel}><Trash2 />Masayı iptal et</button>
            <button class="btn btn-ghost btn-block mt-8" onClick={close}>Kapat</button>
        </div>
    );
}

/** Ekip üyesi olmayan biri QR ile geldiğinde: listeden kendini seçer ya da adını yazar. */
function JoinPicker({ view, onJoined }: { view: TableView; onJoined: (v: TableView) => void }) {
    const [name, setName] = useState('');
    const free = useMemo(() => view.setup.participants.filter(p => !view.seats.find(s => s.pid === p.id)?.claimed), [view]);
    const taken = view.setup.participants.filter(p => !free.includes(p));
    const join = async (body: { pid?: string; name?: string }) => {
        try {
            const r = await request<{ seatToken: string; view: TableView }>('POST', `/api/tables/${view.code}/join`, { body });
            saveSeat(view.code, { pid: r.view.mySeat!, token: r.seatToken });
            onJoined(r.view);
            toast('Masaya katıldın!');
        } catch (e) { toast(e instanceof Error ? e.message : 'Katılınamadı', 'error'); }
    };
    return (
        <>
            <TopBar back="/" />
            <main class="page no-tabbar">
                <div class="center mt-8">
                    <span class="eyebrow">{view.crewName} · canlı masa</span>
                    <h1 class="display mt-8" style={{ fontSize: '32px' }}>{view.setup.venue.name}</h1>
                    <p class="muted mt-8">Sen kimsin? Kendini seç, kendi telefonundan puanla.</p>
                </div>
                <div class="list mt-24">
                    {free.map(p => (
                        <button class="list-item" key={p.id} onClick={() => join({ pid: p.id })}>
                            <Avatar p={p} />
                            <span class="li-body"><span class="li-title">{p.name}</span></span>
                            <span class="btn btn-sm btn-primary">Benim</span>
                        </button>
                    ))}
                    {taken.map(p => (
                        <div class="list-item" key={p.id} style={{ opacity: 0.5 }}>
                            <Avatar p={p} />
                            <span class="li-body"><span class="li-title">{p.name}</span><span class="li-sub">Başka telefonda</span></span>
                        </div>
                    ))}
                </div>
                {view.setup.openSeats && (
                    <form class="section" onSubmit={e => { e.preventDefault(); if (name.trim()) void join({ name: name.trim() }); }}>
                        <div class="section-head"><h2>Listede yok musun?</h2></div>
                        <div class="row">
                            <input class="input grow" placeholder="Adın" value={name} maxLength={LIMITS.personName} onInput={e => setName((e.target as HTMLInputElement).value)} />
                            <button class="btn btn-primary" type="submit" disabled={!name.trim()}>Katıl</button>
                        </div>
                    </form>
                )}
                {memberships.value.length === 0 && <p class="small faint center mt-24">Katılmak için hesap gerekmez. Puanların yalnızca bu masada kullanılır.</p>}
                <p class="tiny faint center mt-12">Pub Skor 18 yaş ve üzeri içindir. Lütfen sorumlu tüketin.</p>
            </main>
        </>
    );
}

/** /masa ile kod girme ekranı (QR okutamayanlar için). */
export function EnterCode() {
    const { route } = useLocation();
    const [code, setCode] = useState('');
    const c = normalizeCode(code);
    return (
        <>
            <TopBar back="/" />
            <main class="page no-tabbar">
                <div class="page-head"><h1 class="display">Masa kodu</h1><p>Masayı açan kişinin ekranındaki 6 karakterlik kodu yaz.</p></div>
                <form onSubmit={e => { e.preventDefault(); if (c.length === 6) route(`/masa/${c}`); }}>
                    <input class="input input-lg center" style={{ letterSpacing: '.3em', textTransform: 'uppercase' }} maxLength={8} value={code} autoFocus autoCapitalize="characters" onInput={e => setCode((e.target as HTMLInputElement).value)} />
                    <button class="btn btn-primary btn-lg btn-block mt-16" disabled={c.length !== 6} type="submit">Masaya git</button>
                </form>
            </main>
        </>
    );
}

