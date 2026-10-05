// Yerel geliştirme için dosya tabanlı depo (.data/ klasörü). Üretimde kullanılmaz.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { KV, WriteOpts } from './kv';

export function fileKV(dir: string): KV {
    const path = (key: string) => join(dir, encodeURIComponent(key));
    const tagOf = (buf: Buffer | string) => '"' + createHash('sha1').update(buf).digest('hex').slice(0, 16) + '"';
    let queue = Promise.resolve();
    // Yazımları sıraya al: koşullu yazmanın oku-karşılaştır-yaz adımı bölünmesin
    const serial = <T>(fn: () => Promise<T>): Promise<T> => {
        const run = queue.then(fn, fn);
        queue = run.then(() => undefined, () => undefined);
        return run;
    };
    const read = async (key: string) => {
        try { return await readFile(path(key)); } catch { return null; }
    };
    const allowed = async (key: string, opts?: WriteOpts) => {
        if (!opts?.onlyIfNew && !opts?.onlyIfMatch) return true;
        const cur = await read(key + '.json');
        const curBin = cur ? null : await read(key + '.bin');
        if (opts.onlyIfNew) return !cur && !curBin;
        return !!cur && tagOf(cur) === opts.onlyIfMatch;
    };
    return {
        async getJSON(key) {
            const buf = await read(key + '.json');
            return buf ? { data: JSON.parse(buf.toString('utf8')), etag: tagOf(buf) } : null;
        },
        setJSON(key, data, opts) {
            return serial(async () => {
                if (!(await allowed(key, opts))) return { modified: false };
                await mkdir(dir, { recursive: true });
                const body = JSON.stringify(data);
                await writeFile(path(key + '.json'), body);
                return { modified: true, etag: tagOf(Buffer.from(body)) };
            });
        },
        async getBinary(key) {
            const buf = await read(key + '.bin');
            if (!buf) return null;
            const meta = await read(key + '.meta');
            return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, meta: meta ? JSON.parse(meta.toString('utf8')) : {} };
        },
        setBinary(key, data, meta, opts) {
            return serial(async () => {
                if (!(await allowed(key, opts))) return { modified: false };
                await mkdir(dir, { recursive: true });
                await writeFile(path(key + '.bin'), Buffer.from(data));
                await writeFile(path(key + '.meta'), JSON.stringify(meta));
                return { modified: true };
            });
        },
        async delete(key) {
            await Promise.all(['.json', '.bin', '.meta'].map(ext => rm(path(key + ext), { force: true })));
        },
        async list(prefix) {
            let files: string[] = [];
            try { files = await readdir(dir); } catch { return []; }
            const keys = new Set<string>();
            for (const f of files) {
                const m = /^(.*)\.(json|bin)$/.exec(f);
                if (!m) continue;
                const key = decodeURIComponent(m[1]);
                if (key.startsWith(prefix)) keys.add(key);
            }
            return [...keys].sort();
        }
    };
}
