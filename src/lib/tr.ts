// Türkçe ek yardımcıları: özel isimlere ünlü uyumu ve ünsüz benzeşmesine uygun ek getirir ("Kaan'da", "Suude'ye", "Mert'te").

const BACK = 'aıouAIOU';
const FRONT = 'eiöüEİÖÜ';
const VOICELESS = 'fstkçşhpFSTKÇŞHP';

function lastVowel(word: string): 'back' | 'front' {
    for (let i = word.length - 1; i >= 0; i--) {
        if (BACK.includes(word[i])) return 'back';
        if (FRONT.includes(word[i])) return 'front';
    }
    return 'front';
}

const endsWithVowel = (w: string) => BACK.includes(w[w.length - 1]) || FRONT.includes(w[w.length - 1]);

/** Bulunma hâli: Kaan'da, Ece'de, Mert'te. */
export function locative(name: string): string {
    const n = name.trim();
    if (!n) return n;
    const v = lastVowel(n) === 'back' ? 'a' : 'e';
    const c = VOICELESS.includes(n[n.length - 1]) ? 't' : 'd';
    return `${n}'${c}${v}`;
}

/** Yönelme hâli: Kaan'a, Ece'ye, Mert'e. */
export function dative(name: string): string {
    const n = name.trim();
    if (!n) return n;
    const v = lastVowel(n) === 'back' ? 'a' : 'e';
    return `${n}'${endsWithVowel(n) ? 'y' : ''}${v}`;
}
