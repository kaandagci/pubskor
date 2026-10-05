// Fotoğrafı tarayıcıda küçültür (en uzun kenar 1600 px), EXIF yönünü uygular, WebP/JPEG'e çevirir.

export interface Compressed { blob: Blob; w: number; h: number; type: string }

const MAX_EDGE = 1600;
const MAX_BYTES = 1_450_000;

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; close: () => void }> {
    if ('createImageBitmap' in window) {
        try {
            const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
            return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
        } catch { /* HEIC gibi biçimlerde <img> ile dene */ }
    }
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.decoding = 'async';
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Bu fotoğraf biçimi desteklenmiyor')); img.src = url; });
        return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
    }
}

function toBlob(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
    return new Promise(res => canvas.toBlob(res, type, q));
}

export async function compressImage(file: Blob): Promise<Compressed> {
    if (!file.type.startsWith('image/') && file.type !== '') throw new Error('Lütfen bir fotoğraf seç');
    const img = await decode(file);
    try {
        let scale = Math.min(1, MAX_EDGE / Math.max(img.w, img.h));
        for (let attempt = 0; attempt < 4; attempt++) {
            const w = Math.max(1, Math.round(img.w * scale)), h = Math.max(1, Math.round(img.h * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img.src, 0, 0, w, h);
            const q = 0.82 - attempt * 0.08;
            let blob = await toBlob(canvas, 'image/webp', q);
            if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', q);
            if (blob && blob.size <= MAX_BYTES) return { blob, w, h, type: blob.type };
            scale *= 0.8;
        }
        throw new Error('Fotoğraf küçültülemedi');
    } finally {
        img.close();
    }
}
