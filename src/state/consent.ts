// Yaş onayı ve gizlilik tercihleri (açık rıza). Yalnızca bu cihazda saklanır.
import { signal } from '@preact/signals';
import { local } from '../lib/storage';

export interface Consent {
    /** 18 yaş beyanı. */
    adult: boolean;
    /** Kişiselleştirilmiş reklam için açık rıza (reklamlar açılırsa). */
    ads: boolean;
    /** Anonim kullanım istatistiği için açık rıza (ileride eklenirse). */
    analytics: boolean;
    decidedAt: number | null;
}

const DEFAULT: Consent = { adult: false, ads: false, analytics: false, decidedAt: null };

export const consent = signal<Consent>({ ...DEFAULT, ...local.get<Partial<Consent>>('consent', {}) });

export function setConsent(patch: Partial<Consent>) {
    consent.value = { ...consent.value, ...patch, decidedAt: Date.now() };
    local.set('consent', consent.value);
}
