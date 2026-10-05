// Mekan kataloğu: adla arama ve mekan bilgisi. Katalog (İstanbul, ~46 bin mekan) bu fonksiyona gömülüdür.
import catalog from '../../data/places/ist.json';
import type { CatalogFile } from '../../shared/places';
import { appStore } from '../../server/kv-blobs';
import { communityLoader } from '../../server/community';
import { netlifyIdentity } from '../../server/identity';
import { createPlacesApp } from '../../server/places-app';

let app: ReturnType<typeof createPlacesApp> | null = null;

export default async (req: Request) => {
    if (!app) {
        const kv = appStore();
        app = createPlacesApp(catalog as unknown as CatalogFile, { community: communityLoader(kv), kv, identity: netlifyIdentity(process.env.URL) });
    }
    return app(req);
};

export const config = { path: '/api/places/*' };
