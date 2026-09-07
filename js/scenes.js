/* scenes.js - the five live demo previews, rendered through ONE shared
   WebGL context.

   Why: phones cap WebGL contexts around 8 and silently kill the oldest.
   Each preview is a plain 2D canvas; one offscreen renderer draws each
   scene and blits it in. Contexts used by all previews together: 1
   (the hero has its own, so the page totals 2). */

import * as THREE from 'three';

export const PALETTE = {
  accent: 0xff5a4e, pale: 0xffc9bd, white: 0xf1efe9,
  grey: 0x8d8d97, slate: 0x3a3a46, cool: 0x7a86ff
};

export function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .45, metalness: 0, ...opts });
}
export function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x14141a, .9));
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(4, 7, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff7a6e, 1.1); rim.position.set(-5, -2, -4); scene.add(rim);
}

const DPR = Math.min(window.devicePixelRatio || 1, 1.75);

let gl = null;          // shared renderer, created lazily
let glW = 0, glH = 0;   // its drawing-buffer size in raw pixels

function ensureRenderer(w, h) {
  if (!gl) {
    gl = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    gl.setPixelRatio(1);            // raw pixels; we do our own dpr math
    gl.setClearColor(0x000000, 0);
    gl.setScissorTest(true);
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
}, { rootMargin: '140px' });

export function createView(el, build, opts = {}) {
  if (!el) return null;
  const ctx = el.getContext('2d');
  if (!ctx) return null;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov || 40, 1, .1, 100);
  const v = {
    el, ctx, scene, camera, active: false, renderedOnce: false,
    w: 0, h: 0, pw: 0, ph: 0, update: null
  };
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

/* Renders every visible view through the shared context and blits it
   onto that view's own 2D canvas. Called once per frame from main.js. */
export function renderScenes(t, dt, reduced) {
  for (const v of views) {
    if (!v.active || !v.pw) continue;
    if (reduced && v.renderedOnce) continue;    // static single frame
    ensureRenderer(v.pw, v.ph);
    gl.setViewport(0, glH - v.ph, v.pw, v.ph);
    gl.setScissor(0, glH - v.ph, v.pw, v.ph);
    gl.clear(true, true, false);
    v.update(t, dt);
    gl.render(v.scene, v.camera);
    v.ctx.clearRect(0, 0, v.pw, v.ph);
    v.ctx.drawImage(gl.domElement, 0, 0, v.pw, v.ph, 0, 0, v.pw, v.ph);
    v.renderedOnce = true;
  }
}

/* ================= 01 PINN: PDE wave surface ================= */
function buildWave(scene, camera) {
  camera.position.set(0, 3.1, 5.6);
  camera.lookAt(0, -.4, 0);
  lights(scene);

  const geo = new THREE.PlaneGeometry(8, 5, 56, 34);
  geo.rotateX(-Math.PI / 2);
  const count = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: .55
  }));
  scene.add(mesh);

  const pos = geo.attributes.position, col = geo.attributes.color;
  const a = new THREE.Color(PALETTE.slate), b = new THREE.Color(PALETTE.accent);

  return t => {
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = .42 * Math.sin(x * 1.4 - t * 1.8) * Math.cos(z * 1.1 + t * .9)
              + .16 * Math.sin(x * 3.1 + t * 1.3);
      pos.setY(i, y);
      const k = THREE.MathUtils.clamp((y + .58) / 1.16, 0, 1);
      col.setXYZ(i, a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k);
    }
    pos.needsUpdate = col.needsUpdate = true;
    geo.computeVertexNormals();
  };
}

/* ================= 02 RAG: documents orbiting a query ================= */
function buildRag(scene, camera) {
  camera.position.set(0, 1.2, 7);
  camera.lookAt(0, 0, 0);
  lights(scene);

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.9, 0),
    mat(PALETTE.accent, { flatShading: true }));
  scene.add(core);

  const cardGeo = new THREE.BoxGeometry(.85, .58, .07);
  const cards = [];
  const rings = [
    { tilt: .45, r: 2.5, n: 4, speed: .55, mat: mat(PALETTE.white, { roughness: .6 }) },
    { tilt: -.65, r: 3.1, n: 4, speed: -.38, mat: mat(PALETTE.grey, { roughness: .6 }) },
  ].map(cfg => {
    const ring = new THREE.Group();
    ring.rotation.x = cfg.tilt;
    for (let i = 0; i < cfg.n; i++) {
      const card = new THREE.Mesh(cardGeo, cfg.mat);
      const a = i / cfg.n * Math.PI * 2;
      card.position.set(Math.cos(a) * cfg.r, 0, Math.sin(a) * cfg.r);
      card.rotation.y = -a + Math.PI / 2;
      ring.add(card);
      cards.push(card);
    }
    ring.userData.speed = cfg.speed;
    scene.add(ring);
    return ring;
  });

  const lpos = new Float32Array(cards.length * 6);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
  scene.add(new THREE.LineSegments(lineGeo,
    new THREE.LineBasicMaterial({ color: PALETTE.white, transparent: true, opacity: .22 })));

  const tmp = new THREE.Vector3();
  return t => {
    core.rotation.y = t * .6;
    core.rotation.x = Math.sin(t * .5) * .3;
    rings.forEach(r => { r.rotation.y = t * r.userData.speed; });
    cards.forEach((c, i) => {
      c.getWorldPosition(tmp);
      lpos[i * 6 + 0] = 0; lpos[i * 6 + 1] = 0; lpos[i * 6 + 2] = 0;
      lpos[i * 6 + 3] = tmp.x; lpos[i * 6 + 4] = tmp.y; lpos[i * 6 + 5] = tmp.z;
    });
    lineGeo.attributes.position.needsUpdate = true;
  };
}

/* ================= 03 FNO: solver vs operator race ================= */
function buildRace(scene, camera) {
  camera.position.set(0, .5, 7);
  camera.lookAt(0, .1, 0);
  lights(scene);

  // left: finite-difference solver, plodding cube by cube
  const cubes = [];
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(.55, .55, .55),
      mat(0xb4b4bd, { flatShading: true }));
    c.position.set(-3.3 + i * .62, -.2, 0);
    scene.add(c);
    cubes.push(c);
  }

  // right: neural operator, one call along an arc
  const comet = new THREE.Mesh(new THREE.SphereGeometry(.3, 20, 14), mat(PALETTE.accent));
  scene.add(comet);
  const trail = [];
  for (let i = 0; i < 5; i++) {
    const tr = new THREE.Mesh(new THREE.SphereGeometry(.3 * (1 - i * .16), 12, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.accent, transparent: true, opacity: .5 - i * .09, roughness: .5 }));
    scene.add(tr);
    trail.push(tr);
  }
  const cometAt = (t, out) => {
    const u = Math.abs(((t * 1.5) % 2) - 1);        // ping-pong 0..1..0
    out.set(1.0 + u * 2.4, -.4 + Math.sin(u * Math.PI) * 1.1, 0);
  };
  const tmp = new THREE.Vector3();

  return t => {
    const active = Math.floor(t * 1.4) % 5;
    cubes.forEach((c, i) => {
      const target = i === active ? 1.45 : 1;
      c.scale.setScalar(c.scale.x + (target - c.scale.x) * .18);
      c.rotation.y += i === active ? .05 : .004;
    });
    cometAt(t, tmp); comet.position.copy(tmp);
    trail.forEach((tr, i) => { cometAt(t - (i + 1) * .045, tmp); tr.position.copy(tmp); });
  };
}

/* ================= 04 Fluid: swirling particles ================= */
function buildFluidPreview(scene, camera) {
  camera.position.set(0, 0, 7.5);
  const Np = 650;
  const pos = new Float32Array(Np * 3);
  const col = new Float32Array(Np * 3);
  const palette = [PALETTE.accent, PALETTE.pale, PALETTE.white, PALETTE.grey, PALETTE.cool]
    .map(c => new THREE.Color(c));
  for (let i = 0; i < Np; i++) {
    pos[i * 3] = (Math.random() - .5) * 9.4;
    pos[i * 3 + 1] = (Math.random() - .5) * 5.4;
    pos[i * 3 + 2] = 0;
    const c = palette[i % palette.length];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: .14, vertexColors: true })));

  return (t, dt) => {
    // two counter-rotating vortices orbiting the centre
    const cx = Math.cos(t * .5) * 1.8, cy = Math.sin(t * .5) * 1.1;
    for (let i = 0; i < Np; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1];
      let dx = x - cx, dy = y - cy, q = dx * dx + dy * dy + .6;
      let vx = -dy / q * 2.4, vy = dx / q * 2.4;
      dx = x + cx; dy = y + cy; q = dx * dx + dy * dy + .6;
      vx += dy / q * 2.4; vy += -dx / q * 2.4;
      pos[i * 3] += vx * dt;
      pos[i * 3 + 1] += vy * dt;
      if (Math.abs(pos[i * 3]) > 5.0) pos[i * 3] *= -.96;
      if (Math.abs(pos[i * 3 + 1]) > 3.0) pos[i * 3 + 1] *= -.96;
    }
    g.attributes.position.needsUpdate = true;
  };
}

/* ================= 05 Optimizers: balls on a loss surface ================= */
function buildOptimPreview(scene, camera) {
  camera.position.set(0, 3.6, 6.4);
  camera.lookAt(0, -.4, 0);
  lights(scene);

  const f = (x, z) => .12 * (x * x + z * z) + .55 * Math.sin(1.5 * x) * Math.cos(1.5 * z) - .45;
  const geo = new THREE.PlaneGeometry(7.5, 7.5, 44, 44);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, n = p.count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const lo = new THREE.Color(PALETTE.slate), hi = new THREE.Color(PALETTE.accent);
  let mn = 1e9, mx = -1e9;
  const hs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    hs[i] = f(p.getX(i), p.getZ(i));
    mn = Math.min(mn, hs[i]); mx = Math.max(mx, hs[i]);
  }
  for (let i = 0; i < n; i++) {
    p.setY(i, hs[i]);
    const k = (hs[i] - mn) / (mx - mn);
    geo.attributes.color.setXYZ(i, lo.r + (hi.r - lo.r) * k, lo.g + (hi.g - lo.g) * k, lo.b + (hi.b - lo.b) * k);
  }
  geo.computeVertexNormals();

  const grp = new THREE.Group();
  scene.add(grp);
  grp.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .6 })));

  const balls = [PALETTE.white, PALETTE.pale, PALETTE.cool].map(c => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(.18, 16, 12), mat(c, { roughness: .3 }));
    grp.add(m);
    return m;
  });

  return t => {
    grp.rotation.y = t * .18;
    balls.forEach((b, i) => {
      const u = (t * .16 + i / 3) % 1;              // spiral descent, looping
      const r = 3.1 * (1 - u) + .12, a = u * 7 + i * 2.1;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      b.position.set(x, f(x, z) + .22, z);
    });
  };
}

/* ================= wiring ================= */
export function initScenes() {
  const builders = { wave: buildWave, rag: buildRag, race: buildRace, fluid: buildFluidPreview, optim: buildOptimPreview };
  document.querySelectorAll('canvas[data-scene]').forEach(el => {
    const b = builders[el.dataset.scene];
    if (b) createView(el, b, { fov: 40 });
  });
}
