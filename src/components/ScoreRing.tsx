import { useEffect, useState } from 'preact/hooks';
import { fmtScore } from '../lib/format';

interface Props {
    score: number | null | undefined;
    /** Halkanın çapı (px). */
    size?: number;
    /** Halka kalınlığı (px); verilmezse çapa göre seçilir. */
    stroke?: number;
    /** Ortada skor yazısı (küçük boylarda varsayılan olarak kapalı). */
    showValue?: boolean;
    /** Açılışta boştan dolarak gelir. */
    animate?: boolean;
    class?: string;
}

/** Skoru 10 üzerinden dolan bir halkayla gösterir (Apple Etkinlik halkaları gibi). Erişilebilir ad skoru söyler. */
export function ScoreRing({ score, size = 28, stroke, showValue = size >= 40, animate = false, class: cls = '' }: Props) {
    const [shown, setShown] = useState<number | null | undefined>(animate ? null : score);
    useEffect(() => {
        if (!animate) { setShown(score); return; }
        const t = setTimeout(() => setShown(score), 80);
        return () => clearTimeout(t);
    }, [score, animate]);
    const w = stroke ?? Math.max(2.5, Math.round(size * 0.1 * 10) / 10);
    const r = 50 - (w / size) * 50;
    const pct = shown == null ? 0 : Math.max(0, Math.min(100, shown * 10));
    const empty = score == null;
    return (
        <span
            class={`score-ring ${empty ? 'empty' : ''} ${cls}`}
            style={{ width: `${size}px`, height: `${size}px` }}
            role="img" aria-label={empty ? 'Puan yok' : `Skor ${fmtScore(score)} / 10`}
        >
            <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle class="sr-track" cx="50" cy="50" r={r} stroke-width={(w / size) * 100} />
                <circle class="sr-val" cx="50" cy="50" r={r} stroke-width={(w / size) * 100} pathLength={100} stroke-dasharray={`${pct} 100`} />
            </svg>
            {showValue && <b style={{ fontSize: `${Math.round(size * 0.32)}px` }}>{empty ? '–' : fmtScore(score)}</b>}
        </span>
    );
}

/** Uygulama işareti: turuncu karede skor halkası (uygulama simgesiyle aynı). */
export function AppMark({ size = 30 }: { size?: number }) {
    return (
        <span class="app-mark" style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true">
            <svg viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="19" fill="none" stroke="rgba(255,255,255,.38)" stroke-width="8" />
                <circle cx="32" cy="32" r="19" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" pathLength={100} stroke-dasharray="84 100" transform="rotate(-90 32 32)" />
            </svg>
        </span>
    );
}
