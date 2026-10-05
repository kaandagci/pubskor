/// <reference lib="webworker" />
// Service worker: uygulama kabuğunu önbelleğe alır, internet yokken de açılmasını sağlar.
// Ekip verisi ve gönderim kuyruğu uygulamanın kendisinde (IndexedDB) tutulur; burada yalnızca dosyalar var.
const sw = globalThis as unknown as ServiceWorkerGlobalScope;

const VERSION = '__SW_VERSION__';
const SHELL = `shell-${VERSION}`;
const PHOTOS = 'photos-v1';
const TILES = 'tiles-v1';
const PLACES = 'places-v1';
const PRECACHE: string[] = '__PRECACHE_MANIFEST__' as unknown as string[];

sw.addEventListener('install', (event: ExtendableEvent) => {
    event.waitUntil(caches.open(SHELL).then(c => c.addAll(Array.isArray(PRECACHE) ? PRECACHE : ['/'])));
});

sw.addEventListener('activate', (event: ExtendableEvent) => {
    event.waitUntil((async () => {
        const keep = new Set([SHELL, PHOTOS, TILES, PLACES]);
        for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
        await sw.clients.claim();
    })());
});

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
    if (event.data === 'skipWaiting') void sw.skipWaiting();
});

async function trim(cacheName: string, max: number) {
    const c = await caches.open(cacheName);
    const keys = await c.keys();
    for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function cacheFirst(req: Request, cacheName: string, max: number): Promise<Response> {
    const c = await caches.open(cacheName);
    const hit = await c.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') { void c.put(req, res.clone()).then(() => trim(cacheName, max)); }
    return res;
}

async function staleWhileRevalidate(req: Request, cacheName: string, max: number): Promise<Response> {
    const c = await caches.open(cacheName);
    const hit = await c.match(req);
    const net = fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') void c.put(req, res.clone()).then(() => trim(cacheName, max));
        return res;
    }).catch(() => hit ?? Response.error());
    return hit ?? net;
}

sw.addEventListener('fetch', (event: FetchEvent) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Sayfa gezintisi: önce ağ, yoksa önbellekteki uygulama kabuğu
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const res = await fetch(req);
                if (res.ok) void caches.open(SHELL).then(c => c.put('/', res.clone()));
                return res;
            } catch {
                return (await caches.match('/')) ?? new Response('Çevrimdışı', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
            }
        })());
        return;
    }

    if (url.origin === sw.location.origin) {
        if (url.pathname.startsWith('/.netlify/')) return; // hesap (Identity) istekleri asla önbelleğe alınmaz
        if (url.pathname.startsWith('/api/photos/')) { event.respondWith(cacheFirst(req, PHOTOS, 300)); return; }
        if (url.pathname.startsWith('/api/')) return; // veri: uygulama yönetir
        // Mekan kataloğu karoları: önce önbellek, arkada tazele (gezilen semtler çevrimdışı da açılır)
        if (url.pathname.startsWith('/places/')) { event.respondWith(staleWhileRevalidate(req, PLACES, 400)); return; }
        if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
            event.respondWith(caches.match(req).then(hit => hit ?? cacheFirst(req, SHELL, 500)));
        }
        return;
    }

    if (url.hostname === 'tile.openstreetmap.org') event.respondWith(staleWhileRevalidate(req, TILES, 300));
});

export {};
