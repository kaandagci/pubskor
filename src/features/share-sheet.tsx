import { useState } from 'preact/hooks';
import type { Visit } from '../../shared/types';
import { ApiError } from '../lib/api';
import { copyText, safeFilename, shareNative, shareOrDownload } from '../lib/share';
import { mutate } from '../state/crew';
import { snapshot, venueById } from '../state/data';
import { online, openSheet, toast } from '../state/ui';
import { FileText, Image, Link as LinkIcon, MessageCircle, Trash2 } from '../components/icons';
import { Spinner, Switch } from '../components/ui';
import { whatsappText } from './export/whatsapp';

async function run(label: string, fn: () => Promise<void>) {
    try { await fn(); } catch (e) { toast(e instanceof Error ? e.message : `${label} başarısız`, 'error'); }
}

export function openShareSheet(v: Visit) {
    openSheet({ title: 'Paylaş', render: close => <ShareBody v={v} close={close} /> });
}

function ShareBody({ v, close }: { v: Visit; close: () => void }) {
    const venue = venueById.value.get(v.venueId);
    const crewName = snapshot.value?.name ?? '';
    const [busy, setBusy] = useState<string | null>(null);
    const [publicOpen, setPublicOpen] = useState(false);
    const [opts, setOpts] = useState({ names: false, photos: false, notes: false });
    const current = snapshot.value?.visits.find(x => x.id === v.id);
    const shareId = current?.shareId ?? null;
    const name = venue?.name ?? 'Pub';

    const card = () => run('Görsel', async () => {
        setBusy('card');
        const { renderCard } = await import('./export/card');
        const blob = await renderCard(v, venue, crewName);
        const r = await shareOrDownload(blob, `${safeFilename(name)}_PubSkor.jpg`, name);
        if (r === 'downloaded') toast('Görsel indirildi');
        setBusy(null);
    }).finally(() => setBusy(null));

    const wa = () => run('Metin', async () => {
        const text = whatsappText(v, venue);
        if (await shareNative({ text })) return;
        toast((await copyText(text)) ? 'Metin kopyalandı, WhatsApp’a yapıştırabilirsin' : 'Kopyalanamadı', 'success');
    });

    const pdf = () => run('PDF', async () => {
        setBusy('pdf');
        const { buildPdf } = await import('./export/pdf');
        const blob = await buildPdf(v, venue, crewName);
        const r = await shareOrDownload(blob, `${safeFilename(name)}_PubSkor.pdf`, name);
        if (r === 'downloaded') toast('PDF indirildi');
    }).finally(() => setBusy(null));

    const makeLink = () => run('Bağlantı', async () => {
        setBusy('link');
        try {
            const r = await mutate<{ shareId: string }>('POST', `/api/crew/visits/${encodeURIComponent(v.id)}/share`, opts);
            const url = `${location.origin}/s/${r.shareId}`;
            if (!(await shareNative({ title: name, url }))) toast((await copyText(url)) ? 'Bağlantı kopyalandı' : url, 'success');
        } catch (e) {
            toast(e instanceof ApiError && e.offline ? 'Bağlantı için internet gerekiyor' : e instanceof Error ? e.message : 'Bağlantı oluşturulamadı', 'error');
        }
    }).finally(() => setBusy(null));

    const removeLink = () => run('Bağlantı', async () => {
        await mutate('DELETE', `/api/crew/visits/${encodeURIComponent(v.id)}/share`);
        toast('Herkese açık bağlantı kaldırıldı', 'info');
    });

    const item = (key: string, Icon: typeof Image, title: string, sub: string, onClick: () => void, disabled = false) => (
        <button class="list-item" onClick={onClick} disabled={disabled || !!busy}>
            <span class="li-icon">{busy === key ? <Spinner small /> : <Icon />}</span>
            <span class="li-body"><span class="li-title">{title}</span><span class="li-sub" style={{ whiteSpace: 'normal' }}>{sub}</span></span>
        </button>
    );

    return (
        <div>
            <div class="list">
                {item('card', Image, 'Paylaşım görseli', 'Hikâye ve sohbetler için skor kartı', card)}
                {item('wa', MessageCircle, 'WhatsApp metni', 'Skor, masa ve öne çıkanlar', wa)}
                {item('pdf', FileText, 'PDF rapor', 'Tüm puan tablosu, notlar ve fotoğraflar', pdf)}
                {item('link', LinkIcon, shareId ? 'Herkese açık bağlantıyı paylaş' : 'Herkese açık bağlantı oluştur', 'Ekip dışından kişiler giriş yapmadan görebilir', () => setPublicOpen(!publicOpen), !online.value)}
            </div>
            {publicOpen && (
                <div class="card card-pad mt-12">
                    <p class="small muted mb-12">Bağlantıyı alan herkes skoru ve kriterleri görür. Gizlilik için aşağıdakiler varsayılan olarak kapalıdır; sipariş defteri hiçbir zaman paylaşılmaz.</p>
                    {([['names', 'Kişi adlarını göster'], ['photos', 'Fotoğrafları göster'], ['notes', 'Notları göster']] as const).map(([k, l]) => (
                        <div class="row between" key={k} style={{ padding: '8px 0' }}>
                            <span>{l}</span>
                            <Switch checked={opts[k]} label={l} onChange={c => setOpts({ ...opts, [k]: c })} />
                        </div>
                    ))}
                    <div class="row mt-12">
                        <button class="btn btn-primary grow" onClick={makeLink} disabled={!!busy}>{busy === 'link' ? <Spinner small /> : <LinkIcon />}{shareId ? 'Güncelle ve paylaş' : 'Oluştur ve paylaş'}</button>
                        {shareId && <button class="btn btn-danger" onClick={removeLink} aria-label="Bağlantıyı kaldır"><Trash2 /></button>}
                    </div>
                </div>
            )}
            <p class="hint center mt-16">Paylaşımlarda alkol markası ya da logosu yer almaz. <a class="link-btn" href="/yasal" onClick={close}>Neden?</a></p>
        </div>
    );
}
