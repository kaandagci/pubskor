// Bira bardağı göstergesinin geometrisi. SVG bileşeni, paylaşım görseli ve önizleme aynı ölçüleri kullanır.

export const PINT_W = 40;
export const PINT_H = 56;

/** Hafif konik "nonic" bardak dış hattı. */
export const GLASS_PATH = 'M3 2.5 H37 Q37.6 2.5 37.5 3.2 L33.6 51 Q33.3 54 30.4 54 H9.6 Q6.7 54 6.4 51 L2.5 3.2 Q2.4 2.5 3 2.5 Z';
/** Sıvının kırpıldığı iç hat. */
export const INNER_PATH = 'M4.6 4.2 H35.4 L31.9 50.6 Q31.7 52.4 29.9 52.4 H10.1 Q8.3 52.4 8.1 50.6 Z';
export const SHINE_PATH = 'M8.2 9 L10.6 46';

const TOP = 9;      // dolu bardakta köpüğün altı
const BOTTOM = 52.4;

/** Skora göre sıvı yüzeyinin y koordinatı (10 = dolu, boş için BOTTOM). */
export function liquidY(score: number | null | undefined): number {
    if (score == null || Number.isNaN(score)) return BOTTOM;
    const f = Math.min(1, Math.max(0, score / 10));
    return BOTTOM - f * (BOTTOM - TOP);
}

/** Köpük kabarcıkları (yüzeyin hemen üstünde). */
export function foamBubbles(y: number): { cx: number; cy: number; r: number }[] {
    const xs = [6, 10.5, 15, 19.5, 24, 28.5, 33];
    return xs.map((cx, i) => ({ cx, cy: y - 1.6 - (i % 2 ? 0.9 : 0), r: i % 2 ? 2.9 : 3.3 }));
}

export const BUBBLES = [{ cx: 15, r: 0.9, d: 0 }, { cx: 22, r: 0.7, d: 0.9 }, { cx: 27, r: 1, d: 1.7 }, { cx: 18.5, r: 0.6, d: 2.2 }];
