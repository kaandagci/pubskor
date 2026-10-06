// Popüler mekanlar (herkese açık, anonim) ve "Buradayım" kaydı.
import { isPlaceId } from '../shared/places';
import { requireUser, type Ctx } from './crew';
import { HttpError, json, readJSON } from './http';
import { K_MIN, POPULAR_KEY, activityCount, aggregate, istanbulDay, partyHash, recordActivity, type PopularDoc } from './popular';

const EMPTY = (now: number): PopularDoc => ({ v: 1, updatedAt: now, k: K_MIN, windows: { day: [], week: [], month: [] }, scores: {} });

export async function getPopular(ctx: Ctx) {
    let doc = (await ctx.kv.getJSON<PopularDoc>(POPULAR_KEY))?.data ?? null;
    // Yerel geliştirmede zamanlanmış fonksiyon yok: istek anında hesapla
    if (ctx.dev && ctx.placeLookup && (!doc || ctx.now() - doc.updatedAt > 15_000)) doc = await aggregate(ctx.kv, ctx.now(), ctx.placeLookup);
    return json(doc ?? EMPTY(ctx.now()), 200, { 'cache-control': ctx.dev ? 'no-store' : 'public, max-age=120' });
}

/** Hesaplı kullanıcı bir mekanda olduğunu bildirir (anonim, puansız; günde en fazla 10 mekan). */
export async function checkin(ctx: Ctx, req: Request) {
    const user = await requireUser(ctx, req);
    const b = await readJSON(req);
    if (!isPlaceId(b.placeId)) throw new HttpError(400, 'Geçersiz mekan');
    const now = ctx.now();
    const day = istanbulDay(now);
    const party = partyHash(ctx.statsSalt, 'user', user.id);
    if (await activityCount(ctx.kv, day, party) >= 10) throw new HttpError(429, 'Bugün yeterince yer bildirdin');
    await recordActivity(ctx.kv, { day, party, placeId: b.placeId as string, score: null, kinds: [], now });
    return json({ ok: true });
}
