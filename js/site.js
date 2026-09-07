/* site.js - smooth scroll, nav, reveals, scroll-linked motion, footer clock.
   Classic script on purpose: everything here works even if ES modules
   or WebGL fail, so the page always reads fine. */
(function () {
  'use strict';

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var html = document.documentElement;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---- smooth scroll: Lenis if it loaded, the browser's own otherwise ---- */
  var lenis = null;
  if (!reduced && window.Lenis) {
    try {
      lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
      // Lenis only moves the page from inside its own frame callback
      (function raf(time) { lenis.raf(time); requestAnimationFrame(raf); })(performance.now());
    } catch (e) { lenis = null; }
  }
  if (!lenis) html.classList.add('native-smooth');

  function scrollToHash(hash) {
    var el = hash && hash !== '#' ? document.querySelector(hash) : null;
    if (!el) {
      if (lenis) lenis.scrollTo(0); else window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
      return;
    }
    if (lenis) lenis.scrollTo(el, { offset: -72 });
    else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  }

  /* ---- hero entrance ---- */
  var hero = document.getElementById('hero');
  if (hero) {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { hero.classList.add('ready'); });
      setTimeout(function () { hero.classList.add('ready'); }, 900);   // fonts stalled: go anyway
    } else {
      hero.classList.add('ready');
    }
  }

  /* ---- mobile nav ---- */
  var menuBtn = document.getElementById('menuBtn');
  var nav = document.getElementById('siteNav');
  function closeNav() {
    html.classList.remove('nav-open');
    if (menuBtn) { menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.textContent = 'Menu'; }
  }
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () {
      var open = html.classList.toggle('nav-open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menuBtn.textContent = open ? 'Close' : 'Menu';
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNav(); });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    closeNav();
    scrollToHash(a.getAttribute('href'));
  });

  /* ---- split headings into word masks ---- */
  document.querySelectorAll('[data-split]').forEach(function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach(function (w, i) {
      var outer = document.createElement('span'); outer.className = 'w';
      var inner = document.createElement('span'); inner.textContent = w; inner.style.setProperty('--i', i);
      outer.appendChild(inner);
      el.appendChild(outer);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
  });

  /* ---- paragraphs that light up word by word as you read down ---- */
  var readers = [];
  document.querySelectorAll('[data-read]').forEach(function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    var spans = words.map(function (w, i) {
      var s = document.createElement('span'); s.className = 'rw'; s.textContent = w;
      s.style.opacity = reduced ? 1 : 0.18;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
      return s;
    });
    readers.push({ el: el, spans: spans });
  });

  /* ---- reveal-on-scroll. Clip-revealed elements start fully clipped, and a
     fully clipped box never counts as intersecting, so those are triggered
     from their parent instead. ---- */
  var revealEls = document.querySelectorAll('.rv, .rv-clip, [data-split]');
  if (reduced || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (e) { e.classList.add('in'); });
    readers.forEach(function (rd) { rd.spans.forEach(function (s) { s.style.opacity = 1; }); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        e.target.querySelectorAll('.rv-clip').forEach(function (c) { c.classList.add('in'); });
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (e) {
      io.observe(e.classList.contains('rv-clip') ? e.parentElement : e);
    });
  }

  /* ---- live demo index in the sticky section label ---- */
  var demoIdx = document.getElementById('demoIdx');
  var demos = document.querySelectorAll('.demo');
  if (demoIdx && demos.length && 'IntersectionObserver' in window) {
    var total = String(demos.length).padStart(2, '0');
    var io2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) demoIdx.textContent = e.target.dataset.idx + ' / ' + total;
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    demos.forEach(function (d) { io2.observe(d); });
  }

  /* ---- live demo stats: numbers this visitor measured on their own machine ---- */
  try {
    var stats = JSON.parse(localStorage.getItem('demoStats') || '{}');
    var stamp = function (sel, text) {
      var prev = document.querySelector(sel + ' .preview');
      if (!prev) return;
      var s = document.createElement('span');
      s.className = 'tag you mono';
      s.textContent = text;
      prev.appendChild(s);
    };
    if (stats.fno && stats.fno.speedup >= 2 && stats.fno.speedup < 1000)
      stamp('.demo.d3', 'you measured ' + Math.round(stats.fno.speedup) + '×');
    if (stats.pinn && stats.pinn.loss > 0 && stats.pinn.loss < 10)
      stamp('.demo.d1', 'your last run: loss ' + Number(stats.pinn.loss).toExponential(1));
    if (stats.fluid && stats.fluid.fps >= 10)
      stamp('.demo.d4', 'ran at ' + Math.round(stats.fluid.fps) + ' fps for you');
  } catch (e) {}

  /* ---- scroll-linked motion: header, active link, hero exit, parallax,
     velocity skew, read-along paragraphs. One rAF loop, cheap per frame. ---- */
  var top = document.getElementById('top');
  var heroInner = document.getElementById('heroInner');
  var heroFoot = document.getElementById('heroFoot');
  var links = nav ? Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]')) : [];
  var sections = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  var parallax = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  var lastY = window.scrollY || 0, vel = 0, skew = 0;

  function frame() {
    requestAnimationFrame(frame);
    var y = window.scrollY || 0, vh = innerHeight;
    var dy = y - lastY; lastY = y;
    vel = vel * 0.82 + dy * 0.18;

    if (top) top.classList.toggle('scrolled', y > 24);
    var current = -1;
    sections.forEach(function (s, i) {
      if (s && s.getBoundingClientRect().top <= vh * 0.4) current = i;
    });
    links.forEach(function (a, i) { a.classList.toggle('active', i === current); });
    if (reduced) return;

    // hero copy drifts up and fades as the sheet slides over it
    if (hero && heroInner) {
      var p = clamp(y / Math.max(1, hero.offsetHeight), 0, 1.2);
      heroInner.style.transform = 'translate3d(0,' + (-y * 0.32).toFixed(1) + 'px,0)';
      heroInner.style.opacity = clamp(1 - p * 1.35, 0, 1);
      if (heroFoot) heroFoot.style.opacity = clamp(1 - p * 2.2, 0, 1);
    }

    // scroll-velocity skew, eased back to zero
    skew += (clamp(vel * 0.045, -3.5, 3.5) - skew) * 0.14;

    parallax.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < -240 || r.top > vh + 240) return;
      var c = r.top + r.height / 2 - vh / 2;
      var sp = parseFloat(el.dataset.parallax) || 0;
      var v = (-c * sp).toFixed(1);
      var t = el.dataset.axis === 'x' ? 'translate3d(' + v + 'px,0,0)' : 'translate3d(0,' + v + 'px,0)';
      if (el.dataset.skew !== undefined) t += ' skewY(' + skew.toFixed(2) + 'deg)';
      el.style.transform = t;
    });

    readers.forEach(function (rd) {
      var r = rd.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var prog = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.22), 0, 1);
      var lit = prog * (rd.spans.length + 2);
      rd.spans.forEach(function (s, i) { s.style.opacity = clamp(lit - i, 0.18, 1).toFixed(2); });
    });
  }
  requestAnimationFrame(frame);

  /* ---- footer clock, Santiago time ---- */
  var clock = document.getElementById('clock');
  if (clock) {
    var fmt;
    try {
      fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
    } catch (e) { fmt = null; }
    var tickClock = function () { if (fmt) clock.textContent = fmt.format(new Date()); };
    tickClock();
    setInterval(tickClock, 15000);
  }
})();
