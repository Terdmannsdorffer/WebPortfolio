/* scenes.js - WebGL chapter backgrounds, rendered through ONE shared context.

   Why: phones cap WebGL contexts around 8 and silently kill the oldest. Each
   view is a plain 2D canvas; one offscreen renderer draws its scene and blits
   it in. Contexts on the page: this one and the stage's.

   optim  the Optimizer Race demo's bumpy bowl with its four optimizers, the
          same update rules and the same start, racing down the surface */

import * as THREE from 'three';

export const PALETTE = {
  accent: 0xff5a4e, pale: 0xffc9bd, white: 0xf1efe9, slate: 0x6f7ba8, deep: 0x1d2030
};

const DPR = Math.min(window.devicePixelRatio || 1, 1.75);

let gl = null;          // shared renderer, created lazily
let glW = 0, glH = 0;   // its drawing-buffer size in raw pixels

function ensureRenderer(w, h) {
  if (!gl) {
    gl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    gl.setPixelRatio(1);            // raw pixels; we do our own dpr math
    gl.setClearColor(0x000000, 0);
    gl.setScissorTest(true);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
  }
  if (w > glW || h > glH) {
    glW = Math.max(glW, w); glH = Math.max(glH, h);
    gl.setSize(glW, glH, false);
  }
  return gl;
}

export function webglOK() {
  try { ensureRenderer(2, 2); return !!gl; }
  catch (e) { return false; }
}

const views = [];
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    const v = views.find(v => v.el === e.target);
    if (v) v.active = e.isIntersecting;
  }
}, { rootMargin: '60px' });

export function createView(el, build, opts = {}) {
  if (!el) return null;
  const ctx = el.getContext('2d');
  if (!ctx) return null;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 40, 1, 0.1, 100);
  const v = { el, ctx, scene, camera, active: false, renderedOnce: false, w: 0, h: 0, pw: 0, ph: 0, update: null };
  v.update = build(scene, camera, el) || (() => {});
  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    v.w = w; v.h = h;
    v.pw = Math.round(w * DPR); v.ph = Math.round(h * DPR);
    el.width = v.pw; el.height = v.ph;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    ensureRenderer(v.pw, v.ph);
    v.renderedOnce = false;           // re-blit at the new size
  }
  resize();
  new ResizeObserver(resize).observe(el);
  io.observe(el);
  views.push(v);
  return v;
}

/* Renders every visible view through the shared context and blits it onto
   that view's own 2D canvas. Called once per frame from main.js. */
export function renderScenes(t, dt, reduced) {
  for (const v of views) {
    if (!v.active || !v.pw) continue;
    if (reduced && v.renderedOnce) continue;    // static single frame
    ensureRenderer(v.pw, v.ph);
    gl.setViewport(0, glH - v.ph, v.pw, v.ph);
    gl.setScissor(0, glH - v.ph, v.pw, v.ph);
    gl.clear(true, true, false);
    v.update(reduced ? 9 : t, dt);
    gl.render(v.scene, v.camera);
    v.ctx.clearRect(0, 0, v.pw, v.ph);
    v.ctx.drawImage(gl.domElement, 0, 0, v.pw, v.ph, 0, 0, v.pw, v.ph);
    v.renderedOnce = true;
    v.el.closest('.chapter')?.classList.add('live');
  }
}

/* ================= the optimizer race ================= */
const D = 3;                                     // domain x, y in [-D, D], as in the demo
const L = {
  f: (x, y) => 0.15 * (x * x + y * y) + 0.7 * Math.sin(1.5 * x) * Math.cos(1.5 * y),
  gx: (x, y) => 0.3 * x + 1.05 * Math.cos(1.5 * x) * Math.cos(1.5 * y),
  gy: (x, y) => 0.3 * y - 1.05 * Math.sin(1.5 * x) * Math.sin(1.5 * y),
  start: [2.4, -2.3]
};
function optimizers() {          // the demo's update rules, verbatim in behaviour
  return [
    { color: PALETTE.accent, st: {}, step(p, g, lr) { p[0] -= lr * g[0]; p[1] -= lr * g[1]; } },
    { color: PALETTE.white, st: { vx: 0, vy: 0 }, step(p, g, lr) {
      const s = this.st; s.vx = 0.92 * s.vx - lr * g[0]; s.vy = 0.92 * s.vy - lr * g[1]; p[0] += s.vx; p[1] += s.vy; } },
    { color: PALETTE.slate, st: { sx: 0, sy: 0 }, step(p, g, lr) {
      const s = this.st; s.sx = 0.96 * s.sx + 0.04 * g[0] * g[0]; s.sy = 0.96 * s.sy + 0.04 * g[1] * g[1];
      p[0] -= lr * 0.6 * g[0] / (Math.sqrt(s.sx) + 1e-8); p[1] -= lr * 0.6 * g[1] / (Math.sqrt(s.sy) + 1e-8); } },
    { color: PALETTE.pale, st: { mx: 0, my: 0, vx: 0, vy: 0, t: 0 }, step(p, g, lr) {
      const s = this.st, b1 = 0.9, b2 = 0.999; s.t++;
      s.mx = b1 * s.mx + (1 - b1) * g[0]; s.my = b1 * s.my + (1 - b1) * g[1];
      s.vx = b2 * s.vx + (1 - b2) * g[0] * g[0]; s.vy = b2 * s.vy + (1 - b2) * g[1] * g[1];
      const c1 = 1 - Math.pow(b1, s.t), c2 = 1 - Math.pow(b2, s.t);
      p[0] -= lr * 0.8 * (s.mx / c1) / (Math.sqrt(s.vx / c2) + 1e-8); p[1] -= lr * 0.8 * (s.my / c1) / (Math.sqrt(s.vy / c2) + 1e-8); } }
  ];
}

function buildOptim(scene, camera) {
  camera.position.set(0, 6.4, 9.8);
  camera.lookAt(0, -0.9, 0);
  scene.add(new THREE.HemisphereLight(0xffe9e4, 0x101018, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 7, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff7a6e, 1.2); rim.position.set(-6, 2, -5); scene.add(rim);

  // heights scaled so the bowl reads at full bleed
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i <= 60; i++) for (let j = 0; j <= 60; j++) {
    const v = L.f(-D + 2 * D * i / 60, -D + 2 * D * j / 60); lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  const H = (x, y) => (L.f(x, y) - (lo + hi) / 2) * (2.1 / (hi - lo));
  const geo = new THREE.PlaneGeometry(2 * D, 2 * D, 110, 110);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, n = p.count, col = new Float32Array(n * 3);
  const cLo = new THREE.Color(PALETTE.deep), cMid = new THREE.Color(PALETTE.slate), cHi = new THREE.Color(PALETTE.accent), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = -p.getZ(i), h = H(x, y), k = (h + 1.05) / 2.1;
    p.setY(i, h);
    if (k < 0.5) c.copy(cLo).lerp(cMid, k / 0.5); else c.copy(cMid).lerp(cHi, (k - 0.5) / 0.5);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const grp = new THREE.Group();
  grp.position.x = 1.5;                          // the surface sits right of the chapter's copy
  scene.add(grp);
  grp.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 })));
  grp.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd9d2, wireframe: true, transparent: true, opacity: 0.06, depthWrite: false })));

  const MAX = 2400, LR = 0.024;
  // a trail is a thin line plus a dot at every step: WebGL lines are one pixel wide, and the
  // steps are close enough that the dots read as a stroke
  const racers = optimizers().map(o => {
    const pos = new Float32Array(MAX * 3), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setDrawRange(0, 0);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.9 }));
    const dots = new THREE.Points(g, new THREE.PointsMaterial({ color: o.color, size: 3.4 * DPR, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false }));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 12), new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.3, emissive: o.color, emissiveIntensity: 0.4 }));
    grp.add(line, dots, ball);
    return { o, pos, g, ball, p: [0, 0], n: 0 };
  });
  let lap = -1;
  function reset() {
    const fresh = optimizers();
    racers.forEach((r, i) => { r.o.st = fresh[i].st; r.p = L.start.slice(); r.n = 0; r.g.setDrawRange(0, 0); });
  }
  return t => {
    const l = Math.floor(t / 16);
    if (l !== lap) { lap = l; reset(); }
    const steps = Math.min(MAX - 1, Math.floor((t % 16) * 60 * 2));    // two steps per frame, as in the demo
    racers.forEach(r => {
      while (r.n < steps) {
        r.o.step(r.p, [L.gx(r.p[0], r.p[1]), L.gy(r.p[0], r.p[1])], LR);
        r.p[0] = Math.max(-D, Math.min(D, r.p[0])); r.p[1] = Math.max(-D, Math.min(D, r.p[1]));
        r.pos.set([r.p[0], H(r.p[0], r.p[1]) + 0.04, -r.p[1]], r.n * 3);
        r.n++;
      }
      r.g.attributes.position.needsUpdate = true;
      r.g.setDrawRange(0, r.n);
      r.ball.position.set(r.p[0], H(r.p[0], r.p[1]) + 0.09, -r.p[1]);
    });
    grp.rotation.y = -0.5 + Math.sin(t * 0.07) * 0.35;
  };
}

/* ================= wiring ================= */
export function initScenes() {
  const builders = { optim: buildOptim };
  document.querySelectorAll('canvas[data-scene]').forEach(el => {
    const b = builders[el.dataset.scene];
    if (b) createView(el, b, { fov: 38 });
  });
}
