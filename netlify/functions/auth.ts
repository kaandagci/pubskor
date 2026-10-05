// Ekip kurma / davet önizleme / katılma. Davet bağlantısı tahminine karşı sıkı istek sınırı.
import { createApp } from '../../server/app';
import { appStore } from '../../server/kv-blobs';

let app: ReturnType<typeof createApp> | null = null;

export default async (req: Request) => {
    app ??= createApp({ kv: appStore(), adminKey: process.env.ADMIN_KEY || '' });
    return app(req);
};

export const config = {
    path: '/api/auth/*',
    rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
