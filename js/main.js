/* main.js - module entry. Two moving parts:
   - hero.js:   the heart in the hero, its own WebGL context
   - scenes.js: the five demo previews, one shared WebGL context
   If WebGL is unavailable the page silently stays static: the hero
   canvas stays blank and every preview shows its CSS backdrop. */

import { initScenes, renderScenes, webglOK } from './scenes.js';
import { initHero } from './hero.js';
import { initSky } from './sky.js';
import { initBackdrop } from './backdrop.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// the occasional light in the background: data-sky on <body> picks the kind,
// ?sky= on the URL overrides it while trying them out
const q = new URLSearchParams(location.search);
// ?fx=off kills every optional effect at once, so a slow machine can be
// bisected in one reload instead of five
const fxOff = q.get('fx') === 'off';
if (fxOff) document.body.dataset.grain = 'off';
const grain = q.get('grain');
if (grain) document.body.dataset.grain = grain;

const skyMode = q.get('sky') || document.body.dataset.sky || 'ecg';
window.__sky = fxOff ? null : initSky({ mode: skyMode });

// the faint layer behind the page: data-backdrop on <body>, ?bg= to try another
window.__bg = fxOff ? null : initBackdrop({ mode: q.get('bg') || document.body.dataset.backdrop || 'contours' });

if (!fxOff && webglOK()) {
  document.documentElement.classList.add('webgl');
  initScenes();
  const hero = initHero(document.getElementById('heroCanvas'), { reduced });

  if (hero) {
    const heroEl = document.getElementById('hero');
    // click anywhere in the hero that isn't a link or button = pace the heart
    heroEl.addEventListener('click', e => {
      if (e.target.closest('a, button')) return;
      hero.pace();
    });
    const paceBtn = document.getElementById('paceBtn');
    if (paceBtn) paceBtn.addEventListener('click', () => hero.pace());

    // the heart drifts off and fades as the page slides over the hero
    const onScroll = () => {
      const p = scrollY / Math.max(1, heroEl.offsetHeight);
      hero.setScroll(p);
      hero.setFade(1 - p * 1.15);
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const readout = document.getElementById('readout');
    if (readout) setInterval(() => { readout.textContent = hero.bpm() + ' bpm'; }, 250);
  }

  let last = performance.now(), t = 0;
  (function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > .05) dt = .05;
    t += dt;
    if (hero) hero.render(t, dt);
    renderScenes(t, dt, reduced);
  })();
}
