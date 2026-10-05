// İstanbul ilçeleri ve gece hayatı semtleri (yaklaşık merkez koordinatları).
// Katalogda ilçe adı eksik olduğunda en yakın merkeze göre atanır; Keşfet ekranında semt seçimi için kullanılır.
import { foldKey } from './text';

export interface District { id: string; name: string; lat: number; lng: number; side: 'avrupa' | 'anadolu' }
export interface Hood { id: string; name: string; district: string; lat: number; lng: number }

const d = (name: string, lat: number, lng: number, side: District['side']): District => ({ id: foldKey(name).replace(/ /g, '-'), name, lat, lng, side });

export const DISTRICTS: District[] = [
    d('Adalar', 40.866, 29.106, 'anadolu'),
    d('Arnavutköy', 41.185, 28.740, 'avrupa'),
    d('Ataşehir', 40.989, 29.112, 'anadolu'),
    d('Avcılar', 40.980, 28.718, 'avrupa'),
    d('Bağcılar', 41.039, 28.856, 'avrupa'),
    d('Bahçelievler', 41.002, 28.860, 'avrupa'),
    d('Bakırköy', 40.981, 28.875, 'avrupa'),
    d('Başakşehir', 41.093, 28.802, 'avrupa'),
    d('Bayrampaşa', 41.046, 28.903, 'avrupa'),
    d('Beşiktaş', 41.043, 29.007, 'avrupa'),
    d('Beykoz', 41.134, 29.096, 'anadolu'),
    d('Beylikdüzü', 40.982, 28.640, 'avrupa'),
    d('Beyoğlu', 41.034, 28.978, 'avrupa'),
    d('Büyükçekmece', 41.020, 28.585, 'avrupa'),
    d('Çatalca', 41.143, 28.461, 'avrupa'),
    d('Çekmeköy', 41.033, 29.178, 'anadolu'),
    d('Esenler', 41.043, 28.876, 'avrupa'),
    d('Esenyurt', 41.028, 28.672, 'avrupa'),
    d('Eyüpsultan', 41.048, 28.934, 'avrupa'),
    d('Fatih', 41.014, 28.954, 'avrupa'),
    d('Gaziosmanpaşa', 41.060, 28.912, 'avrupa'),
    d('Güngören', 41.019, 28.872, 'avrupa'),
    d('Kadıköy', 40.988, 29.036, 'anadolu'),
    d('Kağıthane', 41.081, 28.973, 'avrupa'),
    d('Kartal', 40.889, 29.189, 'anadolu'),
    d('Küçükçekmece', 41.000, 28.780, 'avrupa'),
    d('Maltepe', 40.935, 29.130, 'anadolu'),
    d('Pendik', 40.877, 29.235, 'anadolu'),
    d('Sancaktepe', 41.002, 29.231, 'anadolu'),
    d('Sarıyer', 41.167, 29.052, 'avrupa'),
    d('Silivri', 41.074, 28.247, 'avrupa'),
    d('Sultanbeyli', 40.968, 29.262, 'anadolu'),
    d('Sultangazi', 41.106, 28.867, 'avrupa'),
    d('Şile', 41.175, 29.612, 'anadolu'),
    d('Şişli', 41.060, 28.987, 'avrupa'),
    d('Tuzla', 40.816, 29.300, 'anadolu'),
    d('Ümraniye', 41.016, 29.124, 'anadolu'),
    d('Üsküdar', 41.026, 29.015, 'anadolu'),
    d('Zeytinburnu', 40.994, 28.904, 'avrupa')
];

const h = (name: string, district: string, lat: number, lng: number): Hood => ({ id: foldKey(name).replace(/ /g, '-'), name, district, lat, lng });

/** Gece hayatının yoğun olduğu semtler (Keşfet'te hızlı seçim). */
export const HOODS: Hood[] = [
    h('Moda', 'Kadıköy', 40.9830, 29.0262),
    h('Kadıköy Çarşı', 'Kadıköy', 40.9905, 29.0255),
    h('Kadife Sokak', 'Kadıköy', 40.9858, 29.0290),
    h('Yeldeğirmeni', 'Kadıköy', 40.9950, 29.0310),
    h('Bağdat Caddesi', 'Kadıköy', 40.9640, 29.0700),
    h('Karaköy', 'Beyoğlu', 41.0240, 28.9770),
    h('Galata', 'Beyoğlu', 41.0262, 28.9742),
    h('Asmalımescit', 'Beyoğlu', 41.0310, 28.9750),
    h('Nevizade', 'Beyoğlu', 41.0360, 28.9780),
    h('Cihangir', 'Beyoğlu', 41.0320, 28.9830),
    h('Taksim', 'Beyoğlu', 41.0369, 28.9850),
    h('Beşiktaş Çarşı', 'Beşiktaş', 41.0430, 29.0050),
    h('Ortaköy', 'Beşiktaş', 41.0480, 29.0270),
    h('Arnavutköy', 'Beşiktaş', 41.0670, 29.0430),
    h('Bebek', 'Beşiktaş', 41.0770, 29.0430),
    h('Nişantaşı', 'Şişli', 41.0510, 28.9930),
    h('Bomonti', 'Şişli', 41.0590, 28.9800),
    h('Kurtuluş', 'Şişli', 41.0533, 28.9787),
    h('Kuzguncuk', 'Üsküdar', 41.0360, 29.0310),
    h('Kumkapı', 'Fatih', 41.0040, 28.9640),
    h('Bakırköy Çarşı', 'Bakırköy', 40.9790, 28.8720)
];

/** Konum yokken haritanın ve listelerin merkezi (Taksim). */
export const ISTANBUL_CENTER = { lat: 41.0369, lng: 28.9850 };

/** Kataloğun kapsadığı alan (kaba sınır kutusu). */
export const ISTANBUL_BBOX = { minLat: 40.80, maxLat: 41.60, minLng: 27.97, maxLng: 29.95 };

export const inIstanbul = (lat: number, lng: number) =>
    lat >= ISTANBUL_BBOX.minLat && lat <= ISTANBUL_BBOX.maxLat && lng >= ISTANBUL_BBOX.minLng && lng <= ISTANBUL_BBOX.maxLng;

const BY_KEY = new Map<string, District>();
for (const x of DISTRICTS) BY_KEY.set(foldKey(x.name), x);
BY_KEY.set('eyup', DISTRICTS.find(x => x.name === 'Eyüpsultan')!);

/** Metinden ("Kadıköy, İstanbul", "kadikoy") ilçeyi bulur. */
export function districtFromText(text: string | null | undefined): District | null {
    if (!text) return null;
    const key = foldKey(text);
    if (BY_KEY.has(key)) return BY_KEY.get(key)!;
    // Metnin içinde geçen ilçe adı (uzun adlar önce: "Büyükçekmece" "Küçükçekmece"den önce denenmez, tam kelime aranır)
    const words = ` ${key} `;
    for (const [k, v] of BY_KEY) if (words.includes(` ${k} `)) return v;
    return null;
}

const dist2 = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const x = (bLng - aLng) * Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
    const y = bLat - aLat;
    return x * x + y * y;
};

export function nearestDistrict(lat: number, lng: number): District {
    let best = DISTRICTS[0], bd = Infinity;
    for (const x of DISTRICTS) {
        const v = dist2(lat, lng, x.lat, x.lng);
        if (v < bd) { bd = v; best = x; }
    }
    return best;
}
