import { signal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { newId } from '../../shared/ids';
import { VENUE_KINDS, venueKindFromOsm, venueKindLabel, type VenueKind } from '../../shared/metrics';
import { foldKey } from '../../shared/text';
import type { VenueInput } from '../../shared/types';
import { LIMITS } from '../../shared/validate';
import { fmtDistance, fmtRelativeDay, fmtScore } from '../lib/format';
import { inIstanbul } from '../../shared/istanbul';
import { mapsSearchUrl, type CatalogPlace } from '../../shared/places';
import { distance, getPosition, kindLabel, lastPosition, nearby, searchNominatim, searchPlaces, type LatLng, type Place } from '../lib/geo';
import { catalogAround, searchCatalog, toPlace } from '../lib/places';
import { ApiError, request } from '../lib/api';
import { authUser } from '../lib/auth';
import { summaryById, venueSummaries } from '../state/data';
import { online, toast } from '../state/ui';
import { Beer, LocateFixed, MapPin, Plus, Search, X } from '../components/icons';
import { AsyncButton, Spinner, Switch } from '../components/ui';

export interface VenueChoice { venueId: string | null; venue: VenueInput }

/** Başka bir ekrandan (ör. mekan sayfası) "burada puanla" ile gelinirse seçili mekan. */
export const presetChoice = signal<VenueChoice | null>(null);

/** Katalog mekanını seçime çevirir; ekipte aynı mekan varsa onu kullanır. */
export function choiceFromCatalog(p: CatalogPlace): VenueChoice {
    const known = venueSummaries.value.find(s => s.venue.placeId === p.id);
    if (known) return { venueId: known.venue.id, venue: { id: known.venue.id, name: known.venue.name, kind: known.venue.kind, area: known.venue.area } };
    return { venueId: null, venue: fromPlace(toPlace(p)) };
}

const fromPlace = (p: Place): VenueInput => ({
    id: newId.venue(), name: p.name.slice(0, LIMITS.venueName), kind: p.venueKind ?? venueKindFromOsm(p.kind),
    area: p.area, address: p.address, lat: p.lat, lng: p.lng, osm: p.osm, placeId: p.placeId ?? null
});

/**
 * Mekan seçici: önce ekibin mekanları, sonra yakındakiler ve adla arama. İstanbul'da kendi kataloğumuz
 * (Overture açık verisi), dışında ya da katalogda yoksa OpenStreetMap; bulunamazsa elle ekleme.
 */
export function VenuePicker({ onPick }: { onPick: (c: VenueChoice) => void }) {
    const [q, setQ] = useState('');
    const [pos, setPos] = useState<LatLng | null>(lastPosition());
    const [near, setNear] = useState<Place[] | null>(null);
    const [nearBusy, setNearBusy] = useState(false);
    const [found, setFound] = useState<Place[]>([]);
    const [osmFound, setOsmFound] = useState<Place[]>([]);
    const [searchBusy, setSearchBusy] = useState(false);
    /** Yazarken arama servisi yanıt vermiyorsa açık "Ara" düğmesiyle yedek servise geçilir. */
    const [fallback, setFallback] = useState(false);
    const [manual, setManual] = useState(false);
    const [area, setArea] = useState('');
    const [kind, setKind] = useState<VenueKind>('pub');
    const abort = useRef<AbortController | null>(null);

    const mine = useMemo(() => {
        const key = foldKey(q);
        const list = venueSummaries.value.filter(s => !key || foldKey(`${s.venue.name} ${s.venue.area}`).includes(key));
        return list.sort((a, b) => {
            if (pos && !key) {
                const da = a.venue.lat != null ? distance(pos, { lat: a.venue.lat, lng: a.venue.lng! }) : 1e9;
                const db = b.venue.lat != null ? distance(pos, { lat: b.venue.lat, lng: b.venue.lng! }) : 1e9;
                if (Math.min(da, db) < 400) return da - db;
            }
            return (b.last ?? '').localeCompare(a.last ?? '');
        }).slice(0, key ? 8 : 5);
    }, [q, venueSummaries.value, pos]);

    useEffect(() => {
        abort.current?.abort();
        const text = q.trim();
        if (text.length < 2 || !online.value) { setFound([]); setOsmFound([]); setSearchBusy(false); return; }
        const ctrl = new AbortController();
        abort.current = ctrl;
        setSearchBusy(true);
        const t = setTimeout(async () => {
            // 1) Kendi kataloğumuz (hızlı, İstanbul)
            const cat = await searchCatalog(text, pos, ctrl.signal).catch(() => []);
            if (ctrl.signal.aborted) return;
            setFound(cat.map(p => toPlace(p, pos)));
            // 2) Az sonuç varsa ya da İstanbul dışındaysak OpenStreetMap (Photon)
            const outside = pos ? !inIstanbul(pos.lat, pos.lng) : false;
            if ((cat.length < 4 || outside) && text.length >= 3 && !fallback) {
                try {
                    const osm = await searchPlaces(text, pos, ctrl.signal);
                    if (!ctrl.signal.aborted) setOsmFound(osm.filter(o => !cat.some(c => foldKey(c.name) === foldKey(o.name))));
                } catch { if (!ctrl.signal.aborted) setFallback(true); }
            } else setOsmFound([]);
            if (!ctrl.signal.aborted) setSearchBusy(false);
        }, 250);
        return () => { clearTimeout(t); ctrl.abort(); };
    }, [q]);

    const explicitSearch = async () => {
        if (q.trim().length < 2) return;
        setSearchBusy(true);
        try { setOsmFound(await searchNominatim(q.trim(), pos)); }
        catch { toast('Harita araması şu an yanıt vermiyor; mekanı elle ekleyebilirsin', 'error'); }
        finally { setSearchBusy(false); }
    };

    const findNearby = async () => {
        setNearBusy(true);
        try {
            const p = await getPosition();
            setPos(p);
            // İstanbul'da katalog karoları; dışında OpenStreetMap
            if (inIstanbul(p.lat, p.lng)) setNear((await catalogAround(p, 700)).slice(0, 40).map(x => toPlace(x, p)));
            else setNear(await nearby(p));
        } catch (e) {
            toast(e instanceof Error ? e.message : 'Konum alınamadı', 'error');
        } finally { setNearBusy(false); }
    };

    // Bilinen bir OSM mekanı ekipte zaten varsa onu seç
    const pickPlace = (p: Place) => {
        const known = venueSummaries.value.find(s => (p.placeId && s.venue.placeId === p.placeId) || (p.osm && s.venue.osm === p.osm) || (foldKey(s.venue.name) === foldKey(p.name) && (!s.venue.area || !p.area || foldKey(s.venue.area) === foldKey(p.area))));
        if (known) onPick({ venueId: known.venue.id, venue: { id: known.venue.id, name: known.venue.name, kind: known.venue.kind, area: known.venue.area } });
        else onPick({ venueId: null, venue: fromPlace(p) });
    };

    const [share, setShare] = useState(true);
    const canShare = !!pos && inIstanbul(pos.lat, pos.lng) && !!authUser.value && online.value;
    const addManual = async () => {
        const name = q.trim().slice(0, LIMITS.venueName);
        if (!name) return;
        let placeId: string | null = null;
        let finalName = name;
        // Topluluk mekanı: İstanbul listesine eklenir, sonraki aramalarda herkes bulur (puanlar gizli kalır)
        if (share && canShare) {
            try {
                const r = await request<{ place: CatalogPlace; existing: boolean }>('POST', '/api/places/community', { body: { name, kind, lat: pos!.lat, lng: pos!.lng, district: area } });
                placeId = r.place.id;
                if (r.existing) { finalName = r.place.name; toast(`“${r.place.name}” zaten listede; o seçildi`, 'info'); }
            } catch (e) {
                if (e instanceof ApiError && !e.offline && e.status !== 429) toast(e.message, 'error');
            }
        }
        onPick({ venueId: null, venue: { id: newId.venue(), name: finalName, kind, area: area.trim().slice(0, LIMITS.area), lat: pos?.lat ?? null, lng: pos?.lng ?? null, placeId } });
    };

    const placeRow = (p: Place, i: number) => (
        <button class="place" key={(p.placeId ?? p.osm ?? '') + i} onClick={() => pickPlace(p)}>
            <span class="p-icon"><MapPin /></span>
            <span class="grow" style={{ minWidth: 0 }}>
                <span class="li-title truncate" style={{ display: 'block', fontWeight: 600 }}>{p.name}</span>
                <span class="small faint truncate" style={{ display: 'block' }}>{[p.label ?? kindLabel(p.kind), p.area, p.address].filter(Boolean).join(' · ')}</span>
            </span>
            {p.distance != null && <span class="small faint num">{fmtDistance(p.distance)}</span>}
        </button>
    );

    return (
        <div>
            <form class="input-icon" onSubmit={e => { e.preventDefault(); if (fallback) void explicitSearch(); }}>
                <Search />
                <input class="input input-lg" placeholder="Mekan adı" value={q} autoFocus maxLength={LIMITS.venueName} enterKeyHint="search"
                    onInput={e => { setQ((e.target as HTMLInputElement).value); setManual(false); }} />
                {q && <button type="button" class="icon-btn clear" aria-label="Temizle" onClick={() => setQ('')}><X /></button>}
            </form>
            {fallback && q.trim().length >= 2 && online.value && (
                <button class="btn btn-secondary btn-block mt-12" onClick={explicitSearch} disabled={searchBusy}>{searchBusy ? <Spinner small /> : <Search />}“{q.trim()}” için haritada ara</button>
            )}

            {mine.length > 0 && (
                <div class="section" style={{ marginTop: '20px' }}>
                    <div class="eyebrow mb-8">{q ? 'Ekibin mekanları' : 'Son gidilenler'}</div>
                    {mine.map(s => (
                        <button class="place" key={s.venue.id} onClick={() => onPick({ venueId: s.venue.id, venue: { id: s.venue.id, name: s.venue.name, kind: s.venue.kind, area: s.venue.area } })}>
                            <span class="p-icon mine"><Beer /></span>
                            <span class="grow" style={{ minWidth: 0 }}>
                                <span class="truncate" style={{ display: 'block', fontWeight: 600 }}>{s.venue.name}</span>
                                <span class="small faint truncate" style={{ display: 'block' }}>
                                    {[venueKindLabel(s.venue.kind), s.venue.area, s.count ? `${s.count} ziyaret` : s.venue.wish ? 'Gidilecekler listesinde' : null, s.last ? fmtRelativeDay(s.last) : null].filter(Boolean).join(' · ')}
                                </span>
                            </span>
                            {summaryById.value.get(s.venue.id)?.avg != null && <b class="num">{fmtScore(s.avg)}</b>}
                        </button>
                    ))}
                </div>
            )}

            {!q && (
                <div class="section" style={{ marginTop: '20px' }}>
                    {near == null ? (
                        <button class="btn btn-secondary btn-block" onClick={findNearby} disabled={nearBusy || !online.value}>
                            {nearBusy ? <Spinner small /> : <LocateFixed />}Yakınımdaki mekanları bul
                        </button>
                    ) : (
                        <>
                            <div class="eyebrow mb-8">Yakınındakiler</div>
                            {near.length ? near.slice(0, 15).map(placeRow) : <p class="muted small">Yakında kayıtlı mekan bulunamadı. Adını yazarak ekleyebilirsin.</p>}
                        </>
                    )}
                    {!online.value && <p class="hint mt-8">Çevrimdışısın; mekanı adını yazarak ekleyebilirsin.</p>}
                </div>
            )}

            {q.trim().length >= 2 && (found.length > 0 || searchBusy) && (
                <div class="section" style={{ marginTop: '20px' }}>
                    <div class="row eyebrow mb-8">Mekanlar {searchBusy && <Spinner small />}</div>
                    {found.slice(0, 10).map(placeRow)}
                </div>
            )}
            {q.trim().length >= 2 && osmFound.length > 0 && (
                <div class="section" style={{ marginTop: '20px' }}>
                    <div class="eyebrow mb-8">OpenStreetMap</div>
                    {osmFound.slice(0, 6).map(placeRow)}
                </div>
            )}

            {q.trim() && (
                <div class="section" style={{ marginTop: '20px' }}>
                    {!manual ? (
                        <>
                            <button class="place" onClick={() => setManual(true)}>
                                <span class="p-icon"><Plus /></span>
                                <span class="grow"><b>“{q.trim()}”</b> adıyla yeni mekan ekle</span>
                            </button>
                            <a class="small faint mt-8" style={{ display: 'inline-block' }} href={mapsSearchUrl({ name: q.trim() })} target="_blank" rel="noopener">Bulamadın mı? Google Maps'te bak</a>
                        </>
                    ) : (
                        <div class="card card-pad">
                            <b>{q.trim()}</b>
                            <div class="row-wrap mt-12" role="radiogroup" aria-label="Mekan türü">
                                {VENUE_KINDS.map(k => <button key={k.id} type="button" class="chip" role="radio" aria-checked={kind === k.id} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}
                            </div>
                            <input class="input mt-12" placeholder="Semt (örn. Kadıköy)" value={area} maxLength={LIMITS.area} autoFocus onInput={e => setArea((e.target as HTMLInputElement).value)} />
                            {pos ? <p class="hint mt-8">Şu anki konumun mekanın konumu olarak kaydedilecek; mekandaysan doğru olur.</p> : (
                                <button type="button" class="btn btn-sm btn-secondary mt-12" onClick={findNearby} disabled={nearBusy}><LocateFixed />Konumumu ekle (mekandaysan)</button>
                            )}
                            {canShare && (
                                <label class="row mt-12" style={{ gap: '12px', alignItems: 'flex-start' }}>
                                    <span class="grow small"><b>Herkes bulabilsin</b><span class="muted" style={{ display: 'block' }}>Mekan, Pub Skor'un İstanbul listesine eklenir. Ziyaretin ve puanların gizli kalır.</span></span>
                                    <Switch checked={share} onChange={setShare} label="Herkes bulabilsin" />
                                </label>
                            )}
                            <AsyncButton class="btn btn-primary btn-block mt-12" onClick={addManual}>Mekanı ekle</AsyncButton>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
