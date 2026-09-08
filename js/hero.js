/* hero.js - the heart in the hero.

   The surface comes from a real four-chamber heart: the average shape of
   Rodero et al. 2021 (Zenodo 4593738, CC BY 4.0), a statistical shape
   model built from CT scans of healthy adults, extracted from the
   tetrahedral simulation mesh and decimated to ~40k triangles
   (heart.bin, see the README). Regions keep their labels, so chambers,
   arteries and veins are tinted separately.

   Rendered as a lit solid with a faint wireframe over it: the object is
   literally a simulation mesh, which is the point. The beat is a global
   contraction with a little twist, paced by clicking. */

import * as THREE from 'three';

// region tint by tag id (see the tag map printed by heartmesh.py)
const REGION = {
  muscle:  new THREE.Color('#8f2129'),
  atrium:  new THREE.Color('#9c2c31'),
  artery:  new THREE.Color('#d8a898'),
  vein:    new THREE.Color('#6f7ba8'),
  valve:   new THREE.Color('#b76d6d')
};
const TAG_KIND = ['muscle', 'muscle', 'atrium', 'atrium', 'artery', 'artery', 'valve', 'valve', 'valve', 'valve',
                  'vein', 'vein', 'vein', 'vein', 'vein', 'vein', 'vein', 'vein', 'vein', 'vein', 'vein', 'vein', 'vein', 'vein'];
// resting orientation: the scan's z axis (superior) becomes up, then a yaw picks the
// anterior view and a tilt in the screen plane drops the apex down-right.
// ?rx=&yaw=&tilt= on the URL override them while tuning.
const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) && !isNaN(parseFloat(params.get(k)))) ? parseFloat(params.get(k)) : d;
const REST = { x: num('rx', -Math.PI / 2), yaw: num('yaw', 0), tilt: num('tilt', -0.22) };

const smooth = x => x * x * (3 - 2 * x);
// systole occupies the first ~40% of the cycle: quick contraction, slower release
const beatAt = ph => {
  const s = ph / 0.42;
  return s < 0 || s >= 1 ? 0 : s < 0.35 ? smooth(s / 0.35) : 1 - smooth((s - 0.35) / 0.65);
};

async function loadHeart(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'HRT1') throw new Error('bad heart.bin');
  const nV = dv.getUint32(4, true), nT = dv.getUint32(8, true), scale = dv.getFloat32(12, true);
  let off = 28;
  const q = new Int16Array(buf, off, nV * 3); off += nV * 6;
  const idx = nV <= 65535 ? new Uint16Array(buf, off, nT * 3) : new Uint32Array(buf, off, nT * 3);
  off += nT * 3 * (nV <= 65535 ? 2 : 4);
  const tag = new Uint8Array(buf, off, nV);
  // positions are quantised to the unit cube (scale = the original half-extent in mm, unused here)
  void scale;
  const pos = new Float32Array(nV * 3);
  for (let i = 0; i < nV * 3; i++) pos[i] = q[i] / 32767;
  const col = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const c = REGION[TAG_KIND[tag[i]] || 'muscle'];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

export function initHero(canvas, { reduced = false } = {}) {
  if (!canvas) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.3, 8);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xffe4da, 0x140a0a, 0.55));
  const key = new THREE.DirectionalLight(0xfff1e8, 2.2); key.position.set(3.5, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff8f7e, 2.6); rim.position.set(-5, 2.5, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8a94ff, 0.55); fill.position.set(-4, -3, 4); scene.add(fill);

  const group = new THREE.Group();              // layout + interaction
  const yawG = new THREE.Group();               // which side faces the camera
  const pivot = new THREE.Group();              // scan axes -> y up
  pivot.rotation.x = REST.x;
  yawG.rotation.y = REST.yaw;
  yawG.add(pivot);
  group.add(yawG);
  scene.add(group);

  const solidMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.48, metalness: 0,
    clearcoat: 0.35, clearcoatRoughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ff9a8a'),
    flatShading: false
  });
  const wireMat = new THREE.MeshBasicMaterial({ color: 0xffc1b4, wireframe: true, transparent: true, opacity: 0.07, depthWrite: false });
  let solid = null, wire = null, ready = false;

  const showWire = params.get('wire') !== '0';
  loadHeart('./heart.bin').then(geo => {
    solid = new THREE.Mesh(geo, solidMat);
    pivot.add(solid);
    if (showWire) {                    // a second pass over the same triangles
      wire = new THREE.Mesh(geo, wireMat);
      pivot.add(wire);
    }
    ready = true; dirty = true;
  }).catch(err => console.error(err));

  const mouse = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  const layout = { x: 0, y: 0, scale: 1 };
  let boost = 0, phase = 0, visible = true, dirty = true, scrollFade = 1, scrollP = 0, baseAlpha = 1, cleared = false, rate = 58;

  /* ---- layout: the heart sits right of the headline on wide screens,
     above/behind it on narrow ones ---- */
  let w = 0, h = 0;
  const mobile = Math.min(innerWidth, innerHeight) < 700;
  function resize() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch || (cw === w && ch === h)) return;
    w = cw; h = ch;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const aspect = w / h;
    if (aspect >= 1.15) {
      const k = Math.min(1, Math.max(0, (aspect - 1.15) / 0.45));
      layout.x = 1.65 - 0.2 * k + Math.max(0, aspect - 1.6) * 0.45;
      layout.y = 0.05;
      layout.scale = 1.05 + 0.2 * k;
      baseAlpha = 1;
    } else if (aspect >= 0.8) {
      layout.x = 0.85; layout.y = 0.35; layout.scale = 1.0; baseAlpha = 0.9;
    } else {
      layout.x = 0; layout.y = 1.14; layout.scale = 0.66; baseAlpha = 0.9;
    }
    dirty = true;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  if (!mobile) {
    addEventListener('pointermove', e => {
      mouse.x = e.clientX / innerWidth - 0.5;
      mouse.y = e.clientY / innerHeight - 0.5;
    }, { passive: true });
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  function place(t, beat) {
    const s = layout.scale * (1 - 0.3 * scrollP);
    group.scale.setScalar(s);
    group.position.set(layout.x - scrollP * 0.4, layout.y + scrollP * 1.8, 0);
    group.rotation.y = Math.sin(t * 0.25) * 0.3 + cur.x * 0.55 + scrollP * 1.1 + beat * 0.05;
    group.rotation.x = 0.05 - cur.y * 0.3 + scrollP * 0.25;
    group.rotation.z = REST.tilt + Math.sin(t * 0.19) * 0.03;
    if (solid) {
      // contraction: the wall thickens inward, the long axis shortens a little
      const sq = 1 - 0.075 * beat, sy = 1 - 0.035 * beat;
      solid.scale.set(sq, sq, sy);
      if (wire) wire.scale.copy(solid.scale);
    }
  }

  const api = {
    pace() { boost = 1; },
    bpm() { return Math.round(rate); },
    setFade(f) { scrollFade = f; },
    setScroll(p) { scrollP = Math.max(0, Math.min(1.2, p)); },
    render(t, dt) {
      if (!visible || !ready) return;
      if (reduced) {
        if (!dirty) return;
        dirty = false;
        place(0.9, 0);
        renderer.render(scene, camera);
        return;
      }
      const alpha = baseAlpha * Math.max(0, Math.min(1, scrollFade));
      if (alpha <= 0.002) {
        if (!cleared) { renderer.clear(); cleared = true; }
        return;
      }
      cleared = false;
      boost = Math.max(0, boost - dt / 4.5);
      rate = 58 + 64 * boost;
      phase = (phase + dt * rate / 60) % 1;
      const beat = beatAt(phase);
      solidMat.opacity = alpha; solidMat.transparent = alpha < 1;
      if (wire) wireMat.opacity = 0.07 * alpha;

      cur.x += (mouse.x - cur.x) * Math.min(1, dt * 2.2);
      cur.y += (mouse.y - cur.y) * Math.min(1, dt * 2.2);
      place(t, beat);
      renderer.render(scene, camera);
    }
  };
  return api;
}
