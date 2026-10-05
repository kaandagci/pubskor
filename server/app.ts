// API yönlendiricisi. Netlify fonksiyonu, yerel geliştirme sunucusu ve testler aynı uygulamayı kullanır.
import type { Ctx } from './crew';
import { HttpError, fail } from './http';
import type { KV, LegacyStores } from './kv';
import * as crew from './routes-crew';
import * as tables from './routes-tables';
import * as visits from './routes-visits';

type Handler = (ctx: Ctx, req: Request, params: Record<string, string>) => Promise<Response>;

const ROUTES: [string, string, Handler][] = [
    // Kimlik / davet (ayrı ve daha sıkı istek sınırıyla)
    ['POST', '/api/auth/crew', crew.createCrew],
    ['POST', '/api/auth/preview', crew.previewCrew],
    ['POST', '/api/auth/join', crew.joinCrew],

    // Ekip
    ['GET', '/api/crew', crew.getCrew],
    ['PATCH', '/api/crew', crew.updateCrew],
    ['DELETE', '/api/crew', crew.deleteCrew],
    ['POST', '/api/crew/invite', crew.rotateInvite],
    ['PATCH', '/api/crew/me', crew.updateMe],
    ['POST', '/api/crew/me/token', crew.rotateMyToken],
    ['POST', '/api/crew/claim', crew.claim],
    ['DELETE', '/api/crew/members/:mid', crew.removeMember],
    ['POST', '/api/crew/members/:mid/owner', crew.makeOwner],
    ['POST', '/api/crew/members/:mid/relink', crew.relinkMember],

    // Ziyaretler ve mekanlar
    ['POST', '/api/crew/visits', visits.createVisit],
    ['PUT', '/api/crew/visits/:id', visits.updateVisit],
    ['DELETE', '/api/crew/visits/:id', visits.deleteVisit],
    ['POST', '/api/crew/visits/:id/restore', visits.restoreVisit],
    ['POST', '/api/crew/visits/:id/share', visits.shareVisit],
    ['DELETE', '/api/crew/visits/:id/share', visits.unshareVisit],
    ['POST', '/api/crew/wishlist', visits.wishVenue],
    ['DELETE', '/api/crew/wishlist/:id', visits.unwishVenue],
    ['PATCH', '/api/crew/venues/:id', visits.updateVenue],
    ['DELETE', '/api/crew/venues/:id', visits.deleteVenue],
    ['POST', '/api/crew/venues/:id/merge', visits.mergeVenue],
    ['GET', '/api/crew/legacy', visits.legacyStatus],
    ['POST', '/api/crew/legacy', visits.legacyImport],

    // Herkese açık okumalar
    ['GET', '/api/shares/:sid', visits.getShare],
    ['GET', '/api/photos/:pid', visits.getPhoto],
    ['PUT', '/api/photos/:pid', visits.uploadPhoto],

    // Canlı masa
    ['POST', '/api/tables', tables.createTable],
    ['GET', '/api/tables/:code', tables.getTable],
    ['PATCH', '/api/tables/:code', tables.patchTable],
    ['DELETE', '/api/tables/:code', tables.cancelTable],
    ['POST', '/api/tables/:code/join', tables.joinTable],
    ['POST', '/api/tables/:code/finish', tables.finishTable],
    ['PUT', '/api/tables/:code/sheets/:pid', tables.putSheet],
    ['POST', '/api/tables/:code/seats/:pid/release', tables.releaseSeat]
];

const compiled = ROUTES.map(([method, pattern, handler]) => {
    const names: string[] = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '/?$');
    return { method, re, names, handler };
});

export interface AppOptions {
    kv: KV;
    legacy?: LegacyStores | null;
    adminKey?: string;
    now?: () => number;
}

export function createApp(opts: AppOptions) {
    const ctx: Ctx = { kv: opts.kv, legacy: opts.legacy ?? null, adminKey: opts.adminKey ?? '', now: opts.now ?? Date.now };
    return async function handle(req: Request): Promise<Response> {
        const { pathname } = new URL(req.url);
        let pathMatched = false;
        for (const r of compiled) {
            const m = r.re.exec(pathname);
            if (!m) continue;
            pathMatched = true;
            if (r.method !== req.method && !(r.method === 'GET' && req.method === 'HEAD')) continue;
            const params: Record<string, string> = {};
            r.names.forEach((n, i) => {
                try { params[n] = decodeURIComponent(m[i + 1]); } catch { params[n] = ''; }
            });
            try {
                return await r.handler(ctx, req, params);
            } catch (e) {
                if (e instanceof HttpError) return fail(e.status, e.message, e.extra);
                console.error('API hatası', req.method, pathname, e);
                return fail(500, 'Sunucu hatası, birazdan tekrar dene');
            }
        }
        return pathMatched ? fail(405, 'Desteklenmeyen istek') : fail(404, 'Bulunamadı');
    };
}
