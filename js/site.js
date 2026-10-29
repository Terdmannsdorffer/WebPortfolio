/* site.js - the page around the stage (plain script, no dependencies but Lenis).

   - smooth wheel scrolling (Lenis, with its own rAF loop or it swallows the wheel)
   - reveals: masked lines and rises, once, when they enter the view
   - nav: active section, mobile menu
   - the stage: turns the scroll position in Research into the figure's state
     (window.__stage.progress, read by main.js every frame), says when the
     demos or the closing scene cover it (window.__stage.covered), and on
     phones hides it once Research is over
   - the closing name is fitted to the width of the page
   Everything that moves is off under prefers-reduced-motion. */
(function () {
  'use strict';
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  var stageState = window.__stage = { progress: 0, covered: false };

  /* ---------- smooth scroll ---------- */
  var lenis = null;
  function startLenis() {
    if (reduced || !window.Lenis) { root.classList.add('native-smooth'); return; }
    lenis = new window.Lenis({ lerp: 0.11, smoothWheel: true });
    (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(performance.now());
    lenis.on('scroll', onScroll);
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href');
    var el = id.length > 1 ? document.querySelector(id) : null;
    if (!el) return;
    e.preventDefault();
    closeMenu();
    if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.2 });
    else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    history.replaceState(null, '', id);
  });

  /* ---------- reveals ---------- */
  // only headings move (one masked rise each; body text never fades up). A chapter, a research
  // frame or the demos intro reveals its heading once 30% of it is in view, because their copy
  // sits near the bottom edge where a per-element trigger comes late; other headings go on their own
  var GROUP = '.chapter, .frame, .demos-intro';
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
  var gio = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('in'); });
      gio.unobserve(e.target);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll(GROUP).forEach(function (g) { gio.observe(g); });
  document.querySelectorAll('[data-reveal]').forEach(function (el) { if (!el.closest(GROUP)) io.observe(el); });
  document.querySelectorAll('.rows li').forEach(function (li, i) { li.style.setProperty('--i', i); });
  // the hero enters on load, once its fonts are in (no reflow mid-animation)
  function heroIn() {
    document.querySelectorAll('.hero .mask-lines, .hero .rise').forEach(function (el) { el.classList.add('in'); });
  }
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 900); })]).then(function () {
    requestAnimationFrame(heroIn);
  });
  window.__siteReady = true;

  /* ---------- nav ---------- */
  var nav = document.getElementById('siteNav');
  var menuBtn = document.getElementById('menuBtn');
  var top = document.getElementById('top');
  function closeMenu() {
    if (!nav.classList.contains('open')) return;
    nav.classList.remove('open');
    document.body.classList.remove('menu-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.textContent = 'Menu';
    if (lenis) lenis.start();
  }
  menuBtn.addEventListener('click', function () {
    var open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.textContent = open ? 'Close' : 'Menu';
    if (lenis) { if (open) lenis.stop(); else lenis.start(); }
  });
  addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  addEventListener('resize', function () { if (innerWidth >= 900) closeMenu(); });

  var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
  var sections = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });

  /* ---------- layout cache (read once per resize, never during scroll) ---------- */
  var L = {};
  var frames = Array.prototype.slice.call(document.querySelectorAll('.research .frame'));
  var stage = document.getElementById('stage');
  var research = document.getElementById('research');
  var covers = [document.getElementById('demos'), document.getElementById('contact')];
  function absTop(el) { var y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; }
  function measure() {
    L.vh = innerHeight;
    L.phone = innerWidth < 900;
    L.frames = frames.map(function (f) { return { top: absTop(f), h: f.offsetHeight }; });
    L.researchEnd = absTop(research) + research.offsetHeight;
    L.covers = covers.map(function (c) { return { top: absTop(c), bottom: absTop(c) + c.offsetHeight }; });
    L.sections = sections.map(function (s) { return s ? absTop(s) : 0; });
    L.field = absTop(document.getElementById('contact'));
    fitName();
    onScroll();
  }

  /* ---------- scroll: the stage's state, cover, header colour, active link ---------- */
  var lastActive = -1, lastY = 0;
  function onScroll() {
    var y = lenis ? lenis.scroll : scrollY;
    var vh = L.vh, mid = y + vh * 0.5;
    if (!L.frames) return;
    // progress 0 in the hero, 1/2/3 at the centre of each research frame
    var f1 = L.frames[0], p;
    p = 1 + (mid - (f1.top + f1.h / 2)) / f1.h;
    if (mid < f1.top + f1.h / 2) {      // hero -> frame 1: reach state 1 as frame 1 centres
      p = Math.max(0, 1 - (f1.top + f1.h / 2 - mid) / (vh * 0.9));
    }
    stageState.progress = Math.max(0, Math.min(3, p));
    // covered when an opaque full-width section fills the viewport
    var covered = false;
    for (var i = 0; i < L.covers.length; i++) {
      var c = L.covers[i];
      if (y >= c.top && y + vh <= c.bottom) covered = true;
    }
    if (L.phone) {
      var gone = y > L.researchEnd - vh * 0.6;
      stage.classList.toggle('gone', gone);
      covered = covered || gone;
    }
    stageState.covered = covered;
    top.classList.toggle('on-field', y + 40 >= L.field);
    // the header steps out of the way while reading down, and comes back (on a solid ground) on the way up
    var dy = y - lastY;
    if (Math.abs(dy) > 4 || y < 40) {
      top.classList.toggle('away', y > 120 && dy > 0 && !nav.classList.contains('open'));
      top.classList.toggle('solid', y > 40);
      lastY = y;
    }
    // active nav link: the last section whose top is above the middle of the screen
    var active = -1;
    for (var k = 0; k < L.sections.length; k++) if (L.sections[k] && L.sections[k] <= mid) active = k;
    if (active !== lastActive) {
      links.forEach(function (a, j) { a.classList.toggle('active', j === active); });
      lastActive = active;
    }
  }
  addEventListener('scroll', function () { if (!lenis) onScroll(); }, { passive: true });

  /* ---------- the closing name, fitted to the page ---------- */
  var big = document.getElementById('bigName');
  function fitName() {
    if (!big) return;
    var box = big.parentElement;
    box.style.fontSize = '100px';
    var w = big.getBoundingClientRect().width;
    var avail = box.getBoundingClientRect().width;
    if (w > 0) box.style.fontSize = (100 * avail / w * 0.985) + 'px';
  }

  /* ---------- numbers this visitor measured on their own machine, in the demos ---------- */
  try {
    var stats = JSON.parse(localStorage.getItem('demoStats') || '{}');
    var yours = function (id, text) {
      var tools = document.querySelector('#' + id + ' .tools');
      if (!tools) return;
      var p = document.createElement('p');
      p.className = 'yours';
      p.textContent = text;
      tools.after(p);
    };
    if (stats.fno && stats.fno.speedup >= 2 && stats.fno.speedup < 1000)
      yours('demo-fno', 'Last time you ran it, the operator was ' + Math.round(stats.fno.speedup) + '× faster.');
    if (stats.pinn && stats.pinn.loss > 0 && stats.pinn.loss < 10)
      yours('demo-pinn', 'Your last run brought the loss down to ' + Number(stats.pinn.loss).toExponential(1) + '.');
    if (stats.fluid && stats.fluid.fps >= 10)
      yours('demo-fluid', 'It ran at ' + Math.round(stats.fluid.fps) + ' fps on your machine last time.');
  } catch (e) { /* storage blocked or malformed: the chapters read fine without it */ }

  /* ---------- the MRI loop plays only while it is on screen ---------- */
  var mri = document.getElementById('mri');
  if (mri && !reduced) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { if (!window.__motionPaused) mri.play().catch(function () {}); }
        else mri.pause();
      });
    }, { threshold: 0.2 }).observe(mri);
  }

  addEventListener('resize', measure);
  addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  if (document.readyState !== 'loading') { startLenis(); measure(); }
  else document.addEventListener('DOMContentLoaded', function () { startLenis(); measure(); });
})();
