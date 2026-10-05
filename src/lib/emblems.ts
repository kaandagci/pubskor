// Mekan simgeleri: fotoğrafı olmayan mekanlar, bulundukları ilçenin / şehrin simgesiyle gösterilir
// (Beyoğlu → Galata Kulesi, Üsküdar → Kız Kulesi…). Çizimler Pub Skor'a özgü, 24×24 çizgi simgeler.
import { DISTRICTS, HOODS, districtFromText, inIstanbul, nearestDistrict } from '../../shared/istanbul';
import { foldKey } from '../../shared/text';

export type EmblemId =
    | 'galata' | 'kiz-kulesi' | 'kopru' | 'cami' | 'vapur' | 'hisar' | 'ada' | 'gokdelen' | 'yelken'
    | 'deniz-feneri' | 'agac' | 'lale' | 'marti' | 'saat-kulesi' | 'kale' | 'palmiye' | 'pin';

export interface EmblemDef {
    /** Sembolün adı (erişilebilirlik ve ipucu için). */
    label: string;
    /** 24×24 çizgi yolları (beyaz çizilir). */
    paths: string[];
    /** Karo renk geçişi (üst-sol → alt-sağ). */
    from: string;
    to: string;
}

const WAVE = 'M3 21c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0';

export const EMBLEMS: Record<EmblemId, EmblemDef> = {
    galata: {
        label: 'Galata Kulesi', from: '#5e5ce6', to: '#bf5af2',
        paths: ['M8.2 8.6 12 2.8l3.8 5.8', 'M7 8.6h10', 'M7.6 8.6v1.6h8.8V8.6', 'M8.6 10.2 8 20.6', 'M15.4 10.2l.6 10.4', 'M5 20.6h14', 'M10.6 13v1.6', 'M13.4 13v1.6', 'M12 17.2v3.4']
    },
    'kiz-kulesi': {
        label: 'Kız Kulesi', from: '#32ade6', to: '#007aff',
        paths: ['M4.5 17.2c2.4-1.9 5-2.4 7.5-2.2 2.5-.2 5.1.3 7.5 2.2', 'M10.4 15V8.4h3.2V15', 'M9.9 8.4 12 4.4l2.1 4', 'M13.6 11.6h2.6v3.6', 'M12 2.6v1.8', WAVE]
    },
    kopru: {
        label: 'Köprü', from: '#0a84ff', to: '#5856d6',
        paths: ['M2 15h20', 'M7 5.5V19', 'M17 5.5V19', 'M7 6q5 7.5 10 0', 'M2 11.5q3.5-1.6 5-5.5', 'M22 11.5q-3.5-1.6-5-5.5', 'M9.5 15V8.9', 'M12 15V9.8', 'M14.5 15V8.9']
    },
    cami: {
        label: 'Cami', from: '#ff9f0a', to: '#ff5e3a',
        paths: ['M7 14a5 5 0 0 1 10 0', 'M12 9V6.4', 'M6 14h12v6H6z', 'M11 20v-2.4a1 1 0 0 1 2 0V20', 'M3.8 20V9.2', 'M3.1 9.2l.7-3.8.7 3.8', 'M20.2 20V9.2', 'M19.5 9.2l.7-3.8.7 3.8', 'M2 20h20']
    },
    vapur: {
        label: 'Vapur', from: '#ff9500', to: '#ff375f',
        paths: ['M3 14h18l-2 4H5z', 'M6 14v-3h10v3', 'M8 11V9h6v2', 'M11.6 9V6.4h1.8V9', 'M8.6 12.5h.01', 'M11 12.5h.01', 'M13.4 12.5h.01', WAVE]
    },
    hisar: {
        label: 'Hisar', from: '#d4a373', to: '#a2845e',
        paths: ['M4 20.6V9h5v11.6', 'M4 9V7.4h1.5V9', 'M7.5 9V7.4H9V9', 'M9 13.6h6', 'M15 20.6V11h5v9.6', 'M15 11V9.4h1.5V11', 'M18.5 11V9.4H20V11', 'M11 20.6v-3a1 1 0 0 1 2 0v3', 'M2 20.6h20']
    },
    ada: {
        label: 'Ada', from: '#34c759', to: '#30b0c7',
        paths: ['M3.5 18q8.5-6.2 17 0', 'M12 16v-2.4', 'M9.2 10.2 12 5.2l2.8 5z', 'M8.2 13.8 12 8.4l3.8 5.4z', WAVE]
    },
    gokdelen: {
        label: 'Gökdelenler', from: '#6e7a8a', to: '#2c3e57',
        paths: ['M10 20.6V4.2h5v16.4', 'M12.5 4.2V2', 'M15 20.6V9h4v11.6', 'M5 20.6V12.4h5', 'M3 20.6h18', 'M12.5 8v.01', 'M12.5 11.5v.01', 'M12.5 15v.01', 'M17 12.5v.01', 'M17 16v.01', 'M7.5 15.5v.01']
    },
    yelken: {
        label: 'Yelkenli', from: '#40c8e0', to: '#0a84ff',
        paths: ['M12 3v13', 'M12.8 4.2 18.6 15h-5.8z', 'M11.2 6.4 6.4 15h4.8z', 'M4 16.6h16l-2 3H6z']
    },
    'deniz-feneri': {
        label: 'Deniz feneri', from: '#ff453a', to: '#ff9f0a',
        paths: ['M9.2 20.6 10.2 9h3.6l1 11.6', 'M9.8 9V6.8h4.4V9', 'M9.4 6.8 12 4.4l2.6 2.4', 'M9.9 13h4.2', 'M9.6 16.8h4.8', 'M5.6 5.8l2.4.9', 'M18.4 5.8 16 6.7', 'M5 20.6h14']
    },
    agac: {
        label: 'Ağaçlar', from: '#30d158', to: '#248a3d',
        paths: ['M10 3.8a5 5 0 1 0 0 10 5 5 0 1 0 0-10z', 'M10 13.8v6.8', 'M16.6 9a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 1 0 0-6.8z', 'M16.6 15.8v4.8', 'M3 20.6h18']
    },
    lale: {
        label: 'Lale', from: '#ff2d55', to: '#ff6482',
        paths: ['M12 13.4c-3.4 0-4.4-3-4-7.4l2 2 2-3.6 2 3.6 2-2c.4 4.4-.6 7.4-4 7.4z', 'M12 13.4v7.4', 'M12 19q-3.8-.4-5-3.6', 'M12 17.6q3.4-.4 4.6-3']
    },
    marti: {
        label: 'Martı', from: '#64d2ff', to: '#32ade6',
        paths: ['M3 12.5Q7 5 12 11.2 17 5 21 12.5', 'M14.8 5.4q1.8-2.4 3.4-.3 1.6-2.1 3.4.3', 'M4 17.6h16', 'M7.5 20.6h9']
    },
    'saat-kulesi': {
        label: 'Saat Kulesi', from: '#ffcc00', to: '#ff9500',
        paths: ['M9.5 20.6V9.2h5v11.4', 'M9 9.2h6', 'M10 9.2q2-4.6 4 0', 'M12 4.8V2.8', 'M12 11a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 1 0 0-3.2z', 'M7 20.6h10']
    },
    kale: {
        label: 'Kale', from: '#a2845e', to: '#7d6045',
        paths: ['M4 20.6V10h3v2h3V8.4h4V12h3v-2h3v10.6', 'M10.6 20.6v-3.4a1.4 1.4 0 0 1 2.8 0v3.4', 'M2.5 20.6h19']
    },
    palmiye: {
        label: 'Palmiye', from: '#00c7be', to: '#34c759',
        paths: ['M12 20.6q1.2-6-.2-11.6', 'M11.8 9q-3.4-2.4-7 .4', 'M11.8 9q3.4-2.4 7 .4', 'M11.8 9q-1.6-3.6-5.2-4.4', 'M11.8 9q1.8-3.6 5.4-4.4', 'M5 20.6h14']
    },
    pin: {
        label: 'Konum', from: '#8e8e93', to: '#636366',
        paths: ['M12 20.6S5.5 14.6 5.5 10a6.5 6.5 0 0 1 13 0c0 4.6-6.5 10.6-6.5 10.6z', 'M12 7.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 1 0 0-5.2z']
    }
};

/** Birden çok ilçenin paylaştığı simgeler için renk çeşitleri (ilçe adına göre sabit seçilir). */
const VARIANTS: Partial<Record<EmblemId, [string, string][]>> = {
    yelken: [['#40c8e0', '#0a84ff'], ['#30b0c7', '#34c759'], ['#5ac8fa', '#5856d6'], ['#64d2ff', '#30b0c7']],
    gokdelen: [['#6e7a8a', '#2c3e57'], ['#7d7aff', '#3a3a8c'], ['#5ac8fa', '#2c5c8a']],
    agac: [['#30d158', '#248a3d'], ['#00c7be', '#248a3d'], ['#a3c75a', '#4c8c2b']],
    lale: [['#ff2d55', '#ff6482'], ['#bf5af2', '#ff2d55'], ['#ff6482', '#ff9f0a']],
    cami: [['#ff9f0a', '#ff5e3a'], ['#ffb340', '#d4a373']]
};
const hash = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** İstanbul ilçesi → simge. */
const DISTRICT_EMBLEM: Record<string, EmblemId> = {
    'Beyoğlu': 'galata', 'Üsküdar': 'kiz-kulesi', 'Beşiktaş': 'kopru', 'Kadıköy': 'vapur', 'Fatih': 'cami', 'Eyüpsultan': 'cami',
    'Sarıyer': 'hisar', 'Adalar': 'ada', 'Şile': 'deniz-feneri',
    'Şişli': 'gokdelen', 'Ataşehir': 'gokdelen', 'Kağıthane': 'gokdelen', 'Ümraniye': 'gokdelen',
    'Bakırköy': 'yelken', 'Maltepe': 'yelken', 'Kartal': 'yelken', 'Pendik': 'yelken', 'Tuzla': 'yelken', 'Büyükçekmece': 'yelken',
    'Beylikdüzü': 'yelken', 'Avcılar': 'yelken', 'Küçükçekmece': 'yelken', 'Silivri': 'yelken', 'Zeytinburnu': 'yelken',
    'Beykoz': 'agac', 'Çekmeköy': 'agac', 'Sancaktepe': 'agac', 'Sultanbeyli': 'agac', 'Arnavutköy': 'agac', 'Çatalca': 'agac', 'Başakşehir': 'agac',
    'Bağcılar': 'lale', 'Bahçelievler': 'lale', 'Esenler': 'lale', 'Güngören': 'lale', 'Bayrampaşa': 'lale',
    'Gaziosmanpaşa': 'lale', 'Sultangazi': 'lale', 'Esenyurt': 'lale'
};

/** İstanbul dışındaki şehirler (metinde geçerse). */
const CITY_EMBLEM: [string, EmblemId, string][] = [
    ['izmir', 'saat-kulesi', 'İzmir'], ['ankara', 'kale', 'Ankara'],
    ['antalya', 'palmiye', 'Antalya'], ['alanya', 'palmiye', 'Alanya'], ['bodrum', 'palmiye', 'Bodrum'], ['mugla', 'palmiye', 'Muğla'],
    ['fethiye', 'palmiye', 'Fethiye'], ['kas', 'palmiye', 'Kaş'], ['mersin', 'palmiye', 'Mersin'],
    ['bursa', 'cami', 'Bursa'], ['edirne', 'cami', 'Edirne'], ['konya', 'cami', 'Konya'],
    ['canakkale', 'kale', 'Çanakkale'], ['bozcaada', 'kale', 'Bozcaada'], ['eskisehir', 'kopru', 'Eskişehir']
];

export interface PlaceLike {
    area?: string | null;
    district?: string | null;
    lat?: number | null;
    lng?: number | null;
}

export interface Emblem { id: EmblemId; def: EmblemDef; place: string | null }

const HOOD_BY_KEY = new Map(HOODS.map(h => [foldKey(h.name), h]));

/** Mekanın simgesi: ilçe (metinden ya da semtten), konum, şehir adı; hiçbiri yoksa genel İstanbul simgesi (martı). */
export function emblemFor(p: PlaceLike | null | undefined): Emblem {
    const make = (id: EmblemId, place: string | null): Emblem => {
        const list = place ? VARIANTS[id] : undefined;
        if (!list) return { id, def: EMBLEMS[id], place };
        const [from, to] = list[hash(place!) % list.length];
        return { id, def: { ...EMBLEMS[id], from, to }, place };
    };
    if (!p) return make('marti', null);
    const text = [p.district, p.area].filter(Boolean).join(' ');
    const d = districtFromText(p.district) ?? districtFromText(p.area);
    if (d) return make(DISTRICT_EMBLEM[d.name] ?? 'marti', d.name);
    const key = foldKey(p.area ?? '');
    const hood = HOOD_BY_KEY.get(key) ?? [...HOOD_BY_KEY.values()].find(h => key && ` ${key} `.includes(` ${foldKey(h.name)} `));
    if (hood) return make(DISTRICT_EMBLEM[hood.district] ?? 'marti', hood.district);
    const words = ` ${foldKey(text)} `;
    for (const [k, id, name] of CITY_EMBLEM) if (words.includes(` ${k} `)) return make(id, name);
    if (p.lat != null && p.lng != null) {
        if (inIstanbul(p.lat, p.lng)) {
            const n = nearestDistrict(p.lat, p.lng);
            return make(DISTRICT_EMBLEM[n.name] ?? 'marti', n.name);
        }
        return make('pin', null);
    }
    return make('marti', null);
}

/** Testler için: her ilçenin bir simgesi var. */
export const districtsWithoutEmblem = () => DISTRICTS.filter(d => !DISTRICT_EMBLEM[d.name]).map(d => d.name);
