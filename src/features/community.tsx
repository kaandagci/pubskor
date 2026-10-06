// Topluluk ekranları: herkesin puanları (akış), topluluk sıralaması, mekan sayfasındaki ekip puanları,
// ekibe özel "zevkinize göre" öneriler ve ekibin topluluktaki görünümünü anlatan bilgi kartı.
import { useEffect, useState } from 'preact/hooks';
import { venueKindLabel } from '../../shared/metrics';
import { PUBLIC_DELAY_LABEL, type PublicMode } from '../../shared/public';
import { communityError, communityFeed, communityRanking, getPlaceView, getRecommendations, loadFeed, loadMoreFeed, loadRanking, type PublicPlaceView, type PublicVisit, type Recommendations } from '../lib/community';
import { fmtCount, fmtRelativeDay, fmtScore } from '../lib/format';
import { local } from '../lib/storage';
import { snapshot } from '../state/data';
import { activeMembership } from '../state/session';
import { CrewTag, PublicRow } from '../components/community';
import { ChevronRight, RefreshCw, Sparkles, Users, VenetianMask, X } from '../components/icons';
import { PlaceEmblem } from '../components/PlaceEmblem';
import { ScoreRing } from '../components/ScoreRing';
import { AsyncButton, Empty, TierChip } from '../components/ui';
import { KIND_FILTERS, kindMatch, type KindFilter } from './explore';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const PRIVACY_LINE = 'Toplulukta yalnızca mekan, gün, genel skor ve ekip adı (ya da takma ad) görünür. Kişi adları, puan kağıtları, notlar, fotoğraflar ve harcama hiçbir zaman paylaşılmaz.';

/** Ekibin topluluktaki görünümü: kurallara uyan ekip adı ya da takma ad. */
export function publicLabel(s: { name: string; publicMode?: PublicMode; publicAlias?: string; publicNameOk?: boolean }) {
    const mode = s.publicMode ?? 'anon';
    const named = mode === 'named' && s.publicNameOk !== false;
    return { mode, named, label: named ? s.name : s.publicAlias ?? '' };
}

function Skeleton() {
    return <div class="stack gap-8">{[0, 1, 2, 3].map(i => <div key={i} class="skeleton" style={{ height: '78px' }} />)}</div>;
}

/** Bütün ekiplerin puanları, ay ay. `limit` verilirse kısa önizleme (devamı yok). */
export function CommunityFeed({ limit }: { limit?: number }) {
    useEffect(() => { void loadFeed(); }, []);
    const f = communityFeed.value;
    if (!f) {
        return communityError.value
            ? <Empty title="Topluluk akışı yüklenemedi" action={<button class="btn btn-secondary" onClick={() => loadFeed(true)}><RefreshCw />Tekrar dene</button>}>{communityError.value}</Empty>
            : <Skeleton />;
    }
    const items = limit ? f.items.slice(0, limit) : f.items;
    if (!items.length) {
        return (
            <Empty art={<ScoreRing score={null} size={84} stroke={10} showValue={false} />} title="Henüz topluluk puanı yok">
                Ekipler listedeki mekanları puanladıkça burada görünecek. Yeni puanlar {PUBLIC_DELAY_LABEL} sonra herkese açılır.
            </Empty>
        );
    }
    const groups: { label: string; items: PublicVisit[] }[] = [];
    for (const v of items) {
        const label = `${MONTHS[Number(v.date.slice(5, 7)) - 1]} ${v.date.slice(0, 4)}`;
        const g = groups[groups.length - 1];
        if (g && g.label === label) g.items.push(v); else groups.push({ label, items: [v] });
    }
    return (
        <>
            {groups.map((g, i) => (
                <div key={g.label} class={i ? 'mt-24' : ''}>
                    <div class="list-head">{g.label}</div>
                    <div class="vlist">{g.items.map(v => <PublicRow key={v.id} v={v} />)}</div>
                </div>
            ))}
            {!limit && f.next != null && <AsyncButton class="btn btn-secondary btn-block mt-16" onClick={loadMoreFeed}>Daha fazla göster</AsyncButton>}
            {!limit && <p class="hint center mt-16">{PRIVACY_LINE} Yeni puanlar {PUBLIC_DELAY_LABEL} sonra görünür.</p>}
        </>
    );
}

/** Ekibin puanlarının toplulukta nasıl göründüğünü bir kez anlatan kart (ekip bazında kapatılır). */
export function PublicNotice() {
    const [dismissed, setDismissed] = useState<string[]>(() => local.get<string[]>('public-notice', []));
    const s = snapshot.value;
    if (!s || dismissed.includes(s.id)) return null;
    const { mode, named, label } = publicLabel(s);
    if (mode === 'off') return null;
    const close = () => { const next = [...dismissed, s.id]; local.set('public-notice', next); setDismissed(next); };
    return (
        <div class="banner mt-8" style={{ alignItems: 'flex-start' }}>
            <span class="b-icon">{named ? <Users /> : <VenetianMask />}</span>
            <div class="grow" style={{ minWidth: 0 }}>
                <b>Toplulukta “{label}” olarak görünüyorsunuz</b>
                <div class="small muted">{named ? 'Ekip adınızla' : 'Size özel takma adla'} yalnızca mekan, gün ve skor paylaşılır; kişi adları, notlar ve fotoğraflar asla.</div>
                <a class="link-btn small mt-8" style={{ display: 'inline-block' }} href="/ayarlar#topluluk">Görünümü değiştir</a>
            </div>
            <button class="icon-btn" aria-label="Kapat" onClick={close} style={{ marginTop: '-6px' }}><X /></button>
        </div>
    );
}

/** Topluluk sıralaması: her ekip bir mekana tek oy verir (kendi ortalaması). */
export function CommunityRanking() {
    useEffect(() => { void loadRanking(); }, []);
    const [kind, setKind] = useState<KindFilter>('all');
    const list = communityRanking.value;
    if (!list) {
        return communityError.value
            ? <Empty title="Topluluk sıralaması yüklenemedi" action={<button class="btn btn-secondary" onClick={() => loadRanking(true)}><RefreshCw />Tekrar dene</button>}>{communityError.value}</Empty>
            : <Skeleton />;
    }
    if (!list.length) {
        return <Empty art={<ScoreRing score={null} size={84} stroke={10} showValue={false} />} title="Topluluk sıralaması henüz boş">Ekipler listedeki mekanları puanladıkça burada bir sıralama oluşacak.</Empty>;
    }
    const shown = list.filter(x => kindMatch(kind, x.kind));
    const used = KIND_FILTERS.filter(([k]) => k === 'all' || list.some(x => kindMatch(k, x.kind)));
    const top = shown.length >= 3 ? shown.slice(0, 3) : [];
    const rest = top.length ? shown.slice(3) : shown;
    return (
        <>
            {used.length > 2 && (
                <div class="chip-scroll" role="group" aria-label="Mekan türü">
                    {used.map(([k, l]) => <button key={k} class="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
                </div>
            )}
            <h2 class="display mt-24" style={{ fontSize: '22px' }}>Herkesin favorileri</h2>
            <p class="small faint">{fmtCount(list.length, 'mekan')} · ekiplerin ortalamalarına göre</p>
            {!shown.length ? <p class="muted mt-16">Bu türde puanlanmış mekan yok.</p> : (
                <>
                    {top.length > 0 && (
                        <div class="podium mt-16">
                            {[top[1], top[0], top[2]].map((r, i) => (
                                <a key={r.placeId} href={`/yer/${r.placeId}`} class={`podium-item ${['second', 'first', 'third'][i]}`}>
                                    <ScoreRing score={r.score} size={i === 1 ? 56 : 44} showValue={false} animate />
                                    <div class="p-val">{fmtScore(r.score)}</div>
                                    <div class="p-name">{r.name}</div>
                                    <div class="tiny faint">{fmtCount(r.crews, 'ekip')}</div>
                                    <div class="podium-step">{[2, 1, 3][i]}</div>
                                </a>
                            ))}
                        </div>
                    )}
                    <div class="list mt-16">
                        {rest.map((r, i) => (
                            <a class="rank-row" key={r.placeId} href={`/yer/${r.placeId}`}>
                                <span class="rank-n">{(top.length ? 4 : 1) + i}</span>
                                <PlaceEmblem place={r} size={40} />
                                <div class="grow" style={{ minWidth: 0 }}>
                                    <div class="vrow-title" style={{ fontSize: '16.5px' }}>{r.name}</div>
                                    <div class="vrow-meta">{[venueKindLabel(r.kind), r.district, fmtCount(r.crews, 'ekip')].filter(Boolean).join(' · ')}</div>
                                </div>
                                <span class="rank-val">{fmtScore(r.score)}</span>
                            </a>
                        ))}
                    </div>
                </>
            )}
            <p class="hint mt-16">Her ekip bir mekana tek oy verir: ekibin o mekandaki ortalaması. Az ekibin puanladığı mekanlar, puanları kesinleşene kadar sıralamada temkinli konumlanır.</p>
        </>
    );
}

/** Mekan sayfası: ekiplerin bu mekana verdiği puanlar. */
export function PlaceCommunity({ placeId }: { placeId: string }) {
    const [view, setView] = useState<PublicPlaceView | null | undefined>(undefined);
    useEffect(() => {
        setView(undefined);
        getPlaceView(placeId).then(setView).catch(() => setView(null));
    }, [placeId]);
    if (view === undefined) return <div class="skeleton mt-24" style={{ height: '132px' }} />;
    if (view === null) return null;
    return (
        <section class="section">
            <div class="section-head"><h2>Ekiplerin puanları</h2>{view.crews > 0 && <span class="small faint">{fmtCount(view.visits, 'ziyaret')}</span>}</div>
            {!view.crews ? (
                <p class="muted small">Henüz puanlayan ekip yok. İlk puanı siz verin; ekipler puanladıkça burada görünür.</p>
            ) : (
                <>
                    <div class="card card-pad row" style={{ gap: '14px' }}>
                        <ScoreRing score={view.score} size={60} stroke={6} animate />
                        <div class="grow" style={{ minWidth: 0 }}>
                            <div class="row" style={{ gap: '8px' }}><b class="num" style={{ fontSize: '26px', fontFamily: 'var(--font-rounded)' }}>{fmtScore(view.score)}</b><TierChip score={view.score} /></div>
                            <div class="small muted">{fmtCount(view.crews, 'ekibin')} ortalaması</div>
                        </div>
                    </div>
                    <div class="list mt-12">
                        {view.byCrew.map((c, i) => (
                            <div class="list-item" key={i}>
                                <ScoreRing score={c.avg} size={40} stroke={4} />
                                <span class="li-body">
                                    <span class="li-title"><CrewTag crew={c.crew} /></span>
                                    <span class="li-sub">{c.visits > 1 ? `${c.visits} ziyaret, ortalama ${fmtScore(c.avg)} · ` : ''}{fmtRelativeDay(c.last)}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}

/** "Zevkinize göre": size benzer puan veren ekiplerin sevdiği, sizin henüz gitmediğiniz mekanlar. */
export function CrewRecommendations({ limit = 10 }: { limit?: number }) {
    const m = activeMembership.value;
    const [r, setR] = useState<Recommendations | null | undefined>(undefined);
    useEffect(() => {
        if (!m) return;
        setR(undefined);
        getRecommendations(m).then(setR).catch(() => setR(null));
    }, [m?.crewId]);
    if (!m || r === null) return null;
    return (
        <section class="section">
            <div class="section-head"><h2>Zevkinize göre yeni yerler</h2></div>
            {r === undefined ? <Skeleton /> : !r.items.length ? (
                <p class="muted small">Henüz önerecek kadar topluluk puanı yok. Listedeki mekanları puanladıkça ve diğer ekipler puan verdikçe öneriler belirir.</p>
            ) : (
                <>
                    <p class="small muted mb-12">{r.compared
                        ? `Ortak gittiğiniz mekanlarda size benzer puan veren ekiplerin sevdiği, sizin henüz puanlamadığınız yerler (${fmtCount(r.compared, 'ekiple')} karşılaştırıldı).`
                        : 'Henüz ortak mekanınız olan bir ekip yok; şimdilik topluluğun en sevdikleri. Puanladıkça öneriler size göre şekillenir.'}</p>
                    <div class="list">
                        {r.items.slice(0, limit).map(x => (
                            <a class="rank-row" key={x.placeId} href={`/yer/${x.placeId}`}>
                                <PlaceEmblem place={x} size={40} />
                                <div class="grow" style={{ minWidth: 0 }}>
                                    <div class="vrow-title" style={{ fontSize: '16.5px' }}>{x.name}</div>
                                    <div class="vrow-meta">{[venueKindLabel(x.kind), x.district, x.similar ? `${x.similar} benzer ekip sevdi` : fmtCount(x.crews, 'ekip')].filter(Boolean).join(' · ')}</div>
                                </div>
                                <span class="rec-score"><b class="num">{fmtScore(x.predicted)}</b><span class="tiny faint">{r.compared ? 'tahmin' : 'ortalama'}</span></span>
                            </a>
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}

/** Topluluk akışının başında: ekibe özel önerilere geçiş. */
export function RecommendationLink() {
    if (!activeMembership.value) return null;
    return (
        <a class="banner mb-16" href="/oneri">
            <span class="b-icon"><Sparkles /></span>
            <div class="grow" style={{ minWidth: 0 }}><b>Zevkinize göre öneriler</b><div class="small muted">Size benzer puan veren ekiplerin sevdiği yerler</div></div>
            <ChevronRight class="faint" />
        </a>
    );
}
