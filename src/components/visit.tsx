import { useEffect, useState } from 'preact/hooks';
import { tierOf } from '../../shared/metrics';
import type { Photo, Venue, Visit } from '../../shared/types';
import { emblemFor } from '../lib/emblems';
import { fmtRelativeDay } from '../lib/format';
import { pendingIds, venueById } from '../state/data';
import { hydratePhoto, photoUrl } from '../state/outbox';
import { AvatarStack } from './Avatar';
import { CloudOff } from './icons';
import { EmblemCover, PlaceEmblem } from './PlaceEmblem';
import { ScoreRing } from './ScoreRing';

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

/** Fotoğraf yoksa mekanın ilçesinin / şehrinin simgesiyle tasarlanmış kapak. */
export function Cover({ visit, venue, name, eager }: { visit?: Visit | null; venue?: Venue | null; name: string; eager?: boolean }) {
    const photo = visit?.photos[0];
    if (photo) return <PhotoImg photo={photo} pending={pendingIds.value.has(visit!.id)} eager={eager} alt={name} />;
    return <EmblemCover place={venue} />;
}

/** Ziyaret satırı (akış, kişi ve mekan sayfaları): fotoğraf ya da mekan simgesi, ad, yer, kişiler, skor halkası. */
export function VisitRow({ v }: { v: Visit }) {
    const venue = venueById.value.get(v.venueId);
    const name = venue?.name ?? 'Bilinmeyen mekan';
    const pending = pendingIds.value.has(v.id);
    const photo = v.photos[0];
    const place = venue?.area || emblemFor(venue).place;
    const t = tierOf(v.score);
    return (
        <a class="vrow" href={`/ziyaret/${v.id}`}>
            <div class="vrow-thumb">{photo ? <PhotoImg photo={photo} pending={pending} alt={name} /> : <PlaceEmblem place={venue} size={52} />}</div>
            <div class="vrow-body">
                <div class="vrow-title">{name}</div>
                <div class="vrow-meta">{[place, fmtRelativeDay(v.date)].filter(Boolean).join(' · ')}</div>
                <div class="vrow-foot">
                    <AvatarStack people={v.participants} max={4} />
                    {v.score != null && <span class={`vrow-tier tier-${t.id}`}>{t.label}</span>}
                    {pending && <span class="badge badge-warn"><CloudOff />Gönderilecek</span>}
                </div>
            </div>
            <ScoreRing score={v.score} size={46} stroke={4.5} />
        </a>
    );
}
