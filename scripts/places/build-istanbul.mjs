// İstanbul mekan kataloğu: Overture Maps verisinden İstanbul'un 39 ilçesindeki alkollü içki servis eden
// mekanları (bar, pub, meyhane, şarap ve kokteyl barları, gece kulüpleri, alkol servisi olan restoranlar) çıkarır.
//
// Kullanım:  npm run places:ist                      (en son Overture sürümü, kayıtlı menü kontrolleriyle)
//            npm run places:ist -- --menus            (+ mekan web sitelerini / menülerini yeniden kontrol et)
//            npm run places:ist -- 2026-09-23.1
//
// İl ve ilçe sınırları Overture "divisions" temasından gelir (OpenStreetMap kaynaklı); mekan, içinde bulunduğu
// ilçeye atanır, il sınırı dışındakiler (Gebze, Çerkezköy…) elenir. Alkol sınıflandırması shared/alcohol.ts.
//
// Gereken: internet bağlantısı. DuckDB paketi --no-save ile kurulur, uygulamanın bağımlılıklarına girmez.
// Çıktı: data/places/ist.json (+ NOTICE.txt). Lisanslar NOTICE.txt'de.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { DuckDBInstance } from '@duckdb/node-api';
import { runnerImport } from 'vite';
import { checkSites, hostOf, siteOf } from './menu-check.mjs';

// Paylaşılan TypeScript modülleri Vite ile yüklenir
const { module: ist } = await runnerImport('./shared/istanbul.ts');
const { module: text } = await runnerImport('./shared/text.ts');
const { module: alc } = await runnerImport('./shared/alcohol.ts');
const { DISTRICTS, ISTANBUL_BBOX, districtFromText } = ist;
const { foldKey } = text;
const { classifyAlcohol, isNotVenue } = alc;

const OUT = 'data/places/ist.json';
const MENU_CACHE = 'data/places/menu-cache.json';
const args = process.argv.slice(2);
const CHECK_MENUS = args.includes('--menus');

/** Menü kontrolüne girecek kafe / restoranlar: içki servis etme ihtimali hiç olmayan türler hariç. */
const NO_ALCOHOL_CATS = new Set(['bakery', 'dessert_shop', 'ice_cream_shop', 'candy_store', 'chocolatier', 'bagel_shop', 'donut_shop',
    'cupcake_shop', 'delicatessen', 'food_truck_stand', 'food_court', 'smoothie_juice_bar', 'juice_bar', 'fast_food_restaurant',
    'doner_kebab_restaurant', 'chicken_restaurant', 'sandwich_shop', 'soup_restaurant', 'hookah_bar', 'patisserie', 'halal_restaurant']);
const CAFE_CATS = new Set(['cafe', 'coffee_shop', 'tea_room', 'non_alcoholic_beverage_venue']);

async function latestRelease() {
    const xml = await (await fetch('https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/')).text();
    const all = [...xml.matchAll(/<Prefix>release\/([\d.-]+)\/<\/Prefix>/g)].map(m => m[1]).sort();
    if (!all.length) throw new Error('Overture sürümleri okunamadı');
    return all[all.length - 1];
}

/** Elle düzenlenen istisnalar (data/places/overrides.json). */
const overrides = JSON.parse(await readFile('data/places/overrides.json', 'utf8'));
function override(name, district) {
    const key = foldKey(name);
    const dk = foldKey(district ?? '');
    const hit = (o) => (o.prefix ? key.startsWith(foldKey(o.name)) : key === foldKey(o.name)) && (!o.district || foldKey(o.district) === dk);
    if (overrides.deny.some(o => typeof o === 'object' && hit(o))) return 'deny';
    return overrides.allow.find(hit)?.kind ?? null;
}

/** Gece hayatı kayıtlarında (daha seyrek) daha düşük güven eşiği; restoranlarda daha yüksek. */
const MIN_CONF = { night: 0.4, food: 0.55 };

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

const release = args.find(a => /^\d{4}-\d{2}-\d{2}/.test(a)) || await latestRelease();
console.log(`Overture sürümü: ${release}`);

const db = await DuckDBInstance.create(':memory:');
const con = await db.connect();
await con.run(`INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';`);
const t0 = Date.now();
const base = `s3://overturemaps-us-west-2/release/${release}`;

// İl ve ilçe sınırları (kara). Kıyıdaki / iskeledeki mekanlar için il deniz sınırı da alınır.
await con.run(`CREATE TABLE ilce AS SELECT names.primary AS name, geometry AS geom
    FROM read_parquet('${base}/theme=divisions/type=division_area/*', hive_partitioning=1)
    WHERE country = 'TR' AND region = 'TR-34' AND subtype = 'county' AND class = 'land'`);
await con.run(`CREATE TABLE il AS SELECT geometry AS geom
    FROM read_parquet('${base}/theme=divisions/type=division_area/*', hive_partitioning=1)
    WHERE country = 'TR' AND region = 'TR-34' AND subtype = 'region' AND class = 'maritime'`);
const ilceCount = Number((await con.runAndReadAll('SELECT count(*) AS n FROM ilce')).getRowObjects()[0].n);
if (ilceCount !== 39) throw new Error(`İlçe sınırları eksik: ${ilceCount}/39`);

await con.run(`CREATE TABLE p AS SELECT id, (bbox.xmin + bbox.xmax) / 2 AS lng, (bbox.ymin + bbox.ymax) / 2 AS lat, confidence,
        names.primary AS name, basic_category AS basic, taxonomy.primary AS prim,
        addresses[1].freeform AS freeform, websites, phones, list_transform(sources, s -> s.dataset) AS datasets, operating_status AS status
    FROM read_parquet('${base}/theme=places/type=place/*', hive_partitioning=1)
    WHERE bbox.xmin BETWEEN ${ISTANBUL_BBOX.minLng} AND ${ISTANBUL_BBOX.maxLng}
      AND bbox.ymin BETWEEN ${ISTANBUL_BBOX.minLat} AND ${ISTANBUL_BBOX.maxLat}
      AND (taxonomy.hierarchy[1] IN ('food_and_drink', 'arts_and_entertainment') OR basic_category IN ('bar', 'lounge', 'alcoholic_beverage_venue'))`);

// Her mekanın ilçesi: sınırın içindeyse o ilçe; il deniz sınırı içinde ama karada değilse (iskele, kıyı) 400 m'ye kadar en yakın ilçe
const res = await con.runAndReadAll(`
    WITH pts AS (SELECT *, ST_Point(lng, lat) AS pt FROM p),
    inside AS (SELECT pts.*, ilce.name AS district FROM pts JOIN ilce ON ST_Contains(ilce.geom, pts.pt)),
    coast AS (
        SELECT pts.*, (SELECT ilce.name FROM ilce ORDER BY ST_Distance(ilce.geom, pts.pt) LIMIT 1) AS district,
               (SELECT min(ST_Distance(ilce.geom, pts.pt)) FROM ilce) AS gap
        FROM pts, il WHERE ST_Contains(il.geom, pts.pt) AND pts.id NOT IN (SELECT id FROM inside)
    )
    SELECT * EXCLUDE (pt) FROM inside
    UNION ALL SELECT * EXCLUDE (pt, gap) FROM coast WHERE gap < 0.004`);
const rows = res.getRowObjects();
console.log(`${rows.length} aday kayıt il sınırı içinde (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);

// ----- Mekan web sitesi / menü kontrolü -----
// Site mekanın kendi sitesi mi? Adındaki ayırt edici bir sözcük alan adında geçmeli (ya da tersi).
// Mağaza, otel zinciri, QR menü platformu gibi başka bir işletmenin sitesine bağlanan kayıtlar böylece ayıklanır.
const GENERIC = new Set(['restaurant', 'restoran', 'restorant', 'lokanta', 'lokantasi', 'cafe', 'kafe', 'coffee', 'kahve', 'kahvesi', 'bar', 'pub', 'bistro',
    'meyhane', 'meyhanesi', 'balik', 'et', 'kebap', 'steak', 'burger', 'pizza', 'food', 'yemek', 'mutfak', 'sofra', 'istanbul', 'the', 'and', 've',
    'house', 'garden', 'park', 'menu', 'qr', 'karekod', 'shop', 'hotel', 'otel', 'club', 'lounge', 'terrace', 'teras', 'roof', 'cafe&restaurant']);
function siteMatches(name, host) {
    const h = foldKey(host.replace(/\.(com|net|org|biz|info|co|tr|com\.tr|net\.tr|istanbul|cafe|bar|restaurant|menu|online|site|app|io)$/g, '')).replace(/ /g, '');
    const n = foldKey(name);
    const compact = n.replace(/ /g, '');
    if (compact.length >= 4 && h.includes(compact)) return true;
    const label = h.split(/[^a-z0-9]/)[0];
    if (label.length >= 4 && compact.includes(label)) return true;
    return n.split(' ').some(t => t.length >= 3 && !GENERIC.has(t) && h.includes(t));
}
let menuCache = {};
try { menuCache = JSON.parse(await readFile(MENU_CACHE, 'utf8')); } catch { /* ilk çalıştırma */ }
const isMenuCandidate = r => (r.confidence ?? 0) >= 0.5 && !NO_ALCOHOL_CATS.has(r.prim ?? '') && !isNotVenue(cleanName(r.name) ?? '')
    && (r.basic === 'cafe' || r.basic === 'coffee_shop' || r.basic === 'restaurant' || r.basic === 'casual_eatery' || CAFE_CATS.has(r.prim ?? '') || (r.prim ?? '').endsWith('restaurant'));
if (CHECK_MENUS) {
    const sites = new Map();
    for (const r of rows) {
        const name = cleanName(r.name);
        if (!name) continue;
        const relevant = classifyAlcohol({ primary: r.prim ?? null, basic: r.basic ?? null, name }) || isMenuCandidate(r);
        const site = relevant ? siteOf(r.websites?.items ?? r.websites) : null;
        const host = site && hostOf(site);
        if (host && !sites.has(host) && siteMatches(name, host)) sites.set(host, site);
    }
    console.log(`Menü kontrolü: ${sites.size} farklı site`);
    const save = () => writeFile(MENU_CACHE, JSON.stringify(menuCache));
    const t1 = Date.now();
    await checkSites(sites, menuCache, {
        concurrency: 20, save,
        onProgress: (n, total) => console.log(`  ${n}/${total} site (${Math.round((Date.now() - t1) / 1000)} sn)`)
    });
}
const menuOf = (r, name) => {
    const s = siteOf(r.websites?.items ?? r.websites);
    const h = s && hostOf(s);
    return h && siteMatches(name, h) ? menuCache[h] : null;
};

const stats = { notAlcohol: 0, lowConfidence: 0, closed: 0, noName: 0, duplicate: 0, menuNo: 0, menuYes: 0 };
const sources = {};
const candidates = [];
for (const r of rows) {
    if (r.status && r.status !== 'open') { stats.closed++; continue; }
    const name = cleanName(r.name);
    if (!name || name.length < 2) { stats.noName++; continue; }
    const forced = override(name, r.district);
    if (forced === 'deny') { stats.notAlcohol++; continue; }
    const menu = menuOf(r, name);
    let kind = forced ?? classifyAlcohol({ primary: r.prim ?? null, basic: r.basic ?? null, name });
    // Sitesinde "alkolsüz mekan / alkol servisi yok" diyorsa katalogdan çıkar (elle izin verilenler hariç)
    if (kind && !forced && menu?.a === -1) { stats.menuNo++; continue; }
    // Zincirin sitesi "şu şubemizde alkol yok" diyorsa yalnızca adı / adresi o yeri anan şube çıkar
    if (!forced && menu?.nb?.length) {
        const here = foldKey(`${name} ${r.freeform ?? ''}`);
        if (menu.nb.some(word => here.includes(foldKey(word)))) { stats.menuNo++; continue; }
    }
    // Kendini kafe / restoran olarak listeleyen ama menüsünde içki olan mekan
    if (!kind && menu?.a === 1 && isMenuCandidate(r)) {
        kind = CAFE_CATS.has(r.prim ?? '') || r.basic === 'cafe' || r.basic === 'coffee_shop' ? 'bar' : 'restoran';
        stats.menuYes++;
    }
    if (!kind) { stats.notAlcohol++; continue; }
    const food = kind === 'restoran' || (r.basic === 'restaurant' || r.basic === 'casual_eatery');
    if (!forced && menu?.a !== 1 && (r.confidence ?? 0) < (food ? MIN_CONF.food : MIN_CONF.night)) { stats.lowConfidence++; continue; }
    const district = districtFromText(r.district) ?? DISTRICTS.find(d => foldKey(d.name) === foldKey(r.district ?? ''));
    if (!district) { stats.noName++; continue; }
    for (const ds of r.datasets?.items ?? r.datasets ?? []) if (ds !== 'Overture') sources[ds] = (sources[ds] ?? 0) + 1;
    const web = cleanWeb(r.websites?.items ?? r.websites);
    const phone = cleanPhone(r.phones?.items?.[0] ?? r.phones?.[0]);
    candidates.push({
        id: shortId(r.id), name, key: foldKey(name), kind, cat: r.prim ?? r.basic ?? '',
        lat: Math.round(r.lat * 1e5) / 1e5, lng: Math.round(r.lng * 1e5) / 1e5,
        district: district.name, address: cleanAddress({ freeform: r.freeform }, district.name),
        phone, web, conf: r.confidence ?? 0,
        // Bilinirlik: güven puanı + iletişim bilgisi (ilçe listelerinde sıralama için, 0-100)
        q: Math.round(Math.min(1, (r.confidence ?? 0) * 0.7 + (web ? 0.15 : 0) + (phone ? 0.15 : 0) + (menu?.a === 1 ? 0.1 : 0)) * 100),
        // Doğrulama: 2 = elle onaylı (overrides), 1 = menüsünde içki var (mekanın sitesi), 0 = kategori / ad kuralı
        v: forced ? 2 : menu?.a === 1 ? 1 : 0
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
const denyIds = new Set(overrides.deny.filter(x => typeof x === 'string'));
for (let i = kept.length - 1; i >= 0; i--) if (denyIds.has(kept[i].id)) kept.splice(i, 1);
kept.sort((a, b) => a.id.localeCompare(b.id));

const FIELDS = ['id', 'name', 'kind', 'lat', 'lng', 'district', 'address', 'phone', 'web', 'cat', 'q', 'v'];
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
İl ve ilçe sınırları: Overture divisions teması (OpenStreetMap katkıcıları, ODbL); yalnızca mekanların ilçesini belirlemek için kullanıldı.
Bu dosyadaki veriler Overture verisinden filtrelenip dönüştürülmüştür (yalnızca İstanbul'daki alkollü içki servis eden mekanlar).
`);

const byKind = {}, byDistrict = {};
for (const p of kept) { byKind[p.kind] = (byKind[p.kind] ?? 0) + 1; byDistrict[p.district] = (byDistrict[p.district] ?? 0) + 1; }
console.log('Elenen:', stats);
console.log('Kaynak:', sources);
console.log('Tür:', byKind);
console.log('İlçe:', Object.keys(byDistrict).length, '/', DISTRICTS.length);
console.log(Object.entries(byDistrict).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} ${n}`).join(' · '));
console.log(`${kept.length} mekan → ${OUT} (${(JSON.stringify(out).length / 1e6).toFixed(1)} MB)`);
