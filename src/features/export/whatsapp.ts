// WhatsApp için biçimlendirilmiş özet metni.
import { METRIC_BY_ID, tierOf } from '../../../shared/metrics';
import { analysisOf } from '../../../shared/insights';
import type { Venue, Visit } from '../../../shared/types';
import { fmtDate, fmtMoney, fmtScore } from '../../lib/format';

export function whatsappText(v: Visit, venue: Venue | undefined): string {
    const a = analysisOf(v);
    const t = tierOf(v.score);
    const name = venue?.name ?? 'Mekan';
    const lines: string[] = [];
    lines.push(`🍻 *${name}*${venue?.area ? ` (${venue.area})` : ''}`);
    lines.push(`📅 ${fmtDate(v.date, { year: true })}`);
    lines.push(`⭐ *${fmtScore(v.score)} / 10* — ${t.label}`);
    lines.push('');
    lines.push('👥 *Masa*');
    for (const p of [...v.participants].sort((x, y) => (a.perParticipant[y.id] ?? 0) - (a.perParticipant[x.id] ?? 0))) {
        lines.push(`• ${p.name}: ${fmtScore(a.perParticipant[p.id])}`);
    }
    const ranked = v.metrics.filter(id => a.metricAvg[id] != null).sort((x, y) => a.metricAvg[y]! - a.metricAvg[x]!);
    if (ranked.length >= 3) {
        lines.push('');
        lines.push(`👍 *En iyi:* ${ranked.slice(0, 2).map(id => `${METRIC_BY_ID[id].short} ${fmtScore(a.metricAvg[id])}`).join(', ')}`);
        lines.push(`👎 *En zayıf:* ${ranked.slice(-2).reverse().map(id => `${METRIC_BY_ID[id].short} ${fmtScore(a.metricAvg[id])}`).join(', ')}`);
    }
    if (a.conflicts.length) lines.push(`⚡ *Masa bölündü:* ${a.conflicts.map(id => METRIC_BY_ID[id].short).join(', ')}`);
    const tops = (v.items ?? []).filter(i => i.verdict === 'top');
    if (tops.length) lines.push(`🏆 *Masanın favorileri:* ${tops.map(i => i.name).join(', ')}`);
    if (v.spend) lines.push(`💸 Kişi başı ~${fmtMoney(v.spend)}`);
    if (v.notes.trim()) { lines.push(''); lines.push(`📝 ${v.notes.trim()}`); }
    lines.push('');
    lines.push('_Pub Skor ile puanlandı_');
    return lines.join('\n');
}
