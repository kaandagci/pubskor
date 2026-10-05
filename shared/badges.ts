// Rozetler: ziyaretlerden hesaplanır, saklanmaz. Kişinin ilerlemesi de gösterilir.
import type { KindId } from './metrics';
import { foldKey } from './text';
import { personKey, type PersonSummary } from './insights';
import type { Visit } from './types';

export interface Badge {
    id: string;
    label: string;
    desc: string;
    icon: string;
    earned: boolean;
    progress: number;
    goal: number;
}

const KIND_BADGES: { kind: KindId; id: string; label: string; icon: string }[] = [
    { kind: 'bira', id: 'bira', label: 'Bira ustası', icon: 'beer' },
    { kind: 'kokteyl', id: 'kokteyl', label: 'Kokteyl gurmesi', icon: 'martini' },
    { kind: 'sarap', id: 'sarap', label: 'Şarap tadımcısı', icon: 'wine' },
    { kind: 'sert', id: 'sert', label: 'Meyhane ustası', icon: 'glass' },
    { kind: 'yemek', id: 'yemek', label: 'Gurme', icon: 'utensils' },
    { kind: 'alkolsuz', id: 'alkolsuz', label: 'Ayık kaptan', icon: 'soda' }
];

export function badgesFor(key: string, visits: Visit[], summary: PersonSummary | undefined): Badge[] {
    const mine = visits.filter(v => !v.deletedAt && v.participants.some(p => personKey(p) === key));
    const venues = new Map<string, number>();
    mine.forEach(v => venues.set(v.venueId, (venues.get(v.venueId) ?? 0) + 1));
    const legend = mine.filter(v => (v.score ?? 0) >= 8.5).length;
    const live = mine.filter(v => v.source === 'live').length;
    const items = mine.reduce((n, v) => n + (v.items?.length ?? 0), 0);
    const loyal = Math.max(0, ...venues.values());
    const b = (id: string, label: string, desc: string, icon: string, progress: number, goal: number): Badge =>
        ({ id, label, desc, icon, progress: Math.min(progress, goal), goal, earned: progress >= goal });

    const list: Badge[] = [
        b('ilk', 'İlk yudum', 'İlk ziyaretini puanla', 'sparkles', mine.length, 1),
        b('mudavim', 'Müdavim', '10 ziyarete katıl', 'medal', mine.length, 10),
        b('efsane', 'Efsane avcısı', '8,5 ve üzeri alan 3 ziyarette bulun', 'crown', legend, 3),
        b('koleksiyon', 'Koleksiyoncu', '10 farklı mekan puanla', 'map', venues.size, 10),
        b('rehber', 'Şehir rehberi', '25 farklı mekan puanla', 'compass', venues.size, 25),
        b('sadik', 'Sadık', 'Aynı mekana 4 kez git', 'heart', loyal, 4),
        b('canli', 'Masa başı', '3 canlı masada puan ver', 'radio', live, 3),
        b('defter', 'Defterdar', 'Sipariş defterine 10 kalem yaz', 'notebook', items, 10)
    ];
    for (const k of KIND_BADGES) {
        list.push(b(k.id, k.label, `${k.label.split(' ')[0]} içerikli 5 ziyaret`, k.icon, mine.filter(v => (v.kinds ?? []).includes(k.kind)).length, 5));
    }
    if (summary?.bias != null && mine.length >= 5) {
        if (summary.bias <= -0.6) list.push(b('sert', 'Sert eleştirmen', 'Masaya göre belirgin şekilde düşük puan verir', 'gavel', 1, 1));
        if (summary.bias >= 0.6) list.push(b('comert', 'Cömert kalp', 'Masaya göre belirgin şekilde yüksek puan verir', 'heart', 1, 1));
    }
    return list.sort((x, y) => Number(y.earned) - Number(x.earned) || y.progress / y.goal - x.progress / x.goal);
}

/** Kişinin gittiği farklı semtler (kaşif rozeti ve profil için). */
export function areasOf(key: string, visits: Visit[], areaOf: (venueId: string) => string): string[] {
    const set = new Map<string, string>();
    for (const v of visits) {
        if (v.deletedAt || !v.participants.some(p => personKey(p) === key)) continue;
        const a = areaOf(v.venueId);
        if (a) set.set(foldKey(a), a);
    }
    return [...set.values()];
}
