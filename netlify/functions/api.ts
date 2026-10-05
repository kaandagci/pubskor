// Ana API. Canlı masada birkaç kişi aynı ağdan birkaç saniyede bir istek attığı için sınır geniş tutuldu.
import { createApp } from '../../server/app';
import { netlifyIdentity } from '../../server/identity';
import { appStore, blobsLegacy } from '../../server/kv-blobs';

let app: ReturnType<typeof createApp> | null = null;

export default async (req: Request) => {
    app ??= createApp({
        kv: appStore(), identity: netlifyIdentity(process.env.URL), legacy: blobsLegacy(),
        adminKey: process.env.ADMIN_KEY || '', statsSalt: process.env.STATS_SALT || ''
    });
    return app(req);
};

export const config = {
    path: '/api/*',
    excludedPath: ['/api/auth/*', '/api/places/*'],
    rateLimit: { windowLimit: 600, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
