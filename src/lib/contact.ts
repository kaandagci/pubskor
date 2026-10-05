// İletişim ve başvuru formu. Gönderimler Netlify Forms'a gider (ücretsiz): kayıtlar Netlify panelinde
// (Forms → iletisim) görünür, bildirim site sahibinin Netlify hesabındaki e-postaya gider. Sitede hiçbir
// e-posta adresi yayımlanmaz. Form tanımı public/__forms.html'de; Netlify onu yayın sırasında tanır.

export const CONTACT_FORM = 'iletisim';
/** Gönderim adresi: form tanımının bulunduğu statik dosya (SPA yönlendirmesine takılmaz). */
export const CONTACT_ENDPOINT = '/__forms.html';

export type ContactTopic = 'kvkk' | 'icerik' | 'mekan' | 'hesap' | 'diger';

export const CONTACT_TOPICS: Record<ContactTopic, { label: string; sub: string; reply: string }> = {
    kvkk: { label: 'Kişisel verilerim (KVKK başvurusu)', sub: 'Bilgi alma, düzeltme, silme, itiraz', reply: 'en geç 30 gün içinde, ücretsiz (KVKK m.13)' },
    icerik: { label: 'Hukuka aykırı içerik / kişilik hakkı', sub: 'Hakkındaki bir içeriğin kaldırılması', reply: 'en geç 24 saat içinde (5651 s. Kanun m.9)' },
    mekan: { label: 'Mekan bilgisi', sub: 'Yanlış, kapanmış ya da alkol servisi olmayan mekan', reply: 'en kısa sürede' },
    hesap: { label: 'Hesap ve teknik sorun', sub: 'Giriş, ekip, veri kaybı', reply: 'en kısa sürede' },
    diger: { label: 'Öneri ve diğer', sub: 'Görüş, öneri, iş birliği dışı sorular', reply: 'en kısa sürede' }
};

/** KVKK m.11'deki haklar (başvuruda işaretlenir). */
export const KVKK_RIGHTS: readonly (readonly [string, string])[] = [
    ['ogrenme', 'Kişisel verilerimin işlenip işlenmediğini öğrenmek ve bilgi talep etmek'],
    ['amac', 'İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenmek'],
    ['aktarim', 'Yurt içinde ya da yurt dışında aktarıldığı üçüncü kişileri öğrenmek'],
    ['duzeltme', 'Eksik ya da yanlış işlenmiş verilerimin düzeltilmesini istemek'],
    ['silme', 'Verilerimin silinmesini ya da yok edilmesini istemek'],
    ['bildirim', 'Düzeltme ve silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini istemek'],
    ['itiraz', 'Yalnızca otomatik sistemlerle yapılan analizin aleyhime sonucuna itiraz etmek'],
    ['zarar', 'Kanuna aykırı işleme nedeniyle uğradığım zararın giderilmesini istemek']
];

export const LIMITS = { name: 80, email: 120, phone: 20, identity: 40, address: 300, link: 400, message: 3000 } as const;

/** T.C. kimlik numarası denetimi (11 hane, ilk hane 0 değil, iki kontrol hanesi). */
export function isValidTckn(s: string): boolean {
    if (!/^[1-9]\d{10}$/.test(s)) return false;
    const d = [...s].map(Number);
    const odd = d[0] + d[2] + d[4] + d[6] + d[8];
    const even = d[1] + d[3] + d[5] + d[7];
    if ((((odd * 7 - even) % 10) + 10) % 10 !== d[9]) return false;
    return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

/** Kimlik alanı: T.C. kimlik no ya da (yabancılar için) uyruk ve pasaport numarası. */
export function identityError(raw: string): string | null {
    const s = raw.trim();
    if (!s) return 'KVKK başvurusu için gerekli';
    if (/^\d+$/.test(s)) return isValidTckn(s) ? null : 'Geçerli bir T.C. kimlik numarası gir';
    return s.length >= 5 && /\p{L}/u.test(s) && /\d/.test(s) ? null : 'Uyruk ve pasaport numarasını birlikte yaz (ör. Almanya C01X00T47)';
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

export interface ContactInput {
    topic: ContactTopic;
    name: string;
    email: string;
    phone: string;
    identity: string;
    address: string;
    rights: string[];
    link: string;
    message: string;
    acknowledged: boolean;
}

/** Alan hataları (boşsa gönderilebilir). */
export function validateContact(f: ContactInput): Partial<Record<keyof ContactInput, string>> {
    const e: Partial<Record<keyof ContactInput, string>> = {};
    if (!f.name.trim()) e.name = 'Adını ve soyadını yaz';
    if (!isEmail(f.email)) e.email = 'Yanıt için geçerli bir e-posta gir';
    if (f.topic === 'kvkk') {
        const id = identityError(f.identity);
        if (id) e.identity = id;
        if (f.address.trim().length < 10) e.address = 'Tebligata esas adresini yaz';
        if (!f.rights.length) e.rights = 'En az bir talep seç';
    }
    if (f.topic === 'icerik' && !f.link.trim()) e.link = 'İçeriğin bağlantısını ya da yerini yaz';
    if (f.message.trim().length < 10) e.message = 'Talebini birkaç cümleyle açıkla';
    if (!f.acknowledged) e.acknowledged = 'Devam etmek için onayla';
    return e;
}

/** Başvuru numarası: yanıtta ve sonraki yazışmada kullanılır (ör. PS-261005-7K3Q). */
export function referenceId(now = new Date()): string {
    const d = now.toISOString().slice(2, 10).replace(/-/g, '');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const rnd = crypto.getRandomValues(new Uint8Array(4));
    return `PS-${d}-${[...rnd].map(b => alphabet[b % alphabet.length]).join('')}`;
}

/** Netlify Forms'a gönderilecek alanlar (public/__forms.html'deki tanımla aynı adlar). */
export function contactFields(f: ContactInput, ref: string, account: string | null): Record<string, string> {
    const kvkk = f.topic === 'kvkk';
    return {
        'form-name': CONTACT_FORM,
        'bot-field': '',
        referans: ref,
        konu: CONTACT_TOPICS[f.topic].label,
        ad: f.name.trim().slice(0, LIMITS.name),
        eposta: f.email.trim().slice(0, LIMITS.email),
        telefon: f.phone.trim().slice(0, LIMITS.phone),
        kimlik: kvkk ? f.identity.trim().slice(0, LIMITS.identity) : '',
        adres: kvkk ? f.address.trim().slice(0, LIMITS.address) : '',
        haklar: kvkk ? f.rights.map(id => KVKK_RIGHTS.find(r => r[0] === id)?.[1] ?? id).join(' | ') : '',
        baglanti: f.link.trim().slice(0, LIMITS.link),
        mesaj: f.message.trim().slice(0, LIMITS.message),
        hesap: account ?? '',
        yanit_suresi: CONTACT_TOPICS[f.topic].reply,
        aydinlatma: 'okundu',
        tarih: new Date().toISOString()
    };
}

export async function submitContact(fields: Record<string, string>): Promise<void> {
    const r = await fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString()
    });
    if (!r.ok) throw new Error(r.status === 404 ? 'Form henüz etkin değil. Site yöneticisi Netlify\'da form algılamayı açmalı.' : 'Gönderilemedi, tekrar dene');
}
