// İstanbul mekan kataloğu: Overture Maps "places" verisinden yeme-içme ve gece hayatı mekanlarını çıkarır.
//
// Kullanım:  npm run places:ist            (en son Overture sürümü)
//            npm run places:ist -- 2026-09-23.1
//
// Gereken: internet bağlantısı. DuckDB paketi --no-save ile kurulur, uygulamanın bağımlılıklarına girmez.
// Çıktı: data/places/ist.json (+ NOTICE.txt). Lisanslar: Meta / Microsoft (CDLA-Permissive-2.0),
// Foursquare (Apache-2.0), AllThePlaces (CC0). Ayrıntı NOTICE.txt'de.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { DuckDBInstance } from '@duckdb/node-api';
import { runnerImport } from 'vite';

// Paylaşılan TypeScript modülleri (ilçeler, Türkçe katlama) Vite ile yüklenir
const { module: ist } = await runnerImport('./shared/istanbul.ts');
const { module: text } = await runnerImport('./shared/text.ts');
const { DISTRICTS, ISTANBUL_BBOX, districtFromText, nearestDistrict } = ist;
const { foldKey } = text;

const OUT = 'data/places/ist.json';

async function latestRelease() {
    const xml = await (await fetch('https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/')).text();
    const all = [...xml.matchAll(/<Prefix>release\/([\d.-]+)\/<\/Prefix>/g)].map(m => m[1]).sort();
    if (!all.length) throw new Error('Overture sürümleri okunamadı');
    return all[all.length - 1];
}

// ----- Kategori eşlemesi (Overture taxonomy.primary → Pub Skor mekan türü) -----

const KIND = {
    pub: 'pub', irish_pub: 'pub', gastropub: 'pub', beer_bar: 'pub', beer_garden: 'pub',
    brewery: 'brewpub',
    cocktail_bar: 'kokteyl', speakeasy: 'kokteyl', tiki_bar: 'kokteyl',
    wine_bar: 'sarap', winery: 'sarap',
    bar: 'bar', whiskey_bar: 'bar', hotel_bar: 'bar', dive_bar: 'bar', gay_bar: 'bar', sports_bar: 'bar', sake_bar: 'bar',
    beach_bar: 'bar', piano_bar: 'bar', lounge: 'bar', dance_club: 'bar', music_venue: 'bar', karaoke_venue: 'bar', salsa_club: 'bar',
    hookah_bar: 'kafe', cafe: 'kafe', coffee_shop: 'kafe', tea_room: 'kafe', non_alcoholic_beverage_venue: 'kafe'
};
/** Puanlamaya konu olmayan yeme-içme işletmeleri. */
const SKIP = new Set([
    'bakery', 'dessert_shop', 'ice_cream_shop', 'candy_store', 'chocolatier', 'bagel_shop', 'donut_shop', 'cupcake_shop',
    'delicatessen', 'food_truck_stand', 'food_court', 'smoothie_juice_bar', 'distillery', 'airport_lounge', 'patisserie',
    'frozen_yogurt_shop', 'juice_bar', 'pretzel_shop', 'catering_service', 'food_delivery_service'
]);
const NIGHTLIFE = new Set(['dance_club', 'music_venue', 'karaoke_venue', 'salsa_club']);
const MEYHANE_RE = /meyhane|taverna|tavern|\bfas[ıi]l\b|rak[ıi] ?bal[ıi]k/i;
/** Kutunun içine düşen ama İstanbul'da olmayan yerler (Kocaeli, Tekirdağ). */
const NOT_IST = new Set(['gebze', 'cayirova', 'darica', 'dilovasi', 'korfez', 'izmit', 'kocaeli', 'kartepe', 'derince', 'golcuk',
    'cerkezkoy', 'kapakli', 'marmaraereglisi', 'tekirdag', 'saray', 'corlu', 'ergene', 'sulejmanpasa', 'suleymanpasa']);

function kindOf(primary, basic, name) {
    if (KIND[primary]) return KIND[primary];
    if (basic === 'bar' || basic === 'lounge' || basic === 'alcoholic_beverage_venue') return 'bar';
    if (basic === 'cafe' || basic === 'coffee_shop') return 'kafe';
    if (MEYHANE_RE.test(name)) return 'meyhane';
    return 'restoran';
}

// ----- Yardımcılar -----

const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function shortId(gers) {
    const h = createHash('sha1').update(gers).digest();
    let n = h.readBigUInt64BE(0), s = '';
    for (let i = 0; i < 10; i++) { s += B62[Number(n % 62n)]; n /= 62n; }
    return 'pl_' + s;
}

const clean = (v, max) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

function cleanName(raw) {
    let s = clean(raw, 90);
    // TAMAMI BÜYÜK HARF adları yumuşat ("KARGA BAR" → "Karga Bar")
    if (s.length > 4 && s === s.toLocaleUpperCase('tr') && /[A-ZÇĞİÖŞÜ]{4}/.test(s)) {
        s = s.toLocaleLowerCase('tr').replace(/(^|[\s(&/-])(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('tr'));
    }
    return s;
}

function cleanPhone(p) {
    if (typeof p !== 'string') return '';
    const digits = p.replace(/[^\d+]/g, '');
    if (/^\+90\d{10}$/.test(digits)) return digits;
    if (/^0\d{10}$/.test(digits)) return '+9' + digits;
    if (/^\d{10}$/.test(digits)) return '+90' + digits;
    return '';
}

function cleanWeb(list) {
    for (const w of list ?? []) {
        if (typeof w !== 'string' || !/^https?:\/\//i.test(w) || w.length > 140) continue;
        if (/facebook\.com|menulux|qr\.|linktr\.ee/i.test(w)) continue;
        return w.replace(/^http:\/\//i, 'https://').replace(/\/$/, '');
    }
    return '';
}

function cleanAddress(addr, district) {
    let s = clean(addr?.freeform, 120);
    if (!s) return '';
    // Sondaki ilçe / il tekrarlarını at
    s = s.replace(/[,\s]*(\d{5})?\s*(İstanbul|Istanbul|Türkiye|Turkey)\s*$/i, '').replace(/[,/\s]+$/, '');
    if (district) s = s.replace(new RegExp(`[,/\\s]+${district}\\s*$`, 'i'), '');
    return s.slice(0, 90);
}

const R = 6371000;
const meters = (a, b) => {
    const toRad = x => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
};

// ----- Ana akış -----

const release = process.argv[2] || await latestRelease();
console.log(`Overture sürümü: ${release}`);

const db = await DuckDBInstance.create(':memory:');
const con = await db.connect();
await con.run(`INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';`);
const t0 = Date.now();
const res = await con.runAndReadAll(`
    SELECT id, (bbox.xmin + bbox.xmax) / 2 AS lng, (bbox.ymin + bbox.ymax) / 2 AS lat, confidence,
           names.primary AS name, basic_category AS basic, taxonomy.primary AS prim,
           addresses[1].freeform AS freeform, addresses[1].locality AS locality, addresses[1].region AS region,
           websites, phones, list_transform(sources, s -> s.dataset) AS datasets, operating_status AS status
    FROM read_parquet('s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*', hive_partitioning=1)
    WHERE bbox.xmin BETWEEN ${ISTANBUL_BBOX.minLng} AND ${ISTANBUL_BBOX.maxLng}
      AND bbox.ymin BETWEEN ${ISTANBUL_BBOX.minLat} AND ${ISTANBUL_BBOX.maxLat}
      AND (taxonomy.hierarchy[1] = 'food_and_drink' OR taxonomy.primary IN ('dance_club', 'music_venue', 'karaoke_venue', 'salsa_club'))
`);
const rows = res.getRowObjects();
console.log(`${rows.length} aday kayıt (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);

const stats = { skipCategory: 0, lowConfidence: 0, closed: 0, outside: 0, noName: 0, duplicate: 0 };
const sources = {};
let candidates = [];
for (const r of rows) {
    const prim = r.prim ?? r.basic ?? '';
    if (SKIP.has(prim) || SKIP.has(r.basic)) { stats.skipCategory++; continue; }
    if (r.status && r.status !== 'open') { stats.closed++; continue; }
    const name = cleanName(r.name);
    if (!name || name.length < 2) { stats.noName++; continue; }
    const kind = kindOf(prim, r.basic, name);
    const nightlife = kind === 'bar' || kind === 'pub' || kind === 'kokteyl' || kind === 'sarap' || kind === 'brewpub' || kind === 'meyhane' || NIGHTLIFE.has(prim);
    if ((r.confidence ?? 0) < (nightlife ? 0.3 : 0.5)) { stats.lowConfidence++; continue; }
    const loc = foldKey(r.locality ?? ''), reg = foldKey(r.region ?? '');
    if (NOT_IST.has(loc) || NOT_IST.has(reg) || reg === '41' || reg === '59' || reg === 'kocaeli' || reg === 'tekirdag') { stats.outside++; continue; }
    const district = districtFromText(r.locality) ?? districtFromText(r.freeform) ?? nearestDistrict(r.lat, r.lng);
    // Yakın ilçe merkezinden çok uzaksa (komşu il) at
    if (!districtFromText(r.locality) && meters(r, district) > 22000) { stats.outside++; continue; }
    for (const ds of r.datasets?.items ?? r.datasets ?? []) if (ds !== 'Overture') sources[ds] = (sources[ds] ?? 0) + 1;
    candidates.push({
        id: shortId(r.id), name, key: foldKey(name), kind, cat: prim,
        lat: Math.round(r.lat * 1e5) / 1e5, lng: Math.round(r.lng * 1e5) / 1e5,
        district: district.name, address: cleanAddress({ freeform: r.freeform }, district.name),
        phone: cleanPhone(r.phones?.items?.[0] ?? r.phones?.[0]), web: cleanWeb(r.websites?.items ?? r.websites),
        conf: r.confidence ?? 0
    });
}

// Yinelenenler: aynı ad 60 m içinde → en güvenilir kayıt kalır, eksik alanlar diğerinden tamamlanır
candidates.sort((a, b) => b.conf - a.conf);
const cell = p => `${Math.floor(p.lat * 1000)}:${Math.floor(p.lng * 1000)}`;
const grid = new Map();
const kept = [];
for (const p of candidates) {
    const [cy, cx] = cell(p).split(':').map(Number);
    let dup = null;
    for (let dy = -1; dy <= 1 && !dup; dy++) for (let dx = -1; dx <= 1 && !dup; dx++) {
        for (const q of grid.get(`${cy + dy}:${cx + dx}`) ?? []) {
            if (q.key === p.key && meters(p, q) < 60) { dup = q; break; }
        }
    }
    if (dup) {
        stats.duplicate++;
        dup.phone ||= p.phone; dup.web ||= p.web; dup.address ||= p.address;
        continue;
    }
    const k = `${cy}:${cx}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
    kept.push(p);
}
kept.sort((a, b) => a.id.localeCompare(b.id));

const FIELDS = ['id', 'name', 'kind', 'lat', 'lng', 'district', 'address', 'phone', 'web', 'cat'];
const out = {
    v: 1,
    city: 'ist',
    release,
    generatedAt: new Date().toISOString().slice(0, 10),
    count: kept.length,
    fields: FIELDS,
    rows: kept.map(p => FIELDS.map(f => p[f] ?? ''))
};
await mkdir('data/places', { recursive: true });
await writeFile(OUT, JSON.stringify(out));
await writeFile('data/places/NOTICE.txt', `Pub Skor İstanbul mekan kataloğu
Kaynak: Overture Maps Foundation, places teması, sürüm ${release} (https://overturemaps.org)
Overture verisi şu kaynakları birleştirir; her kayıt kaynağının lisansını taşır:
  - Meta: CDLA-Permissive-2.0 (https://cdla.dev/permissive-2-0/)
  - Microsoft: CDLA-Permissive-2.0
  - Foursquare Open Source Places: Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0)
  - AllThePlaces: CC0-1.0
Bu dosyadaki veriler Overture verisinden filtrelenip dönüştürülmüştür (yalnızca yeme-içme ve gece hayatı, İstanbul).
`);

const byKind = {}, byDistrict = {};
for (const p of kept) { byKind[p.kind] = (byKind[p.kind] ?? 0) + 1; byDistrict[p.district] = (byDistrict[p.district] ?? 0) + 1; }
console.log('Elenen:', stats);
console.log('Kaynak:', sources);
console.log('Tür:', byKind);
console.log('İlçe sayısı:', Object.keys(byDistrict).length, '/', DISTRICTS.length);
console.log(`${kept.length} mekan → ${OUT} (${(JSON.stringify(out).length / 1e6).toFixed(1)} MB)`);
