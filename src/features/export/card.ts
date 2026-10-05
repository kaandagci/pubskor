// Paylaşım görseli (1080×1350, Instagram/WhatsApp için 4:5). Tarayıcıda kanvasla çizilir; dışarıya istek yok.
// Bilinçli olarak marka/logo ya da sipariş adı içermez (alkol tanıtım kuralları).
import { METRIC_BY_ID, tierOf } from '../../../shared/metrics';
import { analysisOf } from '../../../shared/insights';
import type { Venue, Visit } from '../../../shared/types';
import { PERSON_HEX_DARK, TIER_HEX_DARK } from '../../lib/colors';
import { fmtDate, fmtScore, initials } from '../../lib/format';
import { GLASS_PATH, INNER_PATH, PINT_H, PINT_W, SHINE_PATH, foamBubbles, liquidY } from '../../lib/pint';

const W = 1080, H = 1350;
const UI = '"Geist Variable", system-ui, sans-serif';
const DISPLAY = '"Fraunces Variable", Georgia, serif';

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

function drawPint(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, score: number | null) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const glass = new Path2D(GLASS_PATH);
    ctx.fillStyle = 'rgba(255,245,230,0.05)';
    ctx.fill(glass);
    ctx.save();
    ctx.clip(new Path2D(INNER_PATH));
    const ly = liquidY(score);
    const g = ctx.createLinearGradient(0, ly, 0, PINT_H);
    g.addColorStop(0, '#ffcf6e');
    g.addColorStop(1, '#d9821a');
    ctx.fillStyle = g;
    ctx.fillRect(0, ly, PINT_W, PINT_H);
    ctx.fillStyle = '#fff6e6';
    ctx.fillRect(0, ly - 5.6, PINT_W, 4.6);
    for (const b of foamBubbles(ly)) { ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,245,220,0.5)';
    [[15, 0.9, 10], [22, 0.7, 18], [27, 1, 7], [18.5, 0.6, 26]].forEach(([cx, r, dy]) => {
        if (ly + dy + 4 < PINT_H - 3) { ctx.beginPath(); ctx.arc(cx, ly + dy + 4, r, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.restore();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(247,239,228,0.32)';
    ctx.stroke(glass);
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke(new Path2D(SHINE_PATH));
    ctx.restore();
}

export async function renderCard(v: Visit, venue: Venue | undefined, crewName: string): Promise<Blob> {
    try {
        await Promise.all([
            document.fonts.load(`700 120px ${UI}`), document.fonts.load(`600 80px ${DISPLAY}`), document.fonts.load(`500 30px ${UI}`)
        ]);
    } catch { /* sistem yazı tipiyle devam */ }
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const a = analysisOf(v);
    const t = tierOf(v.score);
    const tierHex = TIER_HEX_DARK[t.id];

    // Zemin
    ctx.fillStyle = '#0f0c0a';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, 420, 40, W / 2, 420, 760);
    glow.addColorStop(0, 'rgba(242,169,59,0.30)');
    glow.addColorStop(1, 'rgba(242,169,59,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    // Köpük dokusu
    ctx.fillStyle = 'rgba(255,240,215,0.05)';
    for (let y = 30; y < 520; y += 30) for (let x = 30 + ((y / 30) % 2) * 15; x < W; x += 30) { ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }

    // Üst: marka
    ctx.fillStyle = '#f2a93b';
    roundRect(ctx, 72, 70, 52, 52, 16);
    ctx.fill();
    drawPint(ctx, 84, 78, 0.68, 8);
    ctx.fillStyle = '#f7efe4';
    ctx.font = `600 34px ${DISPLAY}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Pub Skor', 140, 98);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c4b5a3';
    ctx.font = `500 28px ${UI}`;
    ctx.fillText(fmtDate(v.date, { year: true }), W - 72, 98);
    ctx.textAlign = 'left';

    // Mekan adı
    const name = venue?.name ?? 'Mekan';
    const ns = fitText(ctx, name, W - 144, 92, 48, s => `620 ${s}px ${DISPLAY}`);
    ctx.fillStyle = '#f7efe4';
    ctx.font = `620 ${ns}px ${DISPLAY}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(name, 72, 250);
    if (venue?.area) {
        ctx.fillStyle = '#c4b5a3';
        ctx.font = `500 32px ${UI}`;
        ctx.fillText(venue.area, 72, 302);
    }

    // Bardak + skor
    drawPint(ctx, 96, 360, 5.6, v.score);
    ctx.fillStyle = '#f7efe4';
    ctx.font = `760 230px ${UI}`;
    ctx.fillText(fmtScore(v.score), 400, 600);
    ctx.fillStyle = '#8e7f6e';
    ctx.font = `600 40px ${UI}`;
    ctx.fillText('/ 10', 410, 660);
    // Kademe rozeti
    ctx.font = `650 36px ${UI}`;
    const tw = ctx.measureText(t.label).width;
    ctx.fillStyle = tierHex + '2e';
    roundRect(ctx, 404, 690, tw + 82, 62, 31);
    ctx.fill();
    ctx.fillStyle = tierHex;
    ctx.beginPath(); ctx.arc(438, 721, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7efe4';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.label, 458, 722);

    // Kişiler
    const people = [...v.participants].sort((x, y) => (a.perParticipant[y.id] ?? 0) - (a.perParticipant[x.id] ?? 0)).slice(0, 6);
    const slot = (W - 144) / Math.max(people.length, 1);
    people.forEach((p, i) => {
        const cx = 72 + slot * i + slot / 2, cy = 880;
        ctx.fillStyle = PERSON_HEX_DARK[p.color % 8];
        ctx.beginPath(); ctx.arc(cx, cy, 42, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `700 32px ${UI}`;
        ctx.textAlign = 'center';
        ctx.fillText(initials(p.name), cx, cy + 1);
        ctx.fillStyle = '#f7efe4';
        ctx.font = `700 36px ${UI}`;
        ctx.fillText(fmtScore(a.perParticipant[p.id]), cx, cy + 80);
        ctx.fillStyle = '#8e7f6e';
        ctx.font = `500 26px ${UI}`;
        const nm = p.name.length > 10 ? p.name.slice(0, 9) + '…' : p.name;
        ctx.fillText(nm, cx, cy + 118);
    });
    ctx.textAlign = 'left';

    // En iyi kriterler
    const ranked = v.metrics.filter(id => a.metricAvg[id] != null).sort((x, y) => a.metricAvg[y]! - a.metricAvg[x]!).slice(0, 3);
    ranked.forEach((id, i) => {
        const y = 1078 + i * 62;
        ctx.fillStyle = '#c4b5a3';
        ctx.font = `500 30px ${UI}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(METRIC_BY_ID[id].short, 72, y);
        const x0 = 330, w = W - 72 - 90 - x0;
        ctx.fillStyle = 'rgba(242,169,59,0.14)';
        roundRect(ctx, x0, y - 10, w, 20, 6); ctx.fill();
        ctx.fillStyle = '#f2a93b';
        roundRect(ctx, x0, y - 10, Math.max(8, (w * a.metricAvg[id]!) / 10), 20, 6); ctx.fill();
        ctx.fillStyle = '#f7efe4';
        ctx.font = `700 30px ${UI}`;
        ctx.textAlign = 'right';
        ctx.fillText(fmtScore(a.metricAvg[id]), W - 72, y);
        ctx.textAlign = 'left';
    });

    // Alt bilgi
    ctx.fillStyle = 'rgba(255,228,196,0.12)';
    ctx.fillRect(72, H - 110, W - 144, 2);
    ctx.fillStyle = '#8e7f6e';
    ctx.font = `500 26px ${UI}`;
    ctx.fillText(crewName, 72, H - 64);
    ctx.textAlign = 'right';
    ctx.fillText('Lütfen sorumlu tüketin · 18+', W - 72, H - 64);

    return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Görsel oluşturulamadı'))), 'image/jpeg', 0.9));
}
