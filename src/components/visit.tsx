import { useEffect, useState } from 'preact/hooks';
import type { Photo, Visit } from '../../shared/types';
import { fmtRelativeDay, fmtScore } from '../lib/format';
import { pendingIds, venueById } from '../state/data';
import { hydratePhoto, photoUrl } from '../state/outbox';
import { AvatarStack } from './Avatar';
import { CloudOff, MapPin } from './icons';
import { ScoreRing } from './ScoreRing';
import { TierChip } from './ui';

/** Fotoğraf adresi; gönderilmemiş fotoğraflar için cihazdaki kopyayı yükler. */
export function usePhotoUrl(id: string | null | undefined, pending = false): string | null {
    const [url, setUrl] = useState(id ? photoUrl(id) : null);
    useEffect(() => {
        if (!id) { setUrl(null); return; }
        setUrl(photoUrl(id));
        if (pending) void hydratePhoto(id).then(u => { if (u) setUrl(u); });
    }, [id, pending]);
    return url;
}

export function PhotoImg({ photo, pending, alt = '', eager }: { photo: Photo; pending?: boolean; alt?: string; eager?: boolean }) {
    const url = usePhotoUrl(photo.id, pending);
    const [failed, setFailed] = useState(false);
    if (!url || failed) return <div class="pattern" />;
    return <img src={url} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" width={photo.w} height={photo.h} onError={() => setFailed(true)} />;
}

/** Fotoğraf yoksa mekanın baş harfiyle üretilmiş kapak. */
export function Cover({ visit, name, eager }: { visit?: Visit | null; name: string; eager?: boolean }) {
    const photo = visit?.photos[0];
    if (photo) return <PhotoImg photo={photo} pending={pendingIds.value.has(visit!.id)} eager={eager} alt={name} />;
    return <div class="pattern"><span class="mono">{(name.trim()[0] ?? '?').toLocaleUpperCase('tr')}</span></div>;
}

export function VisitRow({ v }: { v: Visit }) {
    const venue = venueById.value.get(v.venueId);
    const name = venue?.name ?? 'Bilinmeyen mekan';
    const pending = pendingIds.value.has(v.id);
    return (
        <a class="vrow" href={`/ziyaret/${v.id}`}>
            <div class="vrow-thumb"><Cover visit={v} name={name} /></div>
            <div class="vrow-body">
                <div class="vrow-title">{name}</div>
                <div class="vrow-meta">{[venue?.area, fmtRelativeDay(v.date)].filter(Boolean).join(' · ')}</div>
                <div class="vrow-foot">
                    <AvatarStack people={v.participants} max={4} />
                    {pending && <span class="badge badge-warn"><CloudOff />Gönderilecek</span>}
                </div>
            </div>
            <div class="vrow-score">
                <b>{fmtScore(v.score)}</b>
                <TierChip score={v.score} />
            </div>
        </a>
    );
}

export function VisitHero({ v }: { v: Visit }) {
    const venue = venueById.value.get(v.venueId);
    const name = venue?.name ?? 'Bilinmeyen mekan';
    const pending = pendingIds.value.has(v.id);
    return (
        <a class="vhero" href={`/ziyaret/${v.id}`}>
            <div class="vhero-media">
                <Cover visit={v} name={name} eager />
                <div class="vhero-pill score-pill"><ScoreRing score={v.score} size={24} stroke={3.5} /><b>{fmtScore(v.score)}</b></div>
            </div>
            <div class="vhero-body">
                <h3 class="display">{name}</h3>
                <div class="vhero-meta">
                    <MapPin size={14} />{[venue?.area, fmtRelativeDay(v.date)].filter(Boolean).join(' · ')}
                    {pending && <span class="badge badge-warn"><CloudOff />Gönderilecek</span>}
                </div>
                <div class="row between mt-12">
                    <AvatarStack people={v.participants} max={5} />
                    <TierChip score={v.score} />
                </div>
            </div>
        </a>
    );
}
