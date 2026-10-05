import { useEffect } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { Beer, Compass, Crown, Gavel, GlassWater, Heart, Map as MapIcon, Martini, Medal, NotebookPen, Radio, Sparkles, UtensilsCrossed, Wine, CupSoda } from 'lucide-preact';
import { METRIC_BY_ID } from '../../shared/metrics';
import { badgesFor, areasOf, type Badge } from '../../shared/badges';
import { analysisOf, pairs, personKey } from '../../shared/insights';
import { fmtCount, fmtRelativeDay, fmtScore, fmtSigned } from '../lib/format';
import { copyText, shareNative } from '../lib/share';
import { mutate } from '../state/crew';
import { crewHighlights, isOwner, me, people, snapshot, venueById, visits } from '../state/data';
import { confirmSheet, openSheet, toast, toastError } from '../state/ui';
import { Avatar } from '../components/Avatar';
import { AgreementMatrix, BiasBars } from '../components/charts';
import { ChevronRight, Copy, RefreshCw, Settings, Share2, UserPlus } from '../components/icons';
import { Pint } from '../components/Pint';
import { Empty, Stat, TopBar } from '../components/ui';
import { QR } from '../components/QR';
import { VisitRow } from '../components/visit';

export function inviteUrl(): string | null {
    const s = snapshot.value;
    return s ? `${location.origin}/katil/${s.id}#${s.invite}` : null;
}

export function openInvite() {
    const url = inviteUrl();
    if (!url) return;
    const name = snapshot.value!.name;
    openSheet({
        title: 'Ekibe davet et',
        render: () => (
            <div class="center">
                <QR value={url} label="Davet QR kodu" />
                <p class="muted small mt-16">Bu QR’ı okutan ya da bağlantıyı açan herkes “{name}” ekibine katılabilir. Yalnızca güvendiğin kişilerle paylaş.</p>
                <div class="row mt-16">
                    <button class="btn btn-secondary grow" onClick={async () => toast((await copyText(url)) ? 'Davet bağlantısı kopyalandı' : 'Kopyalanamadı')}><Copy />Kopyala</button>
                    <button class="btn btn-primary grow" onClick={() => shareNative({ title: `${name} · Pub Skor`, text: `“${name}” ekibine katıl:`, url })}><Share2 />Paylaş</button>
                </div>
                {isOwner.value && (
                    <button class="btn btn-ghost btn-sm mt-16" onClick={async () => {
                        if (!(await confirmSheet({ title: 'Davet bağlantısı yenilensin mi?', body: 'Eski bağlantı ve QR artık çalışmaz. Ekipteki kimse çıkarılmaz.', confirm: 'Yenile' }))) return;
                        try { await mutate('POST', '/api/crew/invite'); toast('Yeni davet bağlantısı hazır'); } catch (e) { toastError(e); }
                    }}><RefreshCw />Bağlantıyı yenile</button>
                )}
            </div>
        )
    });
}

export function CrewPage() {
    const { query } = useLocation();
    const s = snapshot.value;
    // Eski sürümün bıraktığı ?davet=1 adresi her açılışta daveti açmasın
    useEffect(() => { if (query.davet) history.replaceState(null, '', '/ekip'); }, []);
    if (!s) return null;
    const h = crewHighlights.value;
    const list = people.value;
    const members = s.members.filter(m => !m.removed);
    const memberKeys = new Set(members.map(m => 'm:' + m.id));

    const hl = (label: string, main: preact.ComponentChildren, sub: string, href?: string) => (
        <a class="hl" href={href}>
            <span class="hl-label">{label}</span>
            <span class="hl-main">{main}</span>
            <span class="hl-sub">{sub}</span>
        </a>
    );

    return (
        <>
            <TopBar title="Ekip" actions={<a class="icon-btn" href="/ayarlar" aria-label="Ayarlar"><Settings /></a>} />
            <main class="page">
                <div class="card card-pad-lg">
                    <div class="row between" style={{ alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0 }}>
                            <h1 class="display" style={{ fontSize: '28px' }}>{s.name}</h1>
                            <p class="muted small mt-8">{fmtCount(members.length, 'üye')} · {fmtCount(h.totals.visits, 'ziyaret')} · {fmtCount(h.totals.venues, 'mekan')}</p>
                        </div>
                        <button class="btn btn-sm btn-primary" onClick={openInvite}><UserPlus />Davet et</button>
                    </div>
                    <div class="avatar-stack mt-16">{members.slice(0, 12).map(m => <Avatar key={m.id} p={m} />)}</div>
                </div>

                {h.totals.visits === 0 ? (
                    <Empty art={<Pint score={2} size={70} />} title="İstatistikler ilk ziyaretle başlar">Birkaç ziyaretten sonra kimin cömert, kimin sert olduğunu, kimlerin aynı zevke sahip olduğunu burada göreceksiniz.</Empty>
                ) : (
                    <>
                        <section class="section">
                            <div class="section-head"><h2>Öne çıkanlar</h2></div>
                            <div class="hl-grid">
                                {h.top && hl('Ekibin favorisi', <><Pint score={h.top.avg} size={16} /><span>{h.top.venue.name}</span></>, `${fmtScore(h.top.avg)} ortalama`, `/mekan/${h.top.venue.id}`)}
                                {h.mostVisited && hl('En çok gidilen', <span>{h.mostVisited.venue.name}</span>, `${h.mostVisited.count} ziyaret`, `/mekan/${h.mostVisited.venue.id}`)}
                                {h.generous && hl('En cömert', <><Avatar p={h.generous} size="sm" /><span>{h.generous.name}</span></>, `Masadan ${fmtSigned(h.generous.bias)} puan yüksek`, `/kisi/${h.generous.key}`)}
                                {h.harsh && hl('En sert', <><Avatar p={h.harsh} size="sm" /><span>{h.harsh.name}</span></>, `Masadan ${fmtSigned(h.harsh.bias)} puan düşük`, `/kisi/${h.harsh.key}`)}
                                {h.twins && hl('Ruh ikizleri', <><span class="avatar-stack"><Avatar p={h.twins.a} size="sm" /><Avatar p={h.twins.b} size="sm" /></span><span>%{h.twins.similarity}</span></>, `${h.twins.a.name} & ${h.twins.b.name}`)}
                                {h.rivals && h.rivals !== h.twins && hl('Zıt kutuplar', <><span class="avatar-stack"><Avatar p={h.rivals.a} size="sm" /><Avatar p={h.rivals.b} size="sm" /></span><span>%{h.rivals.similarity}</span></>, `${h.rivals.a.name} & ${h.rivals.b.name}`)}
                                {h.controversial && hl('En tartışmalı mekan', <span>{h.controversial.venue.name}</span>, `Ortalama ${fmtScore(h.controversial.controversy)} puan fark`, `/mekan/${h.controversial.venue.id}`)}
                            </div>
                        </section>

                        <section class="section">
                            <div class="section-head"><h2>Kişiler</h2></div>
                            <div class="list">
                                {list.map(p => (
                                    <a class="list-item" key={p.key} href={`/kisi/${p.key}`}>
                                        <Avatar p={p} />
                                        <span class="li-body">
                                            <span class="li-title">{p.name}{p.memberId === s.me ? ' (sen)' : ''}</span>
                                            <span class="li-sub">{p.visits} ziyaret · ort. {fmtScore(p.given)}{!memberKeys.has(p.key) ? ' · misafir' : ''}</span>
                                        </span>
                                        {p.bias != null && <span class={`badge ${p.bias > 0.2 ? 'badge-ok' : p.bias < -0.2 ? 'badge-danger' : ''}`}>{fmtSigned(p.bias)}</span>}
                                        <ChevronRight class="chev" />
                                    </a>
                                ))}
                            </div>
                            <p class="hint mt-8">Rozet: kişinin aynı ziyaret ve kriterde masanın geri kalanına göre ortalama puan farkı.</p>
                        </section>

                        <section class="section">
                            <div class="section-head"><h2>Kim kiminle aynı zevkte?</h2></div>
                            <div class="card card-pad"><AgreementMatrix people={list} /></div>
                        </section>
                    </>
                )}
            </main>
        </>
    );
}

const BADGE_ICONS: Record<string, typeof Beer> = {
    sparkles: Sparkles, medal: Medal, crown: Crown, map: MapIcon, compass: Compass, heart: Heart, radio: Radio, notebook: NotebookPen,
    beer: Beer, martini: Martini, wine: Wine, glass: GlassWater, utensils: UtensilsCrossed, soda: CupSoda, gavel: Gavel
};

function BadgeGrid({ list }: { list: Badge[] }) {
    return (
        <div class="hl-grid">
            {list.map(b => {
                const I = BADGE_ICONS[b.icon] ?? Medal;
                return (
                    <div class="hl" key={b.id} style={b.earned ? { borderColor: 'var(--accent-line)', background: 'linear-gradient(150deg, var(--accent-soft), var(--surface-1) 70%)' } : { opacity: 0.72 }}>
                        <span class="hl-main"><I size={18} style={{ color: b.earned ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }} /><span>{b.label}</span></span>
                        <span class="hl-sub">{b.desc}</span>
                        {!b.earned && (
                            <div style={{ height: '4px', borderRadius: '4px', background: 'var(--surface-3)', overflow: 'hidden' }} role="progressbar" aria-valuenow={b.progress} aria-valuemax={b.goal}>
                                <div style={{ width: `${(b.progress / b.goal) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                            </div>
                        )}
                        {!b.earned && <span class="tiny faint">{b.progress} / {b.goal}</span>}
                    </div>
                );
            })}
        </div>
    );
}

export function PersonPage() {
    const { params } = useRoute();
    const key = decodeURIComponent(params.key ?? '');
    const p = people.value.find(x => x.key === key);
    if (!p) return <><TopBar back="/ekip" /><main class="page"><Empty title="Kişi bulunamadı">Henüz bir ziyarete katılmamış olabilir.</Empty></main></>;
    const others = new Map(people.value.map(x => [x.key, x]));
    const agree = pairs(people.value).filter(x => x.a.key === key || x.b.key === key).map(x => ({ other: x.a.key === key ? x.b : x.a, sim: x.similarity, shared: x.shared }));
    const myVisits = visits.value.filter(v => v.participants.some(q => personKey(q) === key));
    const badges = badgesFor(key, visits.value, p);
    const fav = p.favorite ? venueById.value.get(p.favorite.venueId) : null;
    const areas = areasOf(key, visits.value, id => venueById.value.get(id)?.area ?? '');
    const isMe = p.memberId != null && p.memberId === me.value?.id;
    const last = myVisits[0];

    return (
        <>
            <TopBar back="/ekip" />
            <main class="page">
                <div class="center">
                    <Avatar p={p} size="xl" />
                    <h1 class="display mt-12" style={{ fontSize: '30px' }}>{p.name}{isMe ? ' (sen)' : ''}</h1>
                    <p class="muted small mt-8">{p.memberId ? 'Ekip üyesi' : 'Misafir'}{last ? ` · son ziyaret ${fmtRelativeDay(last.date).toLocaleLowerCase('tr')}` : ''}</p>
                </div>
                <div class="stats mt-24">
                    <Stat label="Ziyaret" value={p.visits} sub={`${areas.length} semt`} />
                    <Stat label="Verdiği ort." value={fmtScore(p.given)} sub={`%${Math.round(p.naRate * 100)} “fikrim yok”`} />
                    <Stat label="Masaya göre" value={fmtSigned(p.bias)} sub={p.bias == null ? 'Veri az' : p.bias > 0.2 ? 'Cömert' : p.bias < -0.2 ? 'Sert' : 'Dengeli'} />
                </div>

                {(fav || p.pickiest || p.softest) && (
                    <div class="card section" style={{ padding: 0 }}>
                        {fav && <a class="insight" href={`/mekan/${fav.id}`}><span class="i-icon up"><Heart size={18} /></span><div><b>En sevdiği mekan: {fav.name}</b><p>Kişisel ortalaması {fmtScore(p.favorite!.score)}</p></div></a>}
                        {p.pickiest && <div class="insight"><span class="i-icon down"><Gavel size={18} /></span><div><b>En titiz olduğu: {METRIC_BY_ID[p.pickiest].label}</b><p>Masadan {fmtSigned(p.metricBias[p.pickiest])} puan farkla</p></div></div>}
                        {p.softest && <div class="insight"><span class="i-icon split"><Sparkles size={18} /></span><div><b>En hoşgörülü olduğu: {METRIC_BY_ID[p.softest].label}</b><p>Masadan {fmtSigned(p.metricBias[p.softest])} puan farkla</p></div></div>}
                    </div>
                )}

                <section class="section">
                    <div class="section-head"><h2>Rozetler</h2><span class="small faint">{badges.filter(b => b.earned).length} / {badges.length}</span></div>
                    <BadgeGrid list={badges} />
                </section>

                {Object.keys(p.metricBias).length > 0 && (
                    <section class="section">
                        <div class="section-head"><h2>Puanlama tarzı</h2></div>
                        <div class="card chart-card"><BiasBars bias={p.metricBias} /></div>
                    </section>
                )}

                {agree.length > 0 && (
                    <section class="section">
                        <div class="section-head"><h2>Kiminle aynı zevkte?</h2></div>
                        <div class="list">
                            {agree.map(a => (
                                <a class="list-item" key={a.other.key} href={`/kisi/${a.other.key}`}>
                                    <Avatar p={others.get(a.other.key) ?? a.other} size="sm" />
                                    <span class="li-body"><span class="li-title">{a.other.name}</span><span class="li-sub">{a.shared} ortak puan</span></span>
                                    <b class="num">%{a.sim}</b>
                                </a>
                            ))}
                        </div>
                    </section>
                )}

                <section class="section">
                    <div class="section-head"><h2>Ziyaretleri</h2><span class="small faint">{myVisits.length}</span></div>
                    {myVisits.slice(0, 20).map(v => {
                        const a = analysisOf(v);
                        const pid = v.participants.find(q => personKey(q) === key)?.id;
                        return <div key={v.id}><VisitRow v={v} />{pid && a.perParticipant[pid] != null && <p class="tiny faint" style={{ margin: '-4px 0 8px 84px' }}>{p.name}: {fmtScore(a.perParticipant[pid])}</p>}</div>;
                    })}
                </section>
            </main>
        </>
    );
}
