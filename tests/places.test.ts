import { describe, expect, it } from 'vitest';
import { classifyAlcohol, isAlcoholOsm } from '../shared/alcohol';
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

    it('yalnızca alkollü içki servis eden mekanlar eklenebilir', async () => {
        expect((await post({ name: 'Kahve Durağı', kind: 'kafe', lat: 41.04, lng: 28.99 })).data.code).toBe('not_alcohol');
        expect((await post({ name: 'Köşe Lokantası', kind: 'restoran', lat: 41.041, lng: 28.991 })).data.code).toBe('not_alcohol');
        expect((await post({ name: 'Köşe Meyhanesi', kind: 'restoran', alcohol: true, lat: 41.042, lng: 28.992 })).status).toBe(201);
    });

    it('katalogda varsa katalog mekanını döner', async () => {
        const r = await post({ name: 'Karga', lat: 40.98662, lng: 29.02659 });
        expect(r.data.existing).toBe(true);
        expect(r.data.place.id).toBe('pl_aaaaaaaaaa');
    });
});

describe('alkol servisi sınıflandırması', () => {
    const c = (primary: string, name: string, basic: string | null = null) => classifyAlcohol({ primary, basic, name });
    it('içki mekanlarını alır', () => {
        expect(c('bar', 'Karga Bar')).toBe('bar');
        expect(c('cocktail_bar', 'Fahri Konsolos')).toBe('kokteyl');
        expect(c('pub', 'Bronx Pub')).toBe('pub');
        expect(c('wine_bar', 'Sensus Wine & Food')).toBe('sarap');
        expect(c('bar', 'Tarihi Cibali Meyhanesi')).toBe('meyhane');
        expect(c('turkish_restaurant', 'Ezberbozan Meyhane', 'restaurant')).toBe('meyhane');
        expect(c('restaurant', 'Karya Bar and Restaurant', 'restaurant')).toBe('restoran');
        expect(c('seafood_restaurant', 'Tekne Balık Lokantası', 'restaurant')).toBe('restoran');
        expect(c('seafood_restaurant', 'Kumkapı Sütliman Fasıl Meyhane', 'restaurant')).toBe('meyhane');
        expect(c('dance_club', 'Ukala Club')).toBe('bar');
        expect(c('music_venue', 'Zeryam Turku Bar')).toBe('bar');
        expect(c('lounge', 'Malt Bistro and Pub')).toBe('bar');
    });
    it('içki sunmayanları ve kayıt hatalarını eler', () => {
        expect(c('cafe', 'Seyid Cafe', 'cafe')).toBeNull();
        expect(c('coffee_shop', 'Kronotrop Moda')).toBeNull();
        expect(c('hookah_bar', 'Nargile Keyfi')).toBeNull();
        expect(c('turkish_restaurant', 'Çiya Sofrası', 'restaurant')).toBeNull();
        expect(c('doner_kebab_restaurant', 'Kebap Bar', 'restaurant')).toBeNull();
        expect(c('sushi_restaurant', 'TAS Ramen & Sushi Bar', 'restaurant')).toBeNull();
        expect(c('restaurant', 'Salata Bar Moda', 'restaurant')).toBeNull();
        expect(c('seafood_restaurant', 'Balıkçı Barınağı', 'restaurant')).toBeNull();
        expect(c('seafood_restaurant', 'Midyeci Gökhan Beyoğlu', 'restaurant')).toBeNull();
        expect(c('seafood_restaurant', 'Bahçe İçi Restoran', 'restaurant')).toBeNull();
        expect(c('brewery', 'Bayrampasa Tekel')).toBeNull();
        expect(c('cocktail_bar', 'Net Ahşap Mob.Dekorasyon San. Tic.Ltd.Şti.')).toBeNull();
        expect(c('lounge', 'Flash Tv Canli Yayin Studyosu')).toBeNull();
        expect(c('lounge', '555-Ist Lounge Cafe')).toBeNull();
        expect(c('restaurant', 'Efor Cafe Bistro', 'restaurant')).toBeNull();
        expect(c('gastropub', 'Cool Coffee')).toBeNull();
        expect(c('lounge', 'Taksim Lounge Cafe Bar')).toBe('bar');
        expect(c('beer_garden', 'Kayseri Kadir Has Stadyumu')).toBeNull();
        expect(c('beer_garden', 'Kardeşler Birahanesi')).toBe('meyhane');
        expect(c('music_venue', 'Sultan Kokteyl Salonu')).toBeNull();
        expect(c('lounge', 'Seyfi Şengül Beauty Lounge')).toBeNull();
        expect(c('bar', 'Aras metal')).toBeNull();
        expect(c('bar', 'Soydan Turşuları')).toBeNull();
        expect(c('bar', 'Disc Music Rental Company')).toBeNull();
        expect(c('bar', 'Göymen Gida & Însaat')).toBeNull();
        expect(c('bar', 'Jolly Joker İstanbul')).toBe('bar');
        expect(c('bar', 'Kilim Turkubar')).toBe('bar');
        expect(c('bar', 'Sultanbeyli Teras Cafe')).toBeNull();
        expect(c('wine_bar', 'Gorele Park')).toBeNull();
        expect(c('pub', 'Bomonti Park Pub')).toBe('pub');
        expect(c('bar', 'Çınar Türkü Evi')).toBe('bar');
        expect(c('bar', 'Bakırkoy Anadolum Turku Evı')).toBe('bar');
        expect(c('dance_club', 'Bağcılar 14 No\'lu Aile Sağlık Merkezi')).toBeNull();
        expect(c('bar', 'Efe Market')).toBeNull();
        expect(c('bar', 'Cinnah Caddesi')).toBeNull();
        expect(c('lounge', 'Turkish Airlines Business Class Lounge')).toBeNull();
        expect(c('music_venue', 'Erd MÜZİK Yapim')).toBeNull();
        expect(c('salsa_club', 'Salsa Dans Okulu')).toBeNull();
    });
    it('OSM yedek aramasında yalnızca içki mekanları', () => {
        expect(isAlcoholOsm('pub', 'X')).toBe(true);
        expect(isAlcoholOsm('cafe', 'X Kafe')).toBe(false);
        expect(isAlcoholOsm('restaurant', 'Kalamış Meyhanesi')).toBe(true);
        expect(isAlcoholOsm('restaurant', 'Köfteci')).toBe(false);
    });
});

describe('bildirim ve ilçe listesi', () => {
    const kv = memoryKV();
    const identity = devIdentity('r');
    const rapp = createPlacesApp(catalog, { community: communityLoader(kv, 0), kv, identity, now: () => Date.now() });
    const req = async (method: string, path: string, token?: string, body?: unknown) => {
        const r = await rapp(new Request('http://x' + path, {
            method, body: body ? JSON.stringify(body) : undefined,
            headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }
        }));
        return { status: r.status, data: await r.json() };
    };

    it('ilçedeki tüm mekanları sayfalı listeler, ilçe sayıları meta\'da', async () => {
        const r = await req('GET', '/api/places/browse?district=Kad%C4%B1k%C3%B6y&limit=2');
        expect(r.data.total).toBe(4);
        expect(r.data.places).toHaveLength(2);
        const bars = await req('GET', '/api/places/browse?district=kadikoy&kinds=bar,kokteyl');
        expect(bars.data.places.map((p: { id: string }) => p.id).sort()).toEqual(['pl_aaaaaaaaaa', 'pl_cccccccccc']);
        expect((await req('GET', '/api/places/meta')).data.districts['Kadıköy']).toBe(4);
    });

    it('iki farklı hesap "alkol servisi yok" derse mekan önerilerden düşer', async () => {
        const [a, b] = ['a@x.co', 'b@x.co'].map(e => identity.devLogin!(e, 'X'));
        expect((await req('POST', '/api/places/pl_aaaaaaaaaa/report', undefined, { reason: 'no_alcohol' })).status).toBe(401);
        expect((await req('POST', '/api/places/pl_aaaaaaaaaa/report', a, { reason: 'uydurma' })).status).toBe(400);
        expect((await req('POST', '/api/places/pl_aaaaaaaaaa/report', a, { reason: 'no_alcohol' })).data.hidden).toBe(false);
        expect((await req('POST', '/api/places/pl_aaaaaaaaaa/report', a, { reason: 'no_alcohol' })).data.already).toBe(true);
        expect((await req('GET', '/api/places/search?q=karga')).data.results[0].id).toBe('pl_aaaaaaaaaa');
        expect((await req('POST', '/api/places/pl_aaaaaaaaaa/report', b, { reason: 'no_alcohol' })).data.hidden).toBe(true);
        expect((await req('GET', '/api/places/hidden')).data.ids).toEqual(['pl_aaaaaaaaaa']);
        expect((await req('GET', '/api/places/search?q=karga%20bar')).data.results.some((p: { id: string }) => p.id === 'pl_aaaaaaaaaa')).toBe(false);
        expect((await req('GET', '/api/places/pl_aaaaaaaaaa')).data.place.hidden).toBe(true);
        expect((await req('GET', '/api/places/browse?district=Kadıköy')).data.total).toBe(3);
    });
});
