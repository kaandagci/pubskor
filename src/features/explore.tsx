// Keşfet: İstanbul'da bugün / bu hafta / bu ay çok gidilen mekanlar (Pub Skor ekiplerinin anonim kayıtları),
// semt ve tür filtresi, liste ya da harita. Veri yetersizse yakındaki mekanları katalogdan gösterir.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { lazy } from 'preact-iso';
import { DISTRICTS, HOODS, ISTANBUL_CENTER, inIstanbul } from '../../shared/istanbul';
import { venueKindLabel, type VenueKind } from '../../shared/metrics';
import { meters, type CatalogPlace } from '../../shared/places';
import { fmtDistance, fmtScore } from '../lib/format';
import { getPosition, lastPosition, type LatLng } from '../lib/geo';
import { catalogAround } from '../lib/places';
import { loadPopular, placeStats, popular, type PopularItem, type Window } from '../lib/popular';
import { memberships } from '../state/session';
import { toastError } from '../state/ui';
import { ChevronRight, ListOrdered, LocateFixed, Map as MapIcon, Sparkles, TrendingDown, TrendingUp } from '../components/icons';
import { Pint } from '../components/Pint';
import { Segmented, Spinner, TopBar } from '../components/ui';

const ExploreMap = lazy(() => import('./explore-map'));

type Area = { type: 'near' } | { type: 'all' } | { type: 'hood'; id: string } | { type: 'district'; name: string };
type KindFilter = 'all' | 'night' | 'kokteyl' | 'meyhane' | 'sarap' | 'restoran' | 'kafe';

const KIND_FILTERS: [KindFilter, string][] = [
    ['all', 'Tümü'], ['night', 'Bar & pub'], ['kokteyl', 'Kokteyl'], ['meyhane', 'Meyhane'], ['sarap', 'Şarap'], ['restoran', 'Restoran'], ['kafe', 'Kafe']
];
const kindMatch = (f: KindFilter, k: VenueKind) =>
    f === 'all' || (f === 'night' ? k === 'pub' || k === 'bar' || k === 'brewpub' : k === f);

/** Semt seçicide öne çıkan ilçeler (gece hayatı yoğunluğuna göre). */
const TOP_DISTRICTS = ['Kadıköy', 'Beyoğlu', 'Beşiktaş', 'Şişli', 'Üsküdar', 'Sarıyer', 'Bakırköy', 'Ataşehir', 'Fatih', 'Maltepe'];

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
            <span class="grow" style={{ minWidth: 0 }}>
                <span class="truncate" style={{ display: 'block', fontWeight: 650 }}>{p.name}</span>
                <span class="small faint truncate" style={{ display: 'block' }}>{[venueKindLabel(p.kind), p.district, dist != null ? fmtDistance(dist) : null].filter(Boolean).join(' · ')}</span>
            </span>
            <span class="pop-meta">
                <b class="num">{p.groups}</b><span class="tiny faint">grup</span>
                <Trend n={p.trend} />
            </span>
            {p.score != null && <span class="pop-score"><Pint score={p.score} size={14} /><span class="num">{fmtScore(p.score)}</span></span>}
        </a>
    );
}

function NearbyRow({ p, dist }: { p: CatalogPlace; dist: number | null }) {
    return (
        <a class="pop-row" href={`/yer/${p.id}`}>
            <span class="grow" style={{ minWidth: 0 }}>
                <span class="truncate" style={{ display: 'block', fontWeight: 600 }}>{p.name}</span>
                <span class="small faint truncate" style={{ display: 'block' }}>{[venueKindLabel(p.kind), p.address || p.district].filter(Boolean).join(' · ')}</span>
            </span>
            {dist != null && <span class="small faint num">{fmtDistance(dist)}</span>}
            <ChevronRight size={16} class="faint" />
        </a>
    );
}

export function Explore() {
    const [win, setWin] = useState<Window>('week');
    const [area, setArea] = useState<Area>(() => (lastPosition() && inIstanbul(lastPosition()!.lat, lastPosition()!.lng) ? { type: 'near' } : { type: 'all' }));
    const [kind, setKind] = useState<KindFilter>('all');
    const [pos, setPos] = useState<LatLng | null>(lastPosition());
    const [locating, setLocating] = useState(false);
    const [view, setView] = useState<'list' | 'map'>('list');
    const [nearby, setNearby] = useState<(CatalogPlace & { distance: number })[] | null>(null);

    useEffect(() => { void loadPopular(); }, []);

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

    // Popüler liste boşsa: seçili bölgenin çevresindeki mekanlar (katalogdan)
    const fallbackCenter = center ?? ISTANBUL_CENTER;
    useEffect(() => {
        if (items.length >= 5) { setNearby(null); return; }
        let live = true;
        void catalogAround(fallbackCenter, area.type === 'all' ? 600 : 900).then(r => {
            if (!live) return;
            setNearby(r.filter(p => kindMatch(kind, p.kind)).sort((a, b) => nightFirst(a) - nightFirst(b) || a.distance - b.distance).slice(0, 25));
        });
        return () => { live = false; };
    }, [items.length, fallbackCenter.lat, fallbackCenter.lng, kind]);

    const locate = async () => {
        setLocating(true);
        try {
            const p = await getPosition();
            setPos(p);
            setArea(inIstanbul(p.lat, p.lng) ? { type: 'near' } : { type: 'all' });
        } catch (e) { toastError(e); } finally { setLocating(false); }
    };

    const chip = (a: Area, label: string) => {
        const active = JSON.stringify(a) === JSON.stringify(area);
        return <button key={label} class="chip" aria-pressed={active} onClick={() => setArea(a)}>{label}</button>;
    };

    const loaded = popular.value != null;
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
                    {HOODS.slice(0, 12).map(h => chip({ type: 'hood', id: h.id }, h.name))}
                    {TOP_DISTRICTS.map(d => chip({ type: 'district', name: d }, d))}
                </div>
                <div class="mt-12">
                    <Segmented label="Zaman" value={win} onChange={setWin} options={[{ value: 'day', label: 'Bugün' }, { value: 'week', label: 'Bu hafta' }, { value: 'month', label: 'Bu ay' }]} />
                </div>
                <div class="chip-scroll mt-12" role="group" aria-label="Tür">
                    {KIND_FILTERS.map(([k, l]) => <button key={k} class="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
                </div>

                {view === 'map' ? (
                    <div class="mt-16"><ExploreMap items={items.map(x => x.p)} nearby={items.length ? [] : nearby ?? []} center={fallbackCenter} pos={pos} /></div>
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
                        {nearby && nearby.length > 0 && (
                            <div class="mt-24">
                                <div class="eyebrow mb-8">{area.type === 'all' ? 'Taksim civarında' : 'Bu civarda'} mekanlar</div>
                                <div class="list">{nearby.map(p => <NearbyRow key={p.id} p={p} dist={area.type === 'near' ? p.distance : null} />)}</div>
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
                <p class="tiny faint mt-24">Listeler Pub Skor ekiplerinin anonim ziyaretlerinden oluşur; ekip ya da kişi bilgisi paylaşılmaz. Mekan bilgileri Overture Maps açık verisinden.</p>
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
