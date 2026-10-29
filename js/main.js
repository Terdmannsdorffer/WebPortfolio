/* main.js - module entry, one render loop for everything that moves:
   - figure.js:   the heart on the stage, its own WebGL context
   - chapters.js: four demo chapters in plain 2D canvas
   - scenes.js:   the optimizer chapter, through one shared WebGL context
   site.js (a plain script) owns scrolling; it publishes window.__stage with
   the figure's scroll state and whether an opaque section covers the stage.
   Without WebGL the page stays readable: the stage and the optimizer stay blank. */

import { initScenes, renderScenes, webglOK } from './scenes.js';
import { initFigure } from './figure.js';
import { initChapters } from './chapters.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const q = new URLSearchParams(location.search);
// ?fx=off: no WebGL and no chapters, to bisect a slow machine in one reload
const fxOff = q.get('fx') === 'off';
const grain = q.get('grain');
if (grain) document.body.dataset.grain = grain;

const stageEl = document.getElementById('stage');
const lite = Math.min(innerWidth, innerHeight) < 700;
const figure = !fxOff && webglOK() ? initFigure(document.getElementById('stageCanvas'), { reduced, lite }) : null;
const chapters = fxOff ? null : initChapters({ reduced });
if (!fxOff && webglOK()) initScenes();

if (figure) {
  document.documentElement.classList.add('webgl');
  figure.onReady(() => stageEl.classList.add('ready'));
  // click anywhere on the stage that isn't a link = pace the heart
  stageEl.addEventListener('click', e => { if (!e.target.closest('a')) figure.pace(); });
  const bpm = document.getElementById('bpm');
  setInterval(() => { bpm.textContent = figure.bpm() + ' bpm'; }, 250);
} else {
  stageEl.querySelector('.stage-cap button').hidden = true;
}

// everything on the page that moves by itself (the beat, the chapters, the MRI loop) stops on
// one switch, for anyone, not only under prefers-reduced-motion (WCAG 2.2.2)
let paused = false;
const motionBtn = document.getElementById('motionBtn');
if (reduced || fxOff) motionBtn.hidden = true;
motionBtn.addEventListener('click', () => {
  paused = !paused;
  window.__motionPaused = paused;
  motionBtn.setAttribute('aria-pressed', String(paused));
  motionBtn.textContent = paused ? 'Play the motion' : 'Pause the motion';
  if (figure) figure.setPaused(paused);
  const mri = document.getElementById('mri');
  if (mri) { if (paused) mri.pause(); else mri.play().catch(() => {}); }
});

let last = performance.now(), t = 0;
(function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  t += dt;
  const st = window.__stage || { progress: 0, covered: false };
  if (figure && !st.covered) {
    figure.setProgress(st.progress);
    figure.render(t, dt);
  }
  if (paused) return;                 // the chapters keep their last frame
  if (chapters) chapters.render(t, dt);
  renderScenes(t, dt, reduced);
})();
