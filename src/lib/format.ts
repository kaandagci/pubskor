// Biçimlendirme yardımcıları (Türkçe).
import { tierOf } from '../../shared/metrics';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export const fmtScore = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '—' : n.toFixed(1).replace('.', ','));
export const fmtSigned = (n: number | null | undefined) => (n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toFixed(1).replace('.', ','));

export function fmtDate(iso: string, opts: { short?: boolean; year?: boolean } = {}): string {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    const months = opts.short ? MONTHS_SHORT : MONTHS;
    const showYear = opts.year ?? y !== new Date().getFullYear();
    return `${d} ${months[m - 1]}${showYear ? ' ' + y : ''}`;
}

export function fmtRelativeDay(iso: string, today = new Date()): string {
    const [y, m, d] = iso.split('-').map(Number);
    const a = Date.UTC(y, m - 1, d);
    const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const diff = Math.round((b - a) / 86400000);
    if (diff === 0) return 'Bugün';
    if (diff === 1) return 'Dün';
    if (diff > 1 && diff < 7) return `${diff} gün önce`;
    return fmtDate(iso, { short: true });
}

export function fmtMoney(n: number | null | undefined): string {
    if (n == null) return '—';
    return '₺' + Math.round(n).toLocaleString('tr-TR');
}

export function fmtCount(n: number, word: string) { return `${n.toLocaleString('tr-TR')} ${word}`; }

export const tierClass = (score: number | null | undefined) => 'tier tier-' + tierOf(score).id;

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const a = parts[0][0] ?? '';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? '';
    return (a + (parts.length > 1 ? b : '')).toLocaleUpperCase('tr');
}

export function plural(n: number, one: string) { return `${n} ${one}`; }

export function fmtDistance(m: number): string {
    if (m < 1000) return `${Math.round(m / 10) * 10} m`;
    return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}
