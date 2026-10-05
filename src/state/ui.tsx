// Arayüz durumu: bildirimler, alt sayfalar, tema, bağlantı.
import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { local } from '../lib/storage';

// ----- Bildirimler -----

export interface Toast {
    id: number;
    kind: 'success' | 'error' | 'info';
    message: string;
    action?: { label: string; run: () => void };
    leaving?: boolean;
}

export const toasts = signal<Toast[]>([]);
let toastSeq = 0;

export function toast(message: string, kind: Toast['kind'] = 'success', action?: Toast['action'], ms = action ? 6000 : 3200) {
    const id = ++toastSeq;
    toasts.value = [...toasts.value.slice(-2), { id, kind, message, action }];
    setTimeout(() => dismissToast(id), ms);
    return id;
}

export function dismissToast(id: number) {
    if (!toasts.value.some(t => t.id === id)) return;
    toasts.value = toasts.value.map(t => (t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 200);
}

export const toastError = (e: unknown) => toast(e instanceof Error ? e.message : 'Bir şeyler ters gitti', 'error');

// ----- Alt sayfalar (sheet) -----

export interface SheetSpec {
    id: number;
    title?: string;
    render: (close: () => void) => ComponentChildren;
    footer?: (close: () => void) => ComponentChildren;
    closing?: boolean;
    onClose?: () => void;
}

export const sheets = signal<SheetSpec[]>([]);
let sheetSeq = 0;

export function openSheet(spec: Omit<SheetSpec, 'id'>): () => void {
    const id = ++sheetSeq;
    sheets.value = [...sheets.value, { ...spec, id }];
    return () => closeSheet(id);
}

export function closeSheet(id?: number) {
    const target = id ?? sheets.value[sheets.value.length - 1]?.id;
    const s = sheets.value.find(x => x.id === target);
    if (!s || s.closing) return;
    sheets.value = sheets.value.map(x => (x.id === target ? { ...x, closing: true } : x));
    setTimeout(() => {
        sheets.value = sheets.value.filter(x => x.id !== target);
        s.onClose?.();
    }, 210);
}

/** Onay diyaloğu; tarayıcının confirm() penceresi yerine. */
export function confirmSheet(o: { title: string; body?: ComponentChildren; confirm: string; danger?: boolean; cancel?: string }): Promise<boolean> {
    return new Promise(resolve => {
        let answered = false;
        const done = (v: boolean, close: () => void) => { answered = true; resolve(v); close(); };
        openSheet({
            title: o.title,
            render: () => (o.body ? <p class="muted">{o.body}</p> : null),
            footer: close => (
                <>
                    <button class="btn btn-secondary" onClick={() => done(false, close)}>{o.cancel ?? 'Vazgeç'}</button>
                    <button class={`btn ${o.danger ? 'btn-danger solid' : 'btn-primary'}`} onClick={() => done(true, close)}>{o.confirm}</button>
                </>
            ),
            onClose: () => { if (!answered) resolve(false); }
        });
    });
}

// ----- Tema -----

export type ThemePref = 'system' | 'light' | 'dark';
export const themePref = signal<ThemePref>(local.get<ThemePref>('theme', 'system'));

export function applyTheme(pref: ThemePref) {
    themePref.value = pref;
    local.set('theme', pref);
    const root = document.documentElement;
    if (pref === 'system') delete root.dataset.theme; else root.dataset.theme = pref;
    const dark = pref === 'dark' || (pref === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
    // Tarayıcı / PWA durum çubuğu zeminle aynı renkte (tokens.css → --bg)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f2f2f7');
}

// ----- Bağlantı -----

export const online = signal(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { online.value = true; });
    window.addEventListener('offline', () => { online.value = false; });
}

export function haptic(ms = 8) {
    try { navigator.vibrate?.(ms); } catch { /* desteklenmiyor */ }
}
