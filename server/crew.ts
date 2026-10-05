// Ekip belgesi: tek blob içinde üyeler, mekanlar, ziyaretler ve aktif masalar.
// Arkadaş grubu ölçeğinde (birkaç bin ziyaret) tek belge hem tutarlı hem de tek okumada yüklenir.
// Her yazım ETag ile koşulludur; çakışmada belge yeniden okunup işlem tekrar uygulanır.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { CrewSnapshot, Member, TableRef, Venue, Visit } from '../shared/types';
import { foldKey } from '../shared/text';
import { HttpError, sleep } from './http';
import type { JsonEntry, KV, LegacyStores } from './kv';

export interface MemberRecord extends Member {
    tokenHash: string | null;
}

export interface CrewDoc {
    v: 1;
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    rev: number;
    invite: string;
    members: MemberRecord[];
    venues: Venue[];
    visits: Visit[];
    tables: TableRef[];
    legacyImported?: boolean;
}

export interface Ctx {
    kv: KV;
    legacy: LegacyStores | null;
    adminKey: string;
    now: () => number;
}

export const crewKey = (id: string) => `crew/${id}`;
export const DELETED_TTL = 30 * 24 * 3600 * 1000;

export const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export function safeEq(a: string, b: string): boolean {
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}

// ----- Jetonlar -----
// Üye: m1.<ekip>.<üye>.<gizli>   Koltuk (canlı masa misafiri): t1.<masa>.<katılımcı>.<gizli>

export type Token =
    | { kind: 'member'; crewId: string; memberId: string; secret: string }
    | { kind: 'seat'; code: string; pid: string; secret: string };

export const memberToken = (crewId: string, memberId: string, secret: string) => `m1.${crewId}.${memberId}.${secret}`;
export const seatToken = (code: string, pid: string, secret: string) => `t1.${code}.${pid}.${secret}`;

export function parseToken(req: Request): Token | null {
    const h = req.headers.get('authorization') || '';
    const m = /^Bearer\s+(\S{10,300})$/i.exec(h);
    if (!m) return null;
    const parts = m[1].split('.');
    if (parts.length !== 4 || parts[3].length < 20) return null;
    if (parts[0] === 'm1') return { kind: 'member', crewId: parts[1], memberId: parts[2], secret: parts[3] };
    if (parts[0] === 't1') return { kind: 'seat', code: parts[1], pid: parts[2], secret: parts[3] };
    return null;
}

// ----- Okuma / yazma -----

export async function loadCrew(ctx: Ctx, id: string): Promise<JsonEntry<CrewDoc> | null> {
    if (!/^c_[\w-]{14}$/.test(id)) return null;
    return ctx.kv.getJSON<CrewDoc>(crewKey(id));
}

export function activeMember(crew: CrewDoc, memberId: string): MemberRecord | null {
    return crew.members.find(m => m.id === memberId && !m.removed) ?? null;
}

export function checkMember(crew: CrewDoc, token: Token | null): MemberRecord | null {
    if (!token || token.kind !== 'member' || token.crewId !== crew.id) return null;
    const m = activeMember(crew, token.memberId);
    if (!m || !m.tokenHash || !safeEq(sha(token.secret), m.tokenHash)) return null;
    return m;
}

export interface Authed {
    crew: CrewDoc;
    entry: JsonEntry<CrewDoc>;
    member: MemberRecord;
}

/** İsteği yapan üyeyi doğrular. Ekip yoksa ya da jeton geçersizse 401. */
export async function authMember(ctx: Ctx, req: Request): Promise<Authed> {
    const token = parseToken(req);
    if (!token || token.kind !== 'member') throw new HttpError(401, 'Giriş gerekli');
    const entry = await loadCrew(ctx, token.crewId);
    if (!entry) throw new HttpError(401, 'Ekip bulunamadı', { code: 'crew_gone' });
    const member = checkMember(entry.data, token);
    if (!member) throw new HttpError(401, 'Bu cihazın ekip erişimi geçersiz', { code: 'token_invalid' });
    return { crew: entry.data, entry, member };
}

/**
 * Ekip belgesini koşullu olarak günceller. `fn` her denemede taze belgeyle yeniden çalışır,
 * bu yüzden yan etkisiz olmalı (yalnızca belgeyi değiştirmeli).
 */
export async function mutateCrew<T>(ctx: Ctx, crewId: string, fn: (crew: CrewDoc) => T): Promise<{ crew: CrewDoc; result: T }> {
    for (let attempt = 0; attempt < 8; attempt++) {
        const entry = await loadCrew(ctx, crewId);
        if (!entry) throw new HttpError(404, 'Ekip bulunamadı');
        const crew = entry.data;
        const result = fn(crew);
        housekeeping(crew, ctx.now());
        crew.rev += 1;
        crew.updatedAt = ctx.now();
        const w = await ctx.kv.setJSON(crewKey(crewId), crew, { onlyIfMatch: entry.etag });
        if (w.modified) return { crew, result };
        await sleep(15 + Math.random() * 60 * (attempt + 1));
    }
    throw new HttpError(503, 'Şu an çok yoğun, birazdan tekrar dene');
}

/** Süresi geçen masaları ve 30 günden eski silinmiş ziyaretleri temizler. */
function housekeeping(crew: CrewDoc, now: number) {
    crew.tables = crew.tables.filter(t => t.expiresAt > now);
    crew.visits = crew.visits.filter(v => !v.deletedAt || now - v.deletedAt < DELETED_TTL);
}

export function snapshot(crew: CrewDoc, meId: string, now: number): CrewSnapshot {
    return {
        id: crew.id,
        name: crew.name,
        createdAt: crew.createdAt,
        rev: crew.rev,
        invite: crew.invite,
        me: meId,
        members: crew.members.map(({ tokenHash, ...m }) => m),
        venues: crew.venues,
        visits: crew.visits,
        tables: crew.tables.filter(t => t.expiresAt > now),
        legacyImported: !!crew.legacyImported
    };
}

export function requireOwner(member: MemberRecord) {
    if (member.role !== 'owner') throw new HttpError(403, 'Bu işlem için ekip kurucusu olmalısın');
}

/** Ekipteki eşleşmemiş misafir isimleri (üyeye bağlanabilir). */
export function guestList(crew: CrewDoc): { key: string; name: string; visits: number }[] {
    const map = new Map<string, { key: string; name: string; visits: number }>();
    for (const v of crew.visits) {
        if (v.deletedAt) continue;
        for (const p of v.participants) {
            if (p.memberId) continue;
            const key = foldKey(p.name);
            if (!key) continue;
            const e = map.get(key);
            if (e) e.visits++; else map.set(key, { key, name: p.name, visits: 1 });
        }
    }
    return [...map.values()].sort((a, b) => b.visits - a.visits);
}

/** Misafir olarak kayıtlı geçmiş katılımları üyeye bağlar. Kaç ziyaretin etkilendiğini döner. */
export function claimGuest(crew: CrewDoc, guestKey: string, memberId: string): number {
    let n = 0;
    for (const v of crew.visits) {
        const hasMember = v.participants.some(p => p.memberId === memberId);
        for (const p of v.participants) {
            if (!p.memberId && foldKey(p.name) === guestKey && !hasMember) { p.memberId = memberId; n++; }
        }
    }
    return n;
}

export function freeColor(crew: CrewDoc): number {
    const used = new Set(crew.members.filter(m => !m.removed).map(m => m.color));
    for (let i = 0; i < 8; i++) if (!used.has(i)) return i;
    return crew.members.length % 8;
}
