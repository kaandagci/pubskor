// Keşfet haritası: popüler mekanlar (grup sayısıyla) ya da veri yoksa çevredeki mekanlar. Leaflet yalnızca açılınca yüklenir.
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import type { CatalogPlace } from '../../shared/places';
import type { LatLng } from '../lib/geo';
import type { PopularItem } from '../lib/popular';
import { themePref } from '../state/ui';

const isDark = () => themePref.value === 'dark' || (themePref.value === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export default function ExploreMap({ items, nearby, center, pos }: { items: PopularItem[]; nearby: CatalogPlace[]; center: LatLng; pos: LatLng | null }) {
    const el = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const layer = useRef<L.LayerGroup | null>(null);
    const { route } = useLocation();

    useEffect(() => {
        if (!el.current) return;
        const m = L.map(el.current, { zoomControl: false, attributionControl: true });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19, className: isDark() ? 'tiles-dark' : '',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> katkıcıları'
        }).addTo(m);
        layer.current = L.layerGroup().addTo(m);
        map.current = m;
        return () => { m.remove(); map.current = null; };
    }, []);

    useEffect(() => {
        const m = map.current, g = layer.current;
        if (!m || !g) return;
        g.clearLayers();
        const pts: L.LatLng[] = [];
        const pin = (id: string, lat: number, lng: number, html: string) => {
            const mk = L.marker([lat, lng], { icon: L.divIcon({ className: '', html, iconSize: [0, 0] }) }).addTo(g);
            mk.on('click', () => route(`/yer/${id}`));
            pts.push(L.latLng(lat, lng));
        };
        for (const p of items.slice(0, 120)) pin(p.id, p.lat, p.lng, `<div class="map-pin" style="--tc:var(--accent)"><i></i>${p.groups} · ${esc(p.name.slice(0, 16))}</div>`);
        for (const p of nearby.slice(0, 60)) pin(p.id, p.lat, p.lng, `<div class="map-pin" style="--tc:var(--text-3)"><i></i>${esc(p.name.slice(0, 16))}</div>`);
        if (pos) L.circleMarker([pos.lat, pos.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(g);
        if (pts.length > 1) m.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 16 });
        else m.setView([center.lat, center.lng], 15);
    }, [items, nearby, center.lat, center.lng, pos]);

    return <div ref={el} class="explore-map" />;
}
