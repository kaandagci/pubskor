// Harita: Leaflet + OpenStreetMap karoları (anahtarsız). Koyu temada karolar CSS filtresiyle koyulaştırılır.
// Bu modül ve Leaflet yalnızca harita açılınca yüklenir.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { tierOf, venueKindLabel } from '../../shared/metrics';
import type { VenueSummary } from '../../shared/insights';
import { TIER_HEX_DARK } from '../lib/colors';
import { fmtScore } from '../lib/format';
import { directionsUrl, getPosition } from '../lib/geo';
import { venueSummaries } from '../state/data';
import { themePref, toastError } from '../state/ui';
import { Bookmark, LocateFixed, Navigation, X } from '../components/icons';
import { TierChip } from '../components/ui';

type Filter = 'all' | 'legend' | 'wish';

const isDark = () => themePref.value === 'dark' || (themePref.value === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export default function MapPage() {
    const el = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const layer = useRef<L.LayerGroup | null>(null);
    const meMarker = useRef<L.Marker | null>(null);
    const [filter, setFilter] = useState<Filter>('all');
    const [selected, setSelected] = useState<string | null>(null);

    const all = venueSummaries.value;
    const placed = useMemo(() => all.filter(s => s.venue.lat != null && s.venue.lng != null && (s.count > 0 || s.venue.wish)), [all]);
    const shown = placed.filter(s => filter === 'all' ? true : filter === 'wish' ? !!s.venue.wish && s.count === 0 : (s.avg ?? 0) >= 8.5);
    const missing = all.filter(s => s.count > 0 && s.venue.lat == null).length;

    useEffect(() => {
        if (!el.current) return;
        const m = L.map(el.current, { zoomControl: false, attributionControl: true, worldCopyJump: true });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            className: isDark() ? 'tiles-dark' : '',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıcıları'
        }).addTo(m);
        m.on('click', () => setSelected(null));
        layer.current = L.layerGroup().addTo(m);
        map.current = m;
        const pts = placed.map(s => L.latLng(s.venue.lat!, s.venue.lng!));
        if (pts.length) m.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 15 });
        else m.setView([41.015, 28.979], 12);
        return () => { m.remove(); map.current = null; };
    }, []);

    useEffect(() => {
        const g = layer.current;
        if (!g) return;
        g.clearLayers();
        for (const s of shown) {
            const wish = !!s.venue.wish && s.count === 0;
            const t = tierOf(s.avg);
            const html = wish
                ? `<div class="map-pin ${selected === s.venue.id ? 'active' : ''}" style="--tc:var(--accent)"><i></i>${esc(s.venue.name.slice(0, 18))}</div>`
                : `<div class="map-pin ${selected === s.venue.id ? 'active' : ''}" style="--tc:${TIER_HEX_DARK[t.id]}"><i></i>${fmtScore(s.avg)}</div>`;
            const marker = L.marker([s.venue.lat!, s.venue.lng!], {
                icon: L.divIcon({ html, className: '', iconSize: [0, 0] }),
                keyboard: true, title: s.venue.name, riseOnHover: true, zIndexOffset: selected === s.venue.id ? 1000 : Math.round((s.avg ?? 0) * 10)
            });
            marker.on('click', e => { L.DomEvent.stopPropagation(e); setSelected(s.venue.id); });
            marker.addTo(g);
        }
    }, [shown.map(s => s.venue.id).join(), selected]);

    const locate = async () => {
        try {
            const p = await getPosition();
            const m = map.current;
            if (!m) return;
            m.setView([p.lat, p.lng], Math.max(m.getZoom(), 15));
            meMarker.current?.remove();
            meMarker.current = L.marker([p.lat, p.lng], { icon: L.divIcon({ html: '<div class="me-dot"></div>', className: '', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false }).addTo(m);
        } catch (e) { toastError(e); }
    };

    const sel: VenueSummary | undefined = shown.find(s => s.venue.id === selected);

    return (
        <>
            <div class="map-page"><div ref={el} style={{ width: '100%', height: '100%' }} /></div>
            <div class="map-top">
                <div class="chip-scroll" style={{ margin: 0, padding: 0, flex: 1 }}>
                    {([['all', 'Tümü'], ['legend', 'Efsaneler'], ['wish', 'Gidilecekler']] as [Filter, string][]).map(([k, l]) => (
                        <button key={k} class="chip" aria-pressed={filter === k} onClick={() => { setFilter(k); setSelected(null); }}>{k === 'wish' && <Bookmark />}{l}</button>
                    ))}
                </div>
                <button class="icon-btn filled" style={{ boxShadow: 'var(--shadow-2)', background: 'var(--surface-1)' }} aria-label="Konumum" onClick={locate}><LocateFixed /></button>
            </div>
            {sel ? (
                <div class="map-card card card-pad">
                    <div class="row" style={{ alignItems: 'flex-start' }}>
                        <a class="grow" href={`/mekan/${sel.venue.id}`} style={{ minWidth: 0 }}>
                            <b class="display truncate" style={{ display: 'block', fontSize: '20px' }}>{sel.venue.name}</b>
                            <span class="small muted">{[venueKindLabel(sel.venue.kind), sel.venue.area, sel.count ? `${sel.count} ziyaret` : 'Henüz gidilmedi'].filter(Boolean).join(' · ')}</span>
                        </a>
                        <button class="icon-btn" aria-label="Kapat" onClick={() => setSelected(null)}><X /></button>
                    </div>
                    <div class="row mt-12">
                        {sel.count > 0 && <><b style={{ fontSize: '26px', letterSpacing: '-.03em' }}>{fmtScore(sel.avg)}</b><TierChip score={sel.avg} /></>}
                        <span class="grow" />
                        <a class="btn btn-sm btn-secondary" href={directionsUrl(sel.venue.lat!, sel.venue.lng!, sel.venue.name)} target="_blank" rel="noopener noreferrer"><Navigation />Yol</a>
                        <a class="btn btn-sm btn-primary" href={`/mekan/${sel.venue.id}`}>Profil</a>
                    </div>
                </div>
            ) : (missing > 0 || !placed.length) ? (
                <div class="map-card card card-pad small muted">
                    {!placed.length ? 'Haritada gösterilecek mekan yok. Yeni ziyarette “Yakınımdaki mekanlar” ile seçilen mekanlar konumuyla kaydedilir.' : `${missing} mekanın konumu yok. Mekan sayfasından “Düzenle → Buradayım” ile ekleyebilirsin.`}
                </div>
            ) : null}
        </>
    );
}
