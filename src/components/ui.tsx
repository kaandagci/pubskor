import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { tierOf } from '../../shared/metrics';
import { canGoBack, markTabNav } from '../lib/nav';
import { closeSheet, dismissToast, sheets, toasts } from '../state/ui';
import { ChevronLeft, CircleCheck, Compass, House, Info, Plus, TriangleAlert, Trophy, Users, X } from './icons';

// ----- Gezinme -----

/** Geçmişte uygulama içi bir önceki sayfa varsa oraya, yoksa verilen adrese döner. */
export function useBack(fallback = '/') {
    const { route } = useLocation();
    return () => {
        if (canGoBack()) history.back();
        else route(fallback, true);
    };
}

/**
 * Üst çubuk (iOS 26): saydam; kaydırınca üst kenar bulanıklaşır. Sayfanın büyük başlığı çubuğun altına girince
 * küçük başlık ortada belirir. Sekme köklerinde (başlık var, geri yok) büyük başlığı kendisi çizer.
 */
export function TopBar(props: { title?: ComponentChildren; back?: string | false; actions?: ComponentChildren; left?: ComponentChildren; transparent?: boolean; center?: boolean; large?: boolean }) {
    const back = useBack(typeof props.back === 'string' ? props.back : '/');
    const large = props.large ?? (typeof props.title === 'string' && props.back === undefined && !props.left);
    const ref = useRef<HTMLElement>(null);
    const [scrolled, setScrolled] = useState(false);
    // Küçük başlık: sayfada büyük başlık (h1) varsa o çubuğun altına girince görünür
    const [showTitle, setShowTitle] = useState(!large);
    const [autoTitle, setAutoTitle] = useState('');
    useEffect(() => {
        const check = () => {
            setScrolled(window.scrollY > 2);
            const barBottom = ref.current?.getBoundingClientRect().bottom ?? 56;
            const h = document.querySelector<HTMLElement>('[data-large-title], main .page-head h1, main h1');
            if (!h) { setShowTitle(true); return; }
            setShowTitle(h.getBoundingClientRect().bottom < barBottom + 2);
            if (props.title == null) setAutoTitle((h.textContent ?? '').trim());
        };
        check();
        // İçerik veriyle sonradan gelirse başlığı yeniden değerlendir
        const timers = [setTimeout(check, 60), setTimeout(check, 400)];
        window.addEventListener('scroll', check, { passive: true });
        window.addEventListener('resize', check);
        return () => { timers.forEach(clearTimeout); window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
    }, [props.title]);
    const title = props.title ?? autoTitle;
    return (
        <>
            <header ref={ref} class={`topbar ${scrolled ? 'scrolled' : ''} ${props.transparent && !scrolled ? 'clear' : ''}`}>
                <div class="topbar-inner">
                    {props.back !== undefined && props.back !== false && (
                        <button class="icon-btn" onClick={back} aria-label="Geri"><ChevronLeft /></button>
                    )}
                    {/* Sol içerik kalan alanın tamamını alır; yoksa boşluk eylemleri sağa iter */}
                    {props.left ? <div class="topbar-left">{props.left}</div> : <div class="grow" />}
                    {title ? <div class={`topbar-title ${showTitle ? '' : 'hidden'}`} aria-hidden={!showTitle}>{title}</div> : null}
                    {props.actions}
                </div>
            </header>
            {large && <div class="large-title-wrap"><h1 class="large-title" data-large-title>{props.title}</h1></div>}
        </>
    );
}

const TABS = [
    { href: '/', label: 'Akış', Icon: House, match: (p: string) => p === '/' || p.startsWith('/ziyaret') },
    { href: '/kesfet', label: 'Keşfet', Icon: Compass, match: (p: string) => p.startsWith('/kesfet') || p.startsWith('/yer') || p.startsWith('/oneri') },
    { href: '/siralama', label: 'Sıralama', Icon: Trophy, match: (p: string) => p.startsWith('/siralama') || p.startsWith('/mekan') || p.startsWith('/harita') },
    { href: '/ekip', label: 'Ekip', Icon: Users, match: (p: string) => p.startsWith('/ekip') || p.startsWith('/kisi') }
];

/** Alt sekme çubuğu (iOS 26): yüzen cam kapsül + ayrı "yeni ziyaret" düğmesi; aşağı kaydırınca küçülür. */
export function TabBar() {
    const { path } = useLocation();
    const idx = TABS.findIndex(t => t.match(path));
    const [min, setMin] = useState(false);
    useEffect(() => {
        const wide = matchMedia('(min-width: 720px)');
        let last = window.scrollY;
        const on = () => {
            const y = window.scrollY;
            if (wide.matches) setMin(false);
            else if (y > last + 8 && y > 140) setMin(true);
            else if (y < last - 8 || y < 60) setMin(false);
            last = y;
        };
        window.addEventListener('scroll', on, { passive: true });
        return () => window.removeEventListener('scroll', on);
    }, []);
    useEffect(() => setMin(false), [path]);
    return (
        <>
            <nav class={`tabbar ${min ? 'min' : ''}`} style={{ '--tab-i': String(Math.max(0, idx)) }} aria-label="Ana gezinme">
                {idx >= 0 && <span class="tab-lens" aria-hidden="true" />}
                {TABS.map(t => {
                    const current = t.match(path);
                    return (
                        <a key={t.href} href={t.href} class="tab" aria-current={current ? 'page' : undefined}
                            onClick={e => {
                                // Bulunduğun sekmeye dokununca başa kayar (iOS); başka sekmeye geçiş kaydırmasız
                                if (current && path === t.href) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); setMin(false); return; }
                                markTabNav();
                            }}>
                            <t.Icon /><span>{t.label}</span>
                        </a>
                    );
                })}
            </nav>
            <a href="/yeni" class="tab-plus" aria-label="Yeni ziyaret"><Plus /></a>
        </>
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

/** Bölümlü seçici: seçili seçeneğin altında kayan başparmak (eşit genişlikli seçenekler). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
    const i = options.findIndex(o => o.value === value);
    return (
        <div class="segmented" role="group" aria-label={label} style={{ '--n': String(options.length), '--i': String(Math.max(0, i)) }}>
            {i >= 0 && <span class="seg-thumb" aria-hidden="true" />}
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
            const el = lastRef.current?.querySelector<HTMLElement>('[autofocus], input, textarea, .sheet-body button:not(.icon-btn)');
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
            {list.map((s, i) => (
                <SheetFrame key={s.id} sheet={s} frameRef={i === list.length - 1 ? lastRef : undefined} close={() => closeSheet(s.id)} />
            ))}
        </>
    );
}

/** Tek bir alt sayfa: tutamaçtan / başlıktan aşağı sürükleyerek kapanır (telefonda). */
function SheetFrame({ sheet: s, frameRef, close }: { sheet: (typeof sheets.value)[number]; frameRef?: { current: HTMLDivElement | null }; close: () => void }) {
    const own = useRef<HTMLDivElement>(null);
    const drag = useRef<{ y0: number; t0: number; dy: number } | null>(null);
    const el = () => own.current;
    const onDown = (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest('button, a, input') || matchMedia('(min-width: 720px)').matches) return;
        drag.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
        el()?.classList.add('dragging');
        el()?.classList.remove('settle');
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        const raw = e.clientY - d.y0;
        d.dy = raw > 0 ? raw : raw / 6; // yukarı çekişte direnç
        el()?.style.setProperty('--drag', `${d.dy}px`);
    };
    const onUp = () => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        const speed = d.dy / Math.max(1, performance.now() - d.t0);
        const node = el();
        node?.classList.remove('dragging');
        if (d.dy > 120 || speed > 0.6) { close(); return; }
        node?.classList.add('settle');
        node?.style.setProperty('--drag', '0px');
    };
    return (
        <div>
            <div class={`overlay ${s.closing ? 'closing' : ''}`} onClick={close} />
            <div
                ref={n => { own.current = n; if (frameRef) frameRef.current = n; }}
                class={`sheet ${s.closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-label={typeof s.title === 'string' ? s.title : undefined}
            >
                <div class="sheet-drag" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
                    <div class="sheet-grip" />
                    {s.title && (
                        <div class="sheet-head">
                            <button class="icon-btn" onClick={close} aria-label="Kapat"><X /></button>
                            <h2>{s.title}</h2>
                            <span />
                        </div>
                    )}
                </div>
                <div class="sheet-body">{s.render(close)}</div>
                {s.footer && <div class="sheet-foot">{s.footer(close)}</div>}
            </div>
        </div>
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
