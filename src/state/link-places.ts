// Ekibin eski mekanlarını arka planda İstanbul kataloğuna bağlar (ad + konum eşleşmesi).
// Bağlanan mekanlar popülerlik ve topluluk puanına katkı verir. Her mekan bir kez denenir.
import { inIstanbul } from '../../shared/istanbul';
import { matchPlace } from '../../shared/places';
import { local } from '../lib/storage';
import { catalogAround } from '../lib/places';
import { mutate, snapshot } from './crew';
import { online } from './ui';

let running = false;

export async function linkCrewPlaces() {
    const s = snapshot.value;
    if (running || !s || !online.value) return;
    const key = 'linked:' + s.id;
    const tried = new Set(local.get<string[]>(key, []));
    const todo = s.venues.filter(v => !v.placeId && v.lat != null && v.lng != null && inIstanbul(v.lat, v.lng) && !tried.has(v.id)).slice(0, 25);
    if (!todo.length) return;
    running = true;
    try {
        for (const v of todo) {
            if (snapshot.value?.id !== s.id) break;
            tried.add(v.id);
            const near = await catalogAround({ lat: v.lat!, lng: v.lng! }, 250);
            const hit = matchPlace({ name: v.name, lat: v.lat!, lng: v.lng! }, near);
            if (hit) await mutate('PATCH', `/api/crew/venues/${v.id}`, { placeId: hit.id }).catch(() => undefined);
        }
    } finally {
        local.set(key, [...tried].slice(-2000));
        running = false;
    }
}
