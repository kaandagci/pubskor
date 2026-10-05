// Ana API. Canlı masada birkaç kişi aynı ağdan birkaç saniyede bir istek attığı için sınır geniş tutuldu.
import { createApp } from '../../server/app';
import { appStore, blobsLegacy } from '../../server/kv-blobs';

let app: ReturnType<typeof createApp> | null = null;

export default async (req: Request) => {
    app ??= createApp({ kv: appStore(), legacy: blobsLegacy(), adminKey: process.env.ADMIN_KEY || '' });
    return app(req);
};

export const config = {
    path: '/api/*',
    excludedPath: '/api/auth/*',
    rateLimit: { windowLimit: 600, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
