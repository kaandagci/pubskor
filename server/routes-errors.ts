// İstemci hata raporu: tarayıcıda yakalanmayan hatalar buraya gönderilir ve Netlify fonksiyon günlüğüne yazılır
// (Netlify → Logs → Functions → api). Kimlik, e-posta, ekip ya da konum bilgisi alınmaz; alanlar kısaltılır.
import type { Ctx } from './crew';
import { json } from './http';

const MAX_PER_MINUTE = 30;
let windowStart = 0;
let count = 0;

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').slice(0, n) : '');
/** Adresten yalnızca yol kalır (sorgu ve parça, olası kişisel veri içerebilir). */
const pathOnly = (v: unknown) => {
    const s = clip(v, 300);
    try { return new URL(s, 'https://x').pathname.slice(0, 120); } catch { return ''; }
};

export async function clientError(ctx: Ctx, req: Request) {
    const now = ctx.now();
    if (now - windowStart > 60_000) { windowStart = now; count = 0; }
    if (++count > MAX_PER_MINUTE) return new Response(null, { status: 204 });
    let b: Record<string, unknown> = {};
    try { b = JSON.parse((await req.text()).slice(0, 8000)); } catch { return new Response(null, { status: 204 }); }
    const entry = {
        kind: clip(b.kind, 20),
        message: clip(b.message, 300),
        source: pathOnly(b.source),
        line: Number.isFinite(b.line) ? b.line : null,
        column: Number.isFinite(b.column) ? b.column : null,
        stack: clip(b.stack, 1200),
        page: pathOnly(b.page),
        version: clip(b.version, 20),
        agent: clip(req.headers.get('user-agent'), 160)
    };
    if (!entry.message) return new Response(null, { status: 204 });
    console.error('[istemci hatası]', JSON.stringify(entry));
    return json({ ok: true }, 202);
}
