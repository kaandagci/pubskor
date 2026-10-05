// Skor hesabı: canlı önizleme, kayıt, PDF, paylaşım ve sunucu doğrulaması aynı fonksiyonu kullanır.
import { GROUPS, METRIC_BY_ID, orderMetrics, type GroupId, type MetricId } from './metrics';
import type { Participant, Sheet } from './types';
import { round1 } from './text';

/** "Yok / fikrim yok" işareti. Puan sayılmaz ama hücre doldurulmuş kabul edilir. */
export const NA = 0;
/** Bir kriterde en yüksek ve en düşük puan arasında bu kadar fark varsa masa "bölünmüş" sayılır. */
export const CONFLICT_SPREAD = 3;

export const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10;
export const isCell = (v: unknown): v is number => v === NA || isScore(v);

export interface ScoringInput {
    participants: Pick<Participant, 'id'>[];
    sheets: Record<string, Sheet | undefined>;
    /** Puanlanan kriterler. */
    metrics: readonly MetricId[];
}

export interface Analysis {
    /** Tüm kriterler × tüm kişiler doldurulmuş ve en az bir gerçek puan var. */
    complete: boolean;
    filled: number;
    needed: number;
    missing: { pid: string; mid: MetricId }[];
    active: MetricId[];
    /** Kişi başına doldurulan hücre sayısı. */
    progress: Record<string, number>;
    metricAvg: Partial<Record<MetricId, number>>;
    metricSpread: Partial<Record<MetricId, number>>;
    perParticipant: Record<string, number | null>;
    groups: Partial<Record<GroupId, number>>;
    /** Ağırlıklı konsensüs. Eksik varsa geçici değerdir (complete=false). */
    score: number | null;
    conflicts: MetricId[];
}

export function analyze(input: ScoringInput): Analysis {
    const active = orderMetrics(input.metrics);
    const pids = input.participants.map(p => p.id);
    const missing: Analysis['missing'] = [];
    const progress: Record<string, number> = {};
    const metricAvg: Analysis['metricAvg'] = {};
    const metricSpread: Analysis['metricSpread'] = {};
    const acc: Record<string, { sum: number; w: number }> = {};
    pids.forEach(pid => { acc[pid] = { sum: 0, w: 0 }; progress[pid] = 0; });

    let filled = 0, wTotal = 0, wSum = 0;
    const groupAcc: Partial<Record<GroupId, { sum: number; w: number }>> = {};
    const conflicts: MetricId[] = [];

    for (const id of active) {
        const m = METRIC_BY_ID[id];
        const vals: number[] = [];
        for (const pid of pids) {
            const v = input.sheets[pid]?.[id];
            if (isCell(v)) {
                filled++; progress[pid]++;
                if (v !== NA) { vals.push(v); acc[pid].sum += v * m.weight; acc[pid].w += m.weight; }
            } else missing.push({ pid, mid: id });
        }
        if (!vals.length) continue;
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const spread = Math.max(...vals) - Math.min(...vals);
        metricAvg[id] = avg;
        metricSpread[id] = spread;
        if (vals.length > 1 && spread >= CONFLICT_SPREAD) conflicts.push(id);
        wTotal += m.weight; wSum += avg * m.weight;
        const g = (groupAcc[m.group] ??= { sum: 0, w: 0 });
        g.sum += avg * m.weight; g.w += m.weight;
    }

    const perParticipant: Record<string, number | null> = {};
    pids.forEach(pid => { perParticipant[pid] = acc[pid].w ? acc[pid].sum / acc[pid].w : null; });
    const groups: Analysis['groups'] = {};
    GROUPS.forEach(g => { const a = groupAcc[g.id]; if (a?.w) groups[g.id] = a.sum / a.w; });

    const needed = pids.length * active.length;
    const score = wTotal ? round1(wSum / wTotal) : null;
    return {
        complete: pids.length > 0 && active.length > 0 && filled === needed && score != null,
        filled, needed, missing, active, progress, metricAvg, metricSpread, perParticipant, groups, score, conflicts
    };
}

/** Kişi kağıdının dolu hücre sayısı (canlı masada ilerleme göstergesi için). */
export function sheetFilled(sheet: Sheet | undefined, metrics: readonly MetricId[]): number {
    if (!sheet) return 0;
    return metrics.reduce((n, id) => n + (isCell(sheet[id]) ? 1 : 0), 0);
}
