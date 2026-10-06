// Topluluk: ekiplerin mekan puanları herkese açık akışta ve sıralamada görünür (istemci + sunucu).
//
// Herkese açık olan YALNIZCA: kataloğa bağlı mekan, ziyaretin günü, ziyaretin genel skoru ve ekibin adı
// (kurucu "ekip adıyla" seçtiyse ve ad kurallara uyuyorsa) ya da ekibe özel bir takma ad. Kişi adları, puan
// kağıtları, içki kriterleri, notlar, fotoğraflar, sipariş defteri, harcama ve saat hiçbir zaman paylaşılmaz.
// Yeni puanlar birkaç saat gecikmeyle görünür: bir ekibin o an nerede olduğu anlaşılmasın.
import type { VenueKind } from './metrics';
import { foldKey } from './text';

export type PublicMode = 'named' | 'anon' | 'off';
export const PUBLIC_MODES: readonly PublicMode[] = ['named', 'anon', 'off'];
export const isPublicMode = (v: unknown): v is PublicMode => typeof v === 'string' && (PUBLIC_MODES as readonly string[]).includes(v);

/** Yeni bir puan herkese bu kadar süre sonra görünür (ekibin kendisi hemen görür). */
export const PUBLIC_DELAY_MS = 3 * 3600_000;
export const PUBLIC_DELAY_LABEL = '3 saat';

/** Ekibin topluluktaki görünümü. Eski "anonim katkı kapalı" ayarı kapalı sayılır; varsayılan takma ad. */
export function publicModeOf(c: { publicMode?: PublicMode | null; shareStats?: boolean }): PublicMode {
    if (isPublicMode(c.publicMode)) return c.publicMode;
    return c.shareStats === false ? 'off' : 'anon';
}

// ----- Takma ad -----

const ALIAS_ADJ = [
    'Mavi', 'Turuncu', 'Mor', 'Yeşil', 'Kırmızı', 'Sarı', 'Lacivert', 'Gri', 'Pembe', 'Turkuaz', 'Bordo', 'Beyaz',
    'Neşeli', 'Sakin', 'Meraklı', 'Rüzgârlı', 'Gezgin', 'Uykusuz', 'Hızlı', 'Ağırbaşlı', 'Cesur', 'Sessiz', 'Keyifli', 'Dalgın'
];
const ALIAS_NOUN = [
    'Martılar', 'Vapurlar', 'Yunuslar', 'Kediler', 'Fenerler', 'Kumrular', 'Dalgalar', 'Yelkenliler', 'Erguvanlar', 'Lodoslar',
    'Kuleler', 'Köprüler', 'Baykuşlar', 'Leylekler', 'Sincaplar', 'Tilkiler', 'Kirpiler', 'Pelikanlar', 'Flamingolar',
    'Serçeler', 'Papağanlar', 'Kaplumbağalar', 'Karabataklar', 'Palamutlar'
];

function fnv(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}

/** Ekibe özel, değişmeyen takma ad ("Mavi Martılar"). Ekip adından türetilmez; ad değişse de aynı kalır. */
export function aliasFor(seed: string): string {
    const h = fnv('alias:' + seed);
    return `${ALIAS_ADJ[h % ALIAS_ADJ.length]} ${ALIAS_NOUN[Math.floor(h / ALIAS_ADJ.length) % ALIAS_NOUN.length]}`;
}

// ----- Ekip adının herkese açık gösterilebilirliği -----
// Ad yalnızca topluluk görünümünde kontrol edilir; uymazsa ekip içinde aynen kalır, toplulukta takma ad görünür.

/** Kelimenin kendisi yasak (kısa ve başka kelimelerin içinde geçebilen sözcükler). */
const BAN_WORDS = new Set([
    'amk', 'aq', 'amq', 'mk', 'sik', 'got', 'pic', 'ibne', 'oc', 'cin', 'ot', 'shot', 'bok',
    'efes', 'corona', 'miller', 'becks', 'stella', 'bud'
]);
/** Bu köklerle başlayan kelimeler yasak (çekimli hâlleri de yakalansın: "biracılar", "rakıcılar"). */
const BAN_STEMS = [
    // hakaret ve müstehcenlik
    'amina', 'amcik', 'sikis', 'sikti', 'siker', 'sikik', 'yarra', 'yarak', 'orosp', 'orosb', 'pezeven', 'gavat', 'godos', 'gotver',
    'kahpe', 'surtuk', 'kaltak', 'yavsak', 'serefsiz', 'dalyara', 'tasak', 'anani', 'avradin', 'pust',
    // alkollü içki ve tüketime özendirme (4250 s. K. m.6)
    'bira', 'raki', 'sarap', 'viski', 'whisk', 'votka', 'vodka', 'tekila', 'tequila', 'likor', 'alkol', 'icki', 'sarhos', 'cakirkeyf',
    'kokteyl', 'cocktail', 'mojito', 'margarita', 'negroni', 'beer', 'wine', 'booze', 'drunk',
    // içki markaları
    'tuborg', 'carlsberg', 'heineken', 'guinness', 'budweiser', 'leffe', 'hoegaarden', 'erdinger', 'paulaner', 'jameson',
    'chivas', 'johnnie', 'daniels', 'absolut', 'smirnoff', 'bacardi', 'jager', 'baileys', 'doluca', 'kavaklidere',
    // kumar, uyuşturucu
    'kumar', 'bahis', 'uyustur', 'esrar', 'kokain', 'eroin'
];
/** Yasak köklerle başlayan ama masum kelimeler ("biraz", "birader", "rakip"). */
const ALLOW_PREFIX = ['biraz', 'birader', 'birara', 'rakip'];
/** Boşluksuz yazılınca da yakalanan marka adları ("YeniRakı", "Jack-Daniels"). */
const BAN_JOINED = ['yenirak', 'jackdaniel', 'johnniewalk', 'stellaartois', 'efespils', 'efesmalt'];

/** Ekip adı toplulukta gösterilebilir mi: hakaret, içki ya da marka adı, iletişim bilgisi içermemeli. */
export function publicNameOk(name: string): boolean {
    const raw = name.trim();
    if (raw.length < 2) return false;
    if (/@|https?:|www\.|\.com\b|\.net\b|\.org\b/i.test(raw)) return false;
    if (/\d[\d\s-]{6,}\d/.test(raw)) return false; // telefon numarası
    const words = foldKey(raw).split(' ').filter(Boolean);
    const joined = words.join('');
    const banned = (w: string) => BAN_WORDS.has(w) || (BAN_STEMS.some(s => w.startsWith(s)) && !ALLOW_PREFIX.some(a => w.startsWith(a)));
    if (words.some(banned)) return false;
    return !BAN_JOINED.some(s => joined.includes(s));
}

// ----- API biçimleri -----

export interface PublicCrew {
    /** Gösterilecek ad: ekip adı ya da takma ad. */
    label: string;
    /** Takma ad mı (ekip adı gizli). */
    anon: boolean;
    /** İsteği yapanın ekiplerinden biri mi. */
    mine?: boolean;
}

export interface PublicPlaceInfo {
    placeId: string;
    name: string;
    kind: VenueKind;
    district: string;
    lat: number;
    lng: number;
}

export interface PublicVisit extends PublicPlaceInfo {
    id: string;
    score: number;
    /** Ziyaretin günü (YYYY-AA-GG; saat yok). */
    date: string;
    crew: PublicCrew;
}

export interface PublicFeed {
    items: PublicVisit[];
    /** Sonraki sayfa için; yoksa null. */
    next: number | null;
}

export interface PublicRankItem extends PublicPlaceInfo {
    /** Ekip ortalamalarının ortalaması: çok giden tek ekip sonucu tek başına belirlemesin. */
    score: number;
    crews: number;
    visits: number;
    last: string;
}

export interface PublicPlaceView {
    placeId: string;
    score: number | null;
    crews: number;
    visits: number;
    /** Ekip başına son puan ve ortalama, yeniden eskiye. */
    byCrew: { crew: PublicCrew; avg: number; visits: number; last: string; lastScore: number }[];
}

export interface Recommendation extends PublicPlaceInfo {
    /** Zevkinize yakın ekiplerin puanlarından tahmin. */
    predicted: number;
    /** Topluluk ortalaması. */
    avg: number;
    crews: number;
    /** Puanlayanlar arasında zevki sizinkine benzeyen ekip sayısı. */
    similar: number;
}

export interface Recommendations {
    items: Recommendation[];
    /** Karşılaştırılabilen (ortak mekanı olan) ekip sayısı. */
    compared: number;
    /** Ekibin puanladığı kataloğa bağlı mekan sayısı. */
    rated: number;
}
