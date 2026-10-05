import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { devIdentity } from '../server/identity';
import { memoryKV } from '../server/kv';
import { dayMinus, istanbulDay, type PopularDoc } from '../server/popular';
import { metricsFor } from '../shared/metrics';
import type { CrewSnapshot, Sheet } from '../shared/types';

const BEER = metricsFor(['bira']);
const full = (v: number): Sheet => Object.fromEntries(BEER.map(id => [id, v]));
const PLACE = { id: 'pl_aaaaaaaaaa', name: 'Karga Bar', kind: 'bar' as const, lat: 40.9866, lng: 29.02657, district: 'Kadıköy', address: '', phone: '', web: '', cat: 'bar' };

let kv: ReturnType<typeof memoryKV>;
let identity: ReturnType<typeof devIdentity>;
let app: ReturnType<typeof createApp>;
let clock = Date.parse('2026-10-05T18:00:00Z');
const today = () => istanbulDay(clock);

async function call(method: string, path: string, token?: string, body?: unknown) {
    const [tok, crew] = (token ?? '').split('#');
    const headers: Record<string, string> = {};
    if (tok) headers.authorization = 'Bearer ' + tok;
    if (crew) headers['x-crew-id'] = crew;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await app(new Request('http://x' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }));
    const text = await r.text();
    return { status: r.status, data: text ? JSON.parse(text) : null };
}

/** Kendi ekibini kuran bir kullanıcı; ekip isteği anahtarını ve görüntüyü döner. */
async function crewOf(n: number) {
    const jwt = identity.devLogin!(`u${n}@example.com`, `Kişi ${n}`);
    await call('POST', '/api/me', jwt, { name: `Kişi ${n}`, adult: true, terms: true });
    const r = await call('POST', '/api/auth/crew', jwt, { crewName: `Ekip ${n}` });
    const snap: CrewSnapshot = r.data.snapshot;
    return { tok: `${jwt}#${snap.id}`, jwt, snap };
}

async function visit(c: Awaited<ReturnType<typeof crewOf>>, id: string, score: number, date = today()) {
    const m = c.snap.members[0];
    const r = await call('POST', '/api/crew/visits', c.tok, {
        id, date, venue: { id: 'v_' + id.slice(4, 14), name: 'Karga', placeId: PLACE.id },
        participants: [{ id: m.id, name: m.name, color: 0, memberId: m.id }], sheets: { [m.id]: full(score) }, metrics: BEER
    });
    expect(r.status).toBe(201);
    return r.data.snapshot as CrewSnapshot;
}

const popular = async () => (await call('GET', '/api/popular')).data as PopularDoc;

beforeEach(() => {
    kv = memoryKV();
    identity = devIdentity('p');
    app = createApp({ kv, identity, dev: true, statsSalt: 'tuz', now: () => clock, placeLookup: id => (id === PLACE.id ? PLACE : null) });
});

describe('popüler mekanlar', () => {
    it('en az 3 farklı grup olmadan listelenmez; grup ve ortalama puan doğru', async () => {
        const [a, b, c] = [await crewOf(1), await crewOf(2), await crewOf(3)];
        await visit(a, 'pub_a000000001', 8);
        await visit(a, 'pub_a000000002', 6); // aynı grup aynı gün: tek grup sayılır
        await visit(b, 'pub_b000000001', 7);
        expect((await popular()).windows.day).toHaveLength(0);
        await visit(c, 'pub_c000000001', 9);
        clock += 20_000;
        const p = await popular();
        expect(p.windows.day).toHaveLength(1);
        expect(p.windows.day[0]).toMatchObject({ id: PLACE.id, name: 'Karga Bar', groups: 3 });
        expect(p.windows.day[0].score).toBeCloseTo((7 + 7 + 9) / 3, 1);
        expect(p.windows.week[0].trend).toBe(3);
        // Grup kimlikleri ya da ekip adları çıktıda yok
        expect(JSON.stringify(p)).not.toMatch(/Ekip|c_|m_/);
        const statKeys = [...kv.dump().keys()].filter(k => /^(act|agg|popular)\//.test(k));
        expect(statKeys.length).toBeGreaterThan(0);
        expect(statKeys.some(k => k.includes(a.snap.id) || k.includes(a.snap.members[0].id))).toBe(false);
    });

    it('geçmiş günler haftaya ve aya girer, bugüne girmez', async () => {
        const cs = [await crewOf(1), await crewOf(2), await crewOf(3)];
        for (const [i, c] of cs.entries()) await visit(c, `pub_old00000${i}`, 7, dayMinus(today(), 10));
        const p = await popular();
        expect(p.windows.day).toHaveLength(0);
        expect(p.windows.week).toHaveLength(0);
        expect(p.windows.month[0].groups).toBe(3);
        expect(p.scores[PLACE.id].groups).toBe(3);
    });

    it('ziyaret silinince ya da ekip katkıyı kapatınca sayımdan düşer', async () => {
        const [a, b, c] = [await crewOf(1), await crewOf(2), await crewOf(3)];
        await visit(a, 'pub_a000000001', 8);
        await visit(b, 'pub_b000000001', 7);
        await visit(c, 'pub_c000000001', 9);
        expect((await popular()).windows.day).toHaveLength(1);

        await call('DELETE', '/api/crew/visits/pub_c000000001', c.tok);
        clock += 20_000;
        expect((await popular()).windows.day).toHaveLength(0);
        await call('POST', '/api/crew/visits/pub_c000000001/restore', c.tok);
        clock += 20_000;
        expect((await popular()).windows.day).toHaveLength(1);

        const off = await call('PATCH', '/api/crew', b.tok, { shareStats: false });
        expect(off.data.snapshot.shareStats).toBe(false);
        clock += 20_000;
        expect((await popular()).windows.day).toHaveLength(0);
    });

    it('"Buradayım" hesap ister, günlük sınırı var ve grup sayar', async () => {
        expect((await call('POST', '/api/checkin', undefined, { placeId: PLACE.id })).status).toBe(401);
        const users = [1, 2, 3].map(n => identity.devLogin!(`c${n}@example.com`, 'C'));
        for (const u of users) expect((await call('POST', '/api/checkin', u, { placeId: PLACE.id })).status).toBe(200);
        const p = await popular();
        expect(p.windows.day[0].groups).toBe(3);
        expect(p.windows.day[0].score).toBeNull();
        for (let i = 0; i < 9; i++) await call('POST', '/api/checkin', users[0], { placeId: `pl_x00000000${i}` });
        expect((await call('POST', '/api/checkin', users[0], { placeId: 'pl_yyyyyyyyyy' })).status).toBe(429);
    });
});
