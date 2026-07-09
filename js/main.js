/* main.js - module entry. Wires up the three moving parts:
   - scenes.js: heart / smiley / demo previews, one shared WebGL context
   - world.js + toys.js + buddy.js: the overlay playground
   If WebGL is unavailable the page silently stays static (emoji
   fallbacks remain visible, all content readable). */

import { initScenes, renderScenes, webglOK } from './scenes.js';
import { createWorld } from './world.js';
import { initToys } from './toys.js';
import { initBuddy } from './buddy.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (webglOK()) {
  document.documentElement.classList.add('webgl');
  initScenes();

  let last = performance.now(), t = 0;
  (function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > .05) dt = .05;
    t += dt;
    renderScenes(t, dt, reduced);
  })();

  if (!reduced) {
    const world = createWorld();
    if (world) {
      const toys = initToys(world);
      initBuddy(world, toys);
    }
  }
}
