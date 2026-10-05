import { emblemFor, type PlaceLike } from '../lib/emblems';

/** Mekan simgesi: ilçenin / şehrin sembolü, renk geçişli yuvarlak karoda (uygulama simgesi gibi). */
export function PlaceEmblem({ place, size = 52 }: { place: PlaceLike | null | undefined; size?: number }) {
    const e = emblemFor(place);
    return (
        <span
            class="emblem" style={{ width: `${size}px`, height: `${size}px`, '--e1': e.def.from, '--e2': e.def.to }}
            role="img" aria-label={e.place ? `${e.def.label} · ${e.place}` : e.def.label} title={e.place ? `${e.place} · ${e.def.label}` : e.def.label}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true">{e.def.paths.map(d => <path key={d} d={d} />)}</svg>
        </span>
    );
}

/** Fotoğrafsız büyük kapak: sembolün renk geçişi, köşede büyük sembol ve ortada karo. */
export function EmblemCover({ place }: { place: PlaceLike | null | undefined }) {
    const e = emblemFor(place);
    return (
        <div class="emblem-cover" style={{ '--e1': e.def.from, '--e2': e.def.to }}>
            <svg class="emblem-cover-art" viewBox="0 0 24 24" aria-hidden="true">{e.def.paths.map(d => <path key={d} d={d} />)}</svg>
            {e.place && <span class="emblem-cover-label"><PlaceEmblem place={place} size={22} />{e.place}</span>}
        </div>
    );
}
