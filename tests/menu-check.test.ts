import { describe, expect, it } from 'vitest';
// @ts-expect-error: betik modülü (JS), tip tanımı yok
import { analyzeText, decide } from '../scripts/places/menu-check.mjs';

const check = (s: string) => decide(analyzeText(s.toLocaleLowerCase('tr')));

describe('menü kontrolü (mekanın kendi sitesi)', () => {
    it('menüsünde en az iki farklı içki terimi olan mekan içkilidir', () => {
        expect(check('Burger, Efes fıçı bira 50 cl, kırmızı şarap kadeh')).toBe(1);
        expect(check('Mojito, Negroni ve Aperol Spritz')).toBe(1);
        expect(check('Rakı, meze, balık')).toBe(0);
        expect(check('Yeni Rakı 35cl, Tekirdağ Rakı, şarap')).toBe(1);
    });
    it('yalnızca kokteyl geçmesi yetmez (alkolsüz kokteyl olabilir); belirsiz sözcükler sayılmaz', () => {
        expect(check('Kokteyller: mojito, cocktail of the day')).toBe(0);
        expect(check('Draft latte, Bourbon vanilyalı kek, Bomonti şubemiz')).toBe(0);
        expect(check('Kokteyller ve kırmızı şarap')).toBe(1);
        expect(check('Fıçı bira, şişe biralar')).toBe(1);
    });
    it('büyük harfli İngilizce menü başlıklarını tanır', () => {
        expect(check('WINES · COCKTAILS · BEERS')).toBe(1);
    });
    it('yanıltıcı kullanımları saymaz', () => {
        expect(check('Pizza Margarita, şarap sirkesi ile salata, alkolsüz bira')).toBe(0);
        expect(check('Kokteyl salonu, düğün ve nişan organizasyonu, wine')).toBe(0);
        expect(check('Kırmızı şarap soslu bonfile, viski soslu burger')).toBe(0);
        expect(check('Cocktail tomato, kirmizi sarap sirkesi, red wine vinegar')).toBe(0);
        expect(check('Rakı bardağı, şarap kadehi seti')).toBe(0);
        expect(check('Market Alkol Reyonu, Şarap Rafı, Viski Reyonu')).toBe(0);
        expect(check('Şarap Aksesuarları, Kokteyl Shaker, Bira Bardağı')).toBe(0);
    });
    it('mağaza sitelerindeki ve alkolsüz kokteyl menüsündeki sözcükleri saymaz', () => {
        expect(check('Sepete ekle · Viski kadehleri · Şarap şişe kovası · Bira açacağı')).toBe(0);
        expect(check('Mocktail: Mojito, Zlatno Martini (kahve, süt). Kokteyller')).toBe(0);
        expect(check('Kahve & bira: 6 çeşit biralarımız, Japanese whiskey')).toBe(1);
    });
    it('açıkça alkolsüz olduğunu söyleyen mekanı ayırır', () => {
        expect(check('Mekanımızda alkol servisi yoktur. Türk kahvesi')).toBe(-1);
        expect(check('Alkolsüz aile kafesi, bira yok')).toBe(-1);
    });
    it('yalnızca bir şube için söylenen "alkol yok" zincirin tamamını düşürmez', () => {
        const r = analyzeText('Kokteyller, şaraplar. Tarihi Teşvikiye cami yanında yer alması dolayısıyla bu şubemizde alkol servisi yapılmamaktadır.'.toLocaleLowerCase('tr'));
        expect(decide(r)).toBe(1);
        expect(r.branch).toContain('teşvikiye');
        expect(r.branch).toEqual(['teşvikiye']);
    });
});
