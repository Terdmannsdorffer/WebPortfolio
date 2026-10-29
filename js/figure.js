/* figure.js - the heart on the stage.

   Data: the average four-chamber heart of Rodero et al. 2021 (Zenodo 4593739,
   CC BY 4.0), a mesh built from CT scans for electro-mechanics simulations,
   prepared by tools/heartfibres.py:
   - heart.bin   its surface, ~40k triangles; every vertex knows its region, its
                 universal ventricular coordinates (Z apex->base, RHO endo->epi)
                 and when the electrical wave reaches it
   - fibres.bin  streamlines of the mesh's rule-based fibre field, traced
                 through the ventricular wall

   The beat is a kinematic model, not a simulation, but each term is something a
   ventricle really does: the activation wave runs from the apex up and out, then
   the base pulls toward the apex, the wall thickens inward (more inside than
   outside), and apex and base twist in opposite directions, the wringing of
   systole. The atria squeeze first; everything above the valve plane is carried
   by it.

   The page scrolls the stage through states (setProgress). A scan plane square
   to the long axis rises from the apex: below it the muscle is shown as its
   fibres, above it as the organ. */

import * as THREE from 'three';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) && !isNaN(parseFloat(params.get(k)))) ? parseFloat(params.get(k)) : d;
const REST = { x: num('rx', -Math.PI / 2), yaw: num('yaw', 0), tilt: num('tilt', -0.22) };

// sorted Rodero tags 1..24 -> region: 0 LV, 1 RV, 2 LA, 3 RA, 4 artery, 5 valve, 6 vein
const REGION_OF = [0, 1, 2, 3, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6];
const TINT = ['#8f2129', '#8a2027', '#9c2c31', '#9a2a30', '#d8a898', '#b76d6d', '#6f7ba8'].map(c => new THREE.Color(c));

// stage states; cut is the scan plane's height along the long axis (0 apex, 1 base)
export const STATES = [
  { cut: -0.35, fibres: 0.0, wire: 0.07, yaw: 0.00, lift: 0.00, zoom: 1.00 },   // the organ
  { cut: 0.52, fibres: 1.0, wire: 0.05, yaw: 0.50, lift: 0.04, zoom: 1.05 },    // half muscle, half fibres
  { cut: 1.85, fibres: 1.0, wire: 0.00, yaw: 1.25, lift: 0.08, zoom: 1.10 },    // the fibres alone
  { cut: -0.35, fibres: 0.0, wire: 0.07, yaw: -0.62, lift: 0.00, zoom: 0.96 }   // the organ again, from its left side
];

/* ---------------- shared GLSL: one beat, used by every pass */
const BEAT = /* glsl */`
uniform float uPhase;           // 0..1 through one cardiac cycle
uniform float uAmp;             // motion amplitude (0 under reduced motion)
uniform vec3 uApex, uAxis, uLA, uRA;
uniform float uLen;

float vsys(float t) { return smoothstep(0.24, 0.44, t) * (1.0 - smoothstep(0.54, 0.76, t)); }
float asys(float t) { return smoothstep(0.05, 0.13, t) * (1.0 - smoothstep(0.15, 0.30, t)); }

vec3 rotAbout(vec3 v, vec3 k, float a) {          // Rodrigues
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

vec3 beat(vec3 p, float region, float z, float rho) {
  float s = vsys(uPhase) * uAmp;
  float descent = s * 0.13 * uLen;                // the base travels ~13% of the long axis
  if (region < 1.5) {                             // ventricles
    vec3 rel = p - uApex;
    float along = dot(rel, uAxis);
    vec3 radial = rel - along * uAxis;
    radial = rotAbout(radial, uAxis, s * mix(0.20, -0.07, z));   // apex one way, base the other
    radial *= 1.0 - s * mix(0.15, 0.06, rho);                    // the wall thickens inward
    along -= descent * z;                                       // base toward apex
    return uApex + along * uAxis + radial;
  }
  // everything else hangs off the valve plane: carried fully at the base, less higher up
  vec3 q = p;
  if (region > 1.5 && region < 3.5) {             // atria squeeze toward their centres first
    vec3 c = region < 2.5 ? uLA : uRA;
    q = c + (q - c) * (1.0 - 0.10 * asys(uPhase) * uAmp);
  }
  vec3 rel = q - uApex;
  float along = dot(rel, uAxis);
  float w = 1.0 - smoothstep(-0.02 * uLen, 0.55 * uLen, along - uLen);
  vec3 radial = rotAbout(rel - along * uAxis, uAxis, -0.07 * s * w);
  return uApex + (along - descent * w) * uAxis + radial;
}
`;

/* ---------------- data */
function reader(buf) {
  const dv = new DataView(buf);
  let o = 0;
  return {
    tag() { const s = String.fromCharCode(...new Uint8Array(buf, o, 4)); o += 4; return s; },
    u32() { const v = dv.getUint32(o, true); o += 4; return v; },
    f32(n = 1) { const a = []; for (let i = 0; i < n; i++) { a.push(dv.getFloat32(o, true)); o += 4; } return n === 1 ? a[0] : a; },
    arr(Type, n) {
      const bytes = n * Type.BYTES_PER_ELEMENT;
      const a = o % Type.BYTES_PER_ELEMENT ? new Type(buf.slice(o, o + bytes)) : new Type(buf, o, n);
      o += bytes; return a;
    }
  };
}

async function loadHeart(url) {
  const r = reader(await (await fetch(url)).arrayBuffer());
  if (r.tag() !== 'HRT2') throw new Error('bad heart.bin');
  const nV = r.u32(), nT = r.u32(); r.f32();
  const frame = { apex: r.f32(3), axis: r.f32(3), len: r.f32(), la: r.f32(3), ra: r.f32(3) };
  const q = r.arr(Int16Array, nV * 3);
  const idx = r.arr(nV <= 65535 ? Uint16Array : Uint32Array, nT * 3);
  const tag = r.arr(Uint8Array, nV), z = r.arr(Uint8Array, nV), rho = r.arr(Uint8Array, nV), act = r.arr(Uint8Array, nV);

  const pos = new Float32Array(nV * 3), col = new Float32Array(nV * 3);
  const aRegion = new Float32Array(nV), aZ = new Float32Array(nV), aRho = new Float32Array(nV), aAct = new Float32Array(nV);
  for (let i = 0; i < nV * 3; i++) pos[i] = q[i] / 32767;
  for (let i = 0; i < nV; i++) {
    const reg = REGION_OF[tag[i]] ?? 0, c = TINT[reg];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    aRegion[i] = reg; aZ[i] = z[i] / 255; aRho[i] = rho[i] / 255; aAct[i] = act[i] === 255 ? 9 : act[i] / 255;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aRegion', new THREE.BufferAttribute(aRegion, 1));
  g.setAttribute('aZ', new THREE.BufferAttribute(aZ, 1));
  g.setAttribute('aRho', new THREE.BufferAttribute(aRho, 1));
  g.setAttribute('aAct', new THREE.BufferAttribute(aAct, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return { geo: g, frame };
}

async function loadFibres(url, keepEvery = 1) {
  const r = reader(await (await fetch(url)).arrayBuffer());
  if (r.tag() !== 'FIB1') throw new Error('bad fibres.bin');
  const nL = r.u32(), nP = r.u32(); r.f32();
  const off = r.arr(Uint32Array, nL + 1);
  const q = r.arr(Int16Array, nP * 3);
  const z = r.arr(Uint8Array, nP), rho = r.arr(Uint8Array, nP), side = r.arr(Uint8Array, nP);

  const pos = new Float32Array(nP * 3), aZ = new Float32Array(nP), aRho = new Float32Array(nP),
        aSide = new Float32Array(nP), aS = new Float32Array(nP), aSeed = new Float32Array(nP);
  const index = [];
  for (let i = 0; i < nP * 3; i++) pos[i] = q[i] / 32767;
  for (let l = 0; l < nL; l++) {
    const a = off[l], b = off[l + 1], seed = Math.random();
    let s = 0;
    for (let i = a; i < b; i++) {
      if (i > a) s += Math.hypot(pos[i * 3] - pos[i * 3 - 3], pos[i * 3 + 1] - pos[i * 3 - 2], pos[i * 3 + 2] - pos[i * 3 - 1]);
      aZ[i] = z[i] / 255; aRho[i] = rho[i] / 255; aSide[i] = side[i]; aS[i] = s; aSeed[i] = seed;
      if (l % keepEvery === 0 && i + 1 < b) index.push(i, i + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aZ', new THREE.BufferAttribute(aZ, 1));
  g.setAttribute('aRho', new THREE.BufferAttribute(aRho, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
  g.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
  g.setIndex(index);
  return g;
}

/* ---------------- materials */
// the beat in the vertex stage; optionally the activation front and the scan ring in the fragment stage
function withBeat(material, uniforms, { glow = false, ring = false } = {}) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aRegion, aZ, aRho, aAct;
varying float vAct;
varying vec3 vWorld;
${BEAT}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
// ventricles: activation from the apical endocardium up and out, taken from the rest
// position so the front is continuous (the stored 8-bit times band)
float zc = clamp(dot(transformed - uApex, uAxis) / uLen, 0.0, 1.0);
vAct = aRegion < 1.5 ? 0.16 + 0.075 * zc + 0.02 * aRho : aAct;
transformed = beat(transformed, aRegion, aZ, aRho);
vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    if (!glow && !ring) return;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uPhase, uGlow, uActStretch;
uniform vec4 uCut;
varying float vAct;
varying vec3 vWorld;`)
      .replace(glow ? '#include <emissivemap_fragment>' : '#include <color_fragment>', `${glow ? '#include <emissivemap_fragment>' : '#include <color_fragment>'}
{
  float edge = exp(-pow((dot(uCut.xyz, vWorld) + uCut.w) / 0.012, 2.0));   // where the scan plane cuts
  ${glow ? `float dt = uPhase - vAct * uActStretch;
  float front = exp(-pow(dt / 0.0075, 2.0));                                  // the depolarisation front
  float lit = smoothstep(0.0, 0.02, dt) * (1.0 - smoothstep(0.30, 0.50, dt));
  totalEmissiveRadiance += uGlow * (front * vec3(1.0, 0.80, 0.70) * 0.95 + lit * vec3(0.10, 0.016, 0.012));
  totalEmissiveRadiance += edge * vec3(1.0, 0.82, 0.74) * 2.2;` : `diffuseColor.rgb += edge * vec3(1.0, 0.82, 0.74) * 0.9; diffuseColor.a = max(diffuseColor.a, edge * 0.85);`}
}`);
  };
  return material;
}

function fibreMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
attribute float aZ, aRho, aSide, aS, aSeed;
uniform float uTime, uFibres, uActStretch;
uniform vec4 uCut;
varying vec3 vCol;
${BEAT}
void main() {
  vec3 p = beat(position, aSide, aZ, aRho);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * world;
  gl_Position = projectionMatrix * mv;
  float below = smoothstep(0.03, -0.03, dot(uCut.xyz, world.xyz) + uCut.w);  // only where the muscle is cut away
  float act = (0.16 + 0.075 * aZ + 0.02 * aRho) * uActStretch;
  float flash = exp(-pow((uPhase - act) / 0.03, 2.0));
  float k = fract(aS * 2.2 - uTime * 0.16 + aSeed);          // a slow pulse running along each fibre
  float pulse = smoothstep(0.0, 0.04, k) * (1.0 - smoothstep(0.04, 0.22, k));
  float depth = clamp(1.0 + (mv.z + 8.0) * 0.55, 0.25, 1.0); // nearer fibres brighter
  vec3 endo = vec3(1.0, 0.80, 0.74), epi = vec3(0.90, 0.20, 0.22);
  vCol = mix(endo, epi, aRho) * below * uFibres * depth * (0.11 + 0.34 * pulse + 0.7 * flash);
}`,
    fragmentShader: /* glsl */`
varying vec3 vCol;
void main() { gl_FragColor = vec4(vCol, 1.0); }`
  });
}

/* ---------------- the stage */
export function initFigure(canvas, { reduced = false, lite = false, base = './' } = {}) {
  if (!canvas) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.3, 8);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffe4da, 0x140a0a, 0.55));
  const key = new THREE.DirectionalLight(0xfff1e8, 2.2); key.position.set(3.5, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff8f7e, 2.6); rim.position.set(-5, 2.5, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8a94ff, 0.55); fill.position.set(-4, -3, 4); scene.add(fill);

  const group = new THREE.Group(), yawG = new THREE.Group(), pivot = new THREE.Group();
  pivot.rotation.x = REST.x; yawG.rotation.y = REST.yaw;
  yawG.add(pivot); group.add(yawG); scene.add(group);

  const U = {
    uPhase: { value: 0 }, uAmp: { value: reduced ? 0 : 1 }, uTime: { value: 0 },
    uApex: { value: new THREE.Vector3() }, uAxis: { value: new THREE.Vector3(0, 0, 1) },
    uLA: { value: new THREE.Vector3() }, uRA: { value: new THREE.Vector3() }, uLen: { value: 1 },
    uGlow: { value: reduced ? 0 : 1 }, uActStretch: { value: 1.6 }, uFibres: { value: 0 },
    uCut: { value: new THREE.Vector4(0, 0, 1, 99) }
  };
  // the scan plane: the solid keeps what is above it, the glass shell what is below
  const cutAbove = new THREE.Plane(), cutBelow = new THREE.Plane();
  const solidMat = withBeat(new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.48, metalness: 0, side: THREE.DoubleSide,
    clearcoat: 0.35, clearcoatRoughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ff9a8a'),
    clippingPlanes: [cutAbove]
  }), U, { glow: true });
  const wireMat = withBeat(new THREE.MeshBasicMaterial({
    color: 0xffc1b4, wireframe: true, transparent: true, opacity: 0.07, depthWrite: false, clippingPlanes: [cutAbove]
  }), U);
  const shellMat = withBeat(new THREE.MeshBasicMaterial({
    color: 0xff8a7a, transparent: true, opacity: 0.02, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [cutBelow]
  }), U, { ring: true });
  const fibreMat = fibreMaterial(U);

  let solid = null, wire = null, shell = null, fibres = null, ready = false;
  const showWire = params.get('wire') !== '0';
  loadHeart(base + 'heart.bin').then(({ geo, frame }) => {
    U.uApex.value.fromArray(frame.apex); U.uAxis.value.fromArray(frame.axis).normalize();
    U.uLA.value.fromArray(frame.la); U.uRA.value.fromArray(frame.ra); U.uLen.value = frame.len;
    solid = new THREE.Mesh(geo, solidMat); pivot.add(solid);
    shell = new THREE.Mesh(geo, shellMat); shell.renderOrder = 3; pivot.add(shell);
    if (showWire) { wire = new THREE.Mesh(geo, wireMat); pivot.add(wire); }
    ready = true;
    // the fibres only show once the page scrolls into the wall; fetch them after first paint
    const later = window.requestIdleCallback || (f => setTimeout(f, 600));
    later(() => loadFibres(base + 'fibres.bin', lite ? 2 : 1).then(g => {
      fibres = new THREE.LineSegments(g, fibreMat);
      fibres.renderOrder = 2; fibres.frustumCulled = false;
      pivot.add(fibres);
    }).catch(err => console.error(err)));
  }).catch(err => console.error(err));

  /* layout: where the figure sits in its canvas */
  let w = 0, h = 0;
  const layout = { x: 0, y: 0, scale: 1 };
  function resize() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch || (cw === w && ch === h)) return;
    w = cw; h = ch;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const aspect = w / h;
    layout.scale = aspect < 0.8 ? 0.9 : 1.08;
    layout.x = 0; layout.y = aspect < 0.8 ? 0.15 : 0.02;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const mouse = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  if (matchMedia('(hover: hover)').matches) {
    addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; }, { passive: true });
  }
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  // blended stage state, eased toward the scroll target
  const st = { ...STATES[0] }, goal = { ...STATES[0] };
  // tAnim is the figure's own clock: it stops while the visitor has paused the motion, but the
  // scroll states keep easing, so the figure always matches the text beside it
  let boost = 0, phase = 0.9, rate = 52, shown = false, paused = false, tAnim = 0;
  const onShown = [];
  const tmpN = new THREE.Vector3(), tmpP = new THREE.Vector3();

  function blendTo(p) {
    const i = Math.max(0, Math.min(STATES.length - 2, Math.floor(p)));
    const f = Math.max(0, Math.min(1, p - i)), e = f * f * (3 - 2 * f);
    for (const k in goal) goal[k] = STATES[i][k] + (STATES[i + 1][k] - STATES[i][k]) * e;
  }

  function frame(t, dt) {
    const ease = reduced ? 1 : Math.min(1, dt * 4);
    for (const k in st) st[k] += (goal[k] - st[k]) * ease;
    cur.x += (mouse.x - cur.x) * Math.min(1, dt * 2.2);
    cur.y += (mouse.y - cur.y) * Math.min(1, dt * 2.2);

    boost = Math.max(0, boost - dt / 4.5);
    rate = 52 + 60 * boost;
    if (!paused) tAnim += dt;
    if (!reduced && !paused) phase = (phase + dt * rate / 60) % 1;
    U.uPhase.value = reduced ? 0.0 : phase;
    U.uTime.value = tAnim;
    U.uFibres.value = st.fibres;
    wireMat.opacity = st.wire;
    if (wire) wire.visible = st.wire > 0.004;

    group.scale.setScalar(layout.scale * st.zoom);
    group.position.set(layout.x, layout.y + st.lift, 0);
    group.rotation.y = (reduced ? 0 : Math.sin(tAnim * 0.21) * 0.18) + cur.x * 0.45 + st.yaw;
    group.rotation.x = 0.05 - cur.y * 0.25;
    group.rotation.z = REST.tilt;
    group.updateMatrixWorld(true);

    // the scan plane in world space: square to the long axis, st.cut of the way from apex to base
    tmpN.copy(U.uAxis.value).transformDirection(pivot.matrixWorld);
    tmpP.copy(U.uApex.value).addScaledVector(U.uAxis.value, st.cut * U.uLen.value).applyMatrix4(pivot.matrixWorld);
    cutAbove.setFromNormalAndCoplanarPoint(tmpN, tmpP);
    cutBelow.copy(cutAbove).negate();
    U.uCut.value.set(cutAbove.normal.x, cutAbove.normal.y, cutAbove.normal.z, cutAbove.constant);
    if (shell) shell.visible = st.cut > -0.2;
  }

  return {
    pace() { boost = 1; },
    bpm() { return Math.round(rate); },
    setProgress(p) { blendTo(p); },
    setPhase(p) { phase = p; },
    setPaused(p) { paused = p; },
    onReady(f) { if (shown) f(); else onShown.push(f); },   // after the first frame with the heart in it
    render(t, dt) {
      if (!visible || !ready) return;
      frame(t, dt);
      renderer.render(scene, camera);
      if (!shown) { shown = true; onShown.forEach(f => f()); }
    }
  };
}
