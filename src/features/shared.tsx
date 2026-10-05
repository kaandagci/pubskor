// Herkese açık paylaşım sayfası (/s/:id). Giriş gerektirmez; ekip verisine erişmez.
import { useEffect, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { GROUP_LABEL, venueKindLabel } from '../../shared/metrics';
import { analyze } from '../../shared/scoring';
import type { SharedVisit } from '../../shared/types';
import { request } from '../lib/api';
import { fmtDate, fmtScore } from '../lib/format';
import { Avatar } from '../components/Avatar';
import { MetricBars } from '../components/charts';
import { KIND_ICONS, MapPin } from '../components/icons';
import { AppMark, ScoreRing } from '../components/ScoreRing';
import { Empty, Loading, TierChip } from '../components/ui';
import { PhotoImg } from '../components/visit';

export function SharedPage() {
    const { params } = useRoute();
    const [data, setData] = useState<SharedVisit | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        request<SharedVisit>('GET', `/api/shares/${encodeURIComponent(params.sid)}`).then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Açılamadı'));
    }, [params.sid]);
    useEffect(() => { if (data) document.title = `${data.venue.name} · ${fmtScore(data.visit.score)} · Pub Skor`; }, [data]);

    if (error) return <main class="page no-tabbar"><Empty title="Paylaşım bulunamadı" action={<a class="btn btn-primary" href="/hosgeldin">Pub Skor’u keşfet</a>}>{error}</Empty></main>;
    if (!data) return <Loading />;
    const { visit: v, venue } = data;
    const a = analyze(v);
    return (
        <main class="page no-tabbar">
            <div class="row between mt-8">
                <span class="brand-word"><AppMark size={30} />Pub Skor</span>
                <span class="badge">{data.crewName}</span>
            </div>
            {v.photos[0] && <div class="card mt-16" style={{ overflow: 'hidden', aspectRatio: '16 / 10' }}><PhotoImg photo={v.photos[0]} eager /></div>}
            <div class="row-wrap mt-16" style={{ gap: '6px' }}>{v.kinds.map(k => { const I = KIND_ICONS[k]; return <span class="badge" key={k}><I />{GROUP_LABEL[k]}</span>; })}</div>
            <h1 class="display mt-8" style={{ fontSize: '34px', lineHeight: 1.05 }}>{venue.name}</h1>
            <div class="vhero-meta"><MapPin size={14} />{[venueKindLabel(venue.kind), venue.area, fmtDate(v.date, { year: true })].filter(Boolean).join(' · ')}</div>
            <div class="card detail-score">
                <ScoreRing score={v.score} size={64} stroke={8} showValue={false} animate />
                <div class="grow">
                    <div class="score-big"><span class="value">{fmtScore(v.score)}<small>/10</small></span></div>
                    <div class="row mt-8" style={{ gap: '8px' }}><TierChip score={v.score} /><span class="small faint">{v.participants.length} kişinin ortak kararı</span></div>
                </div>
            </div>
            <div class="people-scores mt-12">
                {v.participants.map(p => <span class="pscore" key={p.id}><Avatar p={p} size="sm" /><span><span class="n">{fmtScore(a.perParticipant[p.id])}</span> <span class="nm">{p.name}</span></span></span>)}
            </div>
            <section class="section">
                <div class="section-head"><h2>Kriterler</h2></div>
                <div class="card chart-card"><MetricBars avg={a.metricAvg} metrics={v.metrics} /></div>
            </section>
            {v.notes && <section class="section"><div class="card card-pad notes">{v.notes}</div></section>}
            <div class="card card-pad-lg center mt-32">
                <b class="display" style={{ fontSize: '20px' }}>Arkadaşlarınla mekan puanla</b>
                <p class="muted small mt-8">Masadaki herkes kendi telefonundan puan verir; Pub Skor ortak skoru hesaplar ve ekibinizin kendi sıralamasını tutar.</p>
                <a class="btn btn-primary mt-16" href="/hosgeldin">Ücretsiz başla</a>
            </div>
            <p class="tiny faint center mt-16">18+ · Lütfen sorumlu tüketin</p>
        </main>
    );
}
