// Depolama soyutlaması. Üretimde Netlify Blobs, yerelde dosya, testlerde bellek kullanılır.
// Koşullu yazma (ETag) desteği sayesinde aynı belgeye eşzamanlı yazımlar birbirini ezmez.

export interface JsonEntry<T = unknown> {
    data: T;
    etag: string;
}

export interface WriteOpts {
    /** Yalnızca anahtar yoksa yaz. */
    onlyIfNew?: boolean;
    /** Yalnızca mevcut ETag bununla eşleşiyorsa yaz. */
    onlyIfMatch?: string;
}

export interface BinaryEntry {
    data: ArrayBuffer;
    meta: Record<string, unknown>;
}

export interface KV {
    getJSON<T = unknown>(key: string): Promise<JsonEntry<T> | null>;
    setJSON(key: string, data: unknown, opts?: WriteOpts): Promise<{ modified: boolean; etag?: string }>;
    getBinary(key: string): Promise<BinaryEntry | null>;
    setBinary(key: string, data: ArrayBuffer, meta: Record<string, unknown>, opts?: WriteOpts): Promise<{ modified: boolean }>;
    delete(key: string): Promise<void>;
    list(prefix: string): Promise<string[]>;
}

/** v7'nin ayrı depoları (salt okunur içe aktarma için). */
export interface LegacyStores {
    visits: { list(): Promise<string[]>; getJSON(key: string): Promise<unknown | null> };
    photos: { getBinary(key: string): Promise<ArrayBuffer | null> };
}

// ----- Bellek içi uygulama (testler ve yerel geliştirme) -----

export function memoryKV(): KV & { dump(): Map<string, { json?: string; bin?: ArrayBuffer; meta?: Record<string, unknown>; etag: string }> } {
    const map = new Map<string, { json?: string; bin?: ArrayBuffer; meta?: Record<string, unknown>; etag: string }>();
    let counter = 0;
    const nextTag = () => `"e${++counter}"`;
    const allowed = (key: string, opts?: WriteOpts) => {
        const cur = map.get(key);
        if (opts?.onlyIfNew && cur) return false;
        if (opts?.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return false;
        return true;
    };
    return {
        dump: () => map,
        async getJSON<T>(key: string) {
            const e = map.get(key);
            return e && e.json != null ? { data: JSON.parse(e.json) as T, etag: e.etag } : null;
        },
        async setJSON(key, data, opts) {
            if (!allowed(key, opts)) return { modified: false };
            const etag = nextTag();
            map.set(key, { json: JSON.stringify(data), etag });
            return { modified: true, etag };
        },
        async getBinary(key) {
            const e = map.get(key);
            return e && e.bin ? { data: e.bin, meta: e.meta ?? {} } : null;
        },
        async setBinary(key, data, meta, opts) {
            if (!allowed(key, opts)) return { modified: false };
            map.set(key, { bin: data, meta, etag: nextTag() });
            return { modified: true };
        },
        async delete(key) { map.delete(key); },
        async list(prefix) { return [...map.keys()].filter(k => k.startsWith(prefix)).sort(); }
    };
}
