// Ana API. Canlı masada birkaç kişi aynı ağdan birkaç saniyede bir istek attığı için sınır geniş tutuldu.
// Mekan kataloğu (≈0,6 MB) topluluk akışında mekan adını ve konumunu ekiplerin yazdığı addan değil
// katalogdan göstermek için gömülüdür.
import catalog from '../../data/places/ist.json';
import { fromRow, type CatalogFile, type CatalogPlace } from '../../shared/places';
import { createApp } from '../../server/app';
import { netlifyIdentity } from '../../server/identity';
import { appStore, blobsLegacy } from '../../server/kv-blobs';

let app: ReturnType<typeof createApp> | null = null;
let byId: Map<string, CatalogPlace> | null = null;

export default async (req: Request) => {
    app ??= createApp({
        kv: appStore(), identity: netlifyIdentity(process.env.URL), legacy: blobsLegacy(),
        adminKey: process.env.ADMIN_KEY || '', statsSalt: process.env.STATS_SALT || '',
        placeLookup: id => {
            byId ??= new Map((catalog as unknown as CatalogFile).rows.map(r => { const p = fromRow(r); return [p.id, p] as const; }));
            return byId.get(id);
        }
    });
    return app(req);
};

export const config = {
    path: '/api/*',
    excludedPath: ['/api/auth/*', '/api/places/*'],
    rateLimit: { windowLimit: 600, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
