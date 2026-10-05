// Pub Skor tasarım demosu: etkileşimler (sekmeler, itme geçişi, kaydırarak geri, büyük başlık, panel, halka).
// Yalnızca önizleme; örnek veriler temsilidir.
(() => {
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const screen = $('#screen');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const fmt = n => n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const icon = id => `<svg><use href="#i-${id}"/></svg>`;

    // ----- Örnek veriler -----
    const PEOPLE = [['KD', 0], ['DE', 1], ['EL', 3], ['MA', 4], ['SC', 6]];
    const TIERS = [[8.5, 'Efsane', 'var(--tier-legend)'], [7, 'Çok iyi', 'var(--tier-great)'], [5.5, 'İdare eder', 'var(--tier-ok)'], [4, 'Zayıf', 'var(--tier-weak)'], [0, 'Uğrama', 'var(--tier-skip)']];
    const tierOf = s => TIERS.find(t => s >= t[0]);
    const PLACES = {
        marti: { name: 'Martı Pub', kind: 'Pub', district: 'Kadıköy', address: 'Caferağa Mah., Moda Cd., Kadıköy', score: 8.4 },
        kuytu: { name: 'Kuytu Bar', kind: 'Bar', district: 'Beyoğlu', address: 'Asmalımescit Mah., Beyoğlu', score: 7.6 },
        yali: { name: 'Yalı Meyhanesi', kind: 'Meyhane', district: 'Beşiktaş', address: 'Ortaköy Mah., Beşiktaş', score: 8.9 },
        avlu: { name: 'Avlu Bistro', kind: 'Restoran', district: 'Beyoğlu', address: 'Kemankeş Mah., Karaköy', score: 6.2 },
        fener: { name: 'Fener Lokantası', kind: 'Restoran', district: 'Fatih', address: 'Balat Mah., Fatih', score: 7.9 },
        arka: { name: 'Arka Sokak', kind: 'Pub', district: 'Kadıköy', address: 'Osmanağa Mah., Kadıköy', score: 7.2 },
        teras: { name: 'Teras 34', kind: 'Bar', district: 'Şişli', address: 'Bomonti, Şişli', score: 6.8 },
        cinar: { name: 'Çınar Türkü Evi', kind: 'Bar', district: 'Kadıköy', address: 'Rasimpaşa Mah., Kadıköy', score: 8.1 }
    };
    const VISITS = [['marti', '3 Eki', [0, 1, 2]], ['kuytu', '27 Eyl', [0, 3, 1, 4]], ['yali', '19 Eyl', [0, 1, 2, 3, 4]], ['avlu', '12 Eyl', [2, 3]]];
    const POPULAR = {
        today: [['marti', 6, 1], ['cinar', 4, 1], ['arka', 3, 0]],
        week: [['marti', 14, 1], ['arka', 11, 1], ['cinar', 9, -1], ['kuytu', 7, 1], ['yali', 5, -1]],
        month: [['marti', 38, 1], ['yali', 31, 1], ['arka', 26, -1], ['cinar', 22, 1], ['kuytu', 19, -1], ['fener', 15, 1]]
    };
    const RANKING = ['yali', 'marti', 'cinar', 'fener', 'kuytu', 'arka', 'teras', 'avlu'];
    const CRITERIA = [['timer', 'Servis hızı ve ilgi', 8.1], ['receipt', 'Fiyat / performans', 7.9], ['message-circle', 'Akustik ve sohbet', 8.6], ['armchair', 'İç mekan ve oturma', 8.8], ['wind', 'Ambiyans ve müzik', 8.5], ['sparkles', 'Tuvalet ve hijyen', 7.4]];
    const SLIDERS = [['Servis', 8], ['Ortam', 8.5], ['Hijyen', 7], ['Fiyat / performans', 7.5]];

    /** Kişi avatarları: en fazla 3 tane, fazlası "+N" olarak. */
    const avatars = (ids, max = 3) => {
        const shown = ids.length > max ? ids.slice(0, max - 1) : ids;
        const more = ids.length - shown.length;
        return `<span class="avs" aria-label="${ids.length} kişi">${shown.map(i => `<span class="av" style="--c:var(--p${PEOPLE[i][1]})">${PEOPLE[i][0]}</span>`).join('')}${more ? `<span class="av more">+${more}</span>` : ''}</span>`;
    };
    const ring = (score, size = 44, w = 4.5) => `<span class="ring" style="--s:${size}px;--w:${w}" data-ring data-score="${score}"><svg viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="18"/><circle class="val" cx="22" cy="22" r="18" pathLength="100"/></svg><b>${fmt(score)}</b></span>`;

    // ----- Listeler -----
    function renderLists() {
        $('[data-list="visits"]').innerHTML = VISITS.map(([id, date, ppl]) => {
            const p = PLACES[id];
            return `<button class="row press" data-place="${id}">${ring(p.score)}<span class="row-body"><span class="row-title">${p.name}</span><span class="row-sub">${p.district} · ${p.kind} · ${date}</span></span>${avatars(ppl)}</button>`;
        }).join('');
        $('[data-avatars]').outerHTML = avatars([0, 1, 2, 3, 4], 5).replace('class="avs"', 'class="avs big"');
        renderPopular('week', false);
        const [a, b, c] = RANKING;
        $('[data-list="podium"]').innerHTML = [[b, 2, ''], [a, 1, 'first'], [c, 3, '']].map(([id, n, cls]) =>
            `<button class="podium-card press ${cls}" data-place="${id}"><span class="place">${n}.</span>${ring(PLACES[id].score, n === 1 ? 68 : 56, n === 1 ? 5 : 5.5)}<span class="nm">${PLACES[id].name}</span></button>`).join('');
        $('[data-list="ranking"]').innerHTML = RANKING.slice(3).map((id, i) => {
            const p = PLACES[id];
            return `<button class="row press" data-place="${id}"><span class="rank">${i + 4}</span><span class="row-body"><span class="row-title">${p.name}</span><span class="row-sub">${p.district} · ${p.kind}</span></span><span class="row-trail"><b style="font:600 17px/1 var(--font-rounded);color:var(--label)">${fmt(p.score)}</b></span></button>`;
        }).join('');
        $('[data-list="sliders"]').innerHTML = SLIDERS.map(([nm, v], i) =>
            `<div class="slider-row"><div class="slider-top"><span class="nm">${nm}</span><span class="vl" data-vl="${i}">${fmt(v)}</span></div><input type="range" min="0" max="10" step="0.5" value="${v}" data-slider="${i}" aria-label="${nm}"></div>`).join('');
    }

    function renderPopular(period, animate = true) {
        const list = $('[data-list="popular"]');
        list.innerHTML = POPULAR[period].map(([id, groups, trend], i) => {
            const p = PLACES[id];
            const tr = trend > 0 ? `<span class="trend up">${icon('trending-up')}<span class="sr">yükselişte</span></span>` : `<span class="trend down">${icon('trending-down')}<span class="sr">düşüşte</span></span>`;
            return `<button class="row press" data-place="${id}" style="--i:${i}"><span class="rank">${i + 1}</span><span class="row-body"><span class="row-title">${p.name}</span><span class="row-sub">${p.district} · ${p.kind}</span></span><span class="row-trail">${groups} ekip${tr}</span></button>`;
        }).join('');
        list.classList.remove('stagger');
        if (animate) { void list.offsetWidth; list.classList.add('stagger'); }
        $('[data-period-label]').textContent = { today: 'Bugün', week: 'Bu hafta', month: 'Bu ay' }[period];
    }

    // ----- Skor halkaları ve sayaçlar -----
    function fillRings(root) {
        $$('[data-ring]', root).forEach((r, i) => {
            const s = Number(r.dataset.score ?? r.dataset.value ?? 0);
            r.style.setProperty('--v', String(s * 10));
            r.classList.remove('on');
            setTimeout(() => r.classList.add('on'), 40 + i * 50);
        });
    }
    function countUp(el, to, decimals = 1, ms = 700) {
        if (reduced.matches) { el.textContent = decimals ? fmt(to) : String(to); return; }
        const t0 = performance.now();
        const step = t => {
            const k = Math.min(1, (t - t0) / ms);
            const e = 1 - Math.pow(1 - k, 3);
            const v = to * e;
            el.textContent = decimals ? fmt(Math.round(v * 10) / 10) : String(Math.round(v));
            if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    // ----- Görünümler: sekmeler ve itme -----
    const views = Object.fromEntries($$('.view').map(v => [v.dataset.view, v]));
    let tab = 'akis';
    const stack = [];
    const top = () => views[stack.at(-1) ?? tab];

    function selectTab(name) {
        if (stack.length) popAll();
        if (name === tab) { $('.scroller', views[tab]).scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' }); return; }
        views[tab].hidden = true;
        tab = name;
        const v = views[name];
        v.hidden = false;
        v.classList.remove('tab-in'); void v.offsetWidth; v.classList.add('tab-in');
        $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
        moveLens();
        setMin(false);
        fillRings(v);
        $$('.seg', v).forEach(s => placeLens(s, false));
        onScroll(v);
    }

    function push(name, fill) {
        const v = views[name];
        fill?.(v);
        const under = top();
        stack.push(name);
        v.hidden = false;
        v.classList.remove('in');
        $('.scroller', v).scrollTop = 0;
        onScroll(v);
        void v.offsetWidth;
        v.classList.add('animating', 'in');
        under.classList.add('animating', 'covered');
        fillRings(v);
        $$('.seg', v).forEach(s => placeLens(s, false));
        const bars = $('[data-list="criteria"]', v);
        if (bars) { bars.classList.remove('bars-on'); setTimeout(() => bars.classList.add('bars-on'), 80); }
    }

    function pop() {
        const name = stack.pop();
        if (!name) return;
        const v = views[name];
        const under = top();
        v.classList.add('animating');
        under.classList.add('animating');
        v.classList.remove('in');
        v.style.transform = '';
        under.style.transform = '';
        under.classList.remove('covered');
        const done = () => { if (!stack.includes(name)) v.hidden = true; v.removeEventListener('transitionend', done); };
        v.addEventListener('transitionend', done);
        setTimeout(done, 900);
        setMin(false);
        onScroll(under);
    }
    /** Sekme değişince açık sayfalar animasyonsuz kapanır. */
    function popAll() {
        for (const name of stack.splice(0)) {
            const v = views[name];
            v.classList.remove('in', 'animating');
            v.style.transform = '';
            v.hidden = true;
        }
        Object.values(views).forEach(v => { v.classList.remove('covered'); v.style.transform = ''; });
    }

    function openPlace(id) {
        const p = PLACES[id];
        push('mekan', v => {
            $('[data-place-name]', v).textContent = p.name;
            $('[data-place-title]', v).textContent = p.name;
            $('[data-place-kind]', v).textContent = `${p.kind} · ${p.district}`;
            $('[data-place-address]', v).textContent = p.address;
            const r = $('[data-place-ring]', v);
            r.dataset.score = String(p.score);
            countUp($('[data-ring-num]', r), p.score);
            const t = tierOf(p.score);
            const tier = $('[data-place-tier]', v);
            tier.textContent = t[1];
            tier.style.setProperty('--c', t[2]);
            $('[data-list="criteria"]', v).innerHTML = CRITERIA.map(([ic, nm, s], i) =>
                `<div class="crit" style="--i:${i}"><span class="row-icon">${icon(ic)}</span><span class="nm">${nm}</span><span class="vl">${fmt(Math.min(10, s + (p.score - 8.2) * .6))}</span><span class="bar"><i style="--w:${Math.min(100, (s + (p.score - 8.2) * .6) * 10)}%"></i></span></div>`).join('');
            $('[data-action="bookmark"]', v).classList.remove('on');
        });
        current = id;
    }
    let current = 'marti';

    // Soldan kaydırarak geri (iOS kenar hareketi)
    let drag = null;
    $('#views').addEventListener('pointerdown', e => {
        const v = e.target.closest('.view.push.in');
        if (!v || v !== top()) return;
        const rect = screen.getBoundingClientRect();
        const zoom = rect.width / screen.offsetWidth || 1;
        if ((e.clientX - rect.left) / zoom > 28) return;
        drag = { v, under: views[stack.at(-2) ?? tab], x0: e.clientX, t0: performance.now(), w: rect.width, zoom, dx: 0 };
        v.classList.remove('animating'); drag.under.classList.remove('animating');
        v.setPointerCapture(e.pointerId);
    });
    $('#views').addEventListener('pointermove', e => {
        if (!drag) return;
        const dx = Math.max(0, e.clientX - drag.x0);
        drag.dx = dx;
        const k = dx / drag.w;
        drag.v.style.transform = `translateX(${k * 100}%)`;
        drag.under.style.transform = `translateX(${-30 + k * 30}%)`;
    });
    const endDrag = e => {
        if (!drag) return;
        const { v, under, dx, w, t0 } = drag;
        const speed = dx / Math.max(1, performance.now() - t0);
        drag = null;
        if (dx > w * 0.35 || speed > 0.6) pop();
        else {
            v.classList.add('animating'); under.classList.add('animating');
            v.style.transform = ''; under.style.transform = '';
        }
        try { v.releasePointerCapture(e.pointerId); } catch { /* yok */ }
    };
    $('#views').addEventListener('pointerup', endDrag);
    $('#views').addEventListener('pointercancel', endDrag);

    // ----- Büyük başlık, kenar bulanıklığı, sekme çubuğunun küçülmesi -----
    let lastY = 0;
    function onScroll(v) {
        const sc = $('.scroller', v);
        const y = sc.scrollTop;
        // Büyük başlık gezinme çubuğunun altına girince ortadaki küçük başlık görünür
        const big = $('.large-title', v) || $('.place-name', v);
        const navBottom = $('.navbar', v).offsetHeight;
        const threshold = big ? big.offsetTop + big.offsetHeight - navBottom : 30;
        v.style.setProperty('--t', String(Math.min(1, Math.max(0, (y - threshold + 24) / 24))));
        v.style.setProperty('--edge', String(Math.min(1, Math.max(0, y / 24))));
        return y;
    }
    $$('.scroller').forEach(sc => sc.addEventListener('scroll', () => {
        const v = sc.closest('.view');
        const y = onScroll(v);
        if (v === top() && !v.classList.contains('push')) {
            if (y > lastY + 6 && y > 80) setMin(true);
            else if (y < lastY - 6 || y < 40) setMin(false);
        }
        lastY = y;
    }, { passive: true }));

    const tabbar = $('#tabbar');
    function setMin(on) {
        if (tabbar.classList.contains('min') === on) return;
        tabbar.classList.toggle('min', on);
        requestAnimationFrame(moveLens);
        setTimeout(moveLens, 320);
    }
    function moveLens() {
        const sel = $('.tab[aria-selected="true"]', tabbar);
        const lens = $('.tab-lens', tabbar);
        const min = tabbar.classList.contains('min');
        lens.style.width = (min ? 56 : 66) + 'px';
        lens.style.transform = `translateX(${min ? 4 : sel.offsetLeft}px)`;
    }

    // ----- Segment kontrolleri -----
    function placeLens(seg, animate = true) {
        const sel = $('button[aria-pressed="true"]', seg);
        const lens = $('.seg-lens', seg);
        if (!sel || !lens) return;
        seg.classList.toggle('no-anim', !animate);
        lens.style.width = sel.offsetWidth + 'px';
        lens.style.transform = `translateX(${sel.offsetLeft}px)`;
        if (!animate) requestAnimationFrame(() => seg.classList.remove('no-anim'));
    }
    function setSeg(kind, value) {
        $$(`.seg[data-seg="${kind}"]`).forEach(seg => {
            $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
            placeLens(seg);
        });
    }

    // ----- Tema -----
    function setTheme(value) {
        if (value === 'system') delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = value;
        setSeg('theme', value);
        try { localStorage.setItem('pubskor-demo-theme', value); } catch { /* yok */ }
        requestAnimationFrame(renderTokens);
    }

    // ----- Panel (sheet) -----
    const sheet = $('#sheet');
    function openSheet() {
        const p = PLACES[current];
        $('[data-sheet-place]').textContent = `${p.name} · ${p.district}`;
        $$('[data-slider]').forEach((inp, i) => { inp.value = String(SLIDERS[i][1]); });
        updateLive(false);
        screen.classList.add('sheet-open');
        sheet.classList.add('open');
        sheet.setAttribute('aria-hidden', 'false');
        $('.btn-prominent').classList.remove('done');
        setTimeout(() => fillRings(sheet), 200);
    }
    function closeSheet() {
        sheet.style.removeProperty('--drag');
        sheet.classList.remove('open', 'dragging');
        screen.classList.remove('sheet-open');
        sheet.setAttribute('aria-hidden', 'true');
    }
    function updateLive(animate = true) {
        const vals = $$('[data-slider]').map(i => Number(i.value));
        vals.forEach((v, i) => {
            $(`[data-vl="${i}"]`).textContent = fmt(v);
            $(`[data-slider="${i}"]`).style.setProperty('--p', `${v * 10}%`);
        });
        const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10;
        const r = $('[data-live-ring]');
        r.dataset.score = String(avg);
        r.style.setProperty('--v', String(avg * 10));
        if (animate) r.classList.add('on');
        $('[data-ring-num]', r).textContent = fmt(avg);
        const t = tierOf(avg);
        const tier = $('[data-live-tier]');
        tier.textContent = t[1];
        tier.style.setProperty('--c', t[2]);
    }
    sheet.addEventListener('input', e => { if (e.target.matches('[data-slider]')) updateLive(); });
    function save() {
        const btn = $('.btn-prominent');
        btn.classList.add('done');
        const r = $('[data-live-ring]');
        r.classList.remove('pulse'); void r.offsetWidth; r.classList.add('pulse');
        navigator.vibrate?.(8);
        setTimeout(() => { closeSheet(); toast('Puanın kaydedildi'); }, reduced.matches ? 200 : 650);
    }
    // Paneli aşağı sürükleyerek kapatma
    let sd = null;
    $('.sheet-head').addEventListener('pointerdown', e => {
        if (e.target.closest('button')) return;
        sd = { y0: e.clientY, t0: performance.now(), dy: 0 };
        sheet.classList.add('dragging');
        e.currentTarget.setPointerCapture(e.pointerId);
    });
    $('.sheet-head').addEventListener('pointermove', e => {
        if (!sd) return;
        const raw = e.clientY - sd.y0;
        sd.dy = raw > 0 ? raw : raw / 6; // yukarı çekişte direnç
        sheet.style.setProperty('--drag', `${sd.dy}px`);
    });
    const endSheet = () => {
        if (!sd) return;
        const speed = sd.dy / Math.max(1, performance.now() - sd.t0);
        const dy = sd.dy;
        sd = null;
        sheet.classList.remove('dragging');
        if (dy > 140 || speed > 0.7) closeSheet();
        else sheet.style.setProperty('--drag', '0px');
    };
    $('.sheet-head').addEventListener('pointerup', endSheet);
    $('.sheet-head').addEventListener('pointercancel', endSheet);

    // ----- Bildirim -----
    let toastTimer = 0;
    function toast(text) {
        const t = $('#toast');
        $('span', t).textContent = text;
        t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
    }

    // ----- Tokenlar ve hareket listeleri -----
    const TOKENS = [
        ['Zeminler', [['--bg', 'Zemin'], ['--bg-elevated', 'Kart / liste'], ['--bg-elevated-2', 'İç katman'], ['--bg-sheet', 'Panel']]],
        ['Metin', [['--label', 'Birincil'], ['--label-2', 'İkincil'], ['--label-3', 'Üçüncül'], ['--separator', 'Ayraç']]],
        ['Vurgu', [['--tint', 'Vurgu (dolgu)'], ['--tint-text', 'Vurgu (metin)'], ['--tint-soft', 'Vurgu (zemin)'], ['--fill-3', 'Kontrol dolgusu']]],
        ['Skor kademeleri', [['--tier-legend', 'Efsane'], ['--tier-great', 'Çok iyi'], ['--tier-ok', 'İdare eder'], ['--tier-weak', 'Zayıf'], ['--tier-skip', 'Uğrama'], ['--gray', 'Puansız']]],
        ['Sistem renkleri', [['--blue', 'Mavi'], ['--indigo', 'Çivit'], ['--purple', 'Mor'], ['--pink', 'Pembe'], ['--teal', 'Camgöbeği'], ['--brown', 'Kahve']]]
    ];
    function renderTokens() {
        const cs = getComputedStyle(document.documentElement);
        const html = TOKENS.map(([head, list]) => `<p class="swatch-head">${head}</p>` + list.map(([v, nm]) => {
            let val = cs.getPropertyValue(v).trim();
            if (val.startsWith('var(')) val = cs.getPropertyValue(val.slice(4, -1)).trim();
            return `<div class="swatch"><i style="--c:var(${v})"></i><div><b>${nm}</b><code>${val}</code></div></div>`;
        }).join('')).join('');
        $$('[data-swatches]').forEach(el => { el.innerHTML = html; });
    }
    const MOTION = [
        ['smooth', 'Yumuşak', 'Sayfa geçişi, panel, halka. Apple varsayılanı.'],
        ['snappy', 'Çevik', 'Segment kontrolü, küçük durum değişimleri.'],
        ['bouncy', 'Esnek', 'Basma tepkisi, sekme göstergesi, bildirim.']
    ];
    function renderMotion() {
        const html = MOTION.map(([k, nm, ds]) =>
            `<div class="motion-row" style="--d:var(--spring-${k}-dur);--e:var(--spring-${k})"><span class="nm">${nm}</span><span class="ds">${ds}</span><button class="play press" data-play>Oynat</button><span class="motion-track"><span class="motion-dot"></span></span></div>`).join('')
            + '<p class="fineprint" style="margin:8px 0 4px">Cihazda “Hareketi azalt” açıksa yaylar kapanır, yalnızca kısa geçişler kalır.</p>';
        $$('[data-motion]').forEach(el => { el.innerHTML = html; });
    }

    // ----- Olaylar -----
    document.addEventListener('click', e => {
        const el = e.target.closest('button, [data-action]');
        if (!el) return;
        if (el.matches('.tab')) return selectTab(el.dataset.tab);
        if (el.dataset.place) return openPlace(el.dataset.place);
        if (el.dataset.push) return push(el.dataset.push);
        if (el.matches('[data-play]')) {
            const row = el.closest('.motion-row');
            row.classList.toggle('go');
            el.textContent = row.classList.contains('go') ? 'Geri al' : 'Oynat';
            return;
        }
        const seg = el.closest('.seg');
        if (seg && el.dataset.value) {
            if (seg.dataset.seg === 'theme') return setTheme(el.dataset.value);
            $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(b === el)));
            placeLens(seg);
            if (seg.dataset.seg === 'period') renderPopular(el.dataset.value);
            return;
        }
        if (el.matches('.chip')) {
            $$('.chip', el.parentElement).forEach(c => c.setAttribute('aria-pressed', String(c === el)));
            return;
        }
        switch (el.dataset.action) {
            case 'back': return pop();
            case 'rate': return openSheet();
            case 'close-sheet': return closeSheet();
            case 'save': return save();
            case 'toast': return toast(el.dataset.toast);
            case 'bookmark': {
                el.classList.toggle('on');
                return toast(el.classList.contains('on') ? "Gidilecekler'e eklendi" : "Gidilecekler'den çıkarıldı");
            }
        }
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { if (screen.classList.contains('sheet-open')) closeSheet(); else pop(); }
    });

    // Telefon çerçevesini pencereye sığdır (masaüstü)
    function fit() {
        const d = $('#device');
        if (innerWidth <= 760) { d.style.zoom = ''; return; }
        d.style.zoom = String(Math.min(1, (innerHeight - 40) / 874));
    }
    addEventListener('resize', () => { fit(); $$('.seg').forEach(s => placeLens(s, false)); moveLens(); });

    // ----- Başlat -----
    renderLists();
    renderMotion();
    let saved = 'system';
    try { saved = localStorage.getItem('pubskor-demo-theme') || 'system'; } catch { /* yok */ }
    setTheme(saved);
    fit();
    requestAnimationFrame(() => {
        $$('.seg').forEach(s => placeLens(s, false));
        moveLens();
        fillRings(views.akis);
        $$('[data-count]').forEach(el => countUp(el, Number(el.dataset.count), Number(el.dataset.decimals || 0)));
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(renderTokens));
})();
