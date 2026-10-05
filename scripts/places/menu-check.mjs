// Mekan web sitesi / menü kontrolü: mekanın kendi sitesinde ve menü sayfasında alkollü içki geçiyor mu?
// Kendini "kafe" ya da "restoran" olarak listeleyip içki servis eden mekanları yakalamak, katalogdakileri doğrulamak için.
//
// Kurallar: yalnızca mekanın kendi sitesi ve bağlantı verdiği menü sayfaları okunur (Google, Yemeksepeti, sosyal
// medya hiç açılmaz); robots.txt "Disallow: /" diyorsa site atlanır; aynı siteyi paylaşan zincir şubeleri bir kez
// kontrol edilir; sonuç (evet / hayır / bilinmiyor + bulunan terimler) data/places/menu-cache.json'da tutulur,
// 90 günden eskiler yeniden kontrol edilir. İçerik saklanmaz, yalnızca karar ve terimler.

const UA = 'PubSkorBot/1.0 (mekan menusu kontrolu; alkol servisi var mi)';
const SKIP_HOST = /(^|\.)(google\.[a-z.]+|goo\.gl|g\.page|business\.site|facebook\.com|fb\.com|fbf\.bz|instagram\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|linktr\.ee|wa\.me|whatsapp\.com|yemeksepeti\.com|getir\.com|trendyol\.com|tripadvisor\.[a-z.]+|foursquare\.com|zomato\.com|bel\.tr|gov\.tr|edu\.tr|wikipedia\.org)$/i;

/**
 * Alkol terimleri, gruplara ayrılmış. Marka adları yalnızca tespit için; hiçbir yerde gösterilmez.
 * Belirsiz sözcükler bilerek yok: "bomonti" (semt), "efes" (yer adı), "draft" / "bourbon" (kahve terimleri).
 */
const GROUPS = {
    bira: ['bira', 'biralar', 'beer', 'beers', 'fıçı', 'lager', 'pilsner', 'ipa', 'stout', 'weiss', 'efes pilsen', 'efes malt', 'tuborg', 'carlsberg', 'heineken'],
    sarap: ['şarap', 'şaraplar', 'sarap', 'wine', 'wines', 'prosecco', 'şampanya', 'champagne', 'sangria', 'kavaklıdere', 'doluca'],
    sert: ['votka', 'vodka', 'viski', 'whisky', 'whiskey', 'tekila', 'tequila', 'likör', 'liqueur', 'jägermeister', 'gin'],
    raki: ['rakı', 'raki'],
    klasik: ['negroni', 'aperol', 'spritz', 'cosmopolitan', 'gin tonic', 'cin tonik'],
    // Tek başına zayıf: kahveci ve restoranlarda alkolsüz kokteyl / "meyve kokteyli", kahveli "martini" olarak da geçer
    kokteyl: ['kokteyl', 'kokteyller', 'cocktail', 'cocktails', 'mojito', 'martini']
};
// Türkçe küçük harfe çevirmede "WINES" → "wınes" olur: eşleştirmede i ile ı aynı sayılır
const termKey = t => t.replace(/ı/g, 'i');
const GROUP_OF = new Map(Object.entries(GROUPS).flatMap(([g, list]) => list.map(t => [termKey(t), g])));
const TERMS = [...GROUP_OF.keys()].sort((a, b) => b.length - a.length);
const TERM_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${TERMS.map(t => t.replace(/ /g, '\\s+').replace(/i/g, '[iı]')).join('|')})(?![\\p{L}])`, 'giu');
/** Yanıltıcı kullanımlar: önce metinden silinir. */
const NOISE_RE = /(alkolsüz|alkolsuz|non[-\s]?alcoholic|0[,.]0)\s+\p{L}+|(şarap|sarap)\s+sirkes\p{L}*|wine\s+vinegar|(cocktail|kokteyl)\s+(tomato|domates|sauce|sos)\p{L}*|kokteyl\s+(salon|organizasyon|davet|masa)\p{L}*|kokteyl\s+soslu?|bira\s+mayas\p{L}*|pizza\s+\p{L}+|(şarap|viski|rakı|bira)\s+sos\p{L}*|(wine|whiske?y|beer)\s+(sauce|glass\p{L}*)|(şarap|viski|rakı|bira)\s+(bardağ|kadehi?\s+seti)\p{L}*|fıçı\s+turşu\p{L}*|meyve\s+kokteyl\p{L}*|(şarap|wine|viski|bira|kokteyl|cocktail|alkol|bar)\s+(aksesuar|dola[pb]|kova|stand|raf|reyon|açaca|shaker|süzgeç|istasyon|ekipman|bardağ|kadeh|seti|mikser|mat|glass|rack|cooler|opener)\p{L}*/giu;
/** Çevrim içi mağaza: Türkiye'de internetten alkol satışı yasak, sepetli sitedeki içki sözcükleri ürün / aksesuar adıdır. */
const SHOP_RE = /sepete\s+ekle|add\s+to\s+cart|ücretsiz\s+kargo|kargo\s+bedava/iu;
/** Alkolsüz kokteyl bölümü olan sitede kokteyl sözcükleri kanıt sayılmaz. */
const MOCKTAIL_RE = /mocktail|alkolsüz\s+kokteyl|virgin\s+mojito/iu;
/** Açıkça alkolsüz olduğunu söyleyen mekan. */
const NEGATIVE_RE = /(alkolsüz\s+(mekan|kafe|cafe|restoran|aile)|alkol(lü içki)?\s+servis(i|imiz)?\s+(yok|bulunma|yapılma)|alkollü\s+içki\s+(bulunma|satıl?ma|servis edilme)|alkol\s+(bulunma|satılma)\p{L}*)/iu;
/** "Bu şubemizde alkol servisi yoktur": yalnızca o şubeyi ilgilendirir, zincirin tamamını değil. */
const BRANCH_RE = /şube(miz|mizde|sinde|de|lerimizde)?(?![\p{L}])/iu;
/** Şube ipucundan çıkarılan genel sözcükler (adres eşleştirmesinde yanıltmasın). */
const HINT_STOP = /^(tarihi|yanında|yakınında|karşısında|alması|olması|olduğu|dolayısıyla|nedeniyle|sebebiyle|itibaren|servisi|yapıl\p{L}*|bulun\p{L}*|satıl\p{L}*|edil\p{L}*|sadece|yalnızca|mekanımız|restoranımız|şube\p{L}*|bulunan|camii?|caminin|sokak|sokağı|cadde\p{L}*|mahalle\p{L}*|istanbul|alkol\p{L}*|içki\p{L}*|servis\p{L}*|hizmet\p{L}*|yoktur|değildir)$/u;
const MENU_LINK_RE = /men[uü]|mönü|drinks?|içecek|bar|carta|kokteyl|cocktail|wine|şarap/i;

function hostOf(u) {
    try { return new URL(u).host.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

async function get(url, ms = 9000, max = 1_500_000) {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5', 'accept-language': 'tr,en;q=0.7' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const type = r.headers.get('content-type') ?? '';
    if (!/html|json|text/.test(type)) return { text: '', url: r.url };
    const reader = r.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        chunks.push(value);
        if (size > max) { await reader.cancel(); break; }
    }
    return { text: new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks)), url: r.url };
}

async function allowedByRobots(origin) {
    try {
        const { text } = await get(origin + '/robots.txt', 5000, 200_000);
        // Basit yorum: "User-agent: *" bloğunda "Disallow: /" varsa (tamamen kapalı) atla
        const blocks = text.split(/\n(?=\s*user-agent)/i);
        for (const b of blocks) {
            if (!/user-agent:\s*(\*|pubskorbot)/i.test(b)) continue;
            if (/^\s*disallow:\s*\/\s*$/im.test(b)) return false;
        }
        return true;
    } catch { return true; }
}

function visibleText(html) {
    const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join(' ');
    const body = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
    const meta = [...html.matchAll(/<meta[^>]+content="([^"]{3,400})"/gi)].map(m => m[1]).join(' ');
    return `${meta} ${body} ${ld}`.toLocaleLowerCase('tr').replace(/\s+/g, ' ');
}

function menuLinks(html, base) {
    const out = [];
    for (const m of html.matchAll(/<a\b[^>]*href="([^"#][^"]*)"[^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
        const href = m[1], label = m[2].replace(/<[^>]+>/g, ' ');
        if (!MENU_LINK_RE.test(href) && !MENU_LINK_RE.test(label)) continue;
        if (/\.(pdf|jpe?g|png|webp)(\?|$)/i.test(href)) continue;
        try {
            const u = new URL(href, base);
            if (!/^https?:$/.test(u.protocol)) continue;
            const h = u.host.replace(/^www\./, '');
            if (SKIP_HOST.test(h)) continue;
            if (!out.includes(u.href)) out.push(u.href);
        } catch { /* geçersiz */ }
        if (out.length >= 2) break;
    }
    return out;
}

/** Metindeki farklı alkol terimleri ve açık "alkolsüz" beyanı. */
export function analyzeText(text) {
    const clean = text.replace(NOISE_RE, ' ');
    const found = new Set();
    for (const m of clean.matchAll(TERM_RE)) found.add(termKey(m[1].toLocaleLowerCase('tr').replace(/\s+/g, ' ')));
    if (MOCKTAIL_RE.test(text)) for (const t of [...found]) if (GROUP_OF.get(t) === 'kokteyl') found.delete(t);
    if (SHOP_RE.test(text)) found.clear();
    const neg = NEGATIVE_RE.exec(text);
    if (!neg) return { terms: [...found], negative: false };
    // Cümlenin başı: şube sözü geçiyorsa beyan yalnızca o şube için; yer adları ipucu olarak döner
    const start = Math.max(text.lastIndexOf('.', neg.index), text.lastIndexOf('!', neg.index), neg.index - 200) + 1;
    const sentence = text.slice(start, neg.index + neg[0].length);
    if (!BRANCH_RE.test(sentence)) return { terms: [...found], negative: true };
    const branch = [...new Set(sentence.match(/\p{L}{5,}/gu) ?? [])].filter(w => !HINT_STOP.test(w)).slice(0, 6);
    return { terms: [...found], negative: false, branch };
}

/**
 * Karar: -1 açıkça alkolsüz, 1 içki var, 0 bilinmiyor.
 * İçki var: en az iki farklı grup (kokteyl de sayılır) ya da kokteyl dışı bir grupta iki farklı terim.
 * Yalnızca "kokteyl / mojito" geçmesi yetmez.
 */
export function decide({ terms, negative }) {
    if (negative) return -1;
    const groups = new Map();
    for (const t of terms) {
        const g = GROUP_OF.get(termKey(t));
        if (g) groups.set(g, (groups.get(g) ?? 0) + 1);
    }
    if (groups.size >= 2) return 1;
    return [...groups].some(([g, n]) => g !== 'kokteyl' && n >= 2) ? 1 : 0;
}

/** Açılamayan site için denenecek diğer adresler: www'li / www'siz, sertifika hatasında http. */
function alternatives(url) {
    const u = new URL(url);
    const out = [u.href];
    const flip = new URL(u.href);
    flip.host = u.host.startsWith('www.') ? u.host.slice(4) : 'www.' + u.host;
    out.push(flip.href);
    if (u.protocol === 'https:') { const h = new URL(u.href); h.protocol = 'http:'; out.push(h.href); }
    return out;
}
const networkError = e => e?.message === 'fetch failed';

async function checkSite(url) {
    let home = null, lastError = null;
    for (const candidate of alternatives(url)) {
        try {
            if (!(await allowedByRobots(new URL(candidate).origin))) return { a: null, why: 'robots' };
            home = await get(candidate);
            break;
        } catch (e) {
            lastError = e;
            if (!networkError(e)) throw e;
        }
    }
    if (!home) throw lastError;
    let text = visibleText(home.text);
    for (const link of menuLinks(home.text, home.url)) {
        try { text += ' ' + visibleText((await get(link)).text); } catch { /* menü açılamadı */ }
    }
    const r = analyzeText(text);
    return { a: decide(r), t: r.terms.slice(0, 16), ...(r.branch?.length ? { nb: r.branch } : {}) };
}

/**
 * Siteleri kontrol eder. `sites`: Map<host, url>. Önbellekteki taze sonuçlar atlanır.
 * cache: { [host]: { a: 1|0|-1|null, t?: string[], nb?: string[], at: 'YYYY-MM-DD', why?: string } }
 * `nb`: "bu şubemizde alkol yok" beyanındaki yer sözcükleri (o şubeyi ayırmak için).
 */
/** Bu sonuçlar 90 gün boyunca yeniden denenmez (site kapalı ya da taranmak istemiyor); diğer hatalar her çalıştırmada denenir. */
const FINAL = new Set(['robots', 'unreachable', 'HTTP 404', 'HTTP 410']);

export async function checkSites(sites, cache, { concurrency = 16, maxAgeDays = 90, onProgress, save } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const stale = d => !d || (Date.parse(today) - Date.parse(d)) / 86_400_000 > maxAgeDays;
    const queue = [...sites].filter(([host]) => !SKIP_HOST.test(host) && (!cache[host] || stale(cache[host].at) || cache[host].a === null && !FINAL.has(cache[host].why)));
    let done = 0;
    const worker = async () => {
        while (queue.length) {
            const [host, url] = queue.shift();
            try { cache[host] = { ...(await checkSite(url)), at: today }; }
            catch (e) { cache[host] = { a: null, why: e?.name === 'TimeoutError' ? 'timeout' : networkError(e) ? 'unreachable' : String(e?.message ?? e).slice(0, 40), at: today }; }
            done++;
            if (done % 100 === 0) { onProgress?.(done, done + queue.length); await save?.(); }
        }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    await save?.();
    return done;
}

export const siteOf = list => (list ?? []).find(w => typeof w === 'string' && /^https?:\/\//i.test(w) && !SKIP_HOST.test(hostOf(w) ?? '')) ?? null;
export { hostOf };
