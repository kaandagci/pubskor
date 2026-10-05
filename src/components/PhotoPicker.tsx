import { useState } from 'preact/hooks';
import type { Photo } from '../../shared/types';
import { newId } from '../../shared/ids';
import { LIMITS } from '../../shared/validate';
import { compressImage } from '../lib/image';
import { storePhoto, type PendingPhoto } from '../state/outbox';
import { toast } from '../state/ui';
import { ImagePlus, X } from './icons';
import { PhotoImg } from './visit';
import { Spinner } from './ui';

interface Props {
    /** Sunucuda zaten kayıtlı fotoğraflar. */
    saved: Photo[];
    /** Bu düzenlemede eklenen (henüz gönderilmemiş) fotoğraflar. */
    added: PendingPhoto[];
    onChange: (saved: Photo[], added: PendingPhoto[]) => void;
}

export function PhotoPicker({ saved, added, onChange }: Props) {
    const [busy, setBusy] = useState(0);
    const total = saved.length + added.length;
    const onFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        const room = LIMITS.photos - total;
        const list = [...files].slice(0, room);
        if (files.length > room) toast(`En fazla ${LIMITS.photos} fotoğraf eklenebilir`, 'info');
        setBusy(list.length);
        const out: PendingPhoto[] = [];
        for (const f of list) {
            try {
                const c = await compressImage(f);
                const id = newId.photo();
                await storePhoto(id, c.blob);
                out.push({ id, w: c.w, h: c.h, type: c.type, uploaded: false });
            } catch (e) {
                toast(e instanceof Error ? e.message : 'Fotoğraf eklenemedi', 'error');
            }
            setBusy(b => b - 1);
        }
        onChange(saved, [...added, ...out]);
    };
    return (
        <div class="photo-grid">
            {saved.map(p => (
                <div class="ph" key={p.id}>
                    <PhotoImg photo={p} />
                    <button type="button" aria-label="Fotoğrafı kaldır" onClick={() => onChange(saved.filter(x => x.id !== p.id), added)}><X /></button>
                </div>
            ))}
            {added.map(p => (
                <div class="ph" key={p.id}>
                    <PhotoImg photo={p} pending />
                    <button type="button" aria-label="Fotoğrafı kaldır" onClick={() => onChange(saved, added.filter(x => x.id !== p.id))}><X /></button>
                </div>
            ))}
            {busy > 0 && <div class="ph" style={{ display: 'grid', placeItems: 'center' }}><Spinner /></div>}
            {total < LIMITS.photos && (
                <label class="photo-add">
                    <ImagePlus />Ekle
                    <input type="file" accept="image/*" multiple onChange={e => { const t = e.target as HTMLInputElement; void onFiles(t.files); t.value = ''; }} />
                </label>
            )}
        </div>
    );
}
