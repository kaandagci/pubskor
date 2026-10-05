// Uygulama içi geçmiş derinliği: "geri" düğmesi, uygulamaya doğrudan bir bağlantıyla girildiyse siteden çıkarmasın.
let depth = 0;

if (typeof history !== 'undefined') {
    const push = history.pushState.bind(history);
    history.pushState = (...args: Parameters<History['pushState']>) => { depth++; return push(...args); };
    window.addEventListener('popstate', () => { depth = Math.max(0, depth - 1); });
}

export const canGoBack = () => depth > 0;
