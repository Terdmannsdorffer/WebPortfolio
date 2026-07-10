/* site.js - scroll effects, reveal-on-scroll, mobile nav.
   Classic script on purpose: everything here works even if
   ES modules or WebGL fail, so the page always reads fine. */
(function () {
  'use strict';

  /* ---- mobile nav ---- */
  var menuBtn = document.getElementById('menuBtn');
  var nav = document.getElementById('siteNav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('open') && !nav.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
        nav.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---- keyboard access for the clickable 3D canvases ---- */
  ['heart3d', 'smiley3d'].forEach(function (id) {
    var c = document.getElementById(id);
    if (!c) return;
    c.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });
  });

  /* ---- live demo stats: results this visitor measured on their own machine ---- */
  try {
    var stats = JSON.parse(localStorage.getItem('demoStats') || '{}');
    var stamp = function (sel, text) {
      var prev = document.querySelector(sel + ' .preview');
      if (!prev) return;
      var s = document.createElement('span');
      s.className = 'tag you';
      s.textContent = text;
      prev.appendChild(s);
    };
    if (stats.fno && stats.fno.speedup >= 2 && stats.fno.speedup < 1000)
      stamp('.demo.d3', 'you measured ' + Math.round(stats.fno.speedup) + '×');
    if (stats.pinn && stats.pinn.loss > 0 && stats.pinn.loss < 10)
      stamp('.demo.d1', 'your run: loss ' + Number(stats.pinn.loss).toExponential(1));
    if (stats.fluid && stats.fluid.fps >= 10)
      stamp('.demo.d4', 'you ran it at ' + Math.round(stats.fluid.fps) + ' fps');
  } catch (e) {}

  /* ---- reveal-on-scroll ---- */
  var els = document.querySelectorAll('.fx');
  if (!('IntersectionObserver' in window)) {
    els.forEach(function (e) { e.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---- scroll-driven motion: progress bar, timeline draw, marquee shift, doodles ---- */
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items = document.querySelectorAll('.tl-item');
  var bar = document.getElementById('scrollProgress');
  var fill = document.getElementById('tlProgress');
  var timeline = document.querySelector('.timeline');
  var mq = document.getElementById('mqShift');
  var trackEl = document.querySelector('.marquee .track');
  var doodles = Array.prototype.slice.call(document.querySelectorAll('.doodle'));

  if (reduced) {
    items.forEach(function (it) { it.classList.add('lit'); });
    if (fill) fill.style.height = '100%';
    if (bar) bar.style.display = 'none';
    return;
  }

  var halfW = 0, ticking = false;
  function measure() { halfW = trackEl ? trackEl.scrollWidth / 2 : 0; }

  function update() {
    ticking = false;
    var y = window.scrollY || 0;
    var max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.width = (max > 0 ? y / max * 100 : 0) + '%';

    if (timeline && fill) {
      var r = timeline.getBoundingClientRect();
      var p = (innerHeight * 0.62 - r.top) / r.height;
      fill.style.height = (Math.max(0, Math.min(1, p)) * 100) + '%';
    }
    items.forEach(function (it) {
      it.classList.toggle('lit', it.getBoundingClientRect().top < innerHeight * 0.62);
    });

    if (mq && halfW) mq.style.transform = 'translateX(' + (-(y * 0.25) % halfW) + 'px)';

    doodles.forEach(function (d) {
      var pr = d.parentElement.getBoundingClientRect();
      var c = pr.top + pr.height / 2 - innerHeight / 2;
      var sp = parseFloat(d.dataset.speed) || 0.1;
      // scribbles (equations, plot sketches) keep their hand-set tilt: the
      // scroll-rotation that looks cute on ✦ stars spins long text illegible
      var rot = d.classList.contains('scribble') ? 0 : c * 0.03;
      d.style.transform = 'translateY(' + (c * sp) + 'px) rotate(' + rot + 'deg)';
    });
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', function () { measure(); onScroll(); }, { passive: true });
  measure(); update();

  /* ---- ambient sparkles: candy stars twinkling in the empty gutters.
     Fixed-position, pointer-events:none, a handful of elements, pure CSS
     animation per twinkle; each star re-rolls its spot after every cycle.
     Never spawns over content: only in the strips outside the .shell
     column (or the slim edge padding on phones). Skipped entirely under
     prefers-reduced-motion (we returned above). ---- */
  var shell = document.querySelector('.shell');
  if (shell) {
    var SPK_GLYPHS = ['✦', '✦', '✦', '✦', '✳', '✚'];
    var SPK_COLORS = ['var(--coral)', 'var(--teal)', 'var(--yellow)', 'var(--violet)', 'var(--pink)', 'var(--blue)'];

    var spkStrips = function () {
      var r = shell.getBoundingClientRect();
      var pad = innerWidth <= 720 ? 20 : 32;
      var L = r.left + pad, R = r.left + r.width - pad;   // where content starts/ends
      var strips = [];
      if (L >= 26) strips.push([8, L - 18]);              // roomy left gutter
      else if (L >= 12) strips.push([4, L - 6]);          // slim edge strip (phones)
      if (innerWidth - R >= 26) strips.push([R + 10, innerWidth - 16]);
      else if (innerWidth - R >= 12) strips.push([R + 2, innerWidth - 8]);
      return strips;
    };

    var spkPlace = function (s) {
      var strips = spkStrips();
      if (!strips.length) return false;
      var st = strips[Math.random() * strips.length | 0];
      var slim = (st[1] - st[0]) < 30;
      var size = slim ? 8 + Math.random() * 5 : 10 + Math.random() * 12;
      s.style.fontSize = size + 'px';
      s.style.left = (st[0] + Math.random() * Math.max(1, st[1] - st[0] - size)) + 'px';
      s.style.top = (96 + Math.random() * Math.max(120, innerHeight - 190)) + 'px';
      s.style.color = SPK_COLORS[Math.random() * SPK_COLORS.length | 0];
      s.style.setProperty('--dur', (2.2 + Math.random() * 1.6).toFixed(2) + 's');
      s.style.setProperty('--peak', (0.3 + Math.random() * 0.35).toFixed(2));
      return true;
    };

    var spkCount = Math.max(2, Math.min(9, Math.round(innerWidth / 170)));
    for (var i = 0; i < spkCount; i++) {
      (function () {
        var s = document.createElement('span');
        s.className = 'sparkle';
        s.setAttribute('aria-hidden', 'true');
        s.textContent = SPK_GLYPHS[Math.random() * SPK_GLYPHS.length | 0];
        document.body.appendChild(s);
        var go = function () {
          if (spkPlace(s)) {
            s.classList.remove('on');
            void s.offsetWidth;                            // restart the CSS animation
            s.classList.add('on');
          } else {
            setTimeout(go, 4000);                          // no room right now, retry later
          }
        };
        s.addEventListener('animationend', function () {
          s.classList.remove('on');
          setTimeout(go, 400 + Math.random() * 2600);
        });
        setTimeout(go, Math.random() * 3800);              // staggered first appearance
      })();
    }
  }
})();
