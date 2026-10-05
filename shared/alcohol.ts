// Alkollü içki servis eden mekan sınıflandırması. Pub Skor'un önerdiği, aradığı ve listelediği mekanlar
// yalnızca bunlar. Açık veride "alkol servisi" alanı olmadığından kategori + ad kurallarıyla tahmin edilir;
// hatalar kullanıcı bildirimiyle ayıklanır ("alkol servisi yok" → önerilerden düşer).
import type { VenueKind } from './metrics';

/** Önerilen mekan türleri: içki mekanları ve alkol servisi olan restoranlar (kafe ve "diğer" yok). */
export const ALCOHOL_KINDS: readonly VenueKind[] = ['pub', 'bar', 'kokteyl', 'meyhane', 'sarap', 'brewpub', 'restoran'];

/** Overture kategorisi → tür (yalnızca gece hayatı / içki mekanları). */
const NIGHT: Record<string, VenueKind> = {
    pub: 'pub', irish_pub: 'pub', gastropub: 'pub', beer_bar: 'pub', beer_garden: 'pub',
    brewery: 'brewpub',
    cocktail_bar: 'kokteyl', speakeasy: 'kokteyl', tiki_bar: 'kokteyl',
    wine_bar: 'sarap', winery: 'sarap',
    bar: 'bar', whiskey_bar: 'bar', hotel_bar: 'bar', dive_bar: 'bar', gay_bar: 'bar', sports_bar: 'bar', sake_bar: 'bar',
    beach_bar: 'bar', piano_bar: 'bar', lounge: 'bar', dance_club: 'bar', night_club: 'bar', music_venue: 'bar', karaoke_venue: 'bar',
    alcoholic_beverage_venue: 'bar'
};
const NIGHT_BASIC = new Set(['bar', 'lounge', 'alcoholic_beverage_venue']);
const RESTAURANT_BASIC = new Set(['restaurant', 'casual_eatery']);

// Sözcük sınırı Türkçe harfleri de tanısın diye \p{L} kullanılır ("Barınağı" bar değildir)
const w = (s: string) => `(?<![\\p{L}\\p{N}])(?:${s})(?![\\p{L}])`;

/** Adında içki geçen mekan: güçlü sözcükler tek başına yeter. */
const STRONG_NAME = new RegExp([
    'meyhane\\p{L}*', 'meyhani', 'tavern\\p{L}*', 'fas[ıi]l\\p{L}*', 'rak[ıi]', 'şarap\\p{L}*', 'sarap\\p{L}*', 'wine\\p{L}*', 'bira\\p{L}*',
    'beer\\p{L}*', 'brew\\p{L}*', 'pub', 'cocktail\\p{L}*', 'kokteyl\\p{L}*', 'bar', 'birahane\\p{L}*', 'pavyon\\p{L}*', 'muzikhol', 'müzikhol',
    'whisk(?:e)?y', 'viski', 'tequila', 'gin', 'shot house', 'türkü\\p{L}*', 'turku\\p{L}*', 'türkübar', 'turkubar'
].map(w).join('|'), 'iu');
/** Zayıf sözcükler (bistro, lounge…) yalnızca adında kafe / kahve yoksa sayılır ("Cafe Bistro" genelde alkolsüz). */
const WEAK_NAME = new RegExp(['bistro\\p{L}*', 'brasserie', 'gastro\\p{L}*', 'lounge'].map(w).join('|'), 'iu');
const CAFE_NAME = /cafe|kafe|cafee|cafeterya|kahve|coffee|pastane|tatlı|nargile/iu;

/** "Bar" adı taşıyan ama içki mekanı olmayan yerler (salata bar, süt bar…). */
const FOOD_BAR = /(salata|salad|juice|smoothie|süt|sut|kahve|coffee|espresso|waffle|dondurma|çorba|corba|kumpir|kahvaltı|kahvalti|meyve|fresh|protein|mantı|manti|börek|borek|pastane|tatlı|kebap|kebab|köfte|kofte|pide|döner|doner|lahmacun|tost|çiğ ?köfte|cig ?kofte|dürüm|durum|makarna|noodle|ramen|sushi)\s*(&\s*)?bar|bar\s*(&\s*)?(kahve|coffee)/iu;

/** İşletme olmayan ya da içki sunmayan kayıtlar (adresler, okullar, nargile ve çay ocakları, havalimanı salonları…). */
const NOT_VENUE = new RegExp([
    'market\\p{L}*', 'benzin', 'petrol', 'sağlık', 'saglik', 'hastane\\p{L}*', 'eczane\\p{L}*', 'okul\\p{L}*', 'lise\\p{L}*', 'üniversite\\p{L}*',
    'kültür merkezi', 'kultur merkezi', 'belediye\\p{L}*', 'mahalle\\p{L}*', 'mah\\.', 'cadde\\p{L}*', 'cad\\.', 'sokağı', 'sokak', 'sk\\.', 'apartman\\p{L}*',
    'sitesi', 'taksi', 'lazer', 'güzellik', 'kuaför\\p{L}*', 'berber\\p{L}*', 'folklor\\p{L}*', 'halk oyunları', 'prodüksiyon', 'production',
    'records?', 'kayıt stüdyo\\p{L}*', 'dans okulu', 'dans kursu', 'dance studio', 'akademi\\p{L}*', 'kurs\\p{L}*', 'airport', 'havaliman\\p{L}*',
    'business class', 'yolcu salonu', 'terminal', 'cip salonu', 'nargile\\p{L}*', 'hookah', 'shisha', 'çay bahçe\\p{L}*', 'cay bahce\\p{L}*',
    'çay ocağı', 'çay evi', 'kıraathane\\p{L}*', 'kiraathane\\p{L}*', 'aile çay\\p{L}*', 'tesisleri', 'derneği', 'dernek', 'cami\\p{L}*', 'mescit',
    'iga lounge', 'turkish airlines', 'hotel lobby', 'tekel\\p{L}*', 'bayi\\p{L}*', 'şarküteri\\p{L}*', 'büfe\\p{L}*', 'ltd', 'şti', 'san\\.', 'tic\\.',
    'a\\.ş', 'konut\\p{L}*', 'inşaat\\p{L}*', 'dekorasyon\\p{L}*', 'mobilya\\p{L}*', 'catering', 'organizasyon\\p{L}*', 'services?', 'hizmet\\p{L}*',
    'tv', 'stüdyo\\p{L}*', 'studyo\\p{L}*', 'studio', 'showroom', 'avm', 'plaza', 'otopark\\p{L}*', 'istasyon\\p{L}*', 'yolu', 'köyü', 'koyu', 'karakol\\p{L}*',
    'aile sağlık', 'spor salonu', 'fitness', 'düğün salonu', 'dugun salonu', 'nikah\\p{L}*', 'salonu', 'stadyum\\p{L}*', 'çeşme\\p{L}*',
    'tepesi', 'sokagi', 'beauty', 'güvenlik', 'guvenlik', 'kuyumcu\\p{L}*', 'emlak\\p{L}*', 'otel lobi\\p{L}*', 'vip lounge',
    'metal', 'turşu\\p{L}*', 'rental', 'kiralama', 'company', 'digital', 'dijital', 'energy drink', 'aeropuerto', 'traslado', 'transfer',
    'ofis\\p{L}*', 'office', 'însaat', 'gıda', 'gida', 'yapı', 'yapi', 'çiftli\\p{L}*', 'ciftli\\p{L}*', 'dağ evi', 'dag evi', 'kilise\\p{L}*',
    'church', 'eksarh\\p{L}*', 'pos', 'teknoloji', 'bilişim', 'elektrik\\p{L}*', 'oto', 'tamir\\p{L}*', 'nakliyat', 'lojistik',
    'kırtasiye', 'eczacı', 'veteriner', 'ajans\\p{L}*', 'agency', 'events?', 'organization',
    'danışman\\p{L}*', 'danisman\\p{L}*', 'consult\\p{L}*', 'mağaza\\p{L}*', 'magaza\\p{L}*', 'store'
].map(w).join('|'), 'iu');

/** Balık restoranı: yalnızca restoran/meyhane olanlar (midyeci, balık ekmek, balıkçı dükkânı değil). */
const FISH_OK = new RegExp(['restoran\\p{L}*', 'restaurant', 'lokanta\\p{L}*', 'meyhane\\p{L}*', 'fas[ıi]l\\p{L}*', 'rak[ıi]', 'taverna'].map(w).join('|'), 'iu');
const FISH_WORD = /balık|balik|fish|deniz|meyhane|fasıl|fasil|rakı|raki|taverna|balıkçısı/iu;
const FISH_NO = /midye|balıkçılık|balikcilik|ekmek|dürüm|durum|büfe|bufe|kokoreç|kokorec|market|tesis/iu;

/** İçki sözcüğü yoksa işletme olmadığını düşündüren sözcükler ("Gorele Park"; "Park Pub" ise kalır). */
const SOFT_NOT = new RegExp(['park\\p{L}*', 'bahçe\\p{L}*', 'tesis\\p{L}*', 'konağı', 'evi', 'merkez\\p{L}*', 'start'].map(w).join('|'), 'iu');

export const hasAlcoholName = (name: string) =>
    !FOOD_BAR.test(name) && (STRONG_NAME.test(name) || (WEAK_NAME.test(name) && !CAFE_NAME.test(name)));
export const isNotVenue = (name: string) => NOT_VENUE.test(name);

const MEYHANE_NAME = new RegExp(['meyhane\\p{L}*', 'meyhani', 'tavern\\p{L}*', 'fas[ıi]l\\p{L}*', 'rak[ıi]', 'birahane\\p{L}*'].map(w).join('|'), 'iu');

/**
 * Açık veri kaydını sınıflandırır: alkol servisi olan bir mekansa Pub Skor türünü, değilse null döner.
 * `primary`: Overture taxonomy.primary, `basic`: basic_category.
 */
export function classifyAlcohol(p: { primary: string | null; basic: string | null; name: string }): VenueKind | null {
    const name = p.name;
    if (!name || isNotVenue(name) || FOOD_BAR.test(name)) return null;
    const primary = p.primary ?? '';
    if (primary === 'hookah_bar' || primary === 'airport_lounge' || primary === 'salsa_club' || primary === 'distillery') return null;
    const night = NIGHT[primary] ?? (NIGHT_BASIC.has(p.basic ?? '') ? 'bar' : null);
    if (night) {
        if (MEYHANE_NAME.test(name)) return 'meyhane';
        // Lounge ve "bira bahçesi" kategorileri bu veride karışık (nargile salonları, parklar…): adı içki mekanı demeli
        if ((primary === 'lounge' || p.basic === 'lounge' || primary === 'beer_garden') && !hasAlcoholName(name)) return null;
        // Kafe / kahve adlı ama adında hiç içki sözcüğü olmayanlar (yanlış kategori; istisnalar overrides.json'da)
        if (CAFE_NAME.test(name) && !hasAlcoholName(name)) return null;
        if (SOFT_NOT.test(name) && !STRONG_NAME.test(name)) return null;
        // Canlı müzik ve dans kulüpleri: adı bir mekan olduğunu söylemeli (müzik şirketleri, dans okulları değil)
        if ((primary === 'music_venue' || primary === 'dance_club') && !hasAlcoholName(name) && !/club|kulüp|klub|live|canlı|sahne|stage|hall|türkü|muzikhol|müzikhol/iu.test(name)) return null;
        return night;
    }
    if (primary === 'seafood_restaurant') {
        if (FISH_NO.test(name) || !FISH_OK.test(name) || !FISH_WORD.test(name)) return null;
        return MEYHANE_NAME.test(name) ? 'meyhane' : 'restoran';
    }
    if (RESTAURANT_BASIC.has(p.basic ?? '') || primary.endsWith('_restaurant') || primary === 'restaurant') {
        if (!hasAlcoholName(name)) return null;
        if (MEYHANE_NAME.test(name)) return 'meyhane';
        if (/wine|şarap|sarap/iu.test(name)) return 'sarap';
        if (/pub|bira|beer|brew|birahane/iu.test(name)) return 'pub';
        if (/cocktail|kokteyl/iu.test(name)) return 'kokteyl';
        return 'restoran';
    }
    return null;
}

/** OpenStreetMap amenity değeri içki mekanı mı (İstanbul dışı yedek arama için). */
export const isAlcoholOsm = (amenity: string, name: string) =>
    ['pub', 'bar', 'biergarten', 'nightclub', 'brewery'].includes(amenity) || (amenity === 'restaurant' && hasAlcoholName(name));
