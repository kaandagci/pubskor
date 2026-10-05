// Renk yardımcıları: puan ısı skalası, kişi renkleri, kademe renkleri.

/** 1→10 puan için kırmızı→kehribar→yeşil ısı rengi (anlamsal ısı; değer her zaman rakamla da yazılır). */
export function heat(v: number): { bg: string; ink: string } {
    const t = Math.min(1, Math.max(0, (v - 1) / 9));
    // tonu kehribarda biraz bekletip yeşile geçir: 4°(kırmızı) → 38°(kehribar) → 148°(yeşil)
    const hue = t < 0.55 ? 4 + (t / 0.55) * 34 : 38 + ((t - 0.55) / 0.45) * 110;
    const sat = 78 - Math.abs(t - 0.5) * 16;
    const light = t < 0.55 ? 60 + t * 6 : 56 - (t - 0.55) * 10;
    const bg = `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% ${light.toFixed(0)}%)`;
    return { bg, ink: '#160d04' };
}

export const PERSON_COLORS = 8;
export const personClass = (color: number) => `pc-${((color % PERSON_COLORS) + PERSON_COLORS) % PERSON_COLORS}`;

/** Kanvas/PDF için kişi renkleri (açık zemin sürümü). */
export const PERSON_HEX_LIGHT = ['#eda100', '#e87ba4', '#008300', '#2a78d6', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948'];
export const PERSON_HEX_DARK = ['#c98500', '#d55181', '#008300', '#3987e5', '#199e70', '#d95926', '#9085e9', '#e66767'];

export const TIER_HEX_LIGHT: Record<string, string> = { legend: '#059669', great: '#65a30d', ok: '#d97706', weak: '#ea580c', skip: '#dc2626', none: '#a39584' };
export const TIER_HEX_DARK: Record<string, string> = { legend: '#34d399', great: '#a3e635', ok: '#fbbf24', weak: '#fb923c', skip: '#f87171', none: '#6f6357' };
