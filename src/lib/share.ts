// Panoya kopyalama, sistem paylaşım menüsü ve dosya indirme.

export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch { return false; }
    }
}

export function canShareFiles(file: File): boolean {
    try { return !!navigator.canShare?.({ files: [file] }); } catch { return false; }
}

/** Sistem paylaşım menüsü; kullanıcı iptal ederse false döner. */
export async function shareNative(data: ShareData): Promise<boolean> {
    if (!navigator.share) return false;
    try { await navigator.share(data); return true; } catch { return false; }
}

export function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Dosyayı mümkünse paylaşım menüsüyle, değilse indirerek verir. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
    const file = new File([blob], filename, { type: blob.type });
    if (canShareFiles(file)) {
        try { await navigator.share({ files: [file], title }); return 'shared'; } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
        }
    }
    download(blob, filename);
    return 'downloaded';
}

export const safeFilename = (s: string) => (s || 'pub').replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'pub';
