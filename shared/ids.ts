// Kimlik üretimi ve biçim kontrolleri (tarayıcıda ve Node'da aynı çalışır).

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// Masa kodu: okunması kolay, karışan karakterler (0/O, 1/I/L) yok.
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomChars(n: number, alphabet: string): string {
    const bytes = new Uint8Array(n);
    globalThis.crypto.getRandomValues(bytes);
    let out = '';
    // 256 alfabe uzunluğuna tam bölünmüyorsa sapmayı önlemek için reddetme örneklemesi
    const limit = 256 - (256 % alphabet.length);
    let i = 0;
    while (out.length < n) {
        if (i >= bytes.length) { globalThis.crypto.getRandomValues(bytes); i = 0; }
        const b = bytes[i++];
        if (b < limit) out += alphabet[b % alphabet.length];
    }
    return out;
}

export const secret = (len = 32) => randomChars(len, B64URL);

export const newId = {
    crew: () => 'c_' + randomChars(14, B64URL),
    member: () => 'm_' + randomChars(10, B64URL),
    guest: () => 'g_' + randomChars(10, B64URL),
    venue: () => 'v_' + randomChars(12, B64URL),
    visit: () => 'pub_' + randomChars(16, B64URL),
    photo: () => 'ph_' + randomChars(22, B64URL),
    share: () => 's_' + randomChars(14, B64URL),
    table: () => randomChars(6, CODE_CHARS)
};

export const ID_RE = {
    crew: /^c_[\w-]{14}$/,
    member: /^m_[\w-]{10}$/,
    // katılımcı: üye, misafir ya da v7'den kalma ("p0", "p_1696...")
    participant: /^[\w-]{1,40}$/,
    venue: /^v_[\w-]{4,40}$/,
    // v7 kayıtları "pub_<zaman>" biçimindeydi; ikisi de geçerli
    visit: /^pub_[\w-]{4,40}$/,
    photo: /^(ph_[\w-]{22}|L_pub_[\w-]{4,40})$/,
    share: /^s_[\w-]{14}$/,
    table: new RegExp(`^[${CODE_CHARS}]{6}$`)
};

export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6);
