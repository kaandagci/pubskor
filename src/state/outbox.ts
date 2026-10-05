// Çevrimdışı gönderim kuyruğu. Ziyaret kaydı ve fotoğraflar önce cihaza yazılır, bağlantı varken sırayla gönderilir.
// İstekler idempotenttir (istemci kimlikleri), bu yüzden yarıda kalan gönderim güvenle tekrar denenir.
import { signal } from '@preact/signals';
import type { CrewSnapshot, VisitInput } from '../../shared/types';
import { ApiError, request } from '../lib/api';
import { idb } from '../lib/storage';
import { applySnapshot, handleAuthError } from './crew';
import { activeMembership, tokenFor } from './session';
import { toast } from './ui';

export interface PendingPhoto { id: string; w: number; h: number; type: string; uploaded: boolean }

export interface OutboxItem {
    crewId: string;
    method: 'POST' | 'PUT';
    visit: VisitInput;
    photos: PendingPhoto[];
    queuedAt: number;
    attempts: number;
    /** Kalıcı hata (doğrulama, çakışma); kullanıcı müdahalesi gerekir. */
    error?: { message: string; code: string | null } | null;
}

export const outbox = signal<OutboxItem[]>([]);
export const flushing = signal(false);

const KEY = 'outbox';
let loaded = false;

export async function loadOutbox() {
    if (loaded) return;
    loaded = true;
    outbox.value = (await idb.get<OutboxItem[]>(KEY)) ?? [];
}

async function save() { await idb.set(KEY, outbox.value); }

// ----- Bekleyen fotoğraflar -----

const urlCache = new Map<string, string>();

export async function storePhoto(id: string, blob: Blob) {
    await idb.set('photo:' + id, blob);
    urlCache.set(id, URL.createObjectURL(blob));
}

/** Fotoğraf adresi: henüz gönderilmemişse cihazdaki kopya. */
export function photoUrl(id: string): string {
    return urlCache.get(id) ?? `/api/photos/${encodeURIComponent(id)}`;
}

/** Önbellekte nesne URL'si yoksa cihazdaki kopyadan oluşturur (sayfa yenilenince). */
export async function hydratePhoto(id: string): Promise<string | null> {
    if (urlCache.has(id)) return urlCache.get(id)!;
    const blob = await idb.get<Blob>('photo:' + id);
    if (!blob) return null;
    const u = URL.createObjectURL(blob);
    urlCache.set(id, u);
    return u;
}

async function dropPhoto(id: string) {
    await idb.del('photo:' + id);
}

// ----- Kuyruk -----

export async function enqueue(item: Omit<OutboxItem, 'queuedAt' | 'attempts' | 'error'>) {
    await loadOutbox();
    const rest = outbox.value.filter(x => x.visit.id !== item.visit.id);
    // Gönderilmemiş bir oluşturmayı düzenlemek yine oluşturmadır
    const prev = outbox.value.find(x => x.visit.id === item.visit.id);
    const method = prev?.method === 'POST' ? 'POST' : item.method;
    outbox.value = [...rest, { ...item, method, queuedAt: Date.now(), attempts: 0, error: null }];
    await save();
    void flush();
}

export async function discard(visitId: string) {
    const item = outbox.value.find(x => x.visit.id === visitId);
    outbox.value = outbox.value.filter(x => x.visit.id !== visitId);
    await save();
    if (item) await Promise.all(item.photos.filter(p => !p.uploaded).map(p => dropPhoto(p.id)));
}

/** Çakışmada kullanıcı "yine de kaydet" derse sürüm kontrolü olmadan tekrar gönderir. */
export async function forceRetry(visitId: string) {
    outbox.value = outbox.value.map(x => (x.visit.id === visitId ? { ...x, error: null, attempts: 0, visit: { ...x.visit, baseUpdatedAt: undefined } } : x));
    await save();
    void flush();
}

let flushPromise: Promise<void> | null = null;

export function flush(): Promise<void> {
    flushPromise ??= run().finally(() => { flushPromise = null; });
    return flushPromise;
}

async function run() {
    await loadOutbox();
    if (navigator.onLine === false) return;
    flushing.value = true;
    try {
        for (const item of [...outbox.value]) {
            if (item.error) continue;
            const token = tokenFor(item.crewId);
            if (!token) continue;
            const ok = await send(item, token);
            if (!ok) break; // ağ sorunu: sırayı koru, sonra tekrar dene
        }
    } finally {
        flushing.value = false;
    }
}

async function send(item: OutboxItem, token: string): Promise<boolean> {
    const patch = (p: Partial<OutboxItem>) => {
        outbox.value = outbox.value.map(x => (x.visit.id === item.visit.id ? { ...x, ...p } : x));
        void save();
    };
    try {
        for (const ph of item.photos) {
            if (ph.uploaded) continue;
            const blob = await idb.get<Blob>('photo:' + ph.id);
            if (!blob) { ph.uploaded = true; continue; } // kopya kaybolmuş: fotoğrafsız devam
            await request('PUT', '/api/photos/' + ph.id, {
                token, raw: blob, timeout: 60000,
                headers: { 'content-type': ph.type, 'x-photo-width': String(ph.w), 'x-photo-height': String(ph.h) }
            });
            ph.uploaded = true;
            patch({ photos: [...item.photos] });
        }
        const photos = item.photos.map(p => ({ id: p.id, w: p.w, h: p.h }));
        const keep = (item.visit.photos ?? []).filter(p => !item.photos.some(x => x.id === p.id));
        const body = { ...item.visit, photos: [...keep, ...photos] };
        const path = item.method === 'POST' ? '/api/crew/visits' : '/api/crew/visits/' + encodeURIComponent(item.visit.id);
        const r = await request<{ snapshot: CrewSnapshot }>(item.method, path, { token, body });
        outbox.value = outbox.value.filter(x => x.visit.id !== item.visit.id);
        await save();
        await Promise.all(item.photos.map(p => dropPhoto(p.id)));
        if (r?.snapshot && activeMembership.value?.crewId === item.crewId) applySnapshot(r.snapshot);
        else if (r?.snapshot) void idb.set('crew:' + item.crewId, r.snapshot);
        return true;
    } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError('Gönderilemedi', 0);
        if (err.offline || err.status >= 500 || err.status === 429 || err.status === 503) {
            patch({ attempts: item.attempts + 1 });
            return false;
        }
        if (handleAuthError(err, item.crewId)) return true;
        patch({ error: { message: err.message, code: err.code } });
        toast(err.code === 'conflict' ? 'Bir ziyaret başkasının düzenlemesiyle çakıştı' : `Kaydedilemedi: ${err.message}`, 'error');
        return true;
    }
}

export function startOutbox() {
    void loadOutbox().then(() => flush());
    window.addEventListener('online', () => void flush());
    setInterval(() => { if (outbox.value.some(x => !x.error)) void flush(); }, 20000);
}
