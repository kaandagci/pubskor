// Uygulama içi geçmiş derinliği: "geri" düğmesi, uygulamaya doğrudan bir bağlantıyla girildiyse siteden çıkarmasın.
// Gezinme yönü de burada izlenir: <html data-nav="push | pop | tab"> sayfa geçiş animasyonunu seçer
// (ileri: sağdan gelir, geri: soldan gelir, sekme / yönlendirme: yerinde belirir).
let depth = 0;
let nextKind: 'tab' | null = null;

/** Bir sonraki gezinme sekme değişimi (kaydırmasız geçiş). */
export const markTabNav = () => { nextKind = 'tab'; };

const setNav = (kind: 'push' | 'pop' | 'tab') => { document.documentElement.dataset.nav = kind; };

if (typeof history !== 'undefined') {
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);
    history.pushState = (...args: Parameters<History['pushState']>) => {
        depth++;
        setNav(nextKind ?? 'push');
        nextKind = null;
        return push(...args);
    };
    history.replaceState = (...args: Parameters<History['replaceState']>) => {
        // Yalnızca adres değişiyorsa (yönlendirme) yerinde geçiş; aynı sayfanın sorgu temizliği animasyonu etkilemez
        if (typeof args[2] === 'string' && new URL(args[2], location.href).pathname !== location.pathname) setNav('tab');
        return replace(...args);
    };
    window.addEventListener('popstate', () => { depth = Math.max(0, depth - 1); setNav('pop'); });
}

export const canGoBack = () => depth > 0;
