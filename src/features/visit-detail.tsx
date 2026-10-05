import { useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { GROUP_LABEL, METRIC_BY_ID, venueKindLabel } from '../../shared/metrics';
import { analysisOf } from '../../shared/insights';
import { isScore } from '../../shared/scoring';
import type { Visit } from '../../shared/types';
import { fmtDate, fmtMoney, fmtScore } from '../lib/format';
import { mutate } from '../state/crew';
import { isOwner, membersById, pendingIds, snapshot, venueById, visits } from '../state/data';
import { discard } from '../state/outbox';
import { confirmSheet, openSheet, toast, toastError } from '../state/ui';
import { Avatar } from '../components/Avatar';
import { MetricBars } from '../components/charts';
import { ItemsList } from '../components/Items';
import { CloudOff, Ellipsis, KIND_ICONS, MapPin, Pencil, Plus, Radio, Share2, Split, Trash2, TrendingDown, TrendingUp } from '../components/icons';
import { ScoreRing } from '../components/ScoreRing';
import { Empty, TierChip, TopBar } from '../components/ui';
import { Cover, PhotoImg } from '../components/visit';
import { openShareSheet } from './share-sheet';

function Photos({ v, name }: { v: Visit; name: string }) {
    const [idx, setIdx] = useState(0);
    const pending = pendingIds.value.has(v.id);
    if (!v.photos.length) return <div class="detail-media"><Cover visit={v} venue={venueById.value.get(v.venueId)} name={name} eager /></div>;
    return (
        <div class="detail-media">
            <div class="photo-strip" onScroll={e => { const el = e.currentTarget as HTMLElement; setIdx(Math.round(el.scrollLeft / el.clientWidth)); }}>
                {v.photos.map((p, i) => <PhotoImg key={p.id} photo={p} pending={pending} eager={i === 0} alt={`${name} fotoğrafı ${i + 1}`} />)}
            </div>
            {v.photos.length > 1 && <div class="dots">{v.photos.map((p, i) => <span key={p.id} class={i === idx ? 'on' : ''} />)}</div>}
        </div>
    );
}

export async function deleteVisit(v: Visit, after?: () => void) {
    const onServer = !!snapshot.value?.visits.some(x => x.id === v.id);
    const ok = await confirmSheet({ title: 'Ziyaret silinsin mi?', body: onServer ? 'Ekipteki herkes için silinir. 30 gün boyunca yalnızca sen (yönetici) çöp kutusundan geri alabilirsin.' : 'Henüz gönderilmemiş bu kayıt bu cihazdan silinir.', confirm: 'Sil', danger: true });
    if (!ok) return;
    if (pendingIds.value.has(v.id)) await discard(v.id);
    if (!onServer) { after?.(); toast('Ziyaret silindi', 'info'); return; }
    try {
        await mutate('DELETE', `/api/crew/visits/${encodeURIComponent(v.id)}`);
        after?.();
        toast('Ziyaret silindi', 'info', { label: 'Geri al', run: () => { mutate('POST', `/api/crew/visits/${encodeURIComponent(v.id)}/restore`).then(() => toast('Geri alındı')).catch(toastError); } });
    } catch (e) { toastError(e); }
}

export function VisitDetail() {
    const { params } = useRoute();
    const { route } = useLocation();
    const v = visits.value.find(x => x.id === params.id);
    if (!v) {
        return (
            <>
                <TopBar back="/" />
                <main class="page"><Empty title="Ziyaret bulunamadı">Silinmiş ya da henüz eşitlenmemiş olabilir.</Empty></main>
            </>
        );
    }
    const venue = venueById.value.get(v.venueId);
    const name = venue?.name ?? 'Bilinmeyen mekan';
    const a = analysisOf(v);
    const pending = pendingIds.value.has(v.id);
    const ranked = v.metrics.filter(id => a.metricAvg[id] != null).sort((x, y) => a.metricAvg[y]! - a.metricAvg[x]!);
    const author = v.createdBy ? membersById.value.get(v.createdBy)?.name : null;

    const menu = () => openSheet({
        title: name,
        render: close => (
            <div class="menu">
                <a class="menu-item" href={`/ziyaret/${v.id}/duzenle`} onClick={close}><Pencil />Düzenle</a>
                <button class="menu-item" onClick={() => { close(); openShareSheet(v); }}><Share2 />Paylaş</button>
                <a class="menu-item" href={`/yeni?mekan=${v.venueId}`} onClick={close}><Plus />Bu mekana yeni ziyaret</a>
                {(isOwner.value || pendingIds.value.has(v.id)) && <button class="menu-item danger" onClick={() => { close(); void deleteVisit(v, () => route('/', true)); }}><Trash2 />Sil</button>}
            </div>
        )
    });

    return (
        <>
            <TopBar back="/" transparent actions={<>
                <button class="icon-btn filled" aria-label="Paylaş" onClick={() => openShareSheet(v)}><Share2 /></button>
                <button class="icon-btn filled" aria-label="Diğer" onClick={menu}><Ellipsis /></button>
            </>} />
            <main class="page flush" style={{ marginTop: 'calc(-56px - env(safe-area-inset-top, 0px))' }}>
                <div class="detail-hero"><Photos v={v} name={name} /></div>
                <div class="detail-head" style={{ padding: 0 }}>
                    <div class="row-wrap" style={{ gap: '6px' }}>
                        {v.kinds.map(k => { const I = KIND_ICONS[k]; return <span class="badge" key={k}><I />{GROUP_LABEL[k]}</span>; })}
                        {v.source === 'live' && <span class="badge badge-accent"><Radio />Canlı masa</span>}
                        {pending && <span class="badge badge-warn"><CloudOff />Gönderilecek</span>}
                    </div>
                    <a href={`/mekan/${v.venueId}`}><h1 class="display mt-8">{name}</h1></a>
                    <div class="vhero-meta"><MapPin size={14} />{[venueKindLabel(venue?.kind), venue?.area, fmtDate(v.date, { year: true })].filter(Boolean).join(' · ')}</div>
                </div>

                <div class="card detail-score">
                    <ScoreRing score={v.score} size={64} stroke={8} showValue={false} animate />
                    <div class="grow">
                        <div class="score-big"><span class="value">{fmtScore(v.score)}<small>/10</small></span></div>
                        <div class="row mt-8" style={{ gap: '8px' }}><TierChip score={v.score} /><span class="small faint">{v.participants.length} kişi · {v.metrics.length} kriter</span></div>
                    </div>
                </div>

                <div class="people-scores mt-12">
                    {[...v.participants].sort((x, y) => (a.perParticipant[y.id] ?? 0) - (a.perParticipant[x.id] ?? 0)).map(p => (
                        <a class="pscore" key={p.id} href={p.memberId ? `/kisi/m:${p.memberId}` : undefined}>
                            <Avatar p={p} size="sm" />
                            <span><span class="n">{fmtScore(a.perParticipant[p.id])}</span> <span class="nm">{p.name}</span></span>
                        </a>
                    ))}
                </div>

                {(ranked.length >= 3 || a.conflicts.length > 0) && (
                    <div class="card section" style={{ padding: 0 }}>
                        {ranked.length >= 3 && (
                            <>
                                <div class="insight"><span class="i-icon up"><TrendingUp /></span><div><b>En güçlü: {METRIC_BY_ID[ranked[0]].label}</b><p>Masa ortalaması {fmtScore(a.metricAvg[ranked[0]])}</p></div></div>
                                <div class="insight"><span class="i-icon down"><TrendingDown /></span><div><b>En zayıf: {METRIC_BY_ID[ranked[ranked.length - 1]].label}</b><p>Masa ortalaması {fmtScore(a.metricAvg[ranked[ranked.length - 1]])}</p></div></div>
                            </>
                        )}
                        {a.conflicts.map(id => {
                            const scores = v.participants.map(p => ({ p, s: v.sheets[p.id]?.[id] })).filter(x => isScore(x.s)).sort((x, y) => y.s! - x.s!);
                            return (
                                <div class="insight" key={id}><span class="i-icon split"><Split /></span><div>
                                    <b>Masa bölündü: {METRIC_BY_ID[id].short}</b>
                                    <p>{scores.map(x => `${x.p.name} ${x.s}`).join(' · ')}</p>
                                </div></div>
                            );
                        })}
                    </div>
                )}

                <section class="section">
                    <div class="section-head"><h2>Kriterler</h2></div>
                    <div class="card chart-card">
                        <MetricBars avg={a.metricAvg} metrics={v.metrics} participants={v.participants} sheets={v.sheets} conflicts={a.conflicts} />
                    </div>
                </section>

                {v.items.length > 0 && (
                    <section class="section">
                        <div class="section-head"><h2>Sipariş defteri</h2>{v.spend ? <span class="small faint">Kişi başı ~{fmtMoney(v.spend)}</span> : null}</div>
                        <ItemsList items={v.items} />
                    </section>
                )}

                {v.notes.trim() && (
                    <section class="section">
                        <div class="section-head"><h2>Notlar</h2></div>
                        <div class="card card-pad notes">{v.notes}</div>
                    </section>
                )}

                {!v.items.length && v.spend ? <p class="small muted mt-16">Kişi başı harcama: ~{fmtMoney(v.spend)}</p> : null}

                <p class="tiny faint center mt-32">
                    {author ? `${author} ekledi` : 'Eklendi'}{v.updatedAt > v.createdAt + 60000 ? ' · düzenlendi' : ''}{v.source === 'legacy' ? ' · eski arşivden' : ''}
                </p>
                <div class="row mt-16" style={{ justifyContent: 'center' }}>
                    <a class="btn btn-secondary btn-sm" href={`/ziyaret/${v.id}/duzenle`}><Pencil />Düzenle</a>
                </div>
            </main>
        </>
    );
}
