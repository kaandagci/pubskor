// Netlify Blobs uyarlaması.
import { getStore } from '@netlify/blobs';
import type { KV, LegacyStores } from './kv';

type Store = ReturnType<typeof getStore>;

export function blobsKV(store: Store): KV {
    return {
        async getJSON(key) {
            const r = await store.getWithMetadata(key, { type: 'json' });
            return r ? { data: r.data, etag: r.etag ?? '' } : null;
        },
        async setJSON(key, data, opts) {
            const r = await store.setJSON(key, data, conditions(opts));
            return { modified: r.modified, etag: r.etag };
        },
        async getBinary(key) {
            const r = await store.getWithMetadata(key, { type: 'arrayBuffer' });
            return r ? { data: r.data, meta: r.metadata ?? {} } : null;
        },
        async setBinary(key, data, meta, opts) {
            const r = await store.set(key, data, { metadata: meta, ...conditions(opts) });
            return { modified: r.modified };
        },
        async delete(key) { await store.delete(key); },
        async list(prefix) {
            const { blobs } = await store.list({ prefix });
            return blobs.map(b => b.key);
        }
    };
}

function conditions(opts?: { onlyIfNew?: boolean; onlyIfMatch?: string }) {
    if (opts?.onlyIfMatch) return { onlyIfMatch: opts.onlyIfMatch };
    if (opts?.onlyIfNew) return { onlyIfNew: true };
    return {};
}

export function blobsLegacy(): LegacyStores {
    const visits = getStore({ name: 'visits', consistency: 'strong' });
    const photos = getStore({ name: 'photos', consistency: 'strong' });
    return {
        visits: {
            async list() { return (await visits.list()).blobs.map(b => b.key); },
            async getJSON(key) { return visits.get(key, { type: 'json' }); }
        },
        photos: {
            async getBinary(key) { return (await photos.get(key, { type: 'arrayBuffer' })) ?? null; }
        }
    };
}

export function appStore(): KV {
    return blobsKV(getStore({ name: 'pubskor', consistency: 'strong' }));
}
