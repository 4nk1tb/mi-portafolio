/* ==========================================================================
   Yanki Tellez - portfolio
   Lenis (scroll con inercia) + GSAP ScrollTrigger. Sin listeners de "scroll":
   todo el estado de scroll pasa por ScrollTrigger / IntersectionObserver.
   La intro del hero es CSS puro (ver styles.css): aquí solo va lo que depende del scroll.
   Cada animación responde a algo: jerarquía, narrativa, feedback o cambio de estado.
   ========================================================================== */
(() => {
    'use strict';

    const root = document.documentElement;
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const hasLibs = !!(window.gsap && window.ScrollTrigger);

    // Mismo criterio que la media query del stack de paneles en styles.css
    const STACK_MQ = '(min-width: 900px) and (min-height: 600px)';

    let lenis = null;
    let menuOpen = false;
    const cleanups = [];

    const nav = $('#nav');
    const menu = $('#menu');
    const menuToggle = $('#menu-toggle');
    const themeToggle = $('#theme-toggle');

    /* ------------------------------------------------------------------
       Utilidades
       ------------------------------------------------------------------ */
    // Divide un elemento en palabras conservando sus hijos (<em>, etc.).
    // mask = true -> cada palabra va dentro de una máscara para revelarla subiendo.
    function splitWords(el, mask) {
        const out = [];
        const walk = (node) => {
            Array.from(node.childNodes).forEach((n) => {
                if (n.nodeType === 3) {
                    const frag = document.createDocumentFragment();
                    n.textContent.split(/(\s+)/).forEach((part) => {
                        if (!part) return;
                        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
                        const word = document.createElement('span');
                        if (mask) {
                            word.className = 'w';
                            const inner = document.createElement('span');
                            inner.className = 'w__in';
                            inner.textContent = part;
                            word.appendChild(inner);
                            out.push(inner);
                        } else {
                            word.className = 'wd';
                            word.textContent = part;
                            out.push(word);
                        }
                        frag.appendChild(word);
                    });
                    node.replaceChild(frag, n);
                } else if (n.nodeType === 1) {
                    walk(n);
                }
            });
        };
        walk(el);
        return out;
    }

    // Lleva el foco al destino de un ancla (los lectores de pantalla y el teclado siguen desde ahí)
    function focusTarget(target) {
        if (!target.hasAttribute('tabindex')) {
            target.setAttribute('tabindex', '-1');
            target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
        }
        target.focus({ preventScroll: true });
    }

    // Avisa a los lectores de pantalla de los enlaces que abren pestaña nueva
    function annotateExternalLinks() {
        $$('a[target="_blank"]').forEach((a) => {
            if (a.querySelector('.sr-only')) return;
            const note = document.createElement('span');
            note.className = 'sr-only';
            note.textContent = ' (se abre en una pestaña nueva)';
            a.appendChild(note);
        });
    }

    /* ------------------------------------------------------------------
       Tema claro / oscuro (con transición circular si el navegador la soporta)
       ------------------------------------------------------------------ */
    function syncThemeUi() {
        const dark = root.dataset.theme !== 'light';
        themeToggle.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
        const meta = $('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', dark ? '#0c0b0a' : '#f4f3ef');
    }

    function initTheme() {
        syncThemeUi();
        themeToggle.addEventListener('click', () => {
            const next = root.dataset.theme === 'light' ? 'dark' : 'light';
            const apply = () => {
                root.dataset.theme = next;
                try { localStorage.setItem('yt-theme', next); } catch (e) { /* almacenamiento bloqueado */ }
                syncThemeUi();
            };
            if (!document.startViewTransition || reduceMotion) { apply(); return; }
            const r = themeToggle.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
            const vt = document.startViewTransition(apply);
            vt.ready.then(() => {
                root.animate(
                    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                    { duration: 750, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' }
                );
            }).catch(() => {});
        });
    }

    /* ------------------------------------------------------------------
       Menú móvil (foco gestionado; el contenido de detrás queda inerte)
       ------------------------------------------------------------------ */
    function setMenu(open, restoreFocus) {
        menuOpen = open;
        menu.classList.toggle('is-open', open);
        menu.setAttribute('aria-hidden', String(!open));
        menuToggle.setAttribute('aria-expanded', String(open));
        menuToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
        $$('main, footer').forEach((el) => { if (open) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
        nav.classList.remove('is-hidden');
        if (lenis) { open ? lenis.stop() : lenis.start(); }
        else { root.style.overflow = open ? 'hidden' : ''; }
        if (open) {
            const first = $('[data-menu-link]', menu);
            if (first) first.focus({ preventScroll: true });
        } else if (restoreFocus) {
            menuToggle.focus();
        }
    }

    function initMenu() {
        menuToggle.addEventListener('click', () => setMenu(!menuOpen, false));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) setMenu(false, true); });
        window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches && menuOpen) setMenu(false, false); });
    }

    /* ------------------------------------------------------------------
       Anclas (con Lenis si existe; nativo si no)
       ------------------------------------------------------------------ */
    function initAnchors() {
        document.addEventListener('click', (e) => {
            // Ctrl/Cmd/Shift/Alt + clic o botón central: que el navegador haga lo suyo
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const a = e.target.closest('a[href^="#"]');
            if (!a) return;
            const hash = a.getAttribute('href');
            if (hash.length < 2) return;
            const target = $(hash);
            if (!target) return;
            e.preventDefault();
            if (menuOpen) setMenu(false, false);
            if (lenis) {
                lenis.scrollTo(hash === '#inicio' ? 0 : target, { duration: 1.5, easing: (t) => 1 - Math.pow(1 - t, 4) });
            } else {
                target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
            }
            focusTarget(target);
            try { history.pushState(null, '', hash); } catch (err) { /* file:// u otros */ }
        });
    }

    /* ------------------------------------------------------------------
       Estado de la barra (sentinel + IntersectionObserver)
       ------------------------------------------------------------------ */
    function initNavState() {
        const sentinel = document.createElement('div');
        sentinel.setAttribute('aria-hidden', 'true');
        sentinel.style.cssText = 'position:absolute;top:24px;left:0;width:1px;height:1px;pointer-events:none;';
        document.body.appendChild(sentinel);
        new IntersectionObserver(([entry]) => {
            nav.classList.toggle('is-scrolled', !entry.isIntersecting);
        }).observe(sentinel);
    }

    /* ------------------------------------------------------------------
       Cursor: luz ambiental + botones magnéticos + borde con foco
       (feedback: el sitio reconoce al visitante)
       ------------------------------------------------------------------ */
    function initPointerEffects() {
        if (!finePointer) return;

        const glow = $('.glow');
        if (glow && hasLibs && !reduceMotion) {
            gsap.set(glow, { x: innerWidth / 2, y: innerHeight / 2 });
            const gx = gsap.quickTo(glow, 'x', { duration: 0.9, ease: 'power3' });
            const gy = gsap.quickTo(glow, 'y', { duration: 0.9, ease: 'power3' });
            window.addEventListener('pointermove', (e) => { glow.classList.add('is-on'); gx(e.clientX); gy(e.clientY); }, { passive: true });
            root.addEventListener('pointerleave', () => glow.classList.remove('is-on'));
        }

        if (hasLibs && !reduceMotion) {
            $$('[data-magnetic]').forEach((el) => {
                const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
                const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
                el.addEventListener('pointermove', (e) => {
                    const r = el.getBoundingClientRect();
                    xTo((e.clientX - (r.left + r.width / 2)) * 0.22);
                    yTo((e.clientY - (r.top + r.height / 2)) * 0.32);
                });
                el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
                el.addEventListener('pointerdown', () => gsap.to(el, { scale: 0.96, duration: 0.15 }));
                ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => el.addEventListener(t, () => gsap.to(el, { scale: 1, duration: 0.4, ease: 'power3' })));
            });
        }

        $$('[data-spot]').forEach((el) => {
            el.addEventListener('pointermove', (e) => {
                const r = el.getBoundingClientRect();
                el.style.setProperty('--mx', `${e.clientX - r.left}px`);
                el.style.setProperty('--my', `${e.clientY - r.top}px`);
            });
        });
    }

    /* ------------------------------------------------------------------
       Movimiento (solo si hay librerías y no se pidió reducir movimiento)
       ------------------------------------------------------------------ */
    function initMotion() {
        gsap.registerPlugin(ScrollTrigger);

        /* Scroll con inercia: decide el "peso" de toda la página */
        lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
        lenis.on('scroll', ScrollTrigger.update);
        const tick = (t) => { if (lenis) lenis.raf(t * 1000); };
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);
        cleanups.push(() => gsap.ticker.remove(tick));

        /* ---- Efectos que dependen del tamaño de pantalla ---- */
        const mm = gsap.matchMedia();
        cleanups.push(() => mm.revert());

        mm.add('(min-width: 1024px)', () => {
            // Hero: al salir, las líneas se separan y el cluster sube más lento (profundidad)
            const lines = $$('.hero__title .line');
            gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
                .to(lines[0], { xPercent: -7, ease: 'none' }, 0)
                .to(lines[1], { xPercent: 5, ease: 'none' }, 0)
                .to(lines[2], { xPercent: -3, ease: 'none' }, 0)
                .to('.hero__visual', { y: -90, ease: 'none' }, 0)
                .to('.hero__copy', { y: -30, opacity: 0.2, ease: 'none' }, 0);

            // Hero: el cluster responde al puntero (profundidad por capa, vía variables CSS)
            if (!finePointer) return;
            const visual = $('.hero__visual');
            const p = { x: 0, y: 0 };
            const apply = () => {
                visual.style.setProperty('--px', p.x.toFixed(3));
                visual.style.setProperty('--py', p.y.toFixed(3));
            };
            const onMove = (e) => {
                gsap.to(p, { x: e.clientX / innerWidth - 0.5, y: e.clientY / innerHeight - 0.5, duration: 1, ease: 'power3', overwrite: true, onUpdate: apply });
            };
            window.addEventListener('pointermove', onMove, { passive: true });
            return () => {
                window.removeEventListener('pointermove', onMove);
                gsap.killTweensOf(p);
                visual.style.removeProperty('--px');
                visual.style.removeProperty('--py');
            };
        });

        mm.add(STACK_MQ, () => {
            // Soluciones: el panel 2 cubre al 1, que retrocede (jerarquía: ahora toca el otro público)
            const panels = $$('[data-panel]');
            if (panels.length !== 2) return;
            const [a, b] = panels;
            gsap.to(a, {
                scale: 0.93, ease: 'none',
                scrollTrigger: { trigger: b, start: 'top bottom', end: 'top top', scrub: true },
            });
            gsap.to($('.panel__content', a), {
                opacity: 0.25, ease: 'none',
                scrollTrigger: { trigger: b, start: 'top 70%', end: 'top top', scrub: true },
            });
            gsap.fromTo($('.panel__num', b), { yPercent: 28 }, {
                yPercent: 0, ease: 'none',
                scrollTrigger: { trigger: b, start: 'top bottom', end: 'top top', scrub: true },
            });
            // Cuando el panel 2 lo tapa del todo, el panel 1 sale del orden de tabulación
            ScrollTrigger.create({
                trigger: b, start: 'top top',
                onEnter: () => { a.inert = true; },
                onLeaveBack: () => { a.inert = false; },
            });
            return () => { a.inert = false; };
        });

        /* ---- Manifiesto: las palabras se encienden al ritmo de lectura ---- */
        const lit = $('[data-lit]');
        if (lit) {
            const words = splitWords(lit, false);
            gsap.set(words, { opacity: 0.14 });
            gsap.to(words, {
                opacity: 1, ease: 'none', stagger: 0.12, duration: 0.5,
                scrollTrigger: { trigger: lit, start: 'top 80%', end: 'bottom 50%', scrub: true },
            });
        }

        /* ---- Títulos: máscara de palabras (jerarquía de sección) ---- */
        $$('[data-split]').forEach((el) => {
            const inner = splitWords(el, true);
            gsap.set(inner, { yPercent: 118 });
            ScrollTrigger.create({
                trigger: el, start: 'top 88%', once: true,
                onEnter: () => gsap.to(inner, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.07 }),
            });
        });

        /* ---- Demos: entrada por máscara + parallax interior ---- */
        $$('.demo').forEach((demo) => {
            const media = $('.demo__media', demo);
            const img = $('img', media);
            const body = $('.demo__body', demo);
            gsap.set(media, { clipPath: 'inset(100% 0% 0% 0% round 28px)' });
            gsap.set(body, { y: 36, opacity: 0 });
            ScrollTrigger.create({
                trigger: demo, start: 'top 82%', once: true,
                onEnter: () => {
                    gsap.to(media, { clipPath: 'inset(0% 0% 0% 0% round 28px)', duration: 1.4, ease: 'expo.out' });
                    gsap.to(body, { y: 0, opacity: 1, duration: 1.1, delay: 0.25, ease: 'expo.out' });
                },
            });
            gsap.fromTo(img, { yPercent: -4.5 }, {
                yPercent: 4.5, ease: 'none',
                scrollTrigger: { trigger: media, start: 'top bottom', end: 'bottom top', scrub: true },
            });
        });

        /* ---- Paquetes: entrada escalonada + precios que cuentan (énfasis) ---- */
        const plans = $$('.plan');
        gsap.set(plans, { y: 70, opacity: 0 });
        ScrollTrigger.create({
            trigger: '.plans', start: 'top 82%', once: true,
            onEnter: () => gsap.to(plans, { y: 0, opacity: 1, duration: 1.2, ease: 'expo.out', stagger: 0.12 }),
        });
        $$('[data-count]').forEach((el) => {
            const end = Number(el.dataset.count);
            const state = { v: 0 };
            el.textContent = '0';
            ScrollTrigger.create({
                trigger: el, start: 'top 88%', once: true,
                onEnter: () => gsap.to(state, {
                    v: end, duration: 1.7, ease: 'power3.out', delay: 0.2,
                    onUpdate: () => { el.textContent = String(Math.round(state.v)); },
                    onComplete: () => { el.textContent = String(end); },
                }),
            });
        });

        /* ---- Garantía: marquesina (única de la página) que reacciona al scroll ---- */
        initMarquee();

        const gText = $('.guarantee__text');
        if (gText) {
            gsap.set(gText, { y: 30, opacity: 0 });
            ScrollTrigger.create({ trigger: gText, start: 'top 90%', once: true, onEnter: () => gsap.to(gText, { y: 0, opacity: 1, duration: 1, ease: 'expo.out' }) });
        }
        const fWord = $$('.footer__word span');
        if (fWord.length) {
            gsap.set(fWord, { yPercent: 105 });
            ScrollTrigger.create({
                trigger: '.footer__word', start: 'top 95%', once: true,
                onEnter: () => gsap.to(fWord, { yPercent: 0, duration: 1.5, ease: 'expo.out', stagger: 0.12 }),
            });
        }

        /* ---- Barra: se oculta al bajar y vuelve al subir (menos estorbo en lectura) ---- */
        ScrollTrigger.create({
            start: 0, end: 'max',
            onUpdate: (self) => {
                if (menuOpen) return;
                nav.classList.toggle('is-hidden', self.direction === 1 && self.scroll() > 320);
            },
        });

        /* ---- Reajuste cuando todo ha cargado ---- */
        const refresh = () => ScrollTrigger.refresh();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
        window.addEventListener('load', refresh, { once: true });
    }

    function initMarquee() {
        const wrap = $('[data-marquee]');
        if (!wrap) return;
        const track = $('.marquee__track', wrap);
        const group = $('.marquee__group', track);

        const copies = [];
        let groupW = 0;
        const build = () => {
            copies.forEach((c) => c.remove());
            copies.length = 0;
            groupW = group.getBoundingClientRect().width;
            const needed = Math.ceil((innerWidth * 2) / Math.max(groupW, 1));
            for (let i = 0; i < needed; i++) {
                const clone = group.cloneNode(true);
                track.appendChild(clone);
                copies.push(clone);
            }
        };
        build();
        // La anchura del grupo cambia cuando llega la fuente: se vuelve a medir
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
        let resizeTimer;
        const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(build, 150); };
        window.addEventListener('resize', onResize);
        cleanups.push(() => window.removeEventListener('resize', onResize));

        let x = 0;
        let dir = -1;
        let boost = 0;
        let visible = false;
        ScrollTrigger.create({ trigger: wrap, start: 'top bottom', end: 'bottom top', onToggle: (self) => { visible = self.isActive; } });
        lenis.on('scroll', ({ velocity, direction }) => {
            boost = Math.min(Math.abs(velocity) * 14, 900);
            if (direction) dir = -direction;
        });
        const marqueeTick = (_, deltaMs) => {
            if (!visible || !groupW) return;
            const dt = Math.min(deltaMs, 50) / 1000; // evita saltos al volver de una pestaña en segundo plano
            boost *= Math.pow(0.92, dt * 60);
            x += dir * (70 + boost) * dt;
            x = ((x % groupW) - groupW) % groupW;
            gsap.set(track, { x });
        };
        gsap.ticker.add(marqueeTick);
        cleanups.push(() => gsap.ticker.remove(marqueeTick));
    }

    /* ------------------------------------------------------------------
       Enlace activo en la navegación (estado de "dónde estoy")
       ------------------------------------------------------------------ */
    function initActiveLinks() {
        if (!hasLibs) return;
        gsap.registerPlugin(ScrollTrigger);
        const links = $$('[data-nav-link]');
        const setActive = (id) => links.forEach((l) => {
            if (id && l.getAttribute('href') === `#${id}`) l.setAttribute('aria-current', 'true');
            else l.removeAttribute('aria-current');
        });
        ['soluciones', 'demos', 'paquetes', 'contacto'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            ScrollTrigger.create({
                trigger: el, start: 'top 55%', end: 'bottom 55%',
                onEnter: () => setActive(id), onEnterBack: () => setActive(id),
                onLeave: () => setActive(null), onLeaveBack: () => setActive(null),
            });
        });
    }

    /* Si el movimiento falla, deja la página completa, visible y usable */
    function teardown() {
        while (cleanups.length) { try { cleanups.pop()(); } catch (e) { /* ya limpiado */ } }
        if (window.ScrollTrigger) ScrollTrigger.getAll().forEach((t) => t.kill());
        if (lenis) { try { lenis.destroy(); } catch (e) { /* ya destruido */ } lenis = null; }
        if (window.gsap) {
            gsap.set('.w__in, .wd, .line, .hero__visual, .hero__copy, .panel, .panel__content, .panel__num, .demo__media, .demo__media img, .demo__body, .plan, .guarantee__text, .footer__word span', { clearProps: 'all' });
        }
        $$('[data-panel]').forEach((p) => { p.inert = false; });
    }

    /* ------------------------------------------------------------------
       Arranque
       ------------------------------------------------------------------ */
    initTheme();
    initMenu();
    initAnchors();
    annotateExternalLinks();
    initNavState();

    if (hasLibs && window.Lenis && !reduceMotion) {
        try {
            initMotion();
        } catch (err) {
            console.error('[portfolio] motion disabled:', err);
            teardown();
        }
    }
    initActiveLinks();
    initPointerEffects();
})();
