// Paylaşım görseli (1080×1350, Instagram/WhatsApp için 4:5). Tarayıcıda kanvasla çizilir; dışarıya istek yok.
// Bilinçli olarak marka/logo, sipariş adı ya da içki kriteri içermez (alkol tanıtım kuralları): yalnızca mekan deneyimi.
import { METRIC_BY_ID, isPublicMetric, tierOf } from '../../../shared/metrics';
import { analysisOf } from '../../../shared/insights';
import type { Venue, Visit } from '../../../shared/types';
import { PERSON_HEX_DARK, TIER_HEX_DARK } from '../../lib/colors';
import { fmtDate, fmtScore, initials } from '../../lib/format';

const W = 1080, H = 1350;
const UI = '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, "Segoe UI", Roboto, sans-serif';
const ROUNDED = 'ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const TINT = '#ff9f0a';
const LABEL = '#ffffff';
const LABEL_2 = 'rgba(235,235,245,0.6)';

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, min: number, font: (s: number) => string): number {
    let s = size;
    ctx.font = font(s);
    while (s > min && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = font(s); }
    return s;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

/** Skor halkası: 10 üzerinden dolan yay (uygulamadaki ScoreRing ile aynı). */
function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, width: number, score: number | null, track = 'rgba(255,255,255,0.12)') {
    ctx.save();
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.strokeStyle = track;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (score != null && score > 0) {
        ctx.strokeStyle = TINT;
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.min(10, score) / 10) * Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

/** Uygulama işareti: turuncu karede halka. */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    const g = ctx.createLinearGradient(x, y, x + size * 0.6, y + size);
    g.addColorStop(0, '#ffb340');
    g.addColorStop(0.55, '#ff8a00');
    g.addColorStop(1, '#f06a00');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, size, size, size * 0.225);
    ctx.fill();
    const c = size / 2, r = size * 0.297, w = size * 0.125;
    drawRing(ctx, x + c, y + c, r, w, null, 'rgba(255,255,255,0.38)');
    ctx.save();
    ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + c, y + c, r, -Math.PI / 2, -Math.PI / 2 + 0.84 * Math.PI * 2); ctx.stroke();
    ctx.restore();
}

export async function renderCard(v: Visit, venue: Venue | undefined, crewName: string): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const a = analysisOf(v);
    const t = tierOf(v.score);
    const tierHex = TIER_HEX_DARK[t.id];

    // Zemin: gerçek siyah, üstte vurgu renginde yumuşak ışık
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(300, 560, 40, 300, 560, 820);
    glow.addColorStop(0, 'rgba(255,159,10,0.26)');
    glow.addColorStop(1, 'rgba(255,159,10,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Üst: uygulama işareti ve tarih
    drawMark(ctx, 72, 70, 56);
    ctx.fillStyle = LABEL;
    ctx.font = `700 34px ${UI}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Pub Skor', 144, 98);
    ctx.textAlign = 'right';
    ctx.fillStyle = LABEL_2;
    ctx.font = `500 28px ${UI}`;
    ctx.fillText(fmtDate(v.date, { year: true }), W - 72, 98);
    ctx.textAlign = 'left';

    // Mekan adı
    const name = venue?.name ?? 'Mekan';
    const ns = fitText(ctx, name, W - 144, 88, 48, s => `700 ${s}px ${UI}`);
    ctx.fillStyle = LABEL;
    ctx.font = `700 ${ns}px ${UI}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(name, 72, 250);
    if (venue?.area) {
        ctx.fillStyle = LABEL_2;
        ctx.font = `500 32px ${UI}`;
        ctx.fillText(venue.area, 72, 302);
    }

    // Halka + skor
    drawRing(ctx, 270, 540, 170, 34, v.score);
    ctx.fillStyle = LABEL;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 124px ${ROUNDED}`;
    ctx.fillText(fmtScore(v.score), 270, 528);
    ctx.fillStyle = LABEL_2;
    ctx.font = `600 34px ${ROUNDED}`;
    ctx.fillText('/ 10', 270, 610);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Kademe rozeti
    ctx.font = `600 36px ${UI}`;
    const tw = ctx.measureText(t.label).width;
    ctx.fillStyle = tierHex + '2e';
    roundRect(ctx, 520, 470, tw + 82, 62, 31);
    ctx.fill();
    ctx.fillStyle = tierHex;
    ctx.beginPath(); ctx.arc(554, 501, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = LABEL;
    ctx.textBaseline = 'middle';
    ctx.fillText(t.label, 574, 502);
    ctx.fillStyle = LABEL_2;
    ctx.font = `500 32px ${UI}`;
    ctx.fillText(`${v.participants.length} kişinin ortak kararı`, 520, 590);

    // Kişiler
    const people = [...v.participants].sort((x, y) => (a.perParticipant[y.id] ?? 0) - (a.perParticipant[x.id] ?? 0)).slice(0, 6);
    const slot = (W - 144) / Math.max(people.length, 1);
    people.forEach((p, i) => {
        const cx = 72 + slot * i + slot / 2, cy = 880;
        ctx.fillStyle = PERSON_HEX_DARK[p.color % 8];
        ctx.beginPath(); ctx.arc(cx, cy, 42, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `600 32px ${ROUNDED}`;
        ctx.textAlign = 'center';
        ctx.fillText(initials(p.name), cx, cy + 1);
        ctx.fillStyle = LABEL;
        ctx.font = `700 36px ${ROUNDED}`;
        ctx.fillText(fmtScore(a.perParticipant[p.id]), cx, cy + 80);
        ctx.fillStyle = LABEL_2;
        ctx.font = `500 26px ${UI}`;
        const nm = p.name.length > 10 ? p.name.slice(0, 9) + '…' : p.name;
        ctx.fillText(nm, cx, cy + 118);
    });
    ctx.textAlign = 'left';

    // En iyi kriterler (yalnızca mekan deneyimi; içki kriterleri herkese açık görselde yer almaz)
    const ranked = v.metrics.filter(id => isPublicMetric(id) && a.metricAvg[id] != null).sort((x, y) => a.metricAvg[y]! - a.metricAvg[x]!).slice(0, 3);
    ranked.forEach((id, i) => {
        const y = 1078 + i * 62;
        ctx.fillStyle = LABEL_2;
        ctx.font = `500 30px ${UI}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(METRIC_BY_ID[id].short, 72, y);
        const x0 = 330, w = W - 72 - 90 - x0;
        ctx.fillStyle = 'rgba(255,159,10,0.18)';
        roundRect(ctx, x0, y - 9, w, 18, 9); ctx.fill();
        ctx.fillStyle = TINT;
        roundRect(ctx, x0, y - 9, Math.max(18, (w * a.metricAvg[id]!) / 10), 18, 9); ctx.fill();
        ctx.fillStyle = LABEL;
        ctx.font = `700 30px ${ROUNDED}`;
        ctx.textAlign = 'right';
        ctx.fillText(fmtScore(a.metricAvg[id]), W - 72, y);
        ctx.textAlign = 'left';
    });

    // Alt bilgi
    ctx.fillStyle = 'rgba(84,84,88,0.6)';
    ctx.fillRect(72, H - 110, W - 144, 1);
    ctx.fillStyle = LABEL_2;
    ctx.font = `500 26px ${UI}`;
    ctx.fillText(crewName, 72, H - 64);
    ctx.textAlign = 'right';
    ctx.fillText('Mekan puanlaması · 18+', W - 72, H - 64);

    return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Görsel oluşturulamadı'))), 'image/jpeg', 0.9));
}
