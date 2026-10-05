// public/icons/icon.svg dosyasından PNG uygulama simgelerini üretir: npm run icons
// (Simgeler depoda hazır; yalnızca icon.svg değişirse çalıştır. @resvg/resvg-js geçici olarak indirilir.)
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
// Maskelenebilir simge: köşesiz tam zemin, içerik güvenli alanda (%80)
const maskable = svg
    .replace('<rect width="512" height="512" rx="112" fill="url(#bg)"/>', '<rect width="512" height="512" fill="url(#bg)"/>')
    .replace('translate(136 82) scale(6)', 'translate(163 112) scale(4.65)');

const out = [
    ['icon-192.png', svg, 192], ['icon-512.png', svg, 512],
    ['maskable-512.png', maskable, 512], ['apple-touch-icon.png', maskable, 180]
];
for (const [name, src, size] of out) {
    const png = new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng();
    writeFileSync(`public/icons/${name}`, png);
    console.log('yazıldı', name, png.length, 'bayt');
}
