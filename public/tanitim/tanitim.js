// Tanıtım sayfası: kaydırınca beliren bölümler, dolan skor halkaları, sayaçlar, cam gezinme çubuğu.
// Site CSP'si satır içi betiğe izin vermediği için ayrı dosyada.
(() => {
    const root = document.documentElement;
    root.classList.add('js');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fmt = (n, d) => n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

    function countUp(el) {
        const to = Number(el.dataset.count);
        const d = String(el.dataset.count).includes('.') ? 1 : 0;
        const prefix = el.dataset.prefix ?? '';
        if (reduced) { el.textContent = prefix + fmt(to, d); return; }
        const t0 = performance.now();
        const ms = 1100;
        const step = t => {
            const k = Math.min(1, (t - t0) / ms);
            const e = 1 - Math.pow(1 - k, 3);
            el.textContent = prefix + fmt(d ? Math.round(to * e * 10) / 10 : Math.round(to * e), d);
            if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function activate(el) {
        el.classList.add('in');
        el.querySelectorAll('[data-ring]').forEach((r, i) => {
            r.style.setProperty('--v', r.dataset.ring);
            setTimeout(() => r.classList.add('on'), 150 + i * 90);
        });
        el.querySelectorAll('.table-visual').forEach(t => t.classList.add('in'));
        el.querySelectorAll('[data-count]').forEach(countUp);
    }

    const io = new IntersectionObserver(entries => {
        for (const e of entries) {
            if (!e.isIntersecting) continue;
            activate(e.target);
            io.unobserve(e.target);
        }
    }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach((el, i) => {
        // Aynı sırada görünen öğeler arka arkaya gelsin
        el.style.transitionDelay = `${(i % 4) * 60}ms`;
        io.observe(el);
    });

    // Cam gezinme çubuğu ve telefon maketinin hafif paralaksı
    const nav = document.getElementById('nav');
    const phone = document.querySelector('[data-parallax]');
    let ticking = false;
    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const y = scrollY;
            nav.classList.toggle('scrolled', y > 8);
            if (phone && !reduced && y < 900) phone.style.setProperty('--py', `${y * -0.08}px`);
            ticking = false;
        });
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
})();
