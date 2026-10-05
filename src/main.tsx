import './styles/index.css';
import './lib/nav';
import { installErrorReporting } from './lib/errors';
import { render } from 'preact';
import { App } from './app';
import { applyTheme, themePref, toast } from './state/ui';

installErrorReporting();
applyTheme(themePref.value);
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyTheme(themePref.value));

render(<App />, document.getElementById('app')!);

// Çevrimdışı çalışma: yalnızca üretim derlemesinde
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                const sw = reg.installing;
                sw?.addEventListener('statechange', () => {
                    if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                        toast('Yeni sürüm hazır', 'info', { label: 'Yenile', run: () => { sw.postMessage('skipWaiting'); } }, 15000);
                    }
                });
            });
        }).catch(() => undefined);
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
    });
}
