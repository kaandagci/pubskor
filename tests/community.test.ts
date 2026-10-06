import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { devIdentity } from '../server/identity';
import { memoryKV } from '../server/kv';
import { PUBLIC_KEY } from '../server/public-feed';
import { metricsFor } from '../shared/metrics';
import { PUBLIC_DELAY_MS, aliasFor, publicModeOf, publicNameOk, type PublicFeed, type PublicPlaceView, type PublicRankItem, type Recommendations } from '../shared/public';
import type { CrewSnapshot, Sheet } from '../shared/types';

const BEER = metricsFor(['bira']);
const full = (v: number): Sheet => Object.fromEntries(BEER.map(id => [id, v]));
const place = (id: string, name: string) => ({ id, name, kind: 'bar' as const, lat: 40.9866, lng: 29.02657, district: 'Kadıköy', address: '', phone: '', web: '', cat: 'bar' });
const P1 = place('pl_aaaaaaaaaa', 'Karga Bar');
const P2 = place('pl_bbbbbbbbbb', 'Arkaoda');
const P3 = place('pl_cccccccccc', 'Kadıköy Meyhanesi');
const PLACES = new Map([P1, P2, P3].map(p => [p.id, p]));

let kv: ReturnType<typeof memoryKV>;
let identity: ReturnType<typeof devIdentity>;
let app: ReturnType<typeof createApp>;
let clock = Date.parse('2026-10-05T18:00:00Z');

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

async function crewOf(n: number, crewName = `Ekip ${n}`, publicMode?: string) {
    const jwt = identity.devLogin!(`u${n}@example.com`, `Kişi ${n}`);
    await call('POST', '/api/me', jwt, { name: `Kişi ${n}`, adult: true, terms: true });
    const r = await call('POST', '/api/auth/crew', jwt, { crewName, ...(publicMode ? { publicMode } : {}) });
    const snap: CrewSnapshot = r.data.snapshot;
    return { tok: `${jwt}#${snap.id}`, jwt, snap };
}

let seq = 0;
async function visit(c: Awaited<ReturnType<typeof crewOf>>, p: { id: string; name: string } | null, score: number, date = '2026-10-05') {
    const m = c.snap.members[0];
    const id = `pub_t${String(++seq).padStart(9, '0')}`;
    const venue = p ? { id: 'v_' + p.id.slice(3) + c.snap.id.slice(2, 6), name: p.name, placeId: p.id } : { id: `v_manual${String(seq).padStart(6, '0')}`, name: 'Ahmet’in evi' };
    const r = await call('POST', '/api/crew/visits', c.tok, {
        id, date, venue, participants: [{ id: m.id, name: m.name, color: 0, memberId: m.id }], sheets: { [m.id]: full(score) }, metrics: BEER
    });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    return id;
}

const feed = async (token?: string) => (await call('GET', '/api/community/feed', token)).data as PublicFeed;
const later = () => { clock += PUBLIC_DELAY_MS + 1000; };

beforeEach(() => {
    kv = memoryKV();
    identity = devIdentity('p');
    app = createApp({ kv, identity, dev: true, statsSalt: 'tuz', now: () => clock, placeLookup: id => PLACES.get(id) ?? null });
});

describe('topluluk akışı', () => {
    it('ekip adıyla: herkes birkaç saat sonra görür, ekip hemen görür; kişi ve ekip kimliği sızmaz', async () => {
        const a = await crewOf(1, 'Cuma Barcıları', 'named');
        await visit(a, P1, 9);
        expect((await feed()).items).toHaveLength(0);
        const own = await feed(a.jwt);
        expect(own.items).toHaveLength(1);
        expect(own.items[0].crew).toEqual({ label: 'Cuma Barcıları', anon: false, mine: true });

        later();
        const pub = await feed();
        expect(pub.items).toHaveLength(1);
        expect(pub.items[0]).toMatchObject({ placeId: P1.id, name: 'Karga Bar', district: 'Kadıköy', score: 9, date: '2026-10-05', crew: { label: 'Cuma Barcıları', anon: false } });
        expect(pub.items[0].crew.mine).toBeUndefined();
        const raw = JSON.stringify(pub) + JSON.stringify(kv.dump().get(PUBLIC_KEY));
        expect(raw).not.toContain(a.snap.id);
        expect(raw).not.toContain(a.snap.members[0].id);
        expect(raw).not.toContain('Kişi 1');
    });

    it('varsayılan takma ad; ekip adı görünmez', async () => {
        const b = await crewOf(2, 'Ofis Ekibi');
        expect(b.snap.publicMode).toBe('anon');
        expect(b.snap.publicAlias).toBe(aliasFor(b.snap.id));
        await visit(b, P1, 7);
        later();
        const it0 = (await feed()).items[0];
        expect(it0.crew).toEqual({ label: aliasFor(b.snap.id), anon: true });
        expect(JSON.stringify(await feed())).not.toContain('Ofis Ekibi');
    });

    it('kurallara uymayan ekip adı toplulukta takma adla görünür', async () => {
        const c = await crewOf(3, 'Rakı Severler', 'named');
        expect(c.snap.publicNameOk).toBe(false);
        await visit(c, P1, 9);
        later();
        expect((await feed()).items[0].crew).toEqual({ label: aliasFor(c.snap.id), anon: true });
    });

    it('elle eklenen (kataloğa bağlı olmayan) yerler paylaşılmaz', async () => {
        const a = await crewOf(1);
        await visit(a, null, 8);
        later();
        expect((await feed()).items).toHaveLength(0);
    });

    it('silme, geri alma, kapatma ve ekip adı değişikliği akışa yansır', async () => {
        const a = await crewOf(1, 'Cuma Barcıları', 'named');
        const id = await visit(a, P1, 8);
        later();
        expect((await feed()).items).toHaveLength(1);
        await call('DELETE', `/api/crew/visits/${id}`, a.tok);
        expect((await feed()).items).toHaveLength(0);
        await call('POST', `/api/crew/visits/${id}/restore`, a.tok);
        expect((await feed()).items).toHaveLength(1);

        await call('PATCH', '/api/crew', a.tok, { name: 'Pazar Ekibi' });
        expect((await feed()).items[0].crew.label).toBe('Pazar Ekibi');

        const off = await call('PATCH', '/api/crew', a.tok, { publicMode: 'off' });
        expect(off.data.snapshot.publicMode).toBe('off');
        expect(off.data.snapshot.shareStats).toBe(false);
        expect((await feed()).items).toHaveLength(0);
        await visit(a, P2, 9);
        later();
        expect((await feed()).items).toHaveLength(0);

        await call('PATCH', '/api/crew', a.tok, { publicMode: 'anon' });
        expect((await feed()).items).toHaveLength(2);
        expect(await call('PATCH', '/api/crew', a.tok, { publicMode: 'herkes' })).toMatchObject({ status: 400 });
    });

    it('eski "anonim katkı" ayarı: kapalı → topluluğa da kapalı', async () => {
        const a = await crewOf(1);
        await call('PATCH', '/api/crew', a.tok, { shareStats: false });
        await visit(a, P1, 8);
        later();
        expect((await feed()).items).toHaveLength(0);
        expect(publicModeOf({ shareStats: false })).toBe('off');
        expect(publicModeOf({})).toBe('anon');
    });

    it('ekip silinince kayıtları kalkar', async () => {
        const a = await crewOf(1, 'Silinecek Ekip');
        await visit(a, P1, 8);
        later();
        expect((await feed()).items).toHaveLength(1);
        await call('DELETE', '/api/crew', a.tok, { confirm: 'Silinecek Ekip' });
        expect((await feed()).items).toHaveLength(0);
    });

    it('özellikten önce yapılmış puanlar ilk okumada toplu üretilir', async () => {
        const a = await crewOf(1);
        await visit(a, P1, 8);
        await visit(a, P2, 6);
        await kv.delete(PUBLIC_KEY);
        later();
        // Önbelleği atlatmak için yeni uygulama örneği (soğuk başlangıç)
        app = createApp({ kv, identity, dev: true, statsSalt: 'tuz', now: () => clock, placeLookup: id => PLACES.get(id) ?? null });
        const f = await feed();
        expect(f.items.map(x => x.name).sort()).toEqual(['Arkaoda', 'Karga Bar']);
    });
});

describe('topluluk sıralaması ve mekan', () => {
    it('ekip başına bir oy: çok giden ekip sonucu tek başına belirlemez', async () => {
        const a = await crewOf(1, 'Cuma Barcıları', 'named');
        const b = await crewOf(2);
        for (let i = 0; i < 3; i++) await visit(a, P1, 10);
        await visit(b, P1, 6);
        await visit(b, P2, 7);
        later();
        const items = (await call('GET', '/api/community/ranking')).data.items as PublicRankItem[];
        const k = items.find(x => x.placeId === P1.id)!;
        expect(k).toMatchObject({ score: 8, crews: 2, visits: 4, name: 'Karga Bar' });

        const view = (await call('GET', `/api/community/places/${P1.id}`)).data as PublicPlaceView;
        expect(view).toMatchObject({ score: 8, crews: 2, visits: 4 });
        expect(view.byCrew.map(c => c.crew.label).sort()).toEqual([aliasFor(b.snap.id), 'Cuma Barcıları'].sort());
        expect((await call('GET', '/api/community/places/xx')).status).toBe(404);
    });

    it('zevke göre öneri: benzer puan veren ekibin sevdiği yer öne çıkar', async () => {
        const me = await crewOf(1);
        const twin = await crewOf(2);
        const opposite = await crewOf(3);
        await visit(me, P1, 9);
        await visit(twin, P1, 9);
        await visit(twin, P2, 9);
        await visit(twin, P3, 4);
        await visit(opposite, P1, 2);
        await visit(opposite, P2, 3);
        await visit(opposite, P3, 9);
        later();
        const r = (await call('GET', '/api/crew/recommendations', me.tok)).data as Recommendations;
        expect(r.rated).toBe(1);
        expect(r.compared).toBe(2);
        expect(r.items.map(x => x.placeId)).toEqual([P2.id, P3.id]);
        expect(r.items[0].similar).toBe(1);
        expect(r.items[0].predicted).toBeGreaterThan(r.items[1].predicted);
        // Gidilmiş mekan önerilmez
        expect(r.items.some(x => x.placeId === P1.id)).toBe(false);
        expect((await call('GET', '/api/crew/recommendations')).status).toBe(401);
    });
});

describe('ekip adının herkese açık gösterimi', () => {
    it('masum adlar geçer, içki/marka/hakaret/iletişim bilgisi geçmez', () => {
        for (const ok of ['Cuma Barcıları', 'Biraderler', 'Biraz Gezelim', 'Rakipler', 'Kadıköy Kaşifleri', 'Ofis Ekibi', 'Meyhane Sevdalıları']) expect(publicNameOk(ok), ok).toBe(true);
        for (const bad of ['Rakı Severler', 'Biracılar', 'Efes Ekibi', 'YeniRakı Masası', 'Jack-Daniels', 'Sarhoşlar', 'amk', 'Ahmet 0532 123 45 67', 'ig: @ekip', 'x']) expect(publicNameOk(bad), bad).toBe(false);
    });

    it('takma ad ekip kimliğinden türetilir ve değişmez', () => {
        expect(aliasFor('c_aaaaaaaaaaaaaa')).toBe(aliasFor('c_aaaaaaaaaaaaaa'));
        expect(aliasFor('c_aaaaaaaaaaaaaa')).toMatch(/^\S+ \S+$/);
    });
});
