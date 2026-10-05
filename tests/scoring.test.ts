import { describe, expect, it } from 'vitest';
import { LEGACY_METRICS, metricsFor, tierOf } from '../shared/metrics';
import { NA, analyze } from '../shared/scoring';
import { fromLegacy } from '../shared/legacy';
import { highlights, summarizePeople, summarizeVenues } from '../shared/insights';
import { validateVisitInput } from '../shared/validate';
import type { Sheet, Visit } from '../shared/types';
import { foldKey, isValidDate } from '../shared/text';

const BEER = metricsFor(['bira']);
const full = (v: number, ids: readonly string[] = BEER): Sheet => Object.fromEntries(ids.map(id => [id, v]));

describe('analyze', () => {
    it('ağırlıklı konsensüsü hesaplar', () => {
        const a = analyze({ participants: [{ id: 'a' }, { id: 'b' }], sheets: { a: full(8), b: full(6) }, metrics: BEER });
        expect(a.complete).toBe(true);
        expect(a.score).toBe(7);
        expect(a.perParticipant).toEqual({ a: 8, b: 6 });
        expect(a.conflicts).toEqual([]);
    });

    it('"yok" işaretini puan saymaz ama hücreyi dolu kabul eder', () => {
        const a = analyze({ participants: [{ id: 'a' }, { id: 'b' }], sheets: { a: full(8), b: { ...full(6), restroom_queue: NA } }, metrics: BEER });
        expect(a.complete).toBe(true);
        expect(a.metricAvg.restroom_queue).toBe(8);
        expect(a.missing).toEqual([]);
    });

    it('eksik hücreleri raporlar, skoru geçici verir', () => {
        const s = full(7); delete s.vibe_comfort;
        const a = analyze({ participants: [{ id: 'a' }], sheets: { a: s }, metrics: BEER });
        expect(a.complete).toBe(false);
        expect(a.missing).toEqual([{ pid: 'a', mid: 'vibe_comfort' }]);
        expect(a.score).toBe(7);
    });

    it('yalnızca ziyaretin kriterlerini puanlar, ağırlıkları onlara dağıtır', () => {
        const s = full(5); s.beer_temp_gas = 10;
        const metrics = BEER.filter(id => id !== 'beer_temp_gas');
        const a = analyze({ participants: [{ id: 'a' }], sheets: { a: s }, metrics });
        expect(a.score).toBe(5);
        expect(a.needed).toBe(BEER.length - 1);
    });

    it('modüller: kokteyl ve yemek kriterleri eklenir', () => {
        const ids = metricsFor(['kokteyl', 'yemek']);
        expect(ids).toContain('cocktail_taste');
        expect(ids).toContain('food_taste');
        expect(ids).not.toContain('beer_temp_gas');
        const a = analyze({ participants: [{ id: 'a' }], sheets: { a: full(7, ids) }, metrics: ids });
        expect(a.complete).toBe(true);
        expect(a.groups.kokteyl).toBe(7);
        expect(a.groups.bira).toBeUndefined();
    });

    it('3 ve üzeri farkı ayrışma sayar', () => {
        const a = analyze({ participants: [{ id: 'a' }, { id: 'b' }], sheets: { a: { ...full(5), service_speed: 9 }, b: full(5) }, metrics: BEER });
        expect(a.conflicts).toEqual(['service_speed']);
    });

    it('tamamen "yok" olan kağıtta skor yoktur', () => {
        const a = analyze({ participants: [{ id: 'a' }], sheets: { a: full(NA) }, metrics: BEER });
        expect(a.score).toBeNull();
        expect(a.complete).toBe(false);
    });
});

describe('yardımcılar', () => {
    it('tier sınırları', () => {
        expect(tierOf(8.5).label).toBe('Efsane');
        expect(tierOf(7).label).toBe('Çok iyi');
        expect(tierOf(3.9).label).toBe('Uğrama');
        expect(tierOf(null).id).toBe('none');
    });
    it('Türkçe karşılaştırma anahtarı', () => {
        expect(foldKey('Kadıköy  PUB')).toBe(foldKey('kadikoy pub'));
        expect(foldKey('İstanbul')).toBe('istanbul');
    });
    it('tarih doğrulama', () => {
        expect(isValidDate('2026-02-29')).toBe(false);
        expect(isValidDate('2028-02-29')).toBe(true);
    });
});

describe('validateVisitInput', () => {
    const base = {
        id: 'pub_abcdef', venue: { id: 'v_abcdef', name: '  Pub  ' }, date: '2026-10-01',
        participants: [{ id: 'a', name: 'Ali', color: 0 }], sheets: { a: full(7) }, metrics: BEER
    };
    it('geçerli girdiyi temizler ve skoru yeniden hesaplar', () => {
        const r = validateVisitInput({ ...base, score: 10 });
        expect(r.ok && r.value.score).toBe(7);
        expect(r.ok && r.value.venue?.name).toBe('Pub');
    });
    it('aynı isimli iki katılımcıyı reddeder', () => {
        const r = validateVisitInput({ ...base, participants: [{ id: 'a', name: 'Ali' }, { id: 'b', name: 'ali' }], sheets: { a: full(7), b: full(7) } });
        expect(r.ok).toBe(false);
    });
    it('geçersiz puanları atar ve eksik sayar', () => {
        const r = validateVisitInput({ ...base, sheets: { a: { ...full(7), vibe_comfort: 11 } } });
        expect(r.ok).toBe(false);
        expect(!r.ok && r.error).toContain('1 puan eksik');
    });
});

describe('v7 dönüştürücü', () => {
    it('eski kaydı yeni modele çevirir', () => {
        const metrics: Record<string, unknown> = {};
        LEGACY_METRICS.forEach(id => { metrics[id] = { active: id !== 'snacks_food', scores: { p0: 8, p1: 6 } }; });
        const L = fromLegacy({
            id: 'pub_1696000000000', name: 'Eski Pub', location: 'Moda', date: '2025-05-01', notes: 'iyi',
            participants: [{ id: 'p0', name: 'Kaan', colorIdx: 0 }, { id: 'p1', name: 'Suude', colorIdx: 1 }],
            metrics, consensus: 7, hasPhoto: true
        });
        expect(L).not.toBeNull();
        expect(L!.metrics).toHaveLength(10);
        expect(L!.metrics).not.toContain('snacks_food');
        expect(L!.sheets.p0.beer_temp_gas).toBe(8);
        expect(L!.hasPhoto).toBe(true);
    });
    it('bozuk kaydı atlar', () => {
        expect(fromLegacy({ id: 'x', name: '' })).toBeNull();
    });
});

describe('istatistikler', () => {
    const mk = (id: string, venueId: string, date: string, a: number, b: number): Visit => ({
        id, venueId, date, participants: [{ id: 'x', name: 'Ada', color: 0, memberId: 'm_aaaaaaaaaa' }, { id: 'y', name: 'Bora', color: 1, memberId: null }],
        sheets: { x: full(a), y: full(b) }, metrics: BEER, kinds: ['bira'], items: [{ id: 'i_abcd', name: 'IPA', kind: 'bira', price: 200, verdict: 'top' }], notes: '', photos: [], score: (a + b) / 2,
        createdAt: 1, updatedAt: 1
    });
    const visits = [mk('pub_1aaa', 'v_1111', '2026-01-01', 9, 6), mk('pub_2aaa', 'v_1111', '2026-02-01', 8, 6), mk('pub_3aaa', 'v_2222', '2026-03-01', 5, 5)];
    const venues = [
        { id: 'v_1111', name: 'A', kind: 'pub' as const, area: '', tags: [], createdAt: 1 },
        { id: 'v_2222', name: 'B', kind: 'bar' as const, area: '', tags: [], createdAt: 1 }
    ];

    it('mekan özetleri', () => {
        const s = summarizeVenues(venues, visits);
        expect(s[0].count).toBe(2);
        expect(s[0].avg).toBeCloseTo(7.25);
        expect(s[0].trend.map(t => t.date)).toEqual(['2026-01-01', '2026-02-01']);
        expect(s[0].favorites[0]).toMatchObject({ name: 'IPA', top: 2 });
        expect(s[0].kinds.bira).toBe(2);
    });

    it('kişi eğilimleri ve uyum', () => {
        const people = summarizePeople(visits);
        const ada = people.find(p => p.name === 'Ada')!;
        const bora = people.find(p => p.name === 'Bora')!;
        expect(ada.bias!).toBeGreaterThan(0);
        expect(bora.bias!).toBeLessThan(0);
        expect(ada.agreement[bora.key].shared).toBe(BEER.length * 3);
        const h = highlights(people, summarizeVenues(venues, visits), visits);
        expect(h.generous?.name).toBe('Ada');
        expect(h.harsh?.name).toBe('Bora');
        expect(h.top?.venue.id).toBe('v_1111');
    });
});

import { dative, locative } from '../src/lib/tr';
describe('Türkçe ekler', () => {
    it('ünlü uyumu ve ünsüz benzeşmesi', () => {
        expect(locative('Kaan')).toBe("Kaan'da");
        expect(locative('Suude')).toBe("Suude'de");
        expect(locative('Mert')).toBe("Mert'te");
        expect(locative('Burak')).toBe("Burak'ta");
        expect(dative('Kaan')).toBe("Kaan'a");
        expect(dative('Ece')).toBe("Ece'ye");
        expect(dative('Mert')).toBe("Mert'e");
        expect(dative('Ayşe')).toBe("Ayşe'ye");
    });
});
