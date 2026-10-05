// Sunucu istemcisi: kimlik başlığı, zaman aşımı, anlaşılır hata mesajları.

export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public code: string | null = null,
        public data: Record<string, unknown> | null = null
    ) {
        super(message);
    }
    /** Ağ yoksa ya da sunucuya ulaşılamadıysa. */
    get offline() { return this.status === 0; }
}

export interface RequestOpts {
    token?: string | null;
    body?: unknown;
    raw?: Blob | ArrayBuffer;
    headers?: Record<string, string>;
    timeout?: number;
    signal?: AbortSignal;
}

export async function request<T = any>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.token) headers.authorization = 'Bearer ' + opts.token;
    let body: BodyInit | undefined;
    if (opts.raw !== undefined) body = opts.raw;
    else if (opts.body !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(opts.body); }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? 20000);
    opts.signal?.addEventListener('abort', () => ctrl.abort());
    let res: Response;
    try {
        res = await fetch(path, { method, headers, body, signal: ctrl.signal, cache: 'no-store' });
    } catch {
        throw new ApiError(navigator.onLine === false ? 'İnternet bağlantısı yok' : 'Sunucuya ulaşılamadı', 0);
    } finally {
        clearTimeout(timer);
    }
    if (res.status === 304) return null as T;
    let data: any = null;
    const text = await res.text().catch(() => '');
    if (text) { try { data = JSON.parse(text); } catch { data = null; } }
    if (!res.ok) {
        const msg = (data && typeof data.error === 'string' && data.error) || statusMessage(res.status);
        throw new ApiError(msg, res.status, data?.code ?? null, data);
    }
    return data as T;
}

function statusMessage(status: number): string {
    if (status === 429) return 'Çok fazla istek; biraz bekleyip tekrar dene';
    if (status === 413) return 'Dosya çok büyük';
    if (status >= 500) return 'Sunucuda bir sorun oluştu, birazdan tekrar dene';
    if (status === 404) return 'Bulunamadı';
    return `Bir hata oluştu (${status})`;
}
