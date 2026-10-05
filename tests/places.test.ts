import { describe, expect, it } from 'vitest';
import { districtFromText, nearestDistrict } from '../shared/istanbul';
import { geohash, mapsSearchUrl, matchPlace, nameSimilarity, tilesAround, type CatalogFile } from '../shared/places';
import { communityLoader } from '../server/community';
import { devIdentity } from '../server/identity';
import { memoryKV } from '../server/kv';
import { createPlacesApp } from '../server/places-app';

const catalog: CatalogFile = {
    v: 1, city: 'ist', release: 'test', generatedAt: '2026-10-05', count: 5,
    fields: ['id', 'name', 'kind', 'lat', 'lng', 'district', 'address', 'phone', 'web', 'cat'],
    rows: [
        ['pl_aaaaaaaaaa', 'Karga Bar', 'bar', 40.9866, 29.02657, 'Kadıköy', 'Kadife Sk. No:16', '', '', 'bar'],
        ['pl_bbbbbbbbbb', 'Bahcesehir Kargalarla Kahvalti', 'restoran', 41.09, 28.68, 'Başakşehir', '', '', '', 'turkish_restaurant'],
        ['pl_cccccccccc', 'Fahri Konsolos', 'kokteyl', 40.98541, 29.02631, 'Kadıköy', '', '', '', 'cocktail_bar'],
        ['pl_dddddddddd', 'Moda Teras', 'restoran', 40.98075, 29.02568, 'Kadıköy', '', '', '', 'turkish_restaurant'],
        ['pl_eeeeeeeeee', 'Fahriye Cafe', 'kafe', 41.0, 29.03, 'Kadıköy', '', '', '', 'cafe']
    ]
};

const app = createPlacesApp(catalog, { community: async () => [] });
const get = async (path: string) => {
    const r = await app(new Request('http://x' + path));
    return { status: r.status, data: await r.json() };
};

describe('mekan kataloğu', () => {
    it('adla arar: ad öneki önce, yakın bar restorandan önce', async () => {
        const r = await get('/api/places/search?q=karga&lat=40.99&lng=29.03');
        expect(r.data.results.map((p: { id: string }) => p.id)).toEqual(['pl_aaaaaaaaaa', 'pl_bbbbbbbbbb']);
    });

    it('çok kelimeli sorguda ilçeyi de kullanır', async () => {
        const r = await get('/api/places/search?q=fahri%20kadikoy');
        expect(r.data.results[0].name).toBe('Fahri Konsolos');
    });

    it('Türkçe karakterden bağımsız arar', async () => {
        const r = await get('/api/places/search?q=FAHRİYE');
        expect(r.data.results[0].id).toBe('pl_eeeeeeeeee');
    });

    it('kimlikle mekan döner, geçersiz kimlikte 404', async () => {
        expect((await get('/api/places/pl_cccccccccc')).data.place.name).toBe('Fahri Konsolos');
        expect((await get('/api/places/xx')).status).toBe(404);
        expect((await get('/api/places/pl_zzzzzzzzzz')).status).toBe(404);
    });

    it('ekip mekanını katalogla eşleştirir', () => {
        const places = catalog.rows.map(r => ({ id: r[0], name: r[1], lat: r[3], lng: r[4] }));
        expect(matchPlace({ name: 'Karga', lat: 40.9867, lng: 29.0266 }, places)?.id).toBe('pl_aaaaaaaaaa');
        // aynı ad ama 2 km uzakta → eşleşmez
        expect(matchPlace({ name: 'Karga', lat: 41.005, lng: 29.0266 }, places)).toBeNull();
        expect(nameSimilarity('Fahri Konsolos Kadıköy', 'Fahri Konsolos')).toBeGreaterThan(0.9);
        expect(nameSimilarity('Moda Teras', 'Karga Bar')).toBe(0);
    });

    it('geohash karoları noktayı kapsar', () => {
        expect(geohash(41.0369, 28.985)).toBe('sxk97w');
        const tiles = tilesAround(40.986, 29.026, 800);
        expect(tiles).toContain(geohash(40.986, 29.026));
        expect(tiles).toContain(geohash(40.9915, 29.026));
    });

    it('ilçeyi metinden ya da en yakın merkezden bulur', () => {
        expect(districtFromText('Kadıköy, İstanbul')?.name).toBe('Kadıköy');
        expect(districtFromText('Eyüp')?.name).toBe('Eyüpsultan');
        expect(districtFromText('İstanbul')).toBeNull();
        expect(nearestDistrict(41.03, 28.975).name).toBe('Beyoğlu');
    });

    it('Google Maps bağlantısı anahtarsız', () => {
        const u = mapsSearchUrl({ name: 'Karga Bar', address: 'Kadife Sk.', district: 'Kadıköy' });
        expect(u).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Karga\+Bar/);
        expect(u).not.toMatch(/key=/);
    });
});

describe('topluluk mekanları', () => {
    const kv = memoryKV();
    const identity = devIdentity('t');
    const capp = createPlacesApp(catalog, { community: communityLoader(kv, 0), kv, identity });
    const tok = identity.devLogin!('a@example.com', 'A');
    const post = async (body: unknown, token: string | null = tok) => {
        const r = await capp(new Request('http://x/api/places/community', {
            method: 'POST', body: JSON.stringify(body),
            headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }
        }));
        return { status: r.status, data: await r.json() };
    };

    it('giriş ister, İstanbul dışını reddeder', async () => {
        expect((await post({ name: 'Yeni Bar', lat: 41.03, lng: 28.98 }, null)).status).toBe(401);
        expect((await post({ name: 'Ankara Bar', lat: 39.9, lng: 32.8 })).status).toBe(400);
    });

    it('ekler, aramada çıkar; yakındaki aynı mekanı yinelemez', async () => {
        const a = await post({ name: 'Gizli Bahçe', kind: 'bar', lat: 41.0301, lng: 28.9751 });
        expect(a.status).toBe(201);
        expect(a.data.place.id).toMatch(/^pc_/);
        expect(a.data.place.district).toBe('Beyoğlu');
        const again = await post({ name: 'gizli bahçe', lat: 41.0302, lng: 28.9752 });
        expect(again.data.existing).toBe(true);
        expect(again.data.place.id).toBe(a.data.place.id);
        const s = await capp(new Request('http://x/api/places/search?q=gizli'));
        expect((await s.json()).results[0].id).toBe(a.data.place.id);
    });

    it('katalogda varsa katalog mekanını döner', async () => {
        const r = await post({ name: 'Karga', lat: 40.98662, lng: 29.02659 });
        expect(r.data.existing).toBe(true);
        expect(r.data.place.id).toBe('pl_aaaaaaaaaa');
    });
});
