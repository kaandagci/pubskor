import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import preact from '@preact/preset-vite';

/**
 * Yerel geliştirmede /api/* isteklerini Netlify fonksiyonuyla aynı uygulamaya yönlendirir.
 * Veriler .data/ klasöründe dosya olarak tutulur. .data/legacy/ içine v7 JSON kayıtları
 * konursa "eski arşivi içe aktar" akışı da denenebilir.
 */
function devApi(): Plugin {
    let kv: unknown = null;
    return {
        name: 'pubskor-dev-api',
        apply: 'serve',
        configureServer(server: ViteDevServer) {
            server.middlewares.use(async (req, res, next) => {
                if (!req.url?.startsWith('/api/')) return next();
                try {
                    const { createApp } = await server.ssrLoadModule('/server/app.ts');
                    if (!kv) {
                        const { fileKV } = await server.ssrLoadModule('/server/kv-file.ts');
                        kv = fileKV('.data/pubskor');
                    }
                    const legacyDir = '.data/legacy';
                    const legacy = {
                        visits: {
                            list: async () => (await readdir(legacyDir).catch(() => [] as string[])).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)),
                            getJSON: async (k: string) => JSON.parse(await readFile(join(legacyDir, k + '.json'), 'utf8'))
                        },
                        photos: {
                            getBinary: async (k: string) => {
                                const b = await readFile(join(legacyDir, k + '.jpg')).catch(() => null);
                                return b ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : null;
                            }
                        }
                    };
                    const app = createApp({ kv, legacy, adminKey: process.env.ADMIN_KEY || '' });
                    const chunks: Buffer[] = [];
                    for await (const c of req) chunks.push(c as Buffer);
                    const headers = new Headers();
                    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
                    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0;
                    const response: Response = await app(new Request('http://localhost' + req.url, {
                        method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined
                    }));
                    res.statusCode = response.status;
                    response.headers.forEach((v, k) => res.setHeader(k, v));
                    res.end(Buffer.from(await response.arrayBuffer()));
                } catch (e) {
                    next(e);
                }
            });
        }
    };
}

/** Service worker'a önbelleğe alınacak derleme çıktılarının listesini yazar. */
function swManifest(): Plugin {
    return {
        name: 'pubskor-sw-manifest',
        apply: 'build',
        generateBundle(_opts, bundle) {
            const files = Object.keys(bundle).filter(f =>
                f !== 'sw.js' && !f.endsWith('.map') && !/pdf|jspdf|html2canvas|purify|leaflet|index\.es|vietnamese|cyrillic/i.test(f)
            );
            const version = Date.now().toString(36);
            for (const chunk of Object.values(bundle)) {
                if (chunk.type === 'chunk' && chunk.fileName === 'sw.js') {
                    chunk.code = chunk.code
                        .replace(/(["'`])__PRECACHE_MANIFEST__\1/, JSON.stringify(['/', ...files.map(f => '/' + f)]))
                        .replaceAll('__SW_VERSION__', version);
                }
            }
        }
    };
}

export default defineConfig({
    plugins: [preact(), devApi(), swManifest()],
    server: { port: 5173, host: true },
    preview: { port: 4173 },
    build: {
        target: 'es2022',
        sourcemap: false,
        rolldownOptions: {
            input: { index: 'index.html', sw: 'src/sw.ts' },
            output: {
                entryFileNames: chunk => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js')
            }
        }
    }
});
