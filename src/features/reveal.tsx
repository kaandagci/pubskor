import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { METRIC_BY_ID } from '../../shared/metrics';
import { analysisOf } from '../../shared/insights';
import type { Participant, Sheet, Visit } from '../../shared/types';
import { analyze } from '../../shared/scoring';
import { fmtScore } from '../lib/format';
import { venueById, visits } from '../state/data';
import { haptic } from '../state/ui';
import { Avatar } from '../components/Avatar';
import { Share2 } from '../components/icons';
import { Pint } from '../components/Pint';
import { TierChip } from '../components/ui';
import { openShareSheet } from './share-sheet';

function useCountUp(target: number | null, ms = 1300, delay = 250): number | null {
    const [v, setV] = useState<number | null>(target == null ? null : 0);
    useEffect(() => {
        if (target == null) { setV(null); return; }
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
        let raf = 0;
        const start = performance.now() + delay;
        const tick = (now: number) => {
            const t = Math.min(1, Math.max(0, (now - start) / ms));
            const eased = 1 - Math.pow(1 - t, 3);
            setV(Math.round(target * eased * 10) / 10);
            if (t < 1) raf = requestAnimationFrame(tick); else haptic(18);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target]);
    return v;
}

/** Masanın kararı: bardak dolar, skor sayarak açılır, kişiler sırayla belirir. */
export function RevealView({ venueName, score, participants, perParticipant, best, actions }: {
    venueName: string;
    score: number | null;
    participants: Participant[];
    perParticipant: Record<string, number | null>;
    best?: string | null;
    actions?: preact.ComponentChildren;
}) {
    const shown = useCountUp(score);
    const sorted = [...participants].sort((a, b) => (perParticipant[b.id] ?? 0) - (perParticipant[a.id] ?? 0));
    return (
        <div class="reveal">
            <span class="eyebrow">Masanın kararı</span>
            <div class="venue">{venueName}</div>
            <div style={{ marginTop: '22px' }}><Pint score={score} size={128} pour bubbles /></div>
            <div class="big" aria-live="polite">{fmtScore(shown)}</div>
            <TierChip score={score} />
            {best && <p class="muted small mt-12" style={{ animation: 'rise .5s var(--ease) both', animationDelay: '1.6s' }}>{best}</p>}
            <div class="reveal-people">
                {sorted.map((p, i) => (
                    <div class="reveal-person" key={p.id} style={{ animationDelay: `${1.5 + i * 0.12}s` }}>
                        <Avatar p={p} /><b>{fmtScore(perParticipant[p.id])}</b>{p.name}
                    </div>
                ))}
            </div>
            {actions && <div class="reveal-actions">{actions}</div>}
        </div>
    );
}

export function bestLine(v: { metrics: Visit['metrics'] }, metricAvg: Partial<Record<string, number>>): string | null {
    const ranked = v.metrics.filter(id => metricAvg[id] != null).sort((a, b) => metricAvg[b]! - metricAvg[a]!);
    if (ranked.length < 3) return null;
    return `En parlak yanı ${METRIC_BY_ID[ranked[0]].short.toLocaleLowerCase('tr')} (${fmtScore(metricAvg[ranked[0]])}), en zayıfı ${METRIC_BY_ID[ranked[ranked.length - 1]].short.toLocaleLowerCase('tr')} (${fmtScore(metricAvg[ranked[ranked.length - 1]])})`;
}

export function Reveal() {
    const { params } = useRoute();
    const { route } = useLocation();
    const v = visits.value.find(x => x.id === params.id);
    if (!v) return <main class="page no-tabbar"><div class="empty mt-32"><h3 class="display">Ziyaret bulunamadı</h3><a class="btn btn-secondary" href="/">Ana sayfa</a></div></main>;
    const a = analysisOf(v);
    return (
        <RevealView
            venueName={venueById.value.get(v.venueId)?.name ?? 'Mekan'}
            score={v.score}
            participants={v.participants}
            perParticipant={a.perParticipant}
            best={bestLine(v, a.metricAvg)}
            actions={<>
                <button class="btn btn-primary btn-lg" onClick={() => openShareSheet(v)}><Share2 />Paylaş</button>
                <button class="btn btn-secondary" onClick={() => route(`/ziyaret/${v.id}`, true)}>Ziyareti gör</button>
                <a class="btn btn-ghost" href="/">Ana sayfa</a>
            </>}
        />
    );
}

/** Canlı masa kapanınca misafirler için de kullanılan, ziyaret nesnesi olmadan açılış. */
export function revealFromSheets(participants: Participant[], sheets: Record<string, Sheet>, metrics: Visit['metrics']) {
    return analyze({ participants, sheets, metrics });
}
