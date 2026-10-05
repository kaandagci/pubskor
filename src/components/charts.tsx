// Grafikler: ince işaretler, sessiz ızgara, seçici etiketler, üzerine gelince ayrıntı. Her grafiğin tablo karşılığı var.
import { useMemo, useRef, useState } from 'preact/hooks';
import { GROUPS, GROUP_LABEL, METRICS, METRIC_BY_ID, orderMetrics, weightShare, type GroupId, type MetricId } from '../../shared/metrics';
import { isScore } from '../../shared/scoring';
import type { Participant, Sheet } from '../../shared/types';
import { fmtDate, fmtScore, fmtSigned } from '../lib/format';
import { personClass } from '../lib/colors';

// ----- Kriter çubukları (+ kişi noktaları) -----

interface MetricBarsProps {
    avg: Partial<Record<MetricId, number>>;
    /** Gösterilecek kriterler; verilmezse ortalaması olan tüm kriterler. */
    metrics?: readonly MetricId[];
    /** Verilirse her kişinin puanı çubuğun üstünde nokta olarak gösterilir. */
    participants?: Participant[];
    sheets?: Record<string, Sheet>;
    conflicts?: readonly MetricId[];
}

/** Kriterleri gruplarına (Bira, Kokteyl, Servis…) göre sıralar. */
function grouped(ids: readonly MetricId[]): { group: GroupId; ids: MetricId[] }[] {
    const set = new Set(ids);
    return GROUPS.map(g => ({ group: g.id as GroupId, ids: METRICS.filter(m => m.group === g.id && set.has(m.id)).map(m => m.id) }))
        .filter(g => g.ids.length);
}

export function MetricBars({ avg, metrics, participants, sheets, conflicts = [] }: MetricBarsProps) {
    const [table, setTable] = useState(false);
    const ids = metrics ?? (Object.keys(avg) as MetricId[]);
    const groups = useMemo(() => grouped(ids), [ids.join()]);
    const showDots = !!participants && !!sheets && participants.length > 1;

    return (
        <div>
            {showDots && (
                <div class="row between mb-12" style={{ alignItems: 'flex-start' }}>
                    <div class="legend">
                        <span><i class="avg-key neutral" />Masa ortalaması</span>
                        {participants!.map(p => <span key={p.id}><i class={`dot ${personClass(p.color)}`} />{p.name}</span>)}
                    </div>
                    <button class="btn btn-sm btn-ghost" onClick={() => setTable(!table)} aria-pressed={table}>{table ? 'Grafik' : 'Tablo'}</button>
                </div>
            )}
            {table && showDots ? (
                <ScoreTable participants={participants!} sheets={sheets!} metrics={ids} avg={avg} />
            ) : (
                <div class="stack gap-16">
                    {groups.map(g => (
                        <div key={g.group}>
                            {groups.length > 1 && <div class="eyebrow mb-8">{GROUP_LABEL[g.group]}</div>}
                            <div class={`mbars ${showDots ? 'with-dots' : ''}`}>
                                {g.ids.map(id => {
                                    const m = METRIC_BY_ID[id];
                                    const v = avg[id] ?? null;
                                    return (
                                        <div class={`mbar ${v == null ? 'muted' : ''}`} key={id}>
                                            <span class="mbar-label" title={m.label}>{conflicts.includes(id) ? '⚡ ' : ''}{m.short}</span>
                                            <div class="mbar-track">
                                                {v != null && <div class="mbar-fill" style={{ width: `${v * 10}%` }} />}
                                                {showDots && participants!.map(p => {
                                                    const sc = sheets![p.id]?.[id];
                                                    if (!isScore(sc)) return null;
                                                    return <span key={p.id} class={`mbar-dot ${personClass(p.color)}`} style={{ left: `${sc * 10}%` }} title={`${p.name}: ${sc}`} />;
                                                })}
                                            </div>
                                            <span class="mbar-value">{fmtScore(v)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function ScoreTable({ participants, sheets, metrics, avg }: { participants: Participant[]; sheets: Record<string, Sheet>; metrics: readonly MetricId[]; avg?: Partial<Record<MetricId, number>> }) {
    return (
        <div class="grid-wrap">
            <table class="sgrid">
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Kriter</th>
                        {participants.map(p => <th key={p.id}><span class="row" style={{ gap: '5px', justifyContent: 'center' }}><i class={`dot ${personClass(p.color)}`} />{p.name}</span></th>)}
                        {avg && <th>Ort.</th>}
                    </tr>
                </thead>
                <tbody>
                    {orderMetrics(metrics).map(id => {
                        const m = METRIC_BY_ID[id];
                        return (
                            <tr key={id}>
                                <th>{m.short}<small>{GROUP_LABEL[m.group]} · %{weightShare(id, metrics)}</small></th>
                                {participants.map(p => {
                                    const v = sheets[p.id]?.[id];
                                    return <td key={p.id}><span class={`cell ${v === 0 ? 'na' : ''}`} style={{ margin: '0 auto' }}>{v === 0 ? 'yok' : v ?? '·'}</span></td>;
                                })}
                                {avg && <td><b class="num">{fmtScore(avg[id])}</b></td>}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ----- Skor eğilimi (çizgi) -----

export function TrendChart({ points }: { points: { date: string; score: number }[] }) {
    const ref = useRef<SVGSVGElement>(null);
    const [hover, setHover] = useState<number | null>(null);
    const W = 320, H = 132, L = 24, R = 12, T = 18, B = 22;
    const n = points.length;
    if (n === 0) return null;
    const lo = Math.max(0, Math.floor(Math.min(...points.map(p => p.score)) - 1));
    const hi = 10;
    const x = (i: number) => (n === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
    const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
    const ticks = [lo, (lo + hi) / 2, hi];
    const last = points[n - 1];
    const onMove = (e: PointerEvent) => {
        const svg = ref.current;
        if (!svg) return;
        const r = svg.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        let best = 0;
        points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
        setHover(best);
    };
    const h = hover != null ? points[hover] : null;
    return (
        <div style={{ position: 'relative' }}>
            <svg ref={ref} class="chart-svg" viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
                aria-label={`Skor eğilimi: ${points.map(p => `${fmtDate(p.date)} ${fmtScore(p.score)}`).join(', ')}`}>
                {ticks.map(t => (
                    <g key={t}>
                        <line class="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
                        <text class="axis" x={L - 6} y={y(t) + 4} text-anchor="end">{Number.isInteger(t) ? t : fmtScore(t)}</text>
                    </g>
                ))}
                {n > 1 && <path class="area" d={`${line} L${x(n - 1)},${y(lo)} L${x(0)},${y(lo)} Z`} />}
                {n > 1 && <path class="line" d={line} />}
                {h && <line x1={x(hover!)} x2={x(hover!)} y1={T - 6} y2={H - B} stroke="var(--line-strong)" stroke-width="1" />}
                {points.map((p, i) => <circle key={i} class="pt" cx={x(i)} cy={y(p.score)} r={i === hover || i === n - 1 ? 5 : 4} />)}
                <text class="lbl" x={x(n - 1) - (n > 1 ? 6 : -8)} y={y(last.score) - 10} text-anchor={n > 1 ? 'end' : 'start'}>{fmtScore(last.score)}</text>
                <text class="axis" x={x(0)} y={H - 4} text-anchor={n > 1 ? 'start' : 'middle'}>{fmtDate(points[0].date, { short: true })}</text>
                {n > 1 && <text class="axis" x={x(n - 1)} y={H - 4} text-anchor="end">{fmtDate(last.date, { short: true })}</text>}
            </svg>
            {h && (
                <div class="chart-tip" style={{ left: `${(x(hover!) / W) * 100}%`, top: `${(y(h.score) / H) * 100}%` }}>
                    <b>{fmtScore(h.score)}</b> · {fmtDate(h.date)}
                </div>
            )}
        </div>
    );
}

// ----- Küçük eğilim çizgisi -----

export function Spark({ values }: { values: number[] }) {
    if (values.length < 2) return <svg class="spark" viewBox="0 0 64 26" aria-hidden="true" />;
    const lo = Math.min(...values) - 0.3, hi = Math.max(...values) + 0.3;
    const x = (i: number) => 2 + (i * 60) / (values.length - 1);
    const y = (v: number) => 23 - ((v - lo) / (hi - lo || 1)) * 20;
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return (
        <svg class="spark" viewBox="0 0 64 26" aria-hidden="true">
            <path d={d} />
            <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="3.5" />
        </svg>
    );
}

// ----- Sapma çubukları (masaya göre daha sert / daha cömert) -----

export function BiasBars({ bias }: { bias: Partial<Record<MetricId, number>> }) {
    const rows = METRICS.filter(m => bias[m.id] != null).map(m => ({ m, v: bias[m.id]! })).sort((a, b) => a.v - b.v);
    if (!rows.length) return <p class="muted small">Karşılaştırma için yeterli ortak puan yok.</p>;
    const max = Math.max(1.5, ...rows.map(r => Math.abs(r.v)));
    return (
        <div>
            <div class="legend mb-12">
                <span><i class="dot" style={{ background: 'var(--div-neg)' }} />Masadan sert</span>
                <span><i class="dot" style={{ background: 'var(--div-pos)' }} />Masadan cömert</span>
            </div>
            <div class="mbars">
                {rows.map(({ m, v }) => (
                    <div class="mbar" key={m.id}>
                        <span class="mbar-label">{m.short}</span>
                        <div class="dbar">
                            <div class={`dbar-fill ${v < 0 ? 'neg' : 'pos'}`} style={{ width: `${(Math.abs(v) / max) * 50}%` }} title={`${m.label}: ${fmtSigned(v)}`} />
                        </div>
                        <span class="mbar-value">{fmtSigned(v)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ----- Uyum matrisi (sıralı tek ton) -----

const SEQ = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)'];

export function AgreementMatrix({ people }: { people: { key: string; name: string; color: number; agreement: Record<string, { similarity: number }> }[] }) {
    const list = people.filter(p => Object.keys(p.agreement).length > 0).slice(0, 7);
    if (list.length < 2) return <p class="muted small">Uyum için en az iki kişinin birlikte birkaç ziyareti olmalı.</p>;
    const all = list.flatMap(a => list.map(b => a.agreement[b.key]?.similarity).filter((x): x is number => x != null));
    const lo = Math.min(...all), hi = Math.max(...all);
    const step = (v: number) => (hi === lo ? 3 : Math.min(3, Math.floor(((v - lo) / (hi - lo)) * 4)));
    return (
        <div class="grid-wrap">
            <table class="matrix" aria-label="Kişiler arası puan uyumu (yüzde)">
                <thead>
                    <tr><th />{list.map(p => <th key={p.key} scope="col">{p.name}</th>)}</tr>
                </thead>
                <tbody>
                    {list.map(a => (
                        <tr key={a.key}>
                            <th scope="row" style={{ textAlign: 'right' }}>{a.name}</th>
                            {list.map(b => {
                                if (a.key === b.key) return <td key={b.key} style={{ background: 'var(--surface-2)' }} />;
                                const v = a.agreement[b.key]?.similarity;
                                if (v == null) return <td key={b.key} style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>·</td>;
                                const s = step(v);
                                return <td key={b.key} style={{ background: SEQ[s], color: `var(--seq-ink-${s + 1})` }} title={`${a.name} – ${b.name}: %${v}`}>%{v}</td>;
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            <div class="legend mt-8" style={{ flexWrap: 'nowrap', gap: '6px', alignItems: 'center' }}>
                <span>Daha az uyum</span>
                {SEQ.map((c, i) => <i key={i} style={{ display: 'inline-block', width: '18px', height: '10px', borderRadius: '3px', background: c }} />)}
                <span>Daha çok uyum</span>
            </div>
        </div>
    );
}
