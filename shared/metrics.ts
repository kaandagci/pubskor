// Değerlendirme kriterleri. İstemci ve sunucu bu tek kataloğu kullanır.
//
// Yapı: her ziyarette ortak MEKAN kriterleri (servis, mekan, hijyen) puanlanır; üstüne masada ne
// içildiği/yendiğine göre MODÜLLER eklenir (bira, kokteyl, şarap, rakı & sert içki, alkolsüz, yemek).
// Ziyaret, puanladığı kriterlerin listesini kendisi saklar; böylece katalog büyüse de eski ziyaretler bozulmaz.
// v7 kriter kimlikleri aynen korunmuştur.

export const GROUPS = [
    { id: 'bira', label: 'Bira', module: true },
    { id: 'kokteyl', label: 'Kokteyl', module: true },
    { id: 'sarap', label: 'Şarap', module: true },
    { id: 'sert', label: 'Rakı & sert içki', module: true },
    { id: 'alkolsuz', label: 'Alkolsüz', module: true },
    { id: 'yemek', label: 'Yemek & meze', module: true },
    { id: 'servis', label: 'Servis', module: false },
    { id: 'mekan', label: 'Mekan', module: false },
    { id: 'hijyen', label: 'Hijyen', module: false }
] as const;

export type GroupId = (typeof GROUPS)[number]['id'];
export type KindId = Extract<GroupId, 'bira' | 'kokteyl' | 'sarap' | 'sert' | 'alkolsuz' | 'yemek'>;

/** "Ne içtiniz / yediniz?" seçenekleri. */
export const KINDS = GROUPS.filter(g => g.module) as readonly { id: KindId; label: string; module: true }[];
export const KIND_IDS: readonly KindId[] = KINDS.map(k => k.id);
export const isKindId = (v: unknown): v is KindId => typeof v === 'string' && (KIND_IDS as readonly string[]).includes(v);
export const GROUP_LABEL = Object.fromEntries(GROUPS.map(g => [g.id, g.label])) as Record<GroupId, string>;

export interface Metric {
    id: string;
    label: string;
    short: string;
    hint: string;
    weight: number;
    group: GroupId;
}

export const METRICS = [
    // --- Ortak: servis ---
    { id: 'service_speed', label: 'Servis hızı & ilgi', short: 'Servis', weight: 12, group: 'servis', hint: 'Sipariş ne kadar çabuk geldi, personel ilgili ve bilgili miydi?' },
    { id: 'price_transparency', label: 'Fiyat / performans', short: 'Fiyat', weight: 12, group: 'servis', hint: 'Fiyatının karşılığını veriyor mu, hesapta sürpriz var mı?' },
    { id: 'snacks_food', label: 'İkram & çerez', short: 'İkram', weight: 4, group: 'servis', hint: 'Masaya kendiliğinden gelen ikram, çerez ya da atıştırmalık.' },
    // --- Ortak: mekan ---
    { id: 'acoustics_talk', label: 'Akustik & sohbet', short: 'Akustik', weight: 8, group: 'mekan', hint: 'Bağırmadan sohbet edilebiliyor mu?' },
    { id: 'interior_design', label: 'İç mekan & oturma', short: 'İç mekan', weight: 8, group: 'mekan', hint: 'Oturma düzeni, dekor, masalar arası mesafe.' },
    { id: 'ambiance_air', label: 'Ambiyans, müzik & hava', short: 'Ambiyans', weight: 8, group: 'mekan', hint: 'Işık, müzik seçimi, havalandırma ve duman.' },
    { id: 'vibe_comfort', label: 'Vibe & rahatlık', short: 'Vibe', weight: 6, group: 'mekan', hint: 'İnsanı rahat ve iyi hissettiren bir ortam mı?' },
    // --- Ortak: hijyen ---
    { id: 'restroom_queue', label: 'Tuvalet sırası', short: 'WC sırası', weight: 4, group: 'hijyen', hint: 'Sıra bekletiyor mu, kapasite yeterli mi?' },
    { id: 'restroom_hygiene', label: 'Tuvalet & genel hijyen', short: 'Hijyen', weight: 7, group: 'hijyen', hint: 'Tuvalet, masalar ve bardakların temizliği.' },
    // --- Bira ---
    { id: 'beer_temp_gas', label: 'Bira sıcaklığı & gaz', short: 'Sıcaklık', weight: 10, group: 'bira', hint: 'Bira yeterince soğuk mu, gazı ve köpüğü dengeli mi?' },
    { id: 'draft_lacing', label: 'Fıçı tazeliği & köpük', short: 'Fıçı', weight: 10, group: 'bira', hint: 'Fıçı taze mi, bardakta köpük izi (lacing) kalıyor mu?' },
    { id: 'beer_selection', label: 'Bira çeşitliliği', short: 'Bira seçkisi', weight: 6, group: 'bira', hint: 'Fıçı ve şişe seçenekleri, yerel/zanaat biralar.' },
    // --- Kokteyl ---
    { id: 'cocktail_taste', label: 'Kokteyl denge & lezzet', short: 'Kokteyl tadı', weight: 12, group: 'kokteyl', hint: 'Tatlı-ekşi-sert dengesi yerinde mi, tarifine sadık mı?' },
    { id: 'cocktail_craft', label: 'Hazırlık & sunum', short: 'Sunum', weight: 8, group: 'kokteyl', hint: 'Buz kalitesi, bardak, garnitür ve ölçü özeni.' },
    { id: 'cocktail_menu', label: 'Menü & yaratıcılık', short: 'Kokteyl menüsü', weight: 6, group: 'kokteyl', hint: 'Klasikler ve imza kokteyller; menü ilgi çekici mi?' },
    // --- Şarap ---
    { id: 'wine_selection', label: 'Şarap seçkisi', short: 'Şarap seçkisi', weight: 10, group: 'sarap', hint: 'Kadehle seçenekler, yerel üreticiler, fiyat aralığı.' },
    { id: 'wine_service', label: 'Şarap servisi', short: 'Şarap servisi', weight: 8, group: 'sarap', hint: 'Servis sıcaklığı, kadeh, şişe açılışı ve öneri bilgisi.' },
    // --- Rakı & sert içki ---
    { id: 'spirit_selection', label: 'Rakı & sert içki seçkisi', short: 'Sert seçkisi', weight: 8, group: 'sert', hint: 'Rakı, viski, cin, tekila… çeşit ve kalite.' },
    { id: 'spirit_service', label: 'Sert içki servisi', short: 'Sert servisi', weight: 10, group: 'sert', hint: 'Soğukluk, buz ve su servisi, ölçü, bardak.' },
    // --- Alkolsüz ---
    { id: 'nonalc_options', label: 'Alkolsüz seçenekler', short: 'Alkolsüz', weight: 8, group: 'alkolsuz', hint: 'Mocktail, ev yapımı içecekler, alkolsüz bira/şarap; içmeyenler de mutlu mu?' },
    // --- Yemek ---
    { id: 'food_taste', label: 'Yemek lezzeti', short: 'Lezzet', weight: 14, group: 'yemek', hint: 'Yemekler ve mezeler lezzetli, taze ve doğru pişmiş mi?' },
    { id: 'food_variety', label: 'Menü & meze çeşitliliği', short: 'Menü', weight: 6, group: 'yemek', hint: 'Seçenekler yeterli mi; vejetaryen/vegan seçenek var mı?' },
    { id: 'food_portion', label: 'Porsiyon & sunum', short: 'Porsiyon', weight: 6, group: 'yemek', hint: 'Porsiyonlar fiyatına göre doyurucu ve özenli mi?' }
] as const satisfies readonly Metric[];

export type MetricId = (typeof METRICS)[number]['id'];

export const METRIC_IDS: readonly MetricId[] = METRICS.map(m => m.id);
export const METRIC_BY_ID = Object.fromEntries(METRICS.map(m => [m.id, m])) as Record<MetricId, (typeof METRICS)[number]>;
export const isMetricId = (v: unknown): v is MetricId => typeof v === 'string' && v in METRIC_BY_ID;

/** Her ziyarette puanlanan ortak kriterler. */
export const CORE_METRICS: readonly MetricId[] = METRICS.filter(m => !(KIND_IDS as readonly string[]).includes(m.group)).map(m => m.id);

/** v7'de puanlanan 11 kriter (eski kayıtların dönüştürülmesi için). */
export const LEGACY_METRICS: readonly MetricId[] = [
    'beer_temp_gas', 'draft_lacing', 'service_speed', 'price_transparency', 'acoustics_talk',
    'interior_design', 'ambiance_air', 'restroom_queue', 'restroom_hygiene', 'snacks_food', 'vibe_comfort'
];

/** Katalog sırasında, tekrarsız kriter listesi. */
export const orderMetrics = (ids: Iterable<string>): MetricId[] => {
    const set = new Set(ids);
    return METRIC_IDS.filter(id => set.has(id));
};

/** Kriterin bu ziyaretteki payı (%): ağırlıklar yalnızca puanlanan kriterler arasında bölüşülür. */
export function weightShare(id: MetricId, metrics: readonly MetricId[]): number {
    const total = metrics.reduce((sum, x) => sum + (METRIC_BY_ID[x]?.weight ?? 0), 0);
    return total ? Math.round((METRIC_BY_ID[id].weight / total) * 100) : 0;
}

/** Seçilen içki/yemek türlerine göre varsayılan kriterler. */
export function metricsFor(kinds: readonly KindId[]): MetricId[] {
    const k = new Set<string>(kinds);
    return METRICS.filter(m => !(KIND_IDS as readonly string[]).includes(m.group) || k.has(m.group)).map(m => m.id);
}

/** Kriter listesinden türleri çıkarır (eski kayıtlar ya da tür bilgisi olmayan ziyaretler için). */
export function kindsOf(metrics: readonly MetricId[]): KindId[] {
    const groups = new Set(metrics.map(id => METRIC_BY_ID[id].group));
    return KIND_IDS.filter(k => groups.has(k));
}

// ----- Mekan türleri -----

export const VENUE_KINDS = [
    { id: 'pub', label: 'Pub', kinds: ['bira'] },
    { id: 'bar', label: 'Bar', kinds: ['bira', 'kokteyl'] },
    { id: 'kokteyl', label: 'Kokteyl bar', kinds: ['kokteyl'] },
    { id: 'meyhane', label: 'Meyhane', kinds: ['sert', 'yemek'] },
    { id: 'sarap', label: 'Şarap evi', kinds: ['sarap', 'yemek'] },
    { id: 'brewpub', label: 'Bira fabrikası', kinds: ['bira', 'yemek'] },
    { id: 'restoran', label: 'Restoran', kinds: ['yemek'] },
    { id: 'kafe', label: 'Kafe', kinds: ['alkolsuz', 'yemek'] },
    { id: 'diger', label: 'Diğer', kinds: ['bira'] }
] as const satisfies readonly { id: string; label: string; kinds: readonly KindId[] }[];

export type VenueKind = (typeof VENUE_KINDS)[number]['id'];
export const isVenueKind = (v: unknown): v is VenueKind => typeof v === 'string' && VENUE_KINDS.some(k => k.id === v);
export const venueKindLabel = (k: string | null | undefined) => VENUE_KINDS.find(x => x.id === k)?.label ?? '';
export const defaultKindsFor = (k: string | null | undefined): KindId[] => [...(VENUE_KINDS.find(x => x.id === k)?.kinds ?? ['bira'])];

/** OSM etiketinden mekan türü tahmini. */
export function venueKindFromOsm(amenity: string): VenueKind {
    switch (amenity) {
        case 'pub': case 'biergarten': return 'pub';
        case 'bar': case 'nightclub': return 'bar';
        case 'brewery': return 'brewpub';
        case 'restaurant': return 'restoran';
        case 'cafe': return 'kafe';
        default: return 'diger';
    }
}

// ----- Mekan özellik etiketleri -----

export const VENUE_TAGS = [
    { id: 'canli_muzik', label: 'Canlı müzik' },
    { id: 'teras', label: 'Bahçe / teras' },
    { id: 'mac', label: 'Maç yayını' },
    { id: 'manzara', label: 'Manzara' },
    { id: 'sigara', label: 'Sigara alanı' },
    { id: 'evcil', label: 'Evcil hayvan dostu' },
    { id: 'rezervasyon', label: 'Rezervasyon gerekli' },
    { id: 'gec', label: 'Geç saate kadar açık' },
    { id: 'dans', label: 'Dans edilebilir' },
    { id: 'sakin', label: 'Sakin' },
    { id: 'kalabalik', label: 'Kalabalık' },
    { id: 'grup', label: 'Kalabalık gruba uygun' },
    { id: 'vejetaryen', label: 'Vejetaryen dostu' },
    { id: 'erisilebilir', label: 'Engelli erişimi' }
] as const;

export type VenueTag = (typeof VENUE_TAGS)[number]['id'];
export const isVenueTag = (v: unknown): v is VenueTag => typeof v === 'string' && VENUE_TAGS.some(t => t.id === v);
export const tagLabel = (t: string) => VENUE_TAGS.find(x => x.id === t)?.label ?? t;

// ----- Puan sözcükleri ve kademeler -----

/** Puan etiketi: puanlama ekranında seçilen değerin altında görünür. */
export function scoreWord(v: number): string {
    if (v >= 10) return 'Kusursuz';
    if (v >= 9) return 'Mükemmel';
    if (v >= 7) return 'İyi';
    if (v >= 5) return 'Eh işte';
    if (v >= 3) return 'Kötü';
    return 'Berbat';
}

export interface Tier {
    id: 'legend' | 'great' | 'ok' | 'weak' | 'skip' | 'none';
    label: string;
    min: number;
}

export const TIERS: readonly Tier[] = [
    { id: 'legend', label: 'Efsane', min: 8.5 },
    { id: 'great', label: 'Çok iyi', min: 7 },
    { id: 'ok', label: 'İdare eder', min: 5.5 },
    { id: 'weak', label: 'Zayıf', min: 4 },
    { id: 'skip', label: 'Uğrama', min: 0 }
];

export function tierOf(score: number | null | undefined): Tier {
    if (score == null || Number.isNaN(score)) return { id: 'none', label: 'Puansız', min: 0 };
    return TIERS.find(t => score >= t.min) ?? TIERS[TIERS.length - 1];
}
