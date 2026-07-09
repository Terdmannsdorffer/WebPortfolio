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
      d.style.transform = 'translateY(' + (c * sp) + 'px) rotate(' + (c * 0.03) + 'deg)';
    });
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', function () { measure(); onScroll(); }, { passive: true });
  measure(); update();
})();
