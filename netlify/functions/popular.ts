// Zamanlanmış görev (30 dk'da bir): anonim etkinlik kayıtlarından bugün / bu hafta / bu ay popüler
// mekan listelerini ve topluluk puanlarını hesaplar, popular/ist belgesine yazar.
import catalog from '../../data/places/ist.json';
import { REPORT_HIDE_AT, fromRow, type CatalogFile, type CatalogPlace } from '../../shared/places';
import { COMMUNITY_KEY, REPORTS_KEY, hiddenFrom, type CommunityDoc, type ReportsDoc } from '../../server/community';
import { appStore } from '../../server/kv-blobs';
import { aggregate } from '../../server/popular';

let byId: Map<string, CatalogPlace> | null = null;

export default async () => {
    const kv = appStore();
    byId ??= new Map((catalog as unknown as CatalogFile).rows.map(r => { const p = fromRow(r); return [p.id, p] as const; }));
    const community = (await kv.getJSON<CommunityDoc>(COMMUNITY_KEY))?.data.places ?? [];
    const extra = new Map(community.filter(p => !p.hidden).map(p => [p.id, p]));
    // Kullanıcıların "alkol servisi yok / kapandı" bildirdiği mekanlar listelenmez
    const hidden = hiddenFrom((await kv.getJSON<ReportsDoc>(REPORTS_KEY))?.data, REPORT_HIDE_AT);
    const t = Date.now();
    const doc = await aggregate(kv, t, id => (hidden.has(id) ? null : byId!.get(id) ?? extra.get(id)));
    console.log(`Popüler: gün ${doc.windows.day.length}, hafta ${doc.windows.week.length}, ay ${doc.windows.month.length} (${Date.now() - t} ms)`);
};

export const config = { schedule: '*/30 * * * *' };
