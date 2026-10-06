// Topluluk: diğer ekiplerin puanları (akış, sıralama, mekan) ve zevke göre öneriler.
// Okumalar hesapsız da açıktır; giriş yapılmışsa kendi ekiplerinin puanları gecikmesiz görünür ve işaretlenir.
import { isPlaceId } from '../shared/places';
import { authMember, type Ctx } from './crew';
import { HttpError, json } from './http';
import { feed, placeView, ranking, recommend } from './public-feed';

const CACHE = { 'cache-control': 'private, max-age=30' };

export async function getFeed(ctx: Ctx, req: Request) {
    const q = new URL(req.url).searchParams;
    const offset = Math.max(0, Math.min(100_000, Number(q.get('offset')) || 0));
    const limit = Math.max(1, Math.min(100, Number(q.get('limit')) || 40));
    return json(await feed(ctx, req, offset, limit), 200, CACHE);
}

export async function getRanking(ctx: Ctx, req: Request) {
    return json({ items: await ranking(ctx, req) }, 200, CACHE);
}

export async function getPlace(ctx: Ctx, req: Request, p: Record<string, string>) {
    if (!isPlaceId(p.id)) throw new HttpError(404, 'Mekan bulunamadı');
    return json(await placeView(ctx, req, p.id), 200, CACHE);
}

export async function getRecommendations(ctx: Ctx, req: Request) {
    const { crew } = await authMember(ctx, req);
    return json(await recommend(ctx, req, crew), 200, CACHE);
}
