import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { tierOf } from '../../shared/metrics';
import { canGoBack } from '../lib/nav';
import { closeSheet, dismissToast, sheets, toasts } from '../state/ui';
import { ArrowLeft, CircleCheck, Compass, House, Info, Plus, TriangleAlert, Trophy, Users, X } from './icons';

// ----- Gezinme -----

/** Geçmişte uygulama içi bir önceki sayfa varsa oraya, yoksa verilen adrese döner. */
export function useBack(fallback = '/') {
    const { route } = useLocation();
    return () => {
        if (canGoBack()) history.back();
        else route(fallback, true);
    };
}

export function TopBar(props: { title?: ComponentChildren; back?: string | false; actions?: ComponentChildren; left?: ComponentChildren; transparent?: boolean; center?: boolean }) {
    const back = useBack(typeof props.back === 'string' ? props.back : '/');
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const on = () => setScrolled(window.scrollY > 4);
        on();
        window.addEventListener('scroll', on, { passive: true });
        return () => window.removeEventListener('scroll', on);
    }, []);
    return (
        <header class={`topbar ${scrolled ? 'scrolled' : ''}`} style={props.transparent && !scrolled ? { background: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none' } : undefined}>
            <div class="topbar-inner">
                {props.back !== undefined && props.back !== false && (
                    <button class={`icon-btn ${props.transparent && !scrolled ? 'filled' : ''}`} onClick={back} aria-label="Geri"><ArrowLeft /></button>
                )}
                {props.left}
                <div class={`topbar-title ${props.center ? 'center' : ''}`}>{props.title}</div>
                {props.actions}
            </div>
        </header>
    );
}

const TABS = [
    { href: '/', label: 'Akış', Icon: House, match: (p: string) => p === '/' || p.startsWith('/ziyaret') },
    { href: '/kesfet', label: 'Keşfet', Icon: Compass, match: (p: string) => p.startsWith('/kesfet') || p.startsWith('/yer') || p.startsWith('/oneri') },
    null,
    { href: '/siralama', label: 'Sıralama', Icon: Trophy, match: (p: string) => p.startsWith('/siralama') || p.startsWith('/mekan') || p.startsWith('/harita') },
    { href: '/ekip', label: 'Ekip', Icon: Users, match: (p: string) => p.startsWith('/ekip') || p.startsWith('/kisi') }
];

export function TabBar() {
    const { path } = useLocation();
    return (
        <nav class="tabbar" aria-label="Ana gezinme">
            {TABS.map((t, i) => t ? (
                <a key={t.href} href={t.href} class="tab" aria-current={t.match(path) ? 'page' : undefined}>
                    <t.Icon />{t.label}
                </a>
            ) : (
                <a key={i} href="/yeni" class="tab tab-plus" aria-label="Yeni ziyaret"><span><Plus /></span></a>
            ))}
        </nav>
    );
}

// ----- Küçük parçalar -----

export function TierChip({ score }: { score: number | null | undefined }) {
    const t = tierOf(score);
    return <span class={`tier tier-${t.id}`}>{t.label}</span>;
}

export function Stat({ label, value, sub }: { label: string; value: ComponentChildren; sub?: ComponentChildren }) {
    return (
        <div class="stat">
            <div class="stat-label">{label}</div>
            <div class="stat-value">{value}</div>
            {sub != null && <div class="stat-sub">{sub}</div>}
        </div>
    );
}

export function Empty({ art, title, children, action }: { art?: ComponentChildren; title: string; children?: ComponentChildren; action?: ComponentChildren }) {
    return (
        <div class="empty">
            {art && <div class="art">{art}</div>}
            <h3 class="display">{title}</h3>
            {children && <p>{children}</p>}
            {action}
        </div>
    );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
    return (
        <div class="segmented" role="group" aria-label={label}>
            {options.map(o => (
                <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
            ))}
        </div>
    );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <span class="switch">
            <input type="checkbox" role="switch" checked={checked} aria-label={label} onChange={e => onChange((e.target as HTMLInputElement).checked)} />
            <span />
        </span>
    );
}

export function Spinner({ small }: { small?: boolean }) {
    return <span class={`spinner ${small ? 'sm' : ''}`} role="status" aria-label="Yükleniyor" />;
}

export function Loading({ label = 'Yükleniyor' }: { label?: string }) {
    return <div class="center-fill"><div class="stack gap-12" style={{ alignItems: 'center' }}><Spinner /><span class="muted small">{label}</span></div></div>;
}

export function Field({ label, hint, error, children }: { label?: string; hint?: ComponentChildren; error?: string | null; children: ComponentChildren }) {
    return (
        <label class="field">
            {label && <span class="label">{label}</span>}
            {children}
            {error ? <span class="error-text">{error}</span> : hint ? <span class="hint">{hint}</span> : null}
        </label>
    );
}

/** Çift dokunuşu ve tekrar gönderimi engelleyen düğme. */
export function AsyncButton({ onClick, children, class: cls = 'btn btn-primary', disabled, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onClick: () => Promise<unknown> | void; class?: string }) {
    const [busy, setBusy] = useState(false);
    return (
        <button
            {...rest}
            class={cls}
            disabled={busy || !!disabled}
            aria-busy={busy}
            onClick={async () => {
                if (busy) return;
                setBusy(true);
                try { await onClick(); } finally { setBusy(false); }
            }}
        >
            {busy ? <Spinner small /> : null}{children}
        </button>
    );
}

// ----- Alt sayfa ve bildirim katmanları -----

export function SheetHost() {
    const list = sheets.value;
    const lastRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!list.length) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSheet(); };
        document.addEventListener('keydown', onKey);
        const prev = document.activeElement as HTMLElement | null;
        // ilk odaklanabilir öğeye odaklan
        setTimeout(() => {
            const el = lastRef.current?.querySelector<HTMLElement>('[autofocus], input, textarea, button:not(.icon-btn)');
            el?.focus({ preventScroll: true });
        }, 60);
        document.documentElement.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.documentElement.style.overflow = '';
            prev?.focus?.({ preventScroll: true });
        };
    }, [list.length]);
    return (
        <>
            {list.map((s, i) => {
                const close = () => closeSheet(s.id);
                return (
                    <div key={s.id}>
                        <div class={`overlay ${s.closing ? 'closing' : ''}`} onClick={close} />
                        <div ref={i === list.length - 1 ? lastRef : undefined} class={`sheet ${s.closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-label={typeof s.title === 'string' ? s.title : undefined}>
                            <div class="sheet-grip" />
                            {s.title && (
                                <div class="sheet-head">
                                    <h2>{s.title}</h2>
                                    <button class="icon-btn" onClick={close} aria-label="Kapat"><X /></button>
                                </div>
                            )}
                            <div class="sheet-body">{s.render(close)}</div>
                            {s.footer && <div class="sheet-foot">{s.footer(close)}</div>}
                        </div>
                    </div>
                );
            })}
        </>
    );
}

export function ToastHost() {
    return (
        <div class="toasts" role="status" aria-live="polite">
            {toasts.value.map(t => (
                <div key={t.id} class={`toast ${t.kind} ${t.leaving ? 'leaving' : ''}`}>
                    {t.kind === 'success' ? <CircleCheck /> : t.kind === 'error' ? <TriangleAlert /> : <Info />}
                    <span class="t-msg">{t.message}</span>
                    {t.action && <button class="btn btn-secondary" onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button>}
                </div>
            ))}
        </div>
    );
}
