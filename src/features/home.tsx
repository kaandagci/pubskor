import { useEffect, useMemo, useState } from 'preact/hooks';
import { foldKey, todayLocal } from '../../shared/text';
import { fmtScore } from '../lib/format';
import { request } from '../lib/api';
import { local } from '../lib/storage';
import { crewStatus, syncCrew, syncError } from '../state/crew';
import { failedItems, isOwner, me, snapshot, venueById, visits } from '../state/data';
import { draft } from '../state/draft';
import { discard, flushing, forceRetry, outbox } from '../state/outbox';
import { activeCrewId, activeMembership, crewAuth, memberships, setActiveCrew } from '../state/session';
import { online, openSheet, confirmSheet } from '../state/ui';
import { Avatar } from '../components/Avatar';
import { Check, ChevronDown, ChevronRight, CloudOff, Compass, History, Link as LinkIcon, Pencil, Plus, Radio, RefreshCw, Search, Settings, TriangleAlert, Upload, Users, X } from '../components/icons';
import { profile } from '../state/user';
import { AppMark, ScoreRing } from '../components/ScoreRing';
import { Empty, Spinner, Stat, TopBar } from '../components/ui';
import { VisitHero, VisitRow } from '../components/visit';
import { openInvite } from './crew';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function openCrewSwitcher() {
    openSheet({
        title: 'Ekiplerin',
        render: close => (
            <div class="menu">
                {memberships.value.map(m => (
                    <button key={m.crewId} class="menu-item" onClick={() => { setActiveCrew(m.crewId); close(); }}>
                        <span class="li-icon" style={{ width: '36px', height: '36px', borderRadius: '11px', display: 'grid', placeItems: 'center', background: 'var(--surface-2)' }}><Users size={18} /></span>
                        <span class="grow">{m.crewName}</span>
                        {m.crewId === activeCrewId.value && <Check style={{ color: 'var(--accent)' }} />}
                    </button>
                ))}
                <a class="menu-item" href="/ekip/kur" onClick={close}><Plus />Yeni ekip kur</a>
                <a class="menu-item" href="/katil" onClick={close}><LinkIcon />Davetle başka ekibe katıl</a>
            </div>
        )
    });
}

function SyncIndicator() {
    if (!online.value) return <span class="badge badge-warn" title="Çevrimdışı"><CloudOff />Çevrimdışı</span>;
    if (flushing.value) return <Spinner small />;
    const waiting = outbox.value.filter(x => !x.error).length;
    if (waiting) return <span class="badge badge-warn"><Upload />{waiting}</span>;
    return null;
}

function FailedBanner() {
    const items = failedItems.value;
    if (!items.length) return null;
    return (
        <>
            {items.map(it => (
                <div class="banner warn" key={it.visit.id}>
                    <span class="b-icon"><TriangleAlert /></span>
                    <div class="grow">
                        <b>{venueById.value.get(it.visit.venueId ?? it.visit.venue?.id ?? '')?.name ?? 'Ziyaret'} kaydedilemedi</b>
                        <div class="small muted">{it.error?.message}</div>
                    </div>
                    {it.error?.code === 'conflict' && <button class="btn btn-sm btn-secondary" onClick={() => forceRetry(it.visit.id)}>Yine de kaydet</button>}
                    <button class="icon-btn" aria-label="Değişikliği at" onClick={async () => {
                        if (await confirmSheet({ title: 'Değişiklik silinsin mi?', body: 'Bu cihazda bekleyen kayıt silinir.', confirm: 'Sil', danger: true })) await discard(it.visit.id);
                    }}><X /></button>
                </div>
            ))}
        </>
    );
}

function LegacyPrompt() {
    const [info, setInfo] = useState<{ available: number; imported: boolean } | null>(null);
    const s = snapshot.value;
    useEffect(() => {
        if (!isOwner.value || !s || s.legacyImported) return;
        const m = activeMembership.value;
        if (!m) return;
        request<{ available: number; imported: boolean }>('GET', '/api/crew/legacy', crewAuth(m)).then(setInfo).catch(() => undefined);
    }, [s?.id, isOwner.value, s?.legacyImported]);
    if (!info || info.imported || !info.available || s?.legacyImported) return null;
    return (
        <a class="banner mt-12" href="/ayarlar#eski-arsiv">
            <span class="b-icon"><History /></span>
            <div class="grow"><b>Eski ortak arşivde {info.available} kayıt var</b><div class="small muted">Ekibine aktarabilirsin</div></div>
            <ChevronRight class="faint" />
        </a>
    );
}

/** Yeni ekipte arkadaş davet hatırlatması. Kapatılınca o ekip için bir daha görünmez. */
function InviteCard({ crewId, members }: { crewId: string; members: number }) {
    const key = 'invite-card:' + crewId;
    const [hidden, setHidden] = useState(() => local.get<boolean>(key, false));
    if (hidden || members >= 2) return null;
    return (
        <div class="banner mt-8">
            <span class="b-icon"><Users /></span>
            <div class="grow" style={{ minWidth: 0 }}>
                <b>Ekibin hazır</b>
                <div class="small muted">Arkadaşlarını davet et; herkes kendi telefonundan puan versin.</div>
            </div>
            <button class="btn btn-sm btn-primary" onClick={openInvite}>Davet et</button>
            <button class="icon-btn" aria-label="Kapat" onClick={() => { local.set(key, true); setHidden(true); }}><X /></button>
        </div>
    );
}

type Filter = 'all' | 'month' | 'mine' | 'legend';

/** Hesabı olup henüz ekibi olmayan kullanıcı. */
function NoCrewHome() {
    const p = profile.value;
    return (
        <>
            <TopBar left={<span class="brand-word"><AppMark size={30} />Pub Skor</span>}
                actions={<a class="icon-btn" href="/ayarlar" aria-label="Ayarlar"><Settings /></a>} />
            <main class="page">
                <div class="page-head">
                    <h1 class="display">{p ? `Merhaba ${p.name.split(' ')[0]}` : 'Merhaba'}</h1>
                    <p>Ekip, birlikte gezdiğin arkadaş grubun. Puanlar, sıralama ve istatistikler ekip içinde birikir.</p>
                </div>
                <div class="stack gap-12">
                    <a class="banner" href="/ekip/kur">
                        <span class="b-icon"><Plus /></span>
                        <div class="grow"><b>Ekip kur</b><div class="small muted">Sonra arkadaşlarını bağlantı ya da QR ile çağır</div></div>
                        <ChevronRight class="faint" />
                    </a>
                    <a class="banner" href="/katil">
                        <span class="b-icon"><LinkIcon /></span>
                        <div class="grow"><b>Davet bağlantım var</b><div class="small muted">Arkadaşının gönderdiği bağlantıyı aç</div></div>
                        <ChevronRight class="faint" />
                    </a>
                    <a class="banner" href="/masa">
                        <span class="b-icon"><Radio /></span>
                        <div class="grow"><b>Masa koduyla katıl</b><div class="small muted">Masada biri canlı puanlama açtıysa</div></div>
                        <ChevronRight class="faint" />
                    </a>
                    <a class="banner" href="/kesfet">
                        <span class="b-icon"><Compass /></span>
                        <div class="grow"><b>İstanbul'da bu hafta</b><div class="small muted">Çevrendeki çok gidilen mekanlar</div></div>
                        <ChevronRight class="faint" />
                    </a>
                </div>
            </main>
        </>
    );
}

export function Home() {
    if (!memberships.value.length) return <NoCrewHome />;
    return <CrewHome />;
}

function CrewHome() {
    const s = snapshot.value;
    const [filter, setFilter] = useState<Filter>('all');
    const [q, setQ] = useState('');
    const [searching, setSearching] = useState(false);
    const list = visits.value;
    const meId = me.value?.id;

    const filtered = useMemo(() => {
        const month = todayLocal().slice(0, 7);
        const key = foldKey(q);
        return list.filter(v => {
            if (filter === 'month' && !v.date.startsWith(month)) return false;
            if (filter === 'mine' && !v.participants.some(p => p.memberId === meId)) return false;
            if (filter === 'legend' && (v.score ?? 0) < 8.5) return false;
            if (key) {
                const ven = venueById.value.get(v.venueId);
                const hay = foldKey([ven?.name, ven?.area, v.notes, ...v.participants.map(p => p.name)].join(' '));
                if (!hay.includes(key)) return false;
            }
            return true;
        });
    }, [list, filter, q, meId]);

    const stats = useMemo(() => {
        const month = todayLocal().slice(0, 7);
        const scores = list.map(v => v.score).filter((x): x is number => x != null);
        return {
            visits: list.length,
            thisMonth: list.filter(v => v.date.startsWith(month)).length,
            venues: new Set(list.map(v => v.venueId)).size,
            avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
        };
    }, [list]);

    const crewName = activeMembership.value?.crewName ?? s?.name ?? '';
    const tables = s?.tables ?? [];
    const d = draft.value;

    const header = (
        <TopBar
            left={
                <button class="row" style={{ gap: '10px', minWidth: 0, flex: 1, textAlign: 'left' }} onClick={openCrewSwitcher} aria-label="Ekip değiştir">
                    <AppMark size={32} />
                    <span style={{ minWidth: 0 }}>
                        <span class="tiny faint" style={{ display: 'block', fontWeight: 600, lineHeight: 1.1 }}>Ekip</span>
                        <b class="truncate" style={{ display: 'block', fontSize: '16.5px' }}>{crewName}</b>
                    </span>
                    <ChevronDown size={18} class="faint" style={{ flexShrink: 0 }} />
                </button>
            }
            actions={
                <>
                    <SyncIndicator />
                    <button class="icon-btn" aria-label="Ara" onClick={() => { setSearching(!searching); if (searching) setQ(''); }}><Search /></button>
                    <a class="icon-btn" href="/ayarlar" aria-label="Ayarlar"><Settings /></a>
                </>
            }
        />
    );

    if (!s && crewStatus.value === 'loading') {
        return (
            <>
                {header}
                <main class="page">
                    <div class="stats mt-8">{[0, 1, 2].map(i => <div key={i} class="skeleton" style={{ height: '86px' }} />)}</div>
                    <div class="skeleton mt-24" style={{ height: '300px' }} />
                    <div class="skeleton mt-12" style={{ height: '84px' }} />
                </main>
            </>
        );
    }
    if (!s) {
        return (
            <>
                {header}
                <main class="page">
                    <Empty title="Ekip yüklenemedi" action={<button class="btn btn-secondary" onClick={() => syncCrew({ force: true })}><RefreshCw />Tekrar dene</button>}>
                        {syncError.value ?? 'Bağlantını kontrol et.'}
                    </Empty>
                </main>
            </>
        );
    }

    // Ay başlıklarıyla gruplanmış liste (ilk ziyaret büyük kart)
    const [first, ...rest] = filtered;
    const groups: { label: string; items: typeof rest }[] = [];
    for (const v of rest) {
        const label = `${MONTHS[Number(v.date.slice(5, 7)) - 1]} ${v.date.slice(0, 4)}`;
        const g = groups[groups.length - 1];
        if (g && g.label === label) g.items.push(v); else groups.push({ label, items: [v] });
    }

    return (
        <>
            {header}
            <main class="page">
                {searching && (
                    <div class="input-icon mb-12">
                        <Search />
                        <input class="input" type="search" placeholder="Mekan, semt, kişi ya da not ara" value={q} autoFocus onInput={e => setQ((e.target as HTMLInputElement).value)} />
                    </div>
                )}
                <FailedBanner />
                {tables.map(t => {
                    const host = s.members.find(m => m.id === t.hostId);
                    return (
                        <a class="banner live mt-8" key={t.code} href={`/masa/${t.code}`}>
                            <span class="b-icon"><Radio /></span>
                            <div class="grow" style={{ minWidth: 0 }}>
                                <div class="row" style={{ gap: '8px' }}><span class="live-dot" /><b class="truncate">Canlı masa · {t.venueName}</b></div>
                                <div class="small muted">{host ? `${host.name} açtı` : 'Masa açık'} · Kod {t.code}</div>
                            </div>
                            <span class="btn btn-sm btn-primary">Katıl</span>
                        </a>
                    );
                })}
                {d && (
                    <a class="banner mt-8" href="/puanla">
                        <span class="b-icon"><Pencil /></span>
                        <div class="grow" style={{ minWidth: 0 }}>
                            <b class="truncate" style={{ display: 'block' }}>Yarım kalan puanlama</b>
                            <div class="small muted truncate">{d.venue.name} · {d.participants.length} kişi</div>
                        </div>
                        <span class="btn btn-sm btn-secondary">Devam et</span>
                    </a>
                )}
                <InviteCard crewId={s.id} members={s.members.filter(m => !m.removed).length} />
                <LegacyPrompt />

                {list.length > 0 && (
                    <div class="stats mt-16">
                        <Stat label="Ziyaret" value={stats.visits} sub={stats.thisMonth ? `Bu ay ${stats.thisMonth}` : 'Bu ay yok'} />
                        <Stat label="Mekan" value={stats.venues} sub={`${s.members.filter(m => !m.removed).length} üye`} />
                        <Stat label="Ortalama" value={fmtScore(stats.avg)} sub="Ekip geneli" />
                    </div>
                )}

                {list.length === 0 ? (
                    <Empty
                        art={<ScoreRing score={null} size={84} stroke={10} showValue={false} />}
                        title="Henüz ziyaret yok"
                        action={<div class="stack gap-8" style={{ alignItems: 'center' }}>
                            <a class="btn btn-primary btn-lg" href="/yeni"><Plus />İlk ziyareti ekle</a>
                            {s.members.filter(m => !m.removed).length < 2 && <button class="btn btn-ghost" onClick={openInvite}><Users />Önce arkadaşlarını davet et</button>}
                        </div>}
                    >
                        İlk pub ziyaretinizi puanlayın; skorlar, sıralama ve istatistikler burada birikecek.
                    </Empty>
                ) : (
                    <section class="section">
                        <div class="chip-scroll mb-16" role="group" aria-label="Filtre">
                            {([['all', 'Tümü'], ['month', 'Bu ay'], ['mine', 'Katıldıklarım'], ['legend', 'Efsaneler']] as [Filter, string][]).map(([k, l]) => (
                                <button key={k} class="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
                            ))}
                        </div>
                        {!first ? (
                            <p class="muted center mt-24">Bu filtreyle eşleşen ziyaret yok.</p>
                        ) : (
                            <>
                                <VisitHero v={first} />
                                {groups.map(g => (
                                    <div key={g.label} class="mt-24">
                                        <div class="eyebrow mb-12">{g.label}</div>
                                        {g.items.map(v => <VisitRow key={v.id} v={v} />)}
                                    </div>
                                ))}
                            </>
                        )}
                    </section>
                )}
                {me.value && list.length > 0 && (
                    <div class="row mt-32" style={{ justifyContent: 'center', gap: '8px' }}>
                        <Avatar p={me.value} size="sm" />
                        <span class="small faint">{me.value.name} olarak bağlısın</span>
                    </div>
                )}
            </main>
        </>
    );
}
