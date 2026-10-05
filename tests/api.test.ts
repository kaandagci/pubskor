import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { memoryKV, type LegacyStores } from '../server/kv';
import { LEGACY_METRICS, metricsFor } from '../shared/metrics';
import type { CrewSnapshot, Sheet, TableView } from '../shared/types';

const BEER = metricsFor(['bira']);
const full = (v: number): Sheet => Object.fromEntries(BEER.map(id => [id, v]));

let app: ReturnType<typeof createApp>;
let kv: ReturnType<typeof memoryKV>;
let clock = 1_800_000_000_000;

async function call(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: BodyInit } = {}) {
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.token) headers.authorization = 'Bearer ' + opts.token;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const res = await app(new Request('http://x' + path, { method, headers, body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) }));
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
}

const legacyVisits: Record<string, unknown> = {};
const legacy: LegacyStores = {
    visits: { list: async () => Object.keys(legacyVisits), getJSON: async k => legacyVisits[k] ?? null },
    photos: { getBinary: async k => (k === 'pub_1696000000001' ? new Uint8Array([0xff, 0xd8, 0xff, 1]).buffer : null) }
};

async function setupCrew() {
    const a = await call('POST', '/api/auth/crew', { body: { crewName: 'Cuma Ekibi', name: 'Kaan' } });
    expect(a.status).toBe(201);
    const snapA: CrewSnapshot = a.data.snapshot;
    const b = await call('POST', '/api/auth/join', { body: { crewId: snapA.id, invite: snapA.invite, name: 'Suude' } });
    expect(b.status).toBe(201);
    return { tokA: a.data.token as string, tokB: b.data.token as string, crew: b.data.snapshot as CrewSnapshot };
}

const visitBody = (id: string, crew: CrewSnapshot, score = 7) => ({
    id, venue: { id: 'v_' + id.slice(4, 14), name: 'Arka Oda', area: 'Kadıköy' }, date: '2026-10-03',
    participants: crew.members.map((m, i) => ({ id: m.id, name: m.name, color: i, memberId: m.id })),
    sheets: Object.fromEntries(crew.members.map(m => [m.id, full(score)])),
    metrics: BEER
});

beforeEach(() => {
    kv = memoryKV();
    clock = 1_800_000_000_000;
    app = createApp({ kv, legacy, now: () => clock });
});

describe('ekip ve davet', () => {
    it('kurar, önizler, katılır; yanlış davet reddedilir', async () => {
        const a = await call('POST', '/api/auth/crew', { body: { crewName: 'Ekip', name: 'Kaan' } });
        const snap: CrewSnapshot = a.data.snapshot;
        expect(snap.members[0].role).toBe('owner');
        expect(JSON.stringify(snap)).not.toContain('tokenHash');

        const bad = await call('POST', '/api/auth/join', { body: { crewId: snap.id, invite: 'yanlis-davet-kodu-xxxxxxxx', name: 'X' } });
        expect(bad.status).toBe(403);

        const pv = await call('POST', '/api/auth/preview', { body: { crewId: snap.id, invite: snap.invite } });
        expect(pv.data.name).toBe('Ekip');

        const dup = await call('POST', '/api/auth/join', { body: { crewId: snap.id, invite: snap.invite, name: 'kaan' } });
        expect(dup.status).toBe(409);
    });

    it('geçersiz jetonu ve çıkarılan üyeyi reddeder', async () => {
        const { tokA, tokB, crew } = await setupCrew();
        expect((await call('GET', '/api/crew', { token: tokA.slice(0, -2) + 'zz' })).status).toBe(401);
        const b = crew.members.find(m => m.name === 'Suude')!;
        expect((await call('DELETE', '/api/crew/members/' + b.id, { token: tokB.replace(/.$/, '') + 'q' })).status).toBe(401);
        expect((await call('DELETE', '/api/crew/members/' + crew.members[0].id, { token: tokB })).status).toBe(403);
        expect((await call('DELETE', '/api/crew/members/' + b.id, { token: tokA })).status).toBe(200);
        expect((await call('GET', '/api/crew', { token: tokB })).status).toBe(401);
    });

    it('ETag ile değişmeyen ekip için 304 döner', async () => {
        const { tokA } = await setupCrew();
        const r1 = await call('GET', '/api/crew', { token: tokA });
        const r2 = await call('GET', '/api/crew', { token: tokA, headers: { 'if-none-match': r1.headers.get('etag')! } });
        expect(r2.status).toBe(304);
    });

    it('davet yenilenince eski bağlantı geçersiz olur', async () => {
        const { tokA, crew } = await setupCrew();
        const r = await call('POST', '/api/crew/invite', { token: tokA });
        expect(r.data.snapshot.invite).not.toBe(crew.invite);
        expect((await call('POST', '/api/auth/preview', { body: { crewId: crew.id, invite: crew.invite } })).status).toBe(403);
    });
});

describe('ziyaretler', () => {
    it('oluşturur, tekrar isteği yineleme saymaz, skoru sunucu hesaplar', async () => {
        const { tokB, crew } = await setupCrew();
        const body = { ...visitBody('pub_aaaaaaaaaaaa', crew), score: 10 };
        const r = await call('POST', '/api/crew/visits', { token: tokB, body });
        expect(r.status).toBe(201);
        const snap: CrewSnapshot = r.data.snapshot;
        expect(snap.visits[0].score).toBe(7);
        expect(snap.venues[0].name).toBe('Arka Oda');
        const again = await call('POST', '/api/crew/visits', { token: tokB, body });
        expect(again.status).toBe(200);
        expect(again.data.duplicate).toBe(true);
        expect(again.data.snapshot.visits).toHaveLength(1);
    });

    it('aynı isimli mekanı yeniden oluşturmaz', async () => {
        const { tokA, crew } = await setupCrew();
        await call('POST', '/api/crew/visits', { token: tokA, body: visitBody('pub_aaaaaaaaaaaa', crew) });
        const r = await call('POST', '/api/crew/visits', { token: tokA, body: { ...visitBody('pub_bbbbbbbbbbbb', crew), venue: { id: 'v_zzzzzzzzzz', name: 'arka  oda', area: 'kadikoy' } } });
        expect(r.data.snapshot.venues).toHaveLength(1);
    });

    it('eksik puanlı ziyareti reddeder', async () => {
        const { tokA, crew } = await setupCrew();
        const body = visitBody('pub_aaaaaaaaaaaa', crew);
        delete (body.sheets[crew.members[0].id] as Record<string, number>).vibe_comfort;
        const r = await call('POST', '/api/crew/visits', { token: tokA, body });
        expect(r.status).toBe(400);
        expect(r.data.error).toContain('eksik');
    });

    it('eşzamanlı düzenlemede çakışmayı bildirir', async () => {
        const { tokA, tokB, crew } = await setupCrew();
        const created = await call('POST', '/api/crew/visits', { token: tokA, body: visitBody('pub_aaaaaaaaaaaa', crew) });
        const base = created.data.snapshot.visits[0].updatedAt;
        clock += 1000;
        const ok1 = await call('PUT', '/api/crew/visits/pub_aaaaaaaaaaaa', { token: tokB, body: { ...visitBody('pub_aaaaaaaaaaaa', crew, 8), baseUpdatedAt: base } });
        expect(ok1.status).toBe(200);
        const stale = await call('PUT', '/api/crew/visits/pub_aaaaaaaaaaaa', { token: tokA, body: { ...visitBody('pub_aaaaaaaaaaaa', crew, 9), baseUpdatedAt: base } });
        expect(stale.status).toBe(409);
        expect(stale.data.current.score).toBe(8);
    });

    it('paralel yazımların hiçbiri kaybolmaz', async () => {
        const { tokA, tokB, crew } = await setupCrew();
        const ids = Array.from({ length: 12 }, (_, i) => `pub_par${String(i).padStart(9, '0')}`);
        const rs = await Promise.all(ids.map((id, i) => call('POST', '/api/crew/visits', { token: i % 2 ? tokA : tokB, body: visitBody(id, crew) })));
        expect(rs.every(r => r.status === 201)).toBe(true);
        const g = await call('GET', '/api/crew', { token: tokA });
        expect(g.data.visits).toHaveLength(12);
    });

    it('siler, geri alır, paylaşır ve paylaşımı kaldırır', async () => {
        const { tokA, crew } = await setupCrew();
        await call('POST', '/api/crew/visits', { token: tokA, body: visitBody('pub_aaaaaaaaaaaa', crew) });
        const sh = await call('POST', '/api/crew/visits/pub_aaaaaaaaaaaa/share', { token: tokA, body: {} });
        const sid = sh.data.shareId;
        const pub = await call('GET', '/api/shares/' + sid);
        expect(pub.status).toBe(200);
        expect(pub.data.crewName).toBe('Cuma Ekibi');
        expect(pub.data.visit.participants[0].memberId).toBeNull();
        expect(pub.data.visit.participants[0].name).toBe('Kişi 1');
        await call('POST', '/api/crew/visits/pub_aaaaaaaaaaaa/share', { token: tokA, body: { names: true } });
        expect((await call('GET', '/api/shares/' + sid)).data.visit.participants[0].name).toBe('Kaan');

        const del = await call('DELETE', '/api/crew/visits/pub_aaaaaaaaaaaa', { token: tokA });
        expect(del.data.snapshot.visits[0].deletedAt).toBeTruthy();
        expect((await call('GET', '/api/shares/' + sid)).status).toBe(404);
        const res = await call('POST', '/api/crew/visits/pub_aaaaaaaaaaaa/restore', { token: tokA });
        expect(res.data.snapshot.visits[0].deletedAt).toBeNull();
    });

    it('fotoğraf yükler ve sunar, yanlış türü reddeder', async () => {
        const { tokA } = await setupCrew();
        const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3]);
        const id = 'ph_' + 'a'.repeat(22);
        const up = await call('PUT', '/api/photos/' + id, { token: tokA, raw: jpeg, headers: { 'content-type': 'image/jpeg', 'x-photo-width': '640', 'x-photo-height': '480' } });
        expect(up.status).toBe(201);
        const res = await app(new Request('http://x/api/photos/' + id));
        expect(res.headers.get('content-type')).toBe('image/jpeg');
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg);
        const bad = await call('PUT', '/api/photos/ph_' + 'b'.repeat(22), { token: tokA, raw: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), headers: { 'content-type': 'image/gif' } });
        expect(bad.status).toBe(415);
        const anon = await call('PUT', '/api/photos/ph_' + 'c'.repeat(22), { raw: jpeg, headers: { 'content-type': 'image/jpeg' } });
        expect(anon.status).toBe(401);
    });
});

describe('mekanlar', () => {
    it('gidilecekler listesi, etiketler ve tür; ziyaret edilince listeden düşer', async () => {
        const { tokA, crew } = await setupCrew();
        const w = await call('POST', '/api/crew/wishlist', { token: tokA, body: { venue: { id: 'v_wish000001', name: 'Arka Oda', area: 'Kadıköy', kind: 'kokteyl' }, note: 'Negroni övülüyor' } });
        expect(w.status).toBe(200);
        const v0 = w.data.snapshot.venues[0];
        expect(v0.wish.note).toBe('Negroni övülüyor');
        expect(v0.kind).toBe('kokteyl');
        const t = await call('PATCH', '/api/crew/venues/' + v0.id, { token: tokA, body: { tags: ['canli_muzik', 'teras', 'uydurma'], kind: 'bar' } });
        expect(t.data.snapshot.venues[0].tags).toEqual(['canli_muzik', 'teras']);
        expect(t.data.snapshot.venues[0].kind).toBe('bar');
        const items = [{ id: 'i_aaaa1', name: 'Negroni', kind: 'kokteyl', price: 450, verdict: 'top' }, { id: 'bad id', name: 'x' }];
        const r = await call('POST', '/api/crew/visits', { token: tokA, body: { ...visitBody('pub_aaaaaaaaaaaa', crew), venue: undefined, venueId: v0.id, kinds: ['kokteyl'], items } });
        expect(r.status).toBe(201);
        const snap: CrewSnapshot = r.data.snapshot;
        expect(snap.venues[0].wish).toBeNull();
        expect(snap.visits[0].items).toHaveLength(1);
        expect(snap.visits[0].kinds).toEqual(expect.arrayContaining(['kokteyl', 'bira']));
    });

    it('listeden çıkarılan ve hiç gidilmemiş mekan silinir', async () => {
        const { tokA } = await setupCrew();
        const w = await call('POST', '/api/crew/wishlist', { token: tokA, body: { venue: { id: 'v_wish000002', name: 'Yeni Yer' } } });
        const id = w.data.venueId;
        const d = await call('DELETE', '/api/crew/wishlist/' + id, { token: tokA });
        expect(d.data.snapshot.venues).toHaveLength(0);
    });
});

describe('canlı masa', () => {
    it('kör puanlama, misafir koltuğu ve kapanışta ziyaret oluşturma', async () => {
        const { tokA, tokB, crew } = await setupCrew();
        const [kaan, suude] = crew.members;
        const created = await call('POST', '/api/tables', {
            token: tokA,
            body: {
                setup: {
                    venue: { id: 'v_masa000001', name: 'Masa Pub' }, date: '2026-10-04', blind: true, openSeats: true, metrics: BEER, kinds: ['bira'],
                    participants: [
                        { id: kaan.id, name: 'Kaan', color: 0, memberId: kaan.id },
                        { id: suude.id, name: 'Suude', color: 1, memberId: suude.id }
                    ]
                }
            }
        });
        expect(created.status).toBe(201);
        const code = (created.data.view as TableView).code;
        expect((await call('GET', '/api/crew', { token: tokB })).data.tables).toHaveLength(1);

        // Suude üye olarak bağlanır; misafir kendini ekler
        const jb = await call('POST', `/api/tables/${code}/join`, { token: tokB, body: {} });
        expect(jb.data.view.mySeat).toBe(suude.id);
        const anonView = await call('GET', `/api/tables/${code}`);
        expect(anonView.data.sheets).toBeNull();
        expect(anonView.data.mySeat).toBeNull();
        const jg = await call('POST', `/api/tables/${code}/join`, { body: { name: 'Misafir Can' } });
        expect(jg.status).toBe(200);
        const seatTok: string = jg.data.seatToken;
        const guestPid: string = jg.data.view.mySeat;
        const steal = await call('POST', `/api/tables/${code}/join`, { body: { pid: guestPid } });
        expect(steal.status).toBe(409);

        // Herkes kendi kağıdını doldurur; başkasının kağıdı yazılamaz
        expect((await call('PUT', `/api/tables/${code}/sheets/${kaan.id}`, { token: seatTok, body: { sheet: full(1) } })).status).toBe(403);
        await call('PUT', `/api/tables/${code}/sheets/${kaan.id}`, { token: tokA, body: { sheet: full(9), done: true } });
        await call('PUT', `/api/tables/${code}/sheets/${suude.id}`, { token: tokB, body: { sheet: full(7), done: true } });
        const half = full(5); delete half.vibe_comfort;
        await call('PUT', `/api/tables/${code}/sheets/${guestPid}`, { token: seatTok, body: { sheet: half } });

        const vb = await call('GET', `/api/tables/${code}`, { token: tokB });
        expect(vb.data.sheets).toBeNull();
        expect(vb.data.mine[suude.id].beer_temp_gas).toBe(7);
        expect(vb.data.seats.find((s: any) => s.pid === guestPid).filled).toBe(BEER.length - 1);

        expect((await call('POST', `/api/tables/${code}/finish`, { token: tokB, body: {} })).status).toBe(403);
        const inc = await call('POST', `/api/tables/${code}/finish`, { token: tokA, body: {} });
        expect(inc.status).toBe(400);
        const fin = await call('POST', `/api/tables/${code}/finish`, { token: tokA, body: { fillMissing: true } });
        expect(fin.status).toBe(200);
        const again = await call('POST', `/api/tables/${code}/finish`, { token: tokA, body: { fillMissing: true } });
        expect(again.data.visitId).toBe(fin.data.visitId);

        const g = await call('GET', '/api/crew', { token: tokA });
        expect(g.data.tables).toHaveLength(0);
        expect(g.data.visits).toHaveLength(1);
        expect(g.data.visits[0].source).toBe('live');
        expect(g.data.visits[0].participants).toHaveLength(3);

        const reveal = await call('GET', `/api/tables/${code}`, { token: seatTok });
        expect(reveal.data.status).toBe('closed');
        expect(reveal.data.sheets[kaan.id].beer_temp_gas).toBe(9);
        expect(reveal.data.result.score).toBe(g.data.visits[0].score);
    });
});

describe('v7 içe aktarma', () => {
    it('eski kayıtları ekibe taşır ve isimle üyelere bağlar', async () => {
        const metrics: Record<string, unknown> = {};
        LEGACY_METRICS.forEach(id => { metrics[id] = { active: true, scores: { p0: 8, p1: 6 } }; });
        for (let i = 0; i < 3; i++) {
            legacyVisits['pub_169600000000' + i] = {
                id: 'pub_169600000000' + i, name: i < 2 ? 'Eski Pub' : 'Başka Pub', location: 'Moda', date: '2025-05-0' + (i + 1), notes: '',
                participants: [{ id: 'p0', name: 'Kaan', colorIdx: 0 }, { id: 'p1', name: 'Ayşe', colorIdx: 1 }], metrics, hasPhoto: i === 1
            };
        }
        const { tokA, tokB } = await setupCrew();
        expect((await call('GET', '/api/crew/legacy', { token: tokB })).status).toBe(403);
        const st = await call('GET', '/api/crew/legacy', { token: tokA });
        expect(st.data.available).toBe(3);
        const r = await call('POST', '/api/crew/legacy', { token: tokA, body: { cursor: 0 } });
        expect(r.data.imported).toBe(3);
        expect(r.data.next).toBeNull();
        const snap: CrewSnapshot = r.data.snapshot;
        expect(snap.legacyImported).toBe(true);
        expect(snap.venues).toHaveLength(2);
        const v = snap.visits.find(x => x.id === 'pub_1696000000001')!;
        expect(v.participants[0].memberId).toBe(snap.members[0].id);
        expect(v.participants[1].memberId).toBeNull();
        expect(v.photos[0].id).toBe('L_pub_1696000000001');
        const photo = await app(new Request('http://x/api/photos/L_pub_1696000000001'));
        expect(photo.status).toBe(200);

        // Ayşe ekibe katılırken geçmiş katılımlarını sahiplenir
        const join = await call('POST', '/api/auth/join', { body: { crewId: snap.id, invite: snap.invite, name: 'Ayşe', guestKey: 'ayse' } });
        const me = join.data.snapshot.me;
        expect(join.data.snapshot.visits.every((x: any) => x.participants[1].memberId === me)).toBe(true);
    });
});
