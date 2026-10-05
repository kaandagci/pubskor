// Tarayıcı depolama sarmalayıcıları. Gizli sekme ya da engellenmiş site verisinde sessizce düşer.
import { createStore, del as idbDel, get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval';

const PREFIX = 'pubskor:v8:';

export const local = {
    get<T>(key: string, fallback: T): T {
        try {
            const raw = localStorage.getItem(PREFIX + key);
            return raw == null ? fallback : (JSON.parse(raw) as T);
        } catch { return fallback; }
    },
    set(key: string, value: unknown): boolean {
        try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
    },
    del(key: string) { try { localStorage.removeItem(PREFIX + key); } catch { /* yok say */ } },
    /** v7'den kalan anahtarlar için öneksiz okuma. */
    raw<T>(key: string, fallback: T): T {
        try {
            const raw = localStorage.getItem(key);
            return raw == null ? fallback : (JSON.parse(raw) as T);
        } catch { return fallback; }
    }
};

let store: ReturnType<typeof createStore> | null = null;
function db() {
    try { store ??= createStore('pubskor', 'kv'); } catch { store = null; }
    return store;
}

/** IndexedDB: büyük veriler (ekip görüntüsü, taslak fotoğrafları, gönderim kuyruğu). */
export const idb = {
    async get<T>(key: string): Promise<T | undefined> {
        const s = db();
        if (!s) return undefined;
        try { return await idbGet<T>(key, s); } catch { return undefined; }
    },
    async set(key: string, value: unknown): Promise<boolean> {
        const s = db();
        if (!s) return false;
        try { await idbSet(key, value, s); return true; } catch { return false; }
    },
    async del(key: string) {
        const s = db();
        if (!s) return;
        try { await idbDel(key, s); } catch { /* yok say */ }
    },
    async keys(prefix: string): Promise<string[]> {
        const s = db();
        if (!s) return [];
        try { return (await idbKeys(s)).map(String).filter(k => k.startsWith(prefix)); } catch { return []; }
    }
};
