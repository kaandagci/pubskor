import { useEffect, useId, useState } from 'preact/hooks';
import { BUBBLES, GLASS_PATH, INNER_PATH, PINT_H, PINT_W, SHINE_PATH, foamBubbles, liquidY } from '../lib/pint';
import { fmtScore } from '../lib/format';

interface Props {
    score: number | null | undefined;
    size?: number;
    /** Açılışta boştan dolarak gelir. */
    pour?: boolean;
    bubbles?: boolean;
    class?: string;
}

/** Skoru bira bardağının doluluğuyla gösterir. Erişilebilir ad skoru da söyler. */
export function Pint({ score, size = 28, pour = false, bubbles = false, class: cls = '' }: Props) {
    const id = useId().replace(/[^\w-]/g, '');
    const [shown, setShown] = useState(pour ? null : score);
    useEffect(() => {
        if (!pour) { setShown(score); return; }
        const t = setTimeout(() => setShown(score), 120);
        return () => clearTimeout(t);
    }, [score, pour]);
    const y = liquidY(shown);
    const empty = shown == null;
    return (
        <svg
            class={`pint ${bubbles ? 'animate' : ''} ${cls}`}
            width={size} height={(size * PINT_H) / PINT_W} viewBox={`0 0 ${PINT_W} ${PINT_H}`}
            role="img" aria-label={score == null ? 'Puan yok' : `Skor ${fmtScore(score)} / 10`}
        >
            <defs>
                <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="var(--beer-top)" />
                    <stop offset="1" stop-color="var(--beer-bottom)" />
                </linearGradient>
                <clipPath id={`c${id}`}><path d={INNER_PATH} /></clipPath>
            </defs>
            <path class="glass" d={GLASS_PATH} />
            {!empty && (
                <g clip-path={`url(#c${id})`}>
                    <g class="beer" style={{ transform: `translateY(${y}px)` }}>
                        <rect x="0" y="0" width={PINT_W} height={PINT_H} fill={`url(#b${id})`} />
                        {foamBubbles(0).map((b, i) => <circle key={i} class="foam" cx={b.cx} cy={b.cy} r={b.r} />)}
                        <rect class="foam" x="0" y="-5.6" width={PINT_W} height="4.6" />
                        {bubbles && BUBBLES.map((b, i) => (
                            <circle key={'x' + i} class="bubble" cx={b.cx} cy={PINT_H - y - 4} r={b.r} style={{ animationDelay: `${b.d}s` }} />
                        ))}
                    </g>
                </g>
            )}
            <path class="shine" d={SHINE_PATH} />
        </svg>
    );
}
