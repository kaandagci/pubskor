// v7 (ortak arşiv) kayıtlarını yeni modele çevirir. Sunucu tarafı içe aktarma ve
// tarayıcıda kalmış yerel kayıtlar aynı dönüştürücüyü kullanır.
import { LEGACY_METRICS, type MetricId } from './metrics';
import { ID_RE } from './ids';
import { cleanLine, cleanText, isValidDate } from './text';
import { isScore } from './scoring';
import type { Sheet } from './types';
import { LIMITS } from './validate';

export interface LegacyVisit {
    id: string;
    name: string;
    location: string;
    date: string;
    notes: string;
    participants: { id: string; name: string; color: number }[];
    sheets: Record<string, Sheet>;
    /** v7'de aktif olan kriterler. */
    metrics: MetricId[];
    createdAt: number;
    updatedAt: number;
    hasPhoto: boolean;
    /** Yalnızca eski yerel kayıtlarda bulunan gömülü fotoğraf. */
    photoData: string | null;
}

export function fromLegacy(raw: unknown): LegacyVisit | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, any>;
    const id = typeof r.id === 'string' && ID_RE.visit.test(r.id) ? r.id : null;
    const name = cleanLine(r.name, LIMITS.venueName);
    if (!id || !name || !isValidDate(r.date)) return null;
    if (!Array.isArray(r.participants) || !r.participants.length) return null;

    const participants: LegacyVisit['participants'] = [];
    const seenIds = new Set<string>(), seenNames = new Set<string>();
    for (const p of r.participants.slice(0, LIMITS.participants)) {
        const pid = p && p.id != null ? String(p.id) : '';
        const pname = cleanLine(p?.name, LIMITS.personName);
        if (!ID_RE.participant.test(pid) || !pname || seenIds.has(pid) || seenNames.has(pname.toLocaleLowerCase('tr'))) continue;
        seenIds.add(pid); seenNames.add(pname.toLocaleLowerCase('tr'));
        const ci = Number.isInteger(p.colorIdx) ? p.colorIdx : participants.length;
        participants.push({ id: pid, name: pname, color: ((ci % LIMITS.colors) + LIMITS.colors) % LIMITS.colors });
    }
    if (!participants.length) return null;

    const sheets: Record<string, Sheet> = {};
    participants.forEach(p => { sheets[p.id] = {}; });
    const active: MetricId[] = [];
    const src = r.metrics && typeof r.metrics === 'object' ? r.metrics : {};
    for (const id of LEGACY_METRICS) {
        const d = src[id] && typeof src[id] === 'object' ? src[id] : {};
        if (d.active === false) continue;
        active.push(id);
        const scores = d.scores && typeof d.scores === 'object' ? d.scores : {};
        for (const p of participants) {
            const v = Number(scores[p.id]);
            // v7'de eksik puanlı kayıt kaydedilemiyordu; yine de eksik hücre varsa "yok" sayılır
            sheets[p.id][id] = isScore(v) ? v : 0;
        }
    }
    if (!active.length) return null;

    const photoData = typeof r.photo === 'string' && r.photo.startsWith('data:image/') ? r.photo : null;
    return {
        id, name,
        location: cleanLine(r.location, LIMITS.area),
        date: r.date,
        notes: cleanText(r.notes, LIMITS.notes),
        participants, sheets, metrics: active,
        createdAt: Number(r.createdAt) || Date.parse(r.date) || Date.now(),
        updatedAt: Number(r.updatedAt) || Number(r.createdAt) || Date.now(),
        hasPhoto: !!r.hasPhoto || !!r.photoUrl,
        photoData
    };
}

/** Eski fotoğraflar kopyalanmaz; "L_<ziyaretId>" kimliğiyle eski depodan sunulur. */
export const legacyPhotoId = (visitId: string) => 'L_' + visitId;
