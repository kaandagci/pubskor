import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import preact from '@preact/preset-vite';
import { geohash } from './shared/geohash';

interface CatalogFile { release: string; count: number; rows: [string, string, string, number, number, ...unknown[]][] }

/**
 * Yerel geliştirmede /api/* isteklerini Netlify fonksiyonuyla aynı uygulamaya yönlendirir.
 * Veriler .data/ klasöründe dosya olarak tutulur. .data/legacy/ içine v7 JSON kayıtları
 * konursa "eski arşivi içe aktar" akışı da denenebilir.
 */
function devApi(): Plugin {
    let kv: unknown = null;
    let catalog: unknown = null;
    let devIdentity: unknown = null;
    let placeIndex: Map<string, unknown> | null = null;
    return {
        name: 'pubskor-dev-api',
        apply: 'serve',
        configureServer(server: ViteDevServer) {
            server.middlewares.use(async (req, res, next) => {
                // Statik tanıtım sayfası: Netlify'da /tanitim/ doğrudan public/tanitim/index.html'i sunar; yerelde de öyle olsun
                if (req.url === '/tanitim' || req.url === '/tanitim/') req.url = '/tanitim/index.html';
                // Netlify Forms yerelde yok: iletişim formu gönderimleri .data/forms.jsonl dosyasına yazılır
                if (req.method === 'POST' && req.url === '/__forms.html') {
                    const chunks: Buffer[] = [];
                    for await (const c of req) chunks.push(c as Buffer);
                    const fields = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
                    await mkdir('.data', { recursive: true });
                    await appendFile('.data/forms.jsonl', JSON.stringify(fields) + '\n');
                    res.statusCode = 200;
                    res.end('ok');
                    return;
                }
                if (!req.url?.startsWith('/api/')) return next();
                try {
                    if (!kv) {
                        const { fileKV } = await server.ssrLoadModule('/server/kv-file.ts');
                        kv = fileKV('.data/pubskor');
                    }
                    let app: (r: Request) => Promise<Response>;
                    if (req.url.startsWith('/api/places/')) {
                        catalog ??= JSON.parse(await readFile('data/places/ist.json', 'utf8'));
                        const { createPlacesApp } = await server.ssrLoadModule('/server/places-app.ts');
                        const { communityLoader } = await server.ssrLoadModule('/server/community.ts');
                        devIdentity ??= (await server.ssrLoadModule('/server/identity.ts')).devIdentity();
                        app = createPlacesApp(catalog, { community: communityLoader(kv, 0), kv, identity: devIdentity });
                    } else {
                        const { createApp } = await server.ssrLoadModule('/server/app.ts');
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
                        devIdentity ??= (await server.ssrLoadModule('/server/identity.ts')).devIdentity();
                        catalog ??= JSON.parse(await readFile('data/places/ist.json', 'utf8'));
                        const cat = catalog as { rows: [string, string, string, number, number, string][] };
                        const byId = (placeIndex ??= new Map(cat.rows.map(r => [r[0], { id: r[0], name: r[1], kind: r[2], lat: r[3], lng: r[4], district: r[5] }])));
                        const { communityLoader, hiddenLoader } = await server.ssrLoadModule('/server/community.ts');
                        const community = await communityLoader(kv, 0)() as { id: string }[];
                        const hidden = await hiddenLoader(kv, 2, 0)() as Set<string>;
                        const placeLookup = (id: string) => (hidden.has(id) ? null : byId.get(id) ?? community.find(p => p.id === id));
                        app = createApp({ kv, legacy, identity: devIdentity, dev: true, placeLookup, adminKey: process.env.ADMIN_KEY || '' });
                    }
                    const chunks: Buffer[] = [];
                    for await (const c of req) chunks.push(c as Buffer);
                    const headers = new Headers();
                    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
                    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0;
                    const response = await app(new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
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

/**
 * Mekan kataloğunu geohash6 karolarına böler: /places/ist/<karo>.json (statik, CDN'den gelir, çevrimdışı önbelleğe alınır).
 * Geliştirmede aynı dosyalar bellekten sunulur.
 */
/** Katalog özeti: sürüm, toplam ve ilçe başına mekan sayısı. */
function metaOf(catalog: CatalogFile, tiles: number) {
    const districts: Record<string, number> = {};
    for (const r of catalog.rows) districts[r[5] as string] = (districts[r[5] as string] ?? 0) + 1;
    return { release: catalog.release, count: catalog.count, tiles, districts };
}

function placeTiles(): Plugin {
    const build = async () => {
        const catalog = JSON.parse(await readFile('data/places/ist.json', 'utf8')) as CatalogFile;
        const tiles = new Map<string, CatalogFile['rows']>();
        for (const r of catalog.rows) {
            const g = geohash(r[3], r[4]);
            let list = tiles.get(g);
            if (!list) tiles.set(g, (list = []));
            list.push(r);
        }
        return { catalog, tiles };
    };
    let cached: Awaited<ReturnType<typeof build>> | null = null;
    return {
        name: 'pubskor-place-tiles',
        configureServer(server: ViteDevServer) {
            server.middlewares.use(async (req, res, next) => {
                const m = /^\/places\/ist\/(\w+)\.json$/.exec(req.url ?? '');
                if (!m) return next();
                cached ??= await build();
                const rows = m[1] === 'meta' ? null : cached.tiles.get(m[1]);
                res.setHeader('content-type', 'application/json');
                if (m[1] === 'meta') { res.end(JSON.stringify(metaOf(cached.catalog, cached.tiles.size))); return; }
                if (!rows) { res.statusCode = 404; res.end('{}'); return; }
                res.end(JSON.stringify({ v: 1, rows }));
            });
        },
        async generateBundle() {
            const { catalog, tiles } = await build();
            for (const [g, rows] of tiles) {
                this.emitFile({ type: 'asset', fileName: `places/ist/${g}.json`, source: JSON.stringify({ v: 1, rows }) });
            }
            this.emitFile({ type: 'asset', fileName: 'places/empty.json', source: '{"v":1,"rows":[]}' });
            this.emitFile({ type: 'asset', fileName: 'places/ist/meta.json', source: JSON.stringify(metaOf(catalog, tiles.size)) });
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
                f !== 'sw.js' && !f.endsWith('.map') && !/^places\//.test(f) && !/pdf|jspdf|html2canvas|purify|leaflet|index\.es|vietnamese|cyrillic/i.test(f)
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
    plugins: [preact(), devApi(), placeTiles(), swManifest()],
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
