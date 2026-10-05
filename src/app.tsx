import { useEffect } from 'preact/hooks';
import { ErrorBoundary, LocationProvider, Route, Router, lazy, useLocation } from 'preact-iso';
import { consent } from './state/consent';
import { startPolling, syncCrew } from './state/crew';
import { loadDraft } from './state/draft';
import { startOutbox } from './state/outbox';
import { activeCrewId, memberships } from './state/session';
import { SheetHost, TabBar, ToastHost } from './components/ui';
import { CreateCrew, JoinCrew, LinkDevice, PasteInvite, Welcome } from './features/onboarding';
import { Home } from './features/home';
import { NewVisit } from './features/new-visit';
import { RateFlow } from './features/rate';
import { Reveal } from './features/reveal';
import { VisitDetail } from './features/visit-detail';
import { VisitEdit } from './features/visit-edit';
import { EnterCode, LiveTable } from './features/table';
import { Ranking } from './features/ranking';
import { VenuePage } from './features/venue-page';
import { Discover } from './features/discover';
import { CrewPage, PersonPage } from './features/crew';
import { Settings } from './features/settings';
import { SharedPage } from './features/shared';
import { AgeGate, LegalInfo, Privacy, Terms } from './features/legal';

const MapPage = lazy(() => import('./features/map'));

const TAB_ROUTES = [/^\/$/, /^\/siralama/, /^\/harita/, /^\/ekip$/, /^\/mekan\//, /^\/kisi\//, /^\/oneri/, /^\/ayarlar/];
const PUBLIC_ROUTES = [/^\/hosgeldin/, /^\/ekip\/kur/, /^\/katil/, /^\/bagla/, /^\/masa/, /^\/m\//, /^\/s\//, /^\/gizlilik/, /^\/kosullar/, /^\/yasal/, /^\/ayarlar/];
const LEGAL_ROUTES = [/^\/gizlilik/, /^\/kosullar/, /^\/yasal/];

function NotFound() {
    return (
        <main class="page"><div class="empty mt-32">
            <h3 class="display">Burada bir şey yok</h3>
            <p>Aradığın sayfa taşınmış ya da hiç olmamış olabilir.</p>
            <a class="btn btn-secondary" href="/">Ana sayfa</a>
        </div></main>
    );
}

/** Ekibi olmayan kullanıcıyı karşılama ekranına yönlendirir. */
function Guard() {
    const { path, route } = useLocation();
    const needsCrew = !PUBLIC_ROUTES.some(r => r.test(path));
    useEffect(() => {
        if (needsCrew && !memberships.value.length) route('/hosgeldin', true);
    }, [path, memberships.value.length]);
    return null;
}

function Shell() {
    const { path } = useLocation();
    const adult = consent.value.adult;
    const showTabs = memberships.value.length > 0 && TAB_ROUTES.some(r => r.test(path));
    if (!adult && !LEGAL_ROUTES.some(r => r.test(path))) return <AgeGate onAccept={() => undefined} />;
    return (
        <div class="app">
            <Guard />
            <ErrorBoundary onError={e => console.error(e)}>
                <Router onRouteChange={() => window.scrollTo(0, 0)}>
                    <Route path="/" component={Home} />
                    <Route path="/hosgeldin" component={Welcome} />
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
                    <Route path="/oneri" component={Discover} />
                    <Route path="/harita" component={MapPage} />
                    <Route path="/ekip" component={CrewPage} />
                    <Route path="/kisi/:key" component={PersonPage} />
                    <Route path="/ayarlar" component={Settings} />
                    <Route path="/s/:sid" component={SharedPage} />
                    <Route path="/gizlilik" component={Privacy} />
                    <Route path="/kosullar" component={Terms} />
                    <Route path="/yasal" component={LegalInfo} />
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
    return (
        <LocationProvider>
            <Shell />
        </LocationProvider>
    );
}
