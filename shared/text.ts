// Metin ve tarih yardımcıları (istemci + sunucu).

const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Kontrol karakterlerini atar, kırpar, uzunluğu sınırlar. Tek satırlık alanlar için boşlukları sadeleştirir. */
export function cleanLine(v: unknown, max: number): string {
    if (typeof v !== 'string') return '';
    return v.replace(CTRL_RE, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanText(v: unknown, max: number): string {
    if (typeof v !== 'string') return '';
    return v.replace(CTRL_RE, '').replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, max);
}

/** Türkçe duyarlı karşılaştırma anahtarı: "Kadıköy Pub" ve "kadikoy  pub" aynı olur. */
export function foldKey(s: string): string {
    return s
        .toLocaleLowerCase('tr')
        .replace(/[ıİ]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s: unknown): s is string {
    if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
    const d = new Date(s + 'T12:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Yerel tarih (UTC değil): gece yarısından sonra yanlış gün sorununu önler. */
export function todayLocal(now = new Date()): string {
    const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
