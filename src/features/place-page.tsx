import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { venueKindLabel } from '../../shared/metrics';
import { REPORT_REASONS, catLabel, mapsDirectionsUrl, mapsSearchUrl, meters, type CatalogPlace, type ReportReason } from '../../shared/places';
import { fmtRelativeDay, fmtScore } from '../lib/format';
import { getPlace, reportPlace } from '../lib/places';
import { getPosition } from '../lib/geo';
import { request } from '../lib/api';
import { authUser } from '../lib/auth';
import { loadPopular } from '../lib/popular';
import { openSheet, toast, toastError } from '../state/ui';
import { venueSummaries } from '../state/data';
import { memberships } from '../state/session';
import { BookmarkPlus, ChevronRight, Flag, Link as LinkIcon, MapPin, Navigation, Plus, Smartphone } from '../components/icons';
import { ScoreRing } from '../components/ScoreRing';
import { AsyncButton, Empty, Loading, TierChip, TopBar } from '../components/ui';
import { PlaceStats } from './explore';
import { PlaceCommunity } from './community';
import { EmblemCover } from '../components/PlaceEmblem';
import { addToWishlist } from './ranking';
import { choiceFromCatalog, presetChoice } from './venue-picker';

const fmtPhone = (p: string) => p.replace(/^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/, '0$1 $2 $3 $4');
const hostOf = (u: string) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };

/** Katalogdaki bir mekanın sayfası (ekip gitmemiş olsa da açılır). */
export function PlacePage() {
    const { params } = useRoute();
    const { route } = useLocation();
    const [place, setPlace] = useState<CatalogPlace | null | undefined>(undefined);
    useEffect(() => { setPlace(undefined); void getPlace(params.id).then(setPlace); }, [params.id]);

    if (place === undefined) return <><TopBar back="/kesfet" /><Loading label="Mekan açılıyor" /></>;
    if (!place) return <><TopBar back="/kesfet" /><main class="page"><Empty title="Mekan bulunamadı">Bu mekan katalogdan kaldırılmış olabilir.</Empty></main></>;

    const crewVenue = venueSummaries.value.find(s => s.venue.placeId === place.id);
    const sub = [catLabel(place.cat) || venueKindLabel(place.kind), place.district].filter(Boolean).join(' · ');
    const hasCrew = memberships.value.length > 0 && !!authUser.value;

    const rateHere = () => {
        presetChoice.value = choiceFromCatalog(place);
        route('/yeni');
    };
    const report = () => openSheet({
        title: 'Bu mekanda bir sorun mu var?',
        render: close => (
            <div class="menu">
                <p class="small muted mb-12">İki farklı kişi aynı sorunu bildirince mekan Pub Skor önerilerinden çıkarılır.</p>
                {(Object.entries(REPORT_REASONS) as [ReportReason, string][]).map(([k, label]) => (
                    <button key={k} class="menu-item" onClick={async () => {
                        close();
                        if (!authUser.value) { toast('Bildirmek için giriş yap', 'info'); return; }
                        try {
                            const r = await reportPlace(place.id, k);
                            toast(r.already ? 'Bunu zaten bildirmiştin' : r.hidden ? 'Teşekkürler; mekan önerilerden çıkarıldı' : 'Teşekkürler, bildirimin alındı');
                        } catch (e) { toastError(e); }
                    }}><Flag />{label}</button>
                ))}
            </div>
        )
    });
    const checkIn = async () => {
        try {
            const pos = await getPosition();
            if (meters(pos, place) > 250) { toast('Mekana yakın görünmüyorsun; "Buradayım" yalnızca mekandayken kullanılabilir', 'info'); return; }
            await request('POST', '/api/checkin', { body: { placeId: place.id } });
            toast('Kaydedildi. Bugünün popülerine anonim olarak sayılır.');
            void loadPopular(true);
        } catch (e) { toastError(e); }
    };

    return (
        <>
            <TopBar back="/kesfet" transparent />
            <main class="page flush" style={{ marginTop: 'calc(-56px - env(safe-area-inset-top, 0px))' }}>
                <div class="venue-hero"><EmblemCover place={place} /></div>
                <div style={{ marginTop: '-64px', position: 'relative' }}>
                {place.community && <span class="badge">Topluluk ekledi</span>}
                {place.hidden && (
                    <div class="banner warn mb-12">
                        <span class="b-icon"><Flag /></span>
                        <div class="grow small">Kullanıcılar burada alkol servisi olmadığını ya da mekanın kapandığını bildirdi; Pub Skor önerilerinde gösterilmiyor.</div>
                    </div>
                )}
                <h1 class="display mt-8" style={{ fontSize: '34px', lineHeight: 1.05 }}>{place.name}</h1>
                <p class="muted mt-8">{sub}</p>
                {place.address && <div class="vhero-meta"><MapPin size={14} />{place.address}</div>}
                </div>

                <div class="row mt-16" style={{ gap: '8px' }}>
                    {hasCrew && <button class="btn btn-primary grow" onClick={rateHere}><Plus />Burada puanla</button>}
                    <a class="btn btn-secondary" href={mapsDirectionsUrl(place)} target="_blank" rel="noopener noreferrer"><Navigation />Yol tarifi</a>
                </div>
                {authUser.value && <AsyncButton class="btn btn-ghost btn-block mt-8" onClick={checkIn}><MapPin />Buradayım</AsyncButton>}

                {crewVenue && (
                    <a class="banner mt-16" href={`/mekan/${crewVenue.venue.id}`}>
                        <span class="b-icon"><ScoreRing score={crewVenue.avg ?? null} size={22} /></span>
                        <div class="grow" style={{ minWidth: 0 }}>
                            <b>Ekibin {crewVenue.count ? `${crewVenue.count} kez gitti` : 'listesinde'}</b>
                            <div class="small muted">{crewVenue.count ? `Ortalama ${fmtScore(crewVenue.avg)}${crewVenue.last ? ` · son ${fmtRelativeDay(crewVenue.last)}` : ''}` : 'Gidilecekler listesinde'}</div>
                        </div>
                        {crewVenue.avg != null && <TierChip score={crewVenue.avg} />}
                        <ChevronRight class="faint" />
                    </a>
                )}

                <PlaceCommunity placeId={place.id} />
                <PlaceStats placeId={place.id} />

                <section class="section">
                    <div class="list">
                        <a class="list-item" href={mapsSearchUrl(place)} target="_blank" rel="noopener noreferrer">
                            <span class="li-icon"><MapPin /></span>
                            <span class="li-body"><span class="li-title">Google Maps'te aç</span><span class="li-sub">Yorumlar, fotoğraflar, çalışma saatleri</span></span>
                            <ChevronRight class="faint" />
                        </a>
                        {place.phone && (
                            <a class="list-item" href={`tel:${place.phone}`}>
                                <span class="li-icon"><Smartphone /></span>
                                <span class="li-body"><span class="li-title">Ara</span><span class="li-sub num">{fmtPhone(place.phone)}</span></span>
                            </a>
                        )}
                        {place.web && (
                            <a class="list-item" href={place.web} target="_blank" rel="noopener noreferrer">
                                <span class="li-icon"><LinkIcon /></span>
                                <span class="li-body"><span class="li-title">Web sitesi</span><span class="li-sub">{hostOf(place.web)}</span></span>
                                <ChevronRight class="faint" />
                            </a>
                        )}
                        <button class="list-item" onClick={report}>
                            <span class="li-icon"><Flag /></span>
                            <span class="li-body"><span class="li-title">Bilgi yanlış mı?</span><span class="li-sub">Alkol servisi yok, kapandı ya da bilgiler hatalı</span></span>
                        </button>
                        {hasCrew && !crewVenue?.venue.wish && !crewVenue?.count && (
                            <button class="list-item" onClick={() => addToWishlist(choiceFromCatalog(place))}>
                                <span class="li-icon"><BookmarkPlus /></span>
                                <span class="li-body"><span class="li-title">Gidilecekler'e ekle</span><span class="li-sub">Ekibin listesine</span></span>
                            </button>
                        )}
                    </div>
                </section>

                <p class="tiny faint mt-24">
                    {place.community ? 'Bu mekanı Pub Skor kullanıcıları ekledi.' : 'Mekan bilgileri Overture Maps açık verisinden (Foursquare, Meta, Microsoft).'}
                    {' '}{place.v === 2 ? 'Alkol servisi elle doğrulandı.' : place.v === 1 ? 'Alkol servisi mekanın kendi web sitesindeki menüye göre doğrulandı.' : place.community ? '' : 'Alkol servisi kategori bilgisinden tahmin edildi; yanlışsa bildir.'}
                </p>
            </main>
        </>
    );
}
