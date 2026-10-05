// Reklam alanı. ADS.enabled kapalıyken hiçbir şey çizmez ve hiçbir istek atmaz.
// Tasarımı önizlemek için adres çubuğuna ?reklam=onizleme eklenebilir (yalnızca örnek kart gösterilir).
import { ADS } from '../config';
import { consent } from '../state/consent';
import { Megaphone } from './icons';

export interface AdCreative {
    id: string;
    category: string;
    title: string;
    body: string;
    cta: string;
    href: string;
    advertiser: string;
}

/** Yasaklı kategoriler (alkol vb.) burada süzülür; reklam sağlayıcısı ne gönderirse göndersin gösterilmez. */
export function allowed(ad: AdCreative): boolean {
    return !ADS.blockedCategories.includes(ad.category);
}

const SAMPLE: AdCreative = {
    id: 'ornek', category: 'ulasim', title: 'Eve dönüş planın hazır mı?',
    body: 'Gece çıkışlarında taksi ya da toplu taşımayla güvenle dön.', cta: 'Daha fazla', href: '#', advertiser: 'Örnek reklamveren'
};

const preview = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('reklam') === 'onizleme';

export function AdSlot({ placement }: { placement: string }) {
    const ad = preview() ? SAMPLE : null;
    if (!ad && !ADS.enabled) return null;
    if (!ad || !allowed(ad)) return null;
    return (
        <aside class="card card-pad mt-12" aria-label="Reklam" data-placement={placement} style={{ borderStyle: 'dashed' }}>
            <div class="row between mb-8">
                <span class="badge"><Megaphone />Reklam</span>
                <span class="tiny faint">{ad.advertiser}{consent.value.ads ? '' : ' · kişiselleştirilmemiş'}</span>
            </div>
            <b>{ad.title}</b>
            <p class="small muted mt-8">{ad.body}</p>
            <a class="btn btn-sm btn-secondary mt-12" href={ad.href} rel="sponsored noopener" target="_blank">{ad.cta}</a>
        </aside>
    );
}
