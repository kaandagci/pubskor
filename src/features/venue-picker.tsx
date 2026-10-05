import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { newId } from '../../shared/ids';
import { VENUE_KINDS, venueKindFromOsm, venueKindLabel, type VenueKind } from '../../shared/metrics';
import { foldKey } from '../../shared/text';
import type { VenueInput } from '../../shared/types';
import { LIMITS } from '../../shared/validate';
import { fmtDistance, fmtRelativeDay, fmtScore } from '../lib/format';
import { distance, getPosition, kindLabel, lastPosition, nearby, searchNominatim, searchPlaces, type LatLng, type Place } from '../lib/geo';
import { summaryById, venueSummaries } from '../state/data';
import { online, toast } from '../state/ui';
import { Beer, LocateFixed, MapPin, Plus, Search, X } from '../components/icons';
import { Spinner } from '../components/ui';

export interface VenueChoice { venueId: string | null; venue: VenueInput }

const fromPlace = (p: Place): VenueInput => ({ id: newId.venue(), name: p.name.slice(0, LIMITS.venueName), kind: venueKindFromOsm(p.kind), area: p.area, address: p.address, lat: p.lat, lng: p.lng, osm: p.osm });

/** Mekan seçici: önce ekibin mekanları, sonra yakındakiler (OSM) ve adla arama; bulunamazsa elle ekleme. */
export function VenuePicker({ onPick }: { onPick: (c: VenueChoice) => void }) {
    const [q, setQ] = useState('');
    const [pos, setPos] = useState<LatLng | null>(lastPosition());
    const [near, setNear] = useState<Place[] | null>(null);
    const [nearBusy, setNearBusy] = useState(false);
    const [found, setFound] = useState<Place[]>([]);
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
        if (q.trim().length < 3 || !online.value || fallback) { if (!fallback) setFound([]); setSearchBusy(false); return; }
        const ctrl = new AbortController();
        abort.current = ctrl;
        setSearchBusy(true);
        const t = setTimeout(() => {
            searchPlaces(q.trim(), pos, ctrl.signal)
                .then(r => { if (!ctrl.signal.aborted) setFound(r); })
                .catch(() => { if (!ctrl.signal.aborted) setFallback(true); })
                .finally(() => { if (!ctrl.signal.aborted) setSearchBusy(false); });
        }, 380);
        return () => { clearTimeout(t); ctrl.abort(); };
    }, [q]);

    const explicitSearch = async () => {
        if (q.trim().length < 2) return;
        setSearchBusy(true);
        try { setFound(await searchNominatim(q.trim(), pos)); }
        catch { toast('Harita araması şu an yanıt vermiyor; mekanı elle ekleyebilirsin', 'error'); }
        finally { setSearchBusy(false); }
    };

    const findNearby = async () => {
        setNearBusy(true);
        try {
            const p = await getPosition();
            setPos(p);
            setNear(await nearby(p));
        } catch (e) {
            toast(e instanceof Error ? e.message : 'Konum alınamadı', 'error');
        } finally { setNearBusy(false); }
    };

    // Bilinen bir OSM mekanı ekipte zaten varsa onu seç
    const pickPlace = (p: Place) => {
        const known = venueSummaries.value.find(s => (p.osm && s.venue.osm === p.osm) || (foldKey(s.venue.name) === foldKey(p.name) && (!s.venue.area || !p.area || foldKey(s.venue.area) === foldKey(p.area))));
        if (known) onPick({ venueId: known.venue.id, venue: { id: known.venue.id, name: known.venue.name, kind: known.venue.kind, area: known.venue.area } });
        else onPick({ venueId: null, venue: fromPlace(p) });
    };

    const addManual = () => {
        const name = q.trim().slice(0, LIMITS.venueName);
        if (!name) return;
        onPick({ venueId: null, venue: { id: newId.venue(), name, kind, area: area.trim().slice(0, LIMITS.area), lat: pos?.lat ?? null, lng: pos?.lng ?? null } });
    };

    const placeRow = (p: Place, i: number) => (
        <button class="place" key={(p.osm ?? '') + i} onClick={() => pickPlace(p)}>
            <span class="p-icon"><MapPin /></span>
            <span class="grow" style={{ minWidth: 0 }}>
                <span class="li-title truncate" style={{ display: 'block', fontWeight: 600 }}>{p.name}</span>
                <span class="small faint truncate" style={{ display: 'block' }}>{[kindLabel(p.kind), p.area, p.address].filter(Boolean).join(' · ')}</span>
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

            {q.trim().length >= 2 && (found.length > 0 || (searchBusy && !fallback)) && (
                <div class="section" style={{ marginTop: '20px' }}>
                    <div class="row eyebrow mb-8">Haritada {searchBusy && <Spinner small />}</div>
                    {found.slice(0, 8).map(placeRow)}
                </div>
            )}

            {q.trim() && (
                <div class="section" style={{ marginTop: '20px' }}>
                    {!manual ? (
                        <button class="place" onClick={() => setManual(true)}>
                            <span class="p-icon"><Plus /></span>
                            <span class="grow"><b>“{q.trim()}”</b> adıyla yeni mekan ekle</span>
                        </button>
                    ) : (
                        <div class="card card-pad">
                            <b>{q.trim()}</b>
                            <div class="row-wrap mt-12" role="radiogroup" aria-label="Mekan türü">
                                {VENUE_KINDS.map(k => <button key={k.id} type="button" class="chip" role="radio" aria-checked={kind === k.id} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}
                            </div>
                            <input class="input mt-12" placeholder="Semt (örn. Kadıköy)" value={area} maxLength={LIMITS.area} autoFocus onInput={e => setArea((e.target as HTMLInputElement).value)} />
                            <p class="hint mt-8">{pos ? 'Konumun mekan konumu olarak kaydedilecek.' : 'Konumu sonra mekan sayfasından ekleyebilirsin.'}</p>
                            <button class="btn btn-primary btn-block mt-12" onClick={addManual}>Mekanı ekle</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
