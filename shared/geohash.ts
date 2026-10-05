// Geohash (karo anahtarı). Bağımlılıksız; derleme yapılandırması (vite.config.ts) da kullanır.

const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
export const TILE_PRECISION = 6;

export function geohash(lat: number, lng: number, precision = TILE_PRECISION): string {
    let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180;
    let out = '', bit = 0, ch = 0, even = true;
    while (out.length < precision) {
        if (even) {
            const mid = (lngLo + lngHi) / 2;
            if (lng >= mid) { ch = (ch << 1) | 1; lngLo = mid; } else { ch <<= 1; lngHi = mid; }
        } else {
            const mid = (latLo + latHi) / 2;
            if (lat >= mid) { ch = (ch << 1) | 1; latLo = mid; } else { ch <<= 1; latHi = mid; }
        }
        even = !even;
        if (++bit === 5) { out += B32[ch]; bit = 0; ch = 0; }
    }
    return out;
}
