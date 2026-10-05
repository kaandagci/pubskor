import { useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { GROUPS, VENUE_KINDS, VENUE_TAGS, tagLabel, venueKindLabel, type VenueKind, type VenueTag } from '../../shared/metrics';
import { analysisOf, rankVenues } from '../../shared/insights';
import { LIMITS } from '../../shared/validate';
import { fmtMoney, fmtRelativeDay, fmtScore } from '../lib/format';
import { getPosition } from '../lib/geo';
import { mapsDirectionsUrl } from '../../shared/places';
import { mutate } from '../state/crew';
import { summaryById, venueSummaries } from '../state/data';
import { confirmSheet, openSheet, toast, toastError } from '../state/ui';
import { Avatar } from '../components/Avatar';
import { MetricBars, TrendChart } from '../components/charts';
import { BookmarkPlus, Ellipsis, Info, KIND_ICONS, LocateFixed, MapPin, Navigation, Pencil, Plus, Split, ThumbsUp } from '../components/icons';
import { Pint } from '../components/Pint';
import { AsyncButton, Empty, Field, Stat, TierChip, TopBar } from '../components/ui';
import { Cover, VisitRow } from '../components/visit';
import { addToWishlist } from './ranking';

function EditVenue({ id, close }: { id: string; close: () => void }) {
    const s = summaryById.value.get(id)!;
    const v = s.venue;
    const [name, setName] = useState(v.name);
    const [area, setArea] = useState(v.area);
    const [kind, setKind] = useState<VenueKind>(v.kind ?? 'diger');
    const [tags, setTags] = useState<VenueTag[]>([...(v.tags ?? [])]);
    const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : null);
    const save = async () => {
        try {
            await mutate('PATCH', `/api/crew/venues/${id}`, { name, area, kind, tags, ...(loc ? { lat: loc.lat, lng: loc.lng } : {}) });
            toast('Mekan güncellendi');
            close();
        } catch (e) { toastError(e); }
    };
    return (
        <div>
            <Field label="Ad"><input class="input" value={name} maxLength={LIMITS.venueName} onInput={e => setName((e.target as HTMLInputElement).value)} /></Field>
            <Field label="Semt"><input class="input" value={area} maxLength={LIMITS.area} onInput={e => setArea((e.target as HTMLInputElement).value)} /></Field>
            <div class="field mt-16"><span class="label">Tür</span>
                <div class="row-wrap">{VENUE_KINDS.map(k => <button key={k.id} type="button" class="chip" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}</div>
            </div>
            <div class="field mt-16"><span class="label">Özellikler</span>
                <div class="row-wrap">{VENUE_TAGS.map(t => <button key={t.id} type="button" class="chip" aria-pressed={tags.includes(t.id)} onClick={() => setTags(tags.includes(t.id) ? tags.filter(x => x !== t.id) : [...tags, t.id])}>{t.label}</button>)}</div>
            </div>
            <div class="field mt-16"><span class="label">Konum</span>
                <div class="row">
                    <span class="grow small muted">{loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'Konum yok; haritada görünmez'}</span>
                    <button type="button" class="btn btn-sm btn-secondary" onClick={async () => { try { setLoc(await getPosition()); toast('Şu anki konumun alındı'); } catch (e) { toastError(e); } }}><LocateFixed />Buradayım</button>
                </div>
            </div>
            <AsyncButton class="btn btn-primary btn-block mt-24" onClick={save} disabled={!name.trim()}>Kaydet</AsyncButton>
        </div>
    );
}

function MergeVenue({ id, close }: { id: string; close: () => void }) {
    const { route } = useLocation();
    const others = venueSummaries.value.filter(s => s.venue.id !== id).sort((a, b) => a.venue.name.localeCompare(b.venue.name, 'tr'));
    return (
        <div>
            <p class="muted small mb-12">Aynı mekan yanlışlıkla iki kez açıldıysa, bu mekanın ziyaretlerini seçtiğin mekana taşı.</p>
            <div class="list">
                {others.map(o => (
                    <button key={o.venue.id} class="list-item" onClick={async () => {
                        if (!(await confirmSheet({ title: `“${o.venue.name}” ile birleştirilsin mi?`, body: 'Bu mekanın tüm ziyaretleri oraya taşınır ve bu mekan silinir.', confirm: 'Birleştir', danger: true }))) return;
                        try { await mutate('POST', `/api/crew/venues/${id}/merge`, { into: o.venue.id }); close(); toast('Mekanlar birleştirildi'); route(`/mekan/${o.venue.id}`, true); }
                        catch (e) { toastError(e); }
                    }}>
                        <span class="li-body"><span class="li-title">{o.venue.name}</span><span class="li-sub">{[o.venue.area, `${o.count} ziyaret`].filter(Boolean).join(' · ')}</span></span>
                    </button>
                ))}
            </div>
        </div>
    );
}

export function VenuePage() {
    const { params } = useRoute();
    const s = summaryById.value.get(params.id);
    if (!s) return <><TopBar back="/siralama" /><main class="page"><Empty title="Mekan bulunamadı" /></main></>;
    const v = s.venue;
    const rank = rankVenues(venueSummaries.value, 'overall').findIndex(r => r.s.venue.id === v.id);
    const latest = s.visits.find(x => x.photos.length) ?? s.visits[0] ?? null;

    // Kişilerin bu mekana verdiği ortalama
    const fans = (() => {
        const acc = new Map<string, { p: { name: string; color: number }; xs: number[] }>();
        for (const visit of s.visits) {
            const a = analysisOf(visit);
            for (const p of visit.participants) {
                const x = a.perParticipant[p.id];
                if (x == null) continue;
                const key = p.memberId ?? 'g:' + p.name;
                const e = acc.get(key) ?? { p, xs: [] };
                e.xs.push(x);
                acc.set(key, e);
            }
        }
        return [...acc.values()].map(e => ({ p: e.p, avg: e.xs.reduce((a, b) => a + b, 0) / e.xs.length, n: e.xs.length })).sort((a, b) => b.avg - a.avg);
    })();

    const menu = () => openSheet({
        title: v.name,
        render: close => (
            <div class="menu">
                <button class="menu-item" onClick={() => { close(); openSheet({ title: 'Mekanı düzenle', render: c => <EditVenue id={v.id} close={c} /> }); }}><Pencil />Düzenle<span class="mi-sub">Ad, tür, özellikler, konum</span></button>
                {!v.wish && <button class="menu-item" onClick={() => { close(); addToWishlist({ venueId: v.id, venue: { id: v.id, name: v.name } }); }}><BookmarkPlus />Gidilecekler'e ekle</button>}
                <button class="menu-item" onClick={() => { close(); openSheet({ title: 'Başka mekanla birleştir', render: c => <MergeVenue id={v.id} close={c} /> }); }}><Split />Başka mekanla birleştir</button>
            </div>
        )
    });

    return (
        <>
            <TopBar back="/siralama" transparent actions={<button class="icon-btn filled" aria-label="Diğer" onClick={menu}><Ellipsis /></button>} />
            <main class="page flush" style={{ marginTop: 'calc(-56px - env(safe-area-inset-top, 0px))' }}>
                <div class="venue-hero"><Cover visit={latest} name={v.name} eager /></div>
                <div style={{ marginTop: '-64px', position: 'relative' }}>
                    <div class="row-wrap" style={{ gap: '6px' }}>
                        {rank >= 0 && s.count > 0 && <span class="badge badge-accent">#{rank + 1} sıralamada</span>}
                        {v.wish && <span class="badge badge-warn"><BookmarkPlus />Gidilecekler'de</span>}
                        {venueKindLabel(v.kind) && <span class="badge">{venueKindLabel(v.kind)}</span>}
                    </div>
                    <h1 class="display mt-8" style={{ fontSize: '36px', lineHeight: 1.05 }}>{v.name}</h1>
                    <div class="vhero-meta"><MapPin size={14} />{[v.area, v.address].filter(Boolean).join(' · ') || 'Konum bilgisi yok'}</div>
                    {(v.tags ?? []).length > 0 && <div class="row-wrap mt-12" style={{ gap: '6px' }}>{v.tags.map(t => <span class="badge" key={t}>{tagLabel(t)}</span>)}</div>}
                </div>

                <div class="row mt-16" style={{ gap: '8px' }}>
                    <a class="btn btn-primary grow" href={`/yeni?mekan=${v.id}`}><Plus />Yeni ziyaret</a>
                    {(v.lat != null || v.address || v.placeId) && <a class="btn btn-secondary" href={mapsDirectionsUrl(v)} target="_blank" rel="noopener noreferrer"><Navigation />Yol tarifi</a>}
                    {v.placeId && <a class="btn btn-secondary" href={`/yer/${v.placeId}`} aria-label="Mekan bilgisi"><Info /></a>}
                </div>

                {s.count === 0 ? (
                    <Empty title="Henüz puanlanmadı">{v.wish?.note ? `Not: “${v.wish.note}”` : 'İlk ziyarette masanın kararı burada görünecek.'}</Empty>
                ) : (
                    <>
                        <div class="stats mt-16">
                            <Stat label="Ortalama" value={fmtScore(s.avg)} sub={<TierChip score={s.avg} />} />
                            <Stat label="Ziyaret" value={s.count} sub={s.last ? `Son: ${fmtRelativeDay(s.last)}` : undefined} />
                            {s.spend != null ? <Stat label="Kişi başı" value={fmtMoney(s.spend)} sub="ortalama" /> : <Stat label="En iyi" value={fmtScore(s.best)} sub="tek ziyaret" />}
                        </div>

                        {s.trend.length >= 2 && (
                            <div class="card chart-card mt-12">
                                <h3>Skor eğilimi</h3><div class="sub">Her ziyaretin masa skoru</div>
                                <TrendChart points={s.trend} />
                            </div>
                        )}

                        <section class="section">
                            <div class="section-head"><h2>Kategoriler</h2></div>
                            <div class="card card-pad">
                                <div class="mbars">
                                    {GROUPS.filter(g => s.groups[g.id] != null).map(g => {
                                        const I = (KIND_ICONS as Record<string, typeof Plus>)[g.id];
                                        return (
                                            <div class="mbar" key={g.id}>
                                                <span class="mbar-label">{I ? <I size={14} style={{ verticalAlign: '-2px', marginRight: '6px' }} /> : null}{g.label}</span>
                                                <div class="mbar-track"><div class="mbar-fill" style={{ width: `${s.groups[g.id]! * 10}%` }} /></div>
                                                <span class="mbar-value">{fmtScore(s.groups[g.id])}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>

                        {s.favorites.length > 0 && (
                            <section class="section">
                                <div class="section-head"><h2>Masanın favorileri</h2><span class="small faint">Sipariş defterinden</span></div>
                                <div class="list">
                                    {s.favorites.map(f => {
                                        const I = KIND_ICONS[f.kind];
                                        return (
                                            <div class="list-item" key={f.name}>
                                                <span class="li-icon"><I /></span>
                                                <span class="li-body"><span class="li-title">{f.name}</span><span class="li-sub">{f.top} kez “harika”{f.price != null ? ` · ${fmtMoney(f.price)}` : ''}</span></span>
                                                <ThumbsUp size={17} style={{ color: 'var(--ok)' }} />
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        <section class="section">
                            <div class="section-head"><h2>Kriter ortalamaları</h2></div>
                            <div class="card chart-card"><MetricBars avg={s.metricAvg} /></div>
                        </section>

                        {fans.length > 1 && (
                            <section class="section">
                                <div class="section-head"><h2>Kim ne düşünüyor?</h2></div>
                                <div class="list">
                                    {fans.map((f, i) => (
                                        <div class="list-item" key={i}>
                                            <Avatar p={f.p} size="sm" />
                                            <span class="li-body"><span class="li-title">{f.p.name}</span><span class="li-sub">{f.n} ziyaret</span></span>
                                            <Pint score={f.avg} size={16} />
                                            <b class="num">{fmtScore(f.avg)}</b>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        <section class="section">
                            <div class="section-head"><h2>Ziyaretler</h2></div>
                            {s.visits.map(x => <VisitRow key={x.id} v={x} />)}
                        </section>
                    </>
                )}
            </main>
        </>
    );
}
