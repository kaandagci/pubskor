// HTTP yardımcıları: JSON yanıtlar, hata tipi, gövde okuma.

export class HttpError extends Error {
    constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
        super(message);
    }
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
    });

export const fail = (status: number, message: string, extra?: Record<string, unknown>) => json({ error: message, ...extra }, status);

const MAX_JSON = 400_000;

export async function readJSON<T = Record<string, unknown>>(req: Request): Promise<T> {
    const len = Number(req.headers.get('content-length') || 0);
    if (len > MAX_JSON) throw new HttpError(413, 'Veri çok büyük');
    const text = await req.text();
    if (text.length > MAX_JSON) throw new HttpError(413, 'Veri çok büyük');
    if (!text) return {} as T;
    try {
        const v = JSON.parse(text);
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
        return v as T;
    } catch {
        throw new HttpError(400, 'Geçersiz JSON');
    }
}

export async function readBinary(req: Request, max: number): Promise<ArrayBuffer> {
    const len = Number(req.headers.get('content-length') || 0);
    if (len > max) throw new HttpError(413, 'Dosya çok büyük');
    const buf = await req.arrayBuffer();
    if (buf.byteLength > max) throw new HttpError(413, 'Dosya çok büyük');
    if (!buf.byteLength) throw new HttpError(400, 'Boş dosya');
    return buf;
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
