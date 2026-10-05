// Yakalanmayan istemci hatalarını sunucu günlüğüne bildirir (yalnızca yayında). Kimlik bilgisi gönderilmez:
// hata mesajı, dosya / satır, yığın izi, sayfa yolu (sorgusuz) ve sürüm. Oturum başına en fazla 5 rapor.
import { APP_VERSION } from '../config';

const sent = new Set<string>();
const LIMIT = 5;

export function reportError(kind: string, err: unknown, extra: { source?: string; line?: number; column?: number } = {}) {
    if (!import.meta.env.PROD || sent.size >= LIMIT) return;
    const e = err instanceof Error ? err : null;
    const message = String(e?.message ?? err ?? '').slice(0, 300);
    if (!message || /ResizeObserver loop|Script error\.?$/i.test(message)) return; // zararsız / ayrıntısız tarayıcı uyarıları
    const key = kind + message;
    if (sent.has(key)) return;
    sent.add(key);
    const body = JSON.stringify({ kind, message, stack: e?.stack?.slice(0, 1200) ?? '', page: location.pathname, version: APP_VERSION, ...extra });
    try {
        if (!navigator.sendBeacon?.('/api/client-error', new Blob([body], { type: 'application/json' }))) {
            void fetch('/api/client-error', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined);
        }
    } catch { /* bildirim başarısızsa sessizce geç */ }
}

export function installErrorReporting() {
    window.addEventListener('error', e => reportError('error', e.error ?? e.message, { source: e.filename, line: e.lineno, column: e.colno }));
    window.addEventListener('unhandledrejection', e => reportError('promise', e.reason));
}
