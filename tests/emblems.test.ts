import { describe, expect, it } from 'vitest';
import { districtsWithoutEmblem, emblemFor } from '../src/lib/emblems';

describe('mekan simgeleri', () => {
    it("İstanbul'un 39 ilçesinin hepsinin simgesi var", () => {
        expect(districtsWithoutEmblem()).toEqual([]);
    });
    it('ilçeyi metinden, semtten ve konumdan bulur', () => {
        expect(emblemFor({ area: 'Beyoğlu' })).toMatchObject({ id: 'galata', place: 'Beyoğlu' });
        expect(emblemFor({ area: 'Moda' })).toMatchObject({ id: 'vapur', place: 'Kadıköy' });
        expect(emblemFor({ area: 'Kurtuluş' })).toMatchObject({ id: 'gokdelen', place: 'Şişli' });
        expect(emblemFor({ area: 'Kuzguncuk' })).toMatchObject({ id: 'kiz-kulesi', place: 'Üsküdar' });
        expect(emblemFor({ area: 'Bilinmeyen semt', lat: 41.045, lng: 29.006 })).toMatchObject({ id: 'kopru', place: 'Beşiktaş' });
    });
    it('İstanbul dışındaki şehirleri tanır, bilinmeyen yerde genel simge kullanır', () => {
        expect(emblemFor({ area: 'Alsancak, İzmir' })).toMatchObject({ id: 'saat-kulesi', place: 'İzmir' });
        expect(emblemFor({ area: 'Kızılay', lat: 39.92, lng: 32.85 }).id).toBe('pin');
        expect(emblemFor(null).id).toBe('marti');
    });
    it('aynı simgeyi paylaşan ilçeler farklı renk alabilir, aynı ilçe hep aynı rengi alır', () => {
        const a = emblemFor({ district: 'Kartal' }), b = emblemFor({ district: 'Kartal' });
        expect(a.def.from).toBe(b.def.from);
        const colors = new Set(['Kartal', 'Pendik', 'Tuzla', 'Maltepe', 'Bakırköy', 'Avcılar'].map(d => emblemFor({ district: d }).def.from));
        expect(colors.size).toBeGreaterThan(1);
    });
});
