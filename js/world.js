/* world.js - the shared overlay where the buddy and the toys live.

   Two full-viewport transparent canvases sandwich the page content:
   #world-front (z 60, above cards) and #world-back (z 0, behind cards),
   so the buddy can still duck behind a card and peek over it. Everything
   is drawn with an orthographic camera in *viewport pixel* space
   (world y up: worldY = H - screenY).

   Platform rectangles are cached in DOCUMENT coordinates and converted
   to screen space with plain arithmetic each frame. The old version
   called getBoundingClientRect on every card every frame, which both
   thrashed layout and made the buddy slide off cards while scrolling. */

import * as THREE from 'three';

export const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

const PLATFORM_SEL = '.demo, .proj-card, .tl-card, .stat, .heart-card, .smiley-wrap, .polaroid';

function makeLayer(id, zBehind) {
  const canvas = document.createElement('canvas');
  canvas.id = id;
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    canvas.remove();
    return null;
  }
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe9d9c2, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(-.5, 1, .9); scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfd8ff, .5); fill.position.set(.6, -.2, .5); scene.add(fill);
  return { canvas, renderer, scene };
}

export function createWorld() {
  const front = makeLayer('world-front');
  if (!front) return null;                       // no WebGL: page works without the overlay
  const back = makeLayer('world-back');

  const world = {
    W: innerWidth, H: innerHeight,
    scrollY: window.scrollY || 0,
    scrollDelta: 0,
    mx: innerWidth / 2, my: innerHeight / 2,
    TOUCH: matchMedia('(pointer: coarse)').matches,
    front, back,
    camera: new THREE.OrthographicCamera(0, innerWidth, innerHeight, 0, .1, 2000),
    tickers: [],
    plats: [],            // doc-space: {left, right, topDoc, el, kind}
    dynPlats: [],         // screen-space, refilled each frame by toys: {left, right, top, kind:'toy', toy}
    noGo: [],             // doc-space rects the buddy must not loiter over (contact links, CTAs)
    needRender: true,
  };
  world.camera.position.set(0, 0, 500);

  /* ---- resize ---- */
  let lastW = innerWidth;
  function resize() {
    world.W = innerWidth; world.H = innerHeight;
    for (const l of [front, back]) {
      l.renderer.setSize(world.W, world.H, false);
    }
    world.camera.right = world.W;
    world.camera.top = world.H;
    world.camera.updateProjectionMatrix();
    if (innerWidth !== lastW) {                 // real layout change, not URL-bar churn
      lastW = innerWidth;
      world.refreshPlatforms();
    }
    world.needRender = true;
  }
  addEventListener('resize', resize);
  resize();

  /* ---- platform cache (document space) ---- */
  world.refreshPlatforms = function () {
    const sy = window.scrollY || 0;
    world.plats.length = 0;
    for (const el of document.querySelectorAll(PLATFORM_SEL)) {
      const r = el.getBoundingClientRect();
      if (r.width < 40) continue;
      let kind = 'card';
      if (el.matches('.heart-card')) kind = 'heart';
      else if (el.matches('.smiley-wrap')) kind = 'smiley';
      else if (el.matches('.polaroid')) kind = 'polaroid';
      world.plats.push({ left: r.left, right: r.right, topDoc: r.top + sy, el, kind });
    }
    world.noGo.length = 0;
    for (const el of document.querySelectorAll('.contact-list, .cta')) {
      const r = el.getBoundingClientRect();
      world.noGo.push({ left: r.left, right: r.right, topDoc: r.top + sy, botDoc: r.bottom + sy });
    }
  };
  world.refreshPlatforms();
  setInterval(world.refreshPlatforms, 3500);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(world.refreshPlatforms);
  addEventListener('load', world.refreshPlatforms);

  /* Screen-space view of all platforms currently near the viewport,
     plus the floor (screen bottom) and any toy platforms. */
  world.screenPlats = function () {
    const out = [];
    const sy = world.scrollY, H = world.H;
    for (const p of world.plats) {
      const top = p.topDoc - sy;
      if (top < -80 || top > H + 80) continue;
      out.push({ left: p.left, right: p.right, top, el: p.el, kind: p.kind });
    }
    for (const d of world.dynPlats) out.push(d);
    out.push({ left: 0, right: world.W, top: H - 4, el: null, kind: 'floor' });
    return out;
  };

  /* ---- input ---- */
  addEventListener('pointermove', e => { world.mx = e.clientX; world.my = e.clientY; }, { passive: true });

  /* ---- hit proxies: invisible fixed buttons that give toys/buddy
         real pointer events without a full-screen pointer-eating canvas ---- */
  world.makeProxy = function (cls, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hit-proxy ' + cls;
    b.setAttribute('aria-label', label);
    document.body.appendChild(b);
    return b;
  };
  world.placeProxy = function (el, cx, cy, r) {
    el.style.left = (cx - r) + 'px';
    el.style.top = (cy - r) + 'px';
    el.style.width = (r * 2) + 'px';
    el.style.height = (r * 2) + 'px';
  };

  /* ---- layer helpers ---- */
  world.setLayer = function (obj, layer) {
    (layer === 'back' ? back : front).scene.add(obj);   // add() reparents
  };

  /* ---- main loop ---- */
  world.addTicker = fn => world.tickers.push(fn);

  let last = performance.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') last = performance.now();
  });

  let t = 0;
  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > .05) dt = .05;
    t += dt;

    const sy = window.scrollY || 0;
    world.scrollDelta = sy - world.scrollY;
    world.scrollY = sy;
    if (world.scrollDelta !== 0) world.needRender = true;

    world.dynPlats.length = 0;
    for (const fn of world.tickers) fn(t, dt);

    if (world.needRender) {
      front.renderer.render(front.scene, world.camera);
      back.renderer.render(back.scene, world.camera);
      world.needRender = false;
    }
  }
  requestAnimationFrame(frame);

  return world;
}
