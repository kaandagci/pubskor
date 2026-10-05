// A4 PDF rapor. Ekran görüntüsü değil, doğrudan metin ve çizgi komutlarıyla üretilir: metin seçilebilir, dosya küçük kalır.
// jsPDF ve gömülü yazı tipi yalnızca bu dosya ilk kullanıldığında yüklenir.
import { jsPDF } from 'jspdf';
import { GROUP_LABEL, METRIC_BY_ID, orderMetrics, tierOf, weightShare } from '../../../shared/metrics';
import { analysisOf } from '../../../shared/insights';
import type { Photo, Venue, Visit } from '../../../shared/types';
import { PERSON_HEX_LIGHT, TIER_HEX_LIGHT } from '../../lib/colors';
import { fmtDate, fmtScore } from '../../lib/format';
import { photoUrl } from '../../state/outbox';
import { BOLD, REGULAR } from './pdf-fonts';

// Gömülü yazı tipinde olmayan karakterleri (emoji vb.) at
const safe = (t: unknown) => String(t ?? '')
    .replace(/\r\n?/g, '\n').replace(/\t/g, ' ')
    .replace(/[^ -~ -ſ–—‘’“”•…₺\n]/g, '');

function rgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Gömülü yazı tipinde ₺ simgesi yok
const fmtMoney = (n: number) => Math.round(n).toLocaleString('tr-TR') + ' TL';

async function loadPhoto(p: Photo): Promise<{ data: string; w: number; h: number } | null> {
    try {
        const blob = await (await fetch(photoUrl(p.id))).blob();
        const bmp = await createImageBitmap(blob);
        const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
        c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close();
        return { data: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height };
    } catch { return null; }
}

export async function buildPdf(v: Visit, venue: Venue | undefined, crewName: string): Promise<Blob> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    doc.addFileToVFS('LS-Regular.ttf', REGULAR); doc.addFont('LS-Regular.ttf', 'LS', 'normal');
    doc.addFileToVFS('LS-Bold.ttf', BOLD); doc.addFont('LS-Bold.ttf', 'LS', 'bold');

    const a = analysisOf(v), t = tierOf(v.score), n = v.participants.length;
    const PW = 210, PH = 297, M = 14, CW = PW - 2 * M, BOTTOM = PH - M - 6;
    let y = M;
    const font = (style: 'normal' | 'bold', size: number, color = '#1f1610') => { doc.setFont('LS', style); doc.setFontSize(size); doc.setTextColor(...rgb(color)); };
    const newPage = () => { doc.addPage(); y = M; };
    const ensure = (h: number) => { if (y + h > BOTTOM) newPage(); };
    const fit = (str: string, maxW: number, size: number, min: number) => {
        doc.setFontSize(size);
        while (size > min && doc.getTextWidth(str) > maxW) { size -= 0.5; doc.setFontSize(size); }
        return size;
    };

    // ---- Başlık + skor kutusu ----
    const boxW = 38, boxH = 25, titleW = CW - boxW - 6;
    font('bold', 21, '#7a4a06');
    const titleLines = doc.splitTextToSize(safe(venue?.name) || 'Mekan', titleW).slice(0, 3) as string[];
    let ty = y + 7;
    titleLines.forEach(l => { doc.text(l, M, ty); ty += 8.4; });
    font('normal', 9.5, '#5f5144');
    const meta = [venue?.area, fmtDate(v.date, { year: true }), `${n} kişi`, v.spend ? `kişi başı ${fmtMoney(v.spend)}` : null].filter(Boolean).join('  •  ');
    (doc.splitTextToSize(safe(meta), titleW) as string[]).slice(0, 2).forEach(l => { doc.text(l, M, ty - 2); ty += 4.6; });
    const kinds = v.kinds.map(k => GROUP_LABEL[k]).join(', ');
    if (kinds) { font('normal', 8.5, '#85766a'); doc.text(safe('Masada: ' + kinds), M, ty - 1); ty += 4.4; }

    const bx = M + CW - boxW;
    doc.setLineWidth(0.7); doc.setDrawColor(...rgb(TIER_HEX_LIGHT[t.id])); doc.roundedRect(bx, M, boxW, boxH, 3, 3, 'S');
    font('bold', 26, '#1f1610'); doc.text(fmtScore(v.score), bx + boxW / 2, M + 13, { align: 'center' });
    font('normal', 8, '#5f5144'); doc.text(safe('/ 10  •  ' + t.label), bx + boxW / 2, M + 20, { align: 'center' });
    y = Math.max(M + boxH, ty) + 5;

    // ---- Kişi özetleri ----
    let cx = M; const chipH = 6.8;
    for (const p of v.participants) {
        const nm = safe(p.name), av = fmtScore(a.perParticipant[p.id]);
        doc.setFont('LS', 'normal'); doc.setFontSize(9); const nw = doc.getTextWidth(nm);
        doc.setFont('LS', 'bold'); const aw = doc.getTextWidth(av);
        const w = nw + aw + 13;
        if (cx + w > M + CW) { cx = M; y += chipH + 2; }
        doc.setLineWidth(0.3); doc.setDrawColor(210, 200, 188);
        doc.roundedRect(cx, y, w, chipH, chipH / 2, chipH / 2, 'S');
        doc.setFillColor(...rgb(PERSON_HEX_LIGHT[p.color % 8])); doc.circle(cx + 3.6, y + chipH / 2, 1.4, 'F');
        font('normal', 9, '#1f1610'); doc.text(nm, cx + 6.4, y + chipH / 2, { baseline: 'middle' });
        font('bold', 9, '#1f1610'); doc.text(av, cx + 6.4 + nw + 2.6, y + chipH / 2, { baseline: 'middle' });
        cx += w + 2;
    }
    y += chipH + 6;

    // ---- Kriter tablosu ----
    const weightW = 11, avgW = 13;
    const P = Math.min(18, Math.floor(((CW - weightW - avgW - 55) / n) * 10) / 10);
    const critW = CW - weightW - avgW - n * P;
    const colX = [M, M + critW, M + critW + weightW];
    v.participants.forEach((_, i) => colX.push(M + critW + weightW + (i + 1) * P));
    const cell = (x: number, yy: number, w: number, h: number, fill: string | null) => {
        doc.setLineWidth(0.2); doc.setDrawColor(223, 216, 206);
        if (fill) { doc.setFillColor(...rgb(fill)); doc.rect(x, yy, w, h, 'FD'); } else doc.rect(x, yy, w, h, 'S');
    };
    const head = () => {
        const h = 8;
        cell(colX[0], y, critW, h, '#f3ece2'); font('bold', 9); doc.text('Kriter', colX[0] + 2, y + h / 2, { baseline: 'middle' });
        cell(colX[1], y, weightW, h, '#f3ece2'); font('bold', 8); doc.text('Ağ.', colX[1] + weightW / 2, y + h / 2, { align: 'center', baseline: 'middle' });
        v.participants.forEach((p, i) => {
            const x = colX[2 + i], nm = safe(p.name);
            cell(x, y, P, h, '#f3ece2');
            const sz = fit(nm, P - 1.8, 8.5, 5);
            font('bold', sz, '#1f1610');
            doc.text(nm, x + P / 2, y + h / 2, { align: 'center', baseline: 'middle' });
        });
        const ax = colX[2 + n];
        cell(ax, y, avgW, h, '#f3ece2'); font('bold', 8); doc.text('Ort.', ax + avgW / 2, y + h / 2, { align: 'center', baseline: 'middle' });
        y += h;
    };
    const rowH = 7;
    const row = (label: string, wTxt: string, vals: string[], avg: string, opt: { fill?: string | null; bold?: boolean; section?: boolean } = {}) => {
        if (y + rowH > BOTTOM) { newPage(); head(); }
        if (opt.section) {
            cell(colX[0], y, CW, 5.6, '#faf6f0');
            font('bold', 7.5, '#85766a'); doc.text(label.toLocaleUpperCase('tr'), colX[0] + 2, y + 2.9, { baseline: 'middle' });
            y += 5.6;
            return;
        }
        const fill = opt.fill ?? null;
        cell(colX[0], y, critW, rowH, fill);
        const lsz = fit(label, critW - 4, 9, 6);
        font(opt.bold ? 'bold' : 'normal', lsz); doc.text(label, colX[0] + 2, y + rowH / 2, { baseline: 'middle' });
        cell(colX[1], y, weightW, rowH, fill); font('normal', 8, '#85766a');
        if (wTxt) doc.text(wTxt, colX[1] + weightW / 2, y + rowH / 2, { align: 'center', baseline: 'middle' });
        vals.forEach((val, i) => { cell(colX[2 + i], y, P, rowH, fill); font(val === 'yok' ? 'normal' : 'bold', val === 'yok' ? 7.5 : 9, val === 'yok' ? '#85766a' : '#1f1610'); doc.text(val, colX[2 + i] + P / 2, y + rowH / 2, { align: 'center', baseline: 'middle' }); });
        const ax = colX[2 + n];
        cell(ax, y, avgW, rowH, fill); font('bold', 9);
        doc.text(avg, ax + avgW / 2, y + rowH / 2, { align: 'center', baseline: 'middle' });
        y += rowH;
    };

    head();
    let lastGroup = '';
    for (const id of orderMetrics(v.metrics)) {
        const m = METRIC_BY_ID[id];
        if (m.group !== lastGroup) { row(GROUP_LABEL[m.group], '', [], '', { section: true }); lastGroup = m.group; }
        const vals = v.participants.map(p => { const s = v.sheets[p.id]?.[id]; return s === 0 ? 'yok' : s == null ? '-' : String(s); });
        row(safe(m.label), '%' + weightShare(id, v.metrics), vals, fmtScore(a.metricAvg[id]), { fill: a.conflicts.includes(id) ? '#fdecec' : null });
    }
    row('Genel (ağırlıklı)', '', v.participants.map(p => fmtScore(a.perParticipant[p.id])), fmtScore(v.score), { fill: '#faf6f0', bold: true });
    y += 3;
    if (a.conflicts.length) {
        font('normal', 7.5, '#85766a');
        doc.text(safe('Kırmızı satırlar: masada 3 ve üzeri puan farkı olan kriterler. "yok": kişi bu kriteri değerlendirmedi.'), M, y + 2);
        y += 5;
    }
    y += 4;

    // ---- Sipariş defteri ----
    if (v.items.length) {
        ensure(16);
        font('bold', 11); doc.text('Sipariş defteri', M, y + 4); y += 8;
        for (const it of v.items) {
            ensure(6);
            font('normal', 9.5, '#1f1610');
            doc.text(safe(`• ${it.name}`), M + 1, y + 3);
            const right = [it.verdict === 'top' ? 'Harika' : it.verdict === 'ok' ? 'İyi' : it.verdict === 'bad' ? 'Kötü' : '', it.price != null ? fmtMoney(it.price) : ''].filter(Boolean).join('  ');
            font('normal', 9, '#5f5144');
            if (right) doc.text(safe(right), M + CW, y + 3, { align: 'right' });
            y += 5.4;
        }
        y += 4;
    }

    // ---- Notlar ----
    const notes = safe(v.notes).trim();
    if (notes) {
        ensure(22);
        font('bold', 11); doc.text('Notlar', M, y + 4); y += 7;
        font('normal', 9.5, '#333333');
        const lines = doc.splitTextToSize(notes, CW - 8) as string[];
        const LH = 4.7;
        let i = 0;
        while (i < lines.length) {
            if (y + 6 + LH > BOTTOM) newPage();
            const take = Math.min(Math.max(1, Math.floor((BOTTOM - y - 6) / LH)), lines.length - i);
            doc.setLineWidth(0.2); doc.setDrawColor(236, 230, 220); doc.setFillColor(250, 246, 240);
            doc.rect(M, y, CW, take * LH + 6, 'FD');
            font('normal', 9.5, '#333333');
            lines.slice(i, i + take).forEach((l, k) => doc.text(l, M + 4, y + 5 + k * LH));
            y += take * LH + 6; i += take;
            if (i < lines.length) newPage();
        }
        y += 5;
    }

    // ---- Fotoğraflar ----
    for (const ph of v.photos.slice(0, 3)) {
        const img = await loadPhoto(ph);
        if (!img) continue;
        const maxH = 95, ratio = img.w / img.h;
        const dw = Math.min(CW, maxH * ratio), dh = dw / ratio;
        ensure(dh + 4);
        try { doc.addImage(img.data, 'JPEG', M + (CW - dw) / 2, y, dw, dh); y += dh + 4; } catch { /* fotoğrafsız devam */ }
    }

    // ---- Alt bilgi ----
    const total = doc.getNumberOfPages(), stamp = new Date().toLocaleString('tr-TR');
    for (let pg = 1; pg <= total; pg++) {
        doc.setPage(pg); font('normal', 8, '#a39584');
        doc.text(safe(`Pub Skor  •  ${crewName}  •  ${stamp}`), M, PH - 8);
        doc.text(`Sayfa ${pg} / ${total}`, PW - M, PH - 8, { align: 'right' });
    }
    return doc.output('blob');
}
