import { describe, expect, it } from 'vitest';
import { contactFields, identityError, isValidTckn, referenceId, validateContact, type ContactInput } from '../src/lib/contact';

const base: ContactInput = {
    topic: 'diger', name: 'Ayşe Yılmaz', email: 'ayse@example.com', phone: '', identity: '', address: '',
    rights: [], link: '', message: 'Uygulama için bir önerim var.', acknowledged: true
};

describe('iletişim ve başvuru formu', () => {
    it('T.C. kimlik numarasını kontrol hanesiyle doğrular', () => {
        expect(isValidTckn('10000000146')).toBe(true);
        expect(isValidTckn('10000000147')).toBe(false);
        expect(isValidTckn('01234567890')).toBe(false);
        expect(identityError('Almanya C01X00T47')).toBeNull();
        expect(identityError('12345')).not.toBeNull();
    });
    it('genel talepte yalnızca ad, e-posta, mesaj ve onay ister', () => {
        expect(validateContact(base)).toEqual({});
        expect(Object.keys(validateContact({ ...base, email: 'x', acknowledged: false })).sort()).toEqual(['acknowledged', 'email']);
    });
    it('KVKK başvurusunda Tebliğ m.5 bilgilerini ve en az bir talebi ister', () => {
        const e = validateContact({ ...base, topic: 'kvkk' });
        expect(Object.keys(e).sort()).toEqual(['address', 'identity', 'rights']);
        expect(validateContact({ ...base, topic: 'kvkk', identity: '10000000146', address: 'Moda Cd. No:1 Kadıköy İstanbul', rights: ['silme'] })).toEqual({});
    });
    it('içerik bildiriminde bağlantı ister', () => {
        expect(validateContact({ ...base, topic: 'icerik' }).link).toBeTruthy();
    });
    it('KVKK dışı konularda kimlik ve adres gönderilmez', () => {
        const f = contactFields({ ...base, identity: '10000000146', address: 'gizli adres' }, referenceId(), null);
        expect(f['form-name']).toBe('iletisim');
        expect(f.kimlik).toBe('');
        expect(f.adres).toBe('');
        expect(f.referans).toMatch(/^PS-\d{6}-[A-Z2-9]{4}$/);
    });
});
