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
    readers.push({ el: el, spans: spans, last: new Float32Array(spans.length).fill(-1) });
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
  // read the per-element settings once, not sixty times a second
  var parallax = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'))
    .map(function (el) {
      return {
        el: el,
        sp: parseFloat(el.dataset.parallax) || 0,
        xAxis: el.dataset.axis === 'x',
        skew: el.dataset.skew !== undefined
      };
    });
  var lastY = window.scrollY || 0, vel = 0, skew = 0, idle = 0, heroH = 1;
  var secTop = [], pRect = [], rRect = [];

  function measure() { heroH = hero ? hero.offsetHeight : 1; }
  measure();
  addEventListener('resize', measure, { passive: true });

  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    var i, n, y = window.scrollY || 0, vh = innerHeight;
    var dy = y - lastY; lastY = y;
    vel = vel * 0.82 + dy * 0.18;

    // once the page has stopped and the skew has settled there is nothing to do
    if (Math.abs(dy) < 0.5 && Math.abs(vel) < 0.05 && Math.abs(skew) < 0.01) {
      if (++idle > 2) return;
    } else {
      idle = 0;
    }

    /* read phase: take every measurement first, so that a style write never
       forces a synchronous re-layout in the middle of the pass */
    for (i = 0, n = sections.length; i < n; i++) {
      secTop[i] = sections[i] ? sections[i].getBoundingClientRect().top : Infinity;
    }
    for (i = 0, n = parallax.length; i < n; i++) pRect[i] = parallax[i].el.getBoundingClientRect();
    for (i = 0, n = readers.length; i < n; i++) rRect[i] = readers[i].el.getBoundingClientRect();

    /* write phase */
    if (top) top.classList.toggle('scrolled', y > 24);
    var current = -1;
    for (i = 0, n = sections.length; i < n; i++) if (secTop[i] <= vh * 0.4) current = i;
    for (i = 0, n = links.length; i < n; i++) links[i].classList.toggle('active', i === current);
    if (reduced) return;

    // hero copy drifts up and fades as the sheet slides over it
    if (hero && heroInner) {
      var p = clamp(y / Math.max(1, heroH), 0, 1.2);
      heroInner.style.transform = 'translate3d(0,' + (-y * 0.32).toFixed(1) + 'px,0)';
      heroInner.style.opacity = clamp(1 - p * 1.35, 0, 1);
      if (heroFoot) heroFoot.style.opacity = clamp(1 - p * 2.2, 0, 1);
    }

    // scroll-velocity skew, eased back to zero
    skew += (clamp(vel * 0.045, -3.5, 3.5) - skew) * 0.14;

    for (i = 0, n = parallax.length; i < n; i++) {
      var px = parallax[i], r = pRect[i];
      if (r.bottom < -240 || r.top > vh + 240) continue;
      var off = (-(r.top + r.height / 2 - vh / 2) * px.sp).toFixed(1);
      var tr = px.xAxis ? 'translate3d(' + off + 'px,0,0)' : 'translate3d(0,' + off + 'px,0)';
      if (px.skew) tr += ' skewY(' + skew.toFixed(2) + 'deg)';
      px.el.style.transform = tr;
    }

    for (i = 0, n = readers.length; i < n; i++) {
      var rd = readers[i], rr = rRect[i];
      if (rr.bottom < 0 || rr.top > vh) continue;
      var prog = clamp((vh * 0.82 - rr.top) / (rr.height + vh * 0.22), 0, 1);
      var lit = prog * (rd.spans.length + 2);
      for (var j = 0; j < rd.spans.length; j++) {
        var o = clamp(lit - j, 0.18, 1);
        if (Math.abs(o - rd.last[j]) < 0.02) continue;   // a change nobody could see
        rd.last[j] = o;
        rd.spans[j].style.opacity = o.toFixed(2);
      }
    }
  }
  requestAnimationFrame(frame);

  /* ---- optional frame-time meter: ?perf=1 ---- */
  if (/[?&]perf=1/.test(location.search)) {
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9999;font:12px/1.4 ui-monospace,monospace;' +
      'background:rgba(0,0,0,.78);color:#f3f1eb;padding:6px 10px;border:1px solid rgba(255,255,255,.22);' +
      'border-radius:4px;pointer-events:none;white-space:pre';
    document.body.appendChild(box);
    var samples = [], prev = performance.now(), shown = 0;
    requestAnimationFrame(function meter(now) {
      requestAnimationFrame(meter);
      samples.push(now - prev); prev = now;
      if (samples.length > 90) samples.shift();
      if (now - shown < 500 || samples.length < 15) return;
      shown = now;
      var s = samples.slice().sort(function (a, b) { return a - b; });
      var p50 = s[s.length >> 1], p90 = s[Math.floor(s.length * 0.9)];
      box.textContent = 'fps ' + Math.round(1000 / p50) +
        '   frame p50 ' + p50.toFixed(1) + 'ms   p90 ' + p90.toFixed(1) + 'ms';
    });
  }

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
