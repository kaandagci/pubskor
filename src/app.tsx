import { useEffect } from 'preact/hooks';
import { ErrorBoundary, LocationProvider, Route, Router, lazy, useLocation } from 'preact-iso';
import { consent } from './state/consent';
import { snapshot, startPolling, syncCrew } from './state/crew';
import { loadDraft } from './state/draft';
import { startOutbox } from './state/outbox';
import { linkCrewPlaces } from './state/link-places';
import { activeCrewId, memberships } from './state/session';
import { loadMe, loggedIn, profileStatus } from './state/user';
import { toast } from './state/ui';
import { reportError } from './lib/errors';
import { authUser, handleCallback } from './lib/auth';
import { SheetHost, TabBar, ToastHost } from './components/ui';
import { CreateCrew, JoinCrew, LinkDevice, PasteInvite } from './features/onboarding';
import { CompleteProfile, ForgotPassword, NewPassword, SignIn, SignUp, Welcome, finishSignup, takeReturn } from './features/auth';
import { Home } from './features/home';
import { NewVisit } from './features/new-visit';
import { RateFlow } from './features/rate';
import { Reveal } from './features/reveal';
import { VisitDetail } from './features/visit-detail';
import { VisitEdit } from './features/visit-edit';
import { EnterCode, LiveTable } from './features/table';
import { Ranking } from './features/ranking';
import { VenuePage } from './features/venue-page';
import { PlacePage } from './features/place-page';
import { Explore } from './features/explore';
import { Discover } from './features/discover';
import { CrewPage, PersonPage } from './features/crew';
import { Settings } from './features/settings';
import { SharedPage } from './features/shared';
import { AgeGate, LegalInfo, Privacy, Terms } from './features/legal';
import { Contact } from './features/contact';

const MapPage = lazy(() => import('./features/map'));

const TAB_ROUTES = [/^\/$/, /^\/siralama/, /^\/harita/, /^\/ekip$/, /^\/mekan\//, /^\/yer\//, /^\/kesfet/, /^\/kisi\//, /^\/oneri/, /^\/ayarlar/];
/** Yasal sayfalar ve iletişim formu: hesapsız ve yaş onayı olmadan açılır (ör. velinin başvurusu). */
const LEGAL_ROUTES = [/^\/gizlilik/, /^\/kosullar/, /^\/yasal/, /^\/iletisim/];
/** Hesapsız açılabilen sayfalar (canlı masaya misafir katılımı, paylaşım, keşif, davet önizleme). */
const OPEN_ROUTES = [...LEGAL_ROUTES, /^\/hosgeldin/, /^\/giris/, /^\/kayit/, /^\/sifre/, /^\/masa/, /^\/m\//, /^\/s\//, /^\/yer\//, /^\/kesfet/, /^\/katil/, /^\/bagla/];
const AUTH_PAGES = [/^\/hosgeldin/, /^\/giris/, /^\/kayit/];
/** Ekip gerektiren sayfalar (ekibi olmayan hesap ana sayfaya döner). */
const CREW_ROUTES = [/^\/yeni/, /^\/puanla/, /^\/siralama/, /^\/harita/, /^\/ekip$/, /^\/mekan\//, /^\/kisi\//, /^\/oneri/, /^\/ziyaret\//, /^\/sonuc\//];

function NotFound() {
    return (
        <main class="page"><div class="empty mt-32">
            <h3 class="display">Burada bir şey yok</h3>
            <p>Aradığın sayfa taşınmış ya da hiç olmamış olabilir.</p>
            <a class="btn btn-secondary" href="/">Ana sayfa</a>
        </div></main>
    );
}

/**
 * Yönlendirme kuralları: hesapsız → karşılama; profil eksik → tamamlama; girişliyken giriş sayfaları → ana sayfa;
 * ekibi olmayan hesap ekip sayfalarından ana sayfaya.
 */
function Guard() {
    const { path, route } = useLocation();
    const status = profileStatus.value;
    useEffect(() => {
        const is = (list: RegExp[]) => list.some(r => r.test(path));
        if (!loggedIn.value) { if (!is(OPEN_ROUTES)) route('/hosgeldin', true); return; }
        if (status === 'none') { if (!/^\/hesap\/tamamla/.test(path) && !is(LEGAL_ROUTES)) route('/hesap/tamamla', true); return; }
        if (status === 'ready' && (is(AUTH_PAGES) || /^\/hesap\/tamamla/.test(path))) { route(takeReturn(), true); return; }
        if (status === 'ready' && !memberships.value.length && is(CREW_ROUTES)) route('/', true);
    }, [path, loggedIn.value, status, memberships.value.length]);
    return null;
}

/** Açılışta Identity bağlantılarından dönüşü (Google, e-posta doğrulama, şifre sıfırlama) işler. */
function AuthBoot() {
    const { route } = useLocation();
    useEffect(() => {
        void (async () => {
            const r = await handleCallback();
            if (r.type === 'recovery') { route('/sifre/yeni', true); return; }
            if (r.type === 'error') toast(r.error ?? 'Giriş yapılamadı', 'error');
            if (r.type === 'confirmation') { await finishSignup(); toast('E-postan doğrulandı, hoş geldin!'); return; }
            if (authUser.value) await loadMe();
        })();
    }, []);
    return null;
}

function Shell() {
    const { path } = useLocation();
    const adult = consent.value.adult;
    const showTabs = loggedIn.value && profileStatus.value !== 'none' && TAB_ROUTES.some(r => r.test(path));
    if (!adult && !LEGAL_ROUTES.some(r => r.test(path))) return <AgeGate onAccept={() => undefined} />;
    return (
        <div class="app">
            <AuthBoot />
            <Guard />
            <ErrorBoundary onError={e => { console.error(e); reportError('render', e); }}>
                <Router onRouteChange={() => window.scrollTo(0, 0)}>
                    <Route path="/" component={Home} />
                    <Route path="/hosgeldin" component={Welcome} />
                    <Route path="/giris" component={SignIn} />
                    <Route path="/kayit" component={SignUp} />
                    <Route path="/sifre" component={ForgotPassword} />
                    <Route path="/sifre/yeni" component={NewPassword} />
                    <Route path="/hesap/tamamla" component={CompleteProfile} />
                    <Route path="/ekip/kur" component={CreateCrew} />
                    <Route path="/katil" component={PasteInvite} />
                    <Route path="/katil/:crewId" component={JoinCrew} />
                    <Route path="/bagla" component={LinkDevice} />
                    <Route path="/yeni" component={NewVisit} />
                    <Route path="/puanla" component={RateFlow} />
                    <Route path="/sonuc/:id" component={Reveal} />
                    <Route path="/ziyaret/:id" component={VisitDetail} />
                    <Route path="/ziyaret/:id/duzenle" component={VisitEdit} />
                    <Route path="/masa" component={EnterCode} />
                    <Route path="/masa/:code" component={LiveTable} />
                    <Route path="/m/:code" component={LiveTable} />
                    <Route path="/siralama" component={Ranking} />
                    <Route path="/mekan/:id" component={VenuePage} />
                    <Route path="/yer/:id" component={PlacePage} />
                    <Route path="/kesfet" component={Explore} />
                    <Route path="/oneri" component={Discover} />
                    <Route path="/harita" component={MapPage} />
                    <Route path="/ekip" component={CrewPage} />
                    <Route path="/kisi/:key" component={PersonPage} />
                    <Route path="/ayarlar" component={Settings} />
                    <Route path="/s/:sid" component={SharedPage} />
                    <Route path="/gizlilik" component={Privacy} />
                    <Route path="/kosullar" component={Terms} />
                    <Route path="/yasal" component={LegalInfo} />
                    <Route path="/iletisim" component={Contact} />
                    <Route default component={NotFound} />
                </Router>
            </ErrorBoundary>
            {showTabs && <TabBar />}
            <SheetHost />
            <ToastHost />
        </div>
    );
}

export function App() {
    // Etkin ekip değişince: önbellekten aç, sunucudan tazele, taslağı yükle
    const crewId = activeCrewId.value;
    useEffect(() => {
        void syncCrew();
        void loadDraft(crewId);
    }, [crewId]);
    useEffect(() => {
        startPolling();
        startOutbox();
    }, []);
    // Ekip yüklendikten sonra eski mekanları kataloğa bağla (arka planda, bir kez)
    const snapId = snapshot.value?.id;
    useEffect(() => {
        if (!snapId) return;
        const t = setTimeout(() => void linkCrewPlaces(), 4000);
        return () => clearTimeout(t);
    }, [snapId]);
    return (
        <LocationProvider>
            <Shell />
        </LocationProvider>
    );
}
