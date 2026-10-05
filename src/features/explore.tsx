// Keşfet: İstanbul'un 39 ilçesinde bugün / bu hafta / bu ay çok gidilen içki mekanları (Pub Skor ekiplerinin
// anonim kayıtları), ilçe / semt / tür filtresi, liste ya da harita. Veri yetersizse seçilen bölgenin
// mekanlarını katalogdan gösterir (ilçe seçilince ilçenin tamamı).
import { useEffect, useMemo, useState } from 'preact/hooks';
import { lazy } from 'preact-iso';
import { DISTRICTS, HOODS, ISTANBUL_CENTER, inIstanbul } from '../../shared/istanbul';
import { venueKindLabel, type VenueKind } from '../../shared/metrics';
import { meters, type CatalogPlace } from '../../shared/places';
import { fmtDistance, fmtScore } from '../lib/format';
import { getPosition, lastPosition, type LatLng } from '../lib/geo';
import { browsePlaces, catalogAround, catalogMeta } from '../lib/places';
import { loadPopular, placeStats, popular, type PopularItem, type Window } from '../lib/popular';
import { memberships } from '../state/session';
import { openSheet, toastError } from '../state/ui';
import { ChevronDown, ChevronRight, ListOrdered, LocateFixed, Map as MapIcon, Sparkles, TrendingDown, TrendingUp } from '../components/icons';
import { ScoreRing } from '../components/ScoreRing';
import { AsyncButton, Segmented, Spinner, TopBar } from '../components/ui';
import { PlaceEmblem } from '../components/PlaceEmblem';

const ExploreMap = lazy(() => import('./explore-map'));

type Area = { type: 'near' } | { type: 'all' } | { type: 'hood'; id: string } | { type: 'district'; name: string };
type KindFilter = 'all' | 'night' | 'kokteyl' | 'meyhane' | 'sarap' | 'restoran';

const KIND_FILTERS: [KindFilter, string][] = [
    ['all', 'Tümü'], ['night', 'Bar & pub'], ['kokteyl', 'Kokteyl'], ['meyhane', 'Meyhane'], ['sarap', 'Şarap'], ['restoran', 'Restoran']
];
const kindMatch = (f: KindFilter, k: VenueKind) =>
    f === 'all' || (f === 'night' ? k === 'pub' || k === 'bar' || k === 'brewpub' : k === f);


const WINDOW_LABEL: Record<Window, string> = { day: 'bugün', week: 'bu hafta', month: 'bu ay' };

function areaCenter(a: Area, pos: LatLng | null): LatLng | null {
    if (a.type === 'near') return pos;
    if (a.type === 'hood') { const h = HOODS.find(x => x.id === a.id); return h ? { lat: h.lat, lng: h.lng } : null; }
    if (a.type === 'district') { const d = DISTRICTS.find(x => x.name === a.name); return d ? { lat: d.lat, lng: d.lng } : null; }
    return null;
}

function areaLabel(a: Area): string {
    if (a.type === 'near') return 'yakınında';
    if (a.type === 'all') return "İstanbul'da";
    if (a.type === 'hood') return `${HOODS.find(x => x.id === a.id)?.name ?? ''} civarında`;
    return `${a.name} ilçesinde`;
}

function Trend({ n }: { n: number | null | undefined }) {
    if (n == null || n === 0) return null;
    return n > 0
        ? <span class="trend up" title="Geçen haftaya göre"><TrendingUp size={13} />{n}</span>
        : <span class="trend down" title="Geçen haftaya göre"><TrendingDown size={13} />{-n}</span>;
}

function PopularRow({ p, rank, dist }: { p: PopularItem; rank: number; dist: number | null }) {
    return (
        <a class="pop-row" href={`/yer/${p.id}`}>
            <span class="pop-rank num">{rank}</span>
            <PlaceEmblem place={p} size={40} />
            <span class="grow" style={{ minWidth: 0 }}>
                <span class="truncate" style={{ display: 'block', fontWeight: 650 }}>{p.name}</span>
                <span class="small faint truncate" style={{ display: 'block' }}>{[venueKindLabel(p.kind), p.district, dist != null ? fmtDistance(dist) : null].filter(Boolean).join(' · ')}</span>
            </span>
            <span class="pop-meta">
                <b class="num">{p.groups}</b><span class="tiny faint">grup</span>
                <Trend n={p.trend} />
            </span>
            {p.score != null && <span class="pop-score"><ScoreRing score={p.score} size={16} stroke={3} /><span class="num">{fmtScore(p.score)}</span></span>}
        </a>
    );
}

function NearbyRow({ p, dist }: { p: CatalogPlace; dist: number | null }) {
    return (
        <a class="pop-row" href={`/yer/${p.id}`}>
            <PlaceEmblem place={p} size={40} />
            <span class="grow" style={{ minWidth: 0 }}>
                <span class="truncate" style={{ display: 'block', fontWeight: 600 }}>{p.name}</span>
                <span class="small faint truncate" style={{ display: 'block' }}>{[venueKindLabel(p.kind), p.address || p.district].filter(Boolean).join(' · ')}</span>
            </span>
            {dist != null && <span class="small faint num">{fmtDistance(dist)}</span>}
            <ChevronRight size={16} class="faint" />
        </a>
    );
}

/** Tüm ilçeler (alfabetik) ve katalogdaki mekan sayıları. */
function DistrictSheet({ current, onPick }: { current: string | null; onPick: (name: string) => void }) {
    const [counts, setCounts] = useState<Record<string, number>>({});
    useEffect(() => { void catalogMeta().then(m => setCounts(m.districts ?? {})); }, []);
    const list = [...DISTRICTS].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    return (
        <div class="district-grid">
            {list.map(d => (
                <button key={d.id} class="district-cell" aria-pressed={current === d.name} onClick={() => onPick(d.name)}>
                    <PlaceEmblem place={{ district: d.name }} size={34} />
                    <span class="dc-text"><b>{d.name}</b><span class="tiny faint">{counts[d.name] ? `${counts[d.name]} mekan` : d.side === 'anadolu' ? 'Anadolu' : 'Avrupa'}</span></span>
                </button>
            ))}
        </div>
    );
}

const KIND_SET: Record<KindFilter, string[]> = {
    all: [], night: ['pub', 'bar', 'brewpub'], kokteyl: ['kokteyl'], meyhane: ['meyhane'], sarap: ['sarap'], restoran: ['restoran']
};

export function Explore() {
    const [win, setWin] = useState<Window>('week');
    const [area, setArea] = useState<Area>(() => (lastPosition() && inIstanbul(lastPosition()!.lat, lastPosition()!.lng) ? { type: 'near' } : { type: 'all' }));
    const [kind, setKind] = useState<KindFilter>('all');
    const [pos, setPos] = useState<LatLng | null>(lastPosition());
    const [locating, setLocating] = useState(false);
    const [view, setView] = useState<'list' | 'map'>('list');
    const [nearby, setNearby] = useState<(CatalogPlace & { distance: number | null })[] | null>(null);
    const [browse, setBrowse] = useState<{ total: number; places: CatalogPlace[] } | null>(null);
    const [counts, setCounts] = useState<Record<string, number>>({});

    useEffect(() => { void loadPopular(); void catalogMeta().then(m => setCounts(m.districts ?? {})); }, []);

    const center = areaCenter(area, pos);
    const items = useMemo(() => {
        const list = popular.value?.windows[win] ?? [];
        return list
            .filter(p => kindMatch(kind, p.kind))
            .filter(p => {
                if (area.type === 'all') return true;
                if (area.type === 'district') return p.district === area.name;
                if (!center) return false;
                return meters(center, p) <= (area.type === 'near' ? 3000 : 1200);
            })
            .map(p => ({ p, dist: pos ? meters(pos, p) : null }));
    }, [popular.value, win, kind, area, pos]);

    // Popüler liste kısa kaldıysa: seçilen bölgedeki mekanlar (yakınım / semt: çevre; ilçe: ilçenin tamamı)
    const few = items.length < 5;
    useEffect(() => {
        setNearby(null); setBrowse(null);
        if (!few) return;
        let live = true;
        if (area.type === 'district') {
            void browsePlaces(area.name, KIND_SET[kind]).then(r => { if (live) setBrowse(r); }).catch(() => undefined);
        } else if (area.type === 'near' || area.type === 'hood') {
            const c = center;
            if (c) void catalogAround(c, area.type === 'near' ? 1500 : 900).then(r => {
                if (!live) return;
                setNearby(r.filter(p => kindMatch(kind, p.kind)).sort((a, b) => nightFirst(a) - nightFirst(b) || a.distance - b.distance).slice(0, 40)
                    .map(p => ({ ...p, distance: area.type === 'near' ? p.distance : null })));
            });
        }
        return () => { live = false; };
    }, [few, JSON.stringify(area), kind, center?.lat, center?.lng]);

    const more = async () => {
        if (area.type !== 'district' || !browse) return;
        const r = await browsePlaces(area.name, KIND_SET[kind], browse.places.length);
        setBrowse({ total: r.total, places: [...browse.places, ...r.places] });
    };

    const locate = async () => {
        setLocating(true);
        try {
            const p = await getPosition();
            setPos(p);
            setArea(inIstanbul(p.lat, p.lng) ? { type: 'near' } : { type: 'all' });
        } catch (e) { toastError(e); } finally { setLocating(false); }
    };
    const pickDistrict = () => openSheet({
        title: 'İlçe seç',
        render: close => <DistrictSheet current={area.type === 'district' ? area.name : null} onPick={name => { setArea({ type: 'district', name }); close(); }} />
    });

    const chip = (a: Area, label: string) => {
        const active = JSON.stringify(a) === JSON.stringify(area);
        return <button key={label} class="chip" aria-pressed={active} onClick={() => setArea(a)}>{label}</button>;
    };

    const loaded = popular.value != null;
    const fallbackPins = browse?.places ?? nearby ?? [];
    return (
        <>
            <TopBar title="Keşfet" actions={
                <button class="icon-btn" aria-label={view === 'list' ? 'Haritada göster' : 'Liste'} onClick={() => setView(view === 'list' ? 'map' : 'list')}>
                    {view === 'list' ? <MapIcon /> : <ListOrdered />}
                </button>
            } />
            <main class="page">
                <div class="chip-scroll" role="group" aria-label="Bölge">
                    <button class="chip" aria-pressed={area.type === 'near'} onClick={() => (pos ? setArea({ type: 'near' }) : void locate())}>
                        {locating ? <Spinner small /> : <LocateFixed />}Yakınımda
                    </button>
                    {chip({ type: 'all' }, 'Tüm İstanbul')}
                    <button class="chip" aria-pressed={area.type === 'district'} onClick={pickDistrict}>
                        {area.type === 'district' ? area.name : 'İlçe seç'}<ChevronDown size={14} />
                    </button>
                    {HOODS.map(h => chip({ type: 'hood', id: h.id }, h.name))}
                </div>
                <div class="mt-12">
                    <Segmented label="Zaman" value={win} onChange={setWin} options={[{ value: 'day', label: 'Bugün' }, { value: 'week', label: 'Bu hafta' }, { value: 'month', label: 'Bu ay' }]} />
                </div>
                <div class="chip-scroll mt-12" role="group" aria-label="Tür">
                    {KIND_FILTERS.map(([k, l]) => <button key={k} class="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
                </div>

                {view === 'map' ? (
                    <div class="mt-16"><ExploreMap items={items.map(x => x.p)} nearby={few ? fallbackPins : []} center={center ?? ISTANBUL_CENTER} pos={pos} /></div>
                ) : (
                    <section class="section" style={{ marginTop: '20px' }}>
                        <div class="section-head"><h2>{areaLabel(area)} {WINDOW_LABEL[win]} çok gidilenler</h2></div>
                        {!loaded ? <div class="skeleton" style={{ height: '220px' }} /> : items.length ? (
                            <div class="list">{items.map((x, i) => <PopularRow key={x.p.id} p={x.p} rank={i + 1} dist={x.dist} />)}</div>
                        ) : (
                            <div class="card card-pad">
                                <b>Henüz yeterli veri yok</b>
                                <p class="small muted mt-8">Bir mekan, {WINDOW_LABEL[win]} en az 3 farklı Pub Skor grubu tarafından ziyaret edildiğinde burada görünür. Ekibinle puanladıkça liste canlanır.</p>
                            </div>
                        )}

                        {few && area.type === 'all' && (
                            <div class="mt-24">
                                <div class="eyebrow mb-8">İlçelere göre mekanlar</div>
                                <div class="district-grid">
                                    {[...DISTRICTS].sort((a, b) => (counts[b.name] ?? 0) - (counts[a.name] ?? 0)).map(d => (
                                        <button key={d.id} class="district-cell" onClick={() => setArea({ type: 'district', name: d.name })}>
                                            <PlaceEmblem place={{ district: d.name }} size={34} />
                                            <span class="dc-text"><b>{d.name}</b><span class="tiny faint">{counts[d.name] ?? 0} mekan</span></span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {few && browse && (
                            <div class="mt-24">
                                <div class="eyebrow mb-8">{area.type === 'district' ? `${area.name} ilçesindeki mekanlar` : 'Mekanlar'} · {browse.total}</div>
                                <div class="list">{browse.places.map(p => <NearbyRow key={p.id} p={p} dist={pos ? meters(pos, p) : null} />)}</div>
                                {browse.places.length < browse.total && <AsyncButton class="btn btn-secondary btn-block mt-12" onClick={more}>Daha fazla göster</AsyncButton>}
                            </div>
                        )}
                        {few && nearby && nearby.length > 0 && (
                            <div class="mt-24">
                                <div class="eyebrow mb-8">{area.type === 'near' ? 'Yakınındaki mekanlar' : 'Bu civarda mekanlar'}</div>
                                <div class="list">{nearby.map(p => <NearbyRow key={p.id} p={p} dist={p.distance} />)}</div>
                            </div>
                        )}
                    </section>
                )}

                {memberships.value.length > 0 && (
                    <a class="banner mt-24" href="/oneri">
                        <span class="b-icon"><Sparkles /></span>
                        <div class="grow"><b>Nereye gidelim?</b><div class="small muted">Ekibinin puanlarına ve gidilecekler listesine göre öneri</div></div>
                        <ChevronRight class="faint" />
                    </a>
                )}
                <p class="tiny faint mt-24">Yalnızca alkollü içki servis eden mekanlar listelenir. Listeler Pub Skor ekiplerinin anonim ziyaretlerinden oluşur; ekip ya da kişi bilgisi paylaşılmaz. Mekan bilgileri Overture Maps açık verisinden.</p>
            </main>
        </>
    );
}

const nightFirst = (p: CatalogPlace) => (p.kind === 'pub' || p.kind === 'bar' || p.kind === 'kokteyl' || p.kind === 'meyhane' || p.kind === 'sarap' || p.kind === 'brewpub' ? 0 : p.kind === 'restoran' ? 1 : 2);

/** Mekan sayfasında topluluk istatistiği. */
export function PlaceStats({ placeId }: { placeId: string }) {
    useEffect(() => { void loadPopular(); }, []);
    const s = placeStats(placeId);
    if (!s) return null;
    const parts = [
        s.day ? `bugün ${s.day.groups} grup` : null,
        s.week ? `bu hafta ${s.week.groups} grup` : null,
        !s.week && s.month ? `bu ay ${s.month.groups} grup` : null
    ].filter(Boolean);
    return (
        <div class="stats mt-16">
            {s.score && <div class="stat"><div class="stat-label">Topluluk puanı</div><div class="stat-value">{fmtScore(s.score.score)}</div><div class="stat-sub">son 3 ay · {s.score.groups} grup</div></div>}
            {parts.length > 0 && <div class="stat"><div class="stat-label">Popülerlik</div><div class="stat-value" style={{ fontSize: '17px' }}>{parts.join(', ')}</div><div class="stat-sub">Pub Skor grupları</div></div>}
        </div>
    );
}
