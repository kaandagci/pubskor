import { describe, expect, it } from 'vitest';
import { ADS, LEGAL } from '../src/config';

describe('yasal yapılandırma', () => {
    it('reklam açıksa (ticari hizmet) içerik sağlayıcı kimliği girilmiş olmalı (5651, Yönetmelik m.5)', () => {
        if (ADS.enabled) expect(LEGAL.controller.trim()).not.toBe('');
    });
    it('metinlerde yer tutucu kalmaz', () => {
        for (const v of [LEGAL.controller, LEGAL.address, LEGAL.kep]) expect(v).not.toMatch(/\[|\]/);
    });
    it('tek iletişim kanalı uygulama içi form', () => {
        expect(LEGAL.contact).toBe('/iletisim');
    });
});

describe('istemci hata raporu', () => {
    it('kimlik ve sorgu bilgisini günlüğe yazmaz, alanları kısaltır', async () => {
        const { clientError } = await import('../server/routes-errors');
        const logs: string[] = [];
        const orig = console.error;
        console.error = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
        try {
            const req = new Request('http://x/api/client-error', {
                method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Test' },
                body: JSON.stringify({ kind: 'error', message: 'x'.repeat(500), page: '/ziyaret/abc?token=gizli#e-posta', email: 'kisi@example.com' })
            });
            const r = await clientError({ now: () => Date.now() } as never, req);
            expect(r.status).toBe(202);
        } finally { console.error = orig; }
        expect(logs).toHaveLength(1);
        expect(logs[0]).not.toContain('gizli');
        expect(logs[0]).not.toContain('kisi@example.com');
        expect(logs[0]).toContain('/ziyaret/abc');
        expect(logs[0]).not.toContain('x'.repeat(301));
    });
});
