import { useMemo, useState } from 'preact/hooks';
import { KINDS, VENUE_TAGS, defaultKindsFor, venueKindLabel, type KindId } from '../../shared/metrics';
import { rankValue } from '../../shared/insights';
import { fmtDistance, fmtRelativeDay, fmtScore } from '../lib/format';
import { distance, getPosition, lastPosition, type LatLng } from '../lib/geo';
import { venueSummaries, wishlist } from '../state/data';
import { haptic, toastError } from '../state/ui';
import { Bookmark, KIND_ICONS, LocateFixed, Shuffle, Sparkles } from '../components/icons';
import { ScoreRing } from '../components/ScoreRing';
import { Spinner, Switch, TierChip, TopBar } from '../components/ui';
import { CrewRecommendations } from './community';

type Mood = 'overall' | KindId;

/** "Nereye gidelim?": ekibin kendi puanlarına, ruh haline, özelliklere ve yakınlığa göre öneri. */
export function Discover() {
    const [mood, setMood] = useState<Mood>('overall');
    const [tags, setTags] = useState<string[]>([]);
    const [near, setNear] = useState(false);
    const [pos, setPos] = useState<LatLng | null>(lastPosition());
    const [locating, setLocating] = useState(false);
    const [pick, setPick] = useState<string | null>(null);

    const toggleNear = async (on: boolean) => {
        setNear(on);
        if (on && !pos) {
            setLocating(true);
            try { setPos(await getPosition()); } catch (e) { toastError(e); setNear(false); } finally { setLocating(false); }
        }
    };

    const results = useMemo(() => {
        return venueSummaries.value
            .filter(s => s.count > 0)
            .filter(s => tags.every(t => (s.venue.tags as string[]).includes(t)))
            .map(s => {
                const value = rankValue(s, mood);
                const d = near && pos && s.venue.lat != null ? distance(pos, { lat: s.venue.lat, lng: s.venue.lng! }) : null;
                // Yakınlık açıksa her km için 0,4 puan düş; konumu olmayanlar sona
                const rank = value == null ? -99 : value - (near ? (d == null ? 3 : (d / 1000) * 0.4) : 0);
                return { s, value, d, rank };
            })
            .filter(x => x.value != null && (!near || x.d == null || x.d < 15000))
            .sort((a, b) => b.rank - a.rank)
            .slice(0, 12);
    }, [venueSummaries.value, mood, tags.join(), near, pos]);

    const wishes = useMemo(() => wishlist.value
        .filter(v => mood === 'overall' || defaultKindsFor(v.kind).includes(mood))
        .filter(v => tags.every(t => (v.tags as string[]).includes(t)))
        .map(v => ({ v, d: near && pos && v.lat != null ? distance(pos, { lat: v.lat, lng: v.lng! }) : null }))
        .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9)), [wishlist.value, mood, tags.join(), near, pos]);

    const lucky = () => {
        const pool = results.slice(0, 5);
        if (!pool.length) return;
        haptic(20);
        setPick(pool[Math.floor(Math.random() * pool.length)].s.venue.id);
    };

    return (
        <>
            <TopBar title="Nereye gidelim?" back="/siralama" />
            <main class="page">
                <div class="eyebrow mb-8">Canın ne çekiyor?</div>
                <div class="chip-scroll" role="group" aria-label="Ruh hali">
                    <button class="chip" aria-pressed={mood === 'overall'} onClick={() => setMood('overall')}><Sparkles />Fark etmez</button>
                    {KINDS.map(k => { const I = KIND_ICONS[k.id]; return <button key={k.id} class="chip" aria-pressed={mood === k.id} onClick={() => setMood(k.id)}><I />{k.label}</button>; })}
                </div>
                <div class="eyebrow mt-16 mb-8">Olsun istediklerin</div>
                <div class="row-wrap">
                    {VENUE_TAGS.map(t => <button key={t.id} class="chip" aria-pressed={tags.includes(t.id)} onClick={() => setTags(tags.includes(t.id) ? tags.filter(x => x !== t.id) : [...tags, t.id])}>{t.label}</button>)}
                </div>
                <div class="list mt-16">
                    <div class="list-item">
                        <span class="li-icon">{locating ? <Spinner small /> : <LocateFixed />}</span>
                        <span class="li-body"><span class="li-title">Yakınımdakiler öne çıksın</span><span class="li-sub">Konumun yalnızca bu cihazda kullanılır</span></span>
                        <Switch checked={near} onChange={toggleNear} label="Yakınımdakiler" />
                    </div>
                </div>

                <section class="section">
                    <div class="section-head"><h2>Öneriler</h2>{results.length > 1 && <button class="btn btn-sm btn-secondary" onClick={lucky}><Shuffle />Şansıma</button>}</div>
                    {!results.length ? <p class="muted">Bu seçimlere uyan, daha önce puanladığınız bir mekan yok.</p> : (
                        <div class="list">
                            {results.map(({ s, value, d }) => (
                                <a key={s.venue.id} href={`/mekan/${s.venue.id}`} class="rank-row" style={pick === s.venue.id ? { background: 'var(--accent-soft)' } : undefined}>
                                    <ScoreRing score={value} size={22} />
                                    <div class="grow" style={{ minWidth: 0 }}>
                                        <div class="vrow-title" style={{ fontSize: '16.5px' }}>{s.venue.name}{pick === s.venue.id ? ' 🎯' : ''}</div>
                                        <div class="vrow-meta">{[venueKindLabel(s.venue.kind), s.venue.area, d != null ? fmtDistance(d) : null, s.last ? `son ${fmtRelativeDay(s.last).toLocaleLowerCase('tr')}` : null].filter(Boolean).join(' · ')}</div>
                                    </div>
                                    <div class="vrow-score"><b style={{ fontSize: '19px' }}>{fmtScore(value)}</b><TierChip score={value} /></div>
                                </a>
                            ))}
                        </div>
                    )}
                </section>

                <CrewRecommendations />

                {wishes.length > 0 && (
                    <section class="section">
                        <div class="section-head"><h2>Henüz gitmedikleriniz</h2></div>
                        <div class="list">
                            {wishes.map(({ v, d }) => (
                                <a key={v.id} href={`/mekan/${v.id}`} class="list-item">
                                    <span class="li-icon" style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}><Bookmark /></span>
                                    <span class="li-body"><span class="li-title">{v.name}</span><span class="li-sub">{[venueKindLabel(v.kind), v.area, d != null ? fmtDistance(d) : null, v.wish?.note].filter(Boolean).join(' · ')}</span></span>
                                </a>
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </>
    );
}
