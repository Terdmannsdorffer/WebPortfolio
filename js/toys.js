/* toys.js - the hero playground. Instead of abstract floating candy
   geometry, the hero has little objects from Tomás's actual work:
   a beating heart (cardiac PINNs), a GPU die (CUDA / tiny LMs), a
   nabla (PDEs), a tiny neural net, a coffee mug, and a wave tile
   (Burgers). They hang on soft springs in document space: you can
   drag and throw them, they bump each other, and the buddy treats
   them as platforms and playmates. */

import * as THREE from 'three';
import { PALETTE, candyMat, heartGeometry } from './scenes.js';

const SPRING = 16, DAMP = 5.2, MAX_LEASH = 520;

/* ---------- little models, all ~radius-1 primitive builds ---------- */

function buildHeartToy() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(heartGeometry(.5), candyMat(PALETTE.coral, { roughness: .3 }));
  m.scale.setScalar(.62);
  g.add(m);
  let phase = 0;
  return {
    group: g,
    update(t, dt, ex) {
      phase += dt * (2.6 + ex * 5);
      const lub = Math.pow(Math.max(0, Math.sin(phase)), 10);
      m.scale.setScalar(.62 * (1 + .1 * lub * (1 + ex)));
    }
  };
}

function buildGpuToy() {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, .14), candyMat(PALETTE.violet, { roughness: .5 }));
  g.add(slab);
  const die = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .1), candyMat(PALETTE.yellow, { roughness: .35 }));
  die.position.set(.4, .05, .12);
  g.add(die);
  const fan = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .1, 10), candyMat(PALETTE.ink));
  hub.rotation.x = Math.PI / 2;
  fan.add(hub);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.3, .1, .03), candyMat(0xfffdf7, { roughness: .6 }));
    blade.position.x = .19;
    const holder = new THREE.Group();
    holder.rotation.z = i * Math.PI / 2;
    holder.add(blade);
    fan.add(holder);
  }
  fan.position.set(-.42, .05, .14);
  g.add(fan);
  for (let i = 0; i < 6; i++) {
    const pin = new THREE.Mesh(new THREE.BoxGeometry(.09, .16, .06), candyMat(PALETTE.yellow, { roughness: .4 }));
    pin.position.set(-.72 + i * .29, -.66, 0);
    g.add(pin);
  }
  let spin = 0;
  return {
    group: g,
    update(t, dt, ex) {
      spin += dt * (3 + ex * 26);
      fan.rotation.z = spin;
    }
  };
}

function buildNablaToy() {
  const outer = new THREE.Shape();
  outer.moveTo(-1, .9); outer.lineTo(1, .9); outer.lineTo(0, -1.05); outer.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-.48, .55); hole.lineTo(0, -.5); hole.lineTo(.48, .55); hole.closePath();
  outer.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(outer, { depth: .3, bevelEnabled: true, bevelThickness: .06, bevelSize: .06, bevelSegments: 2 });
  geo.center();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, candyMat(PALETTE.blue, { roughness: .4 })));
  return { group: g, update() {} };
}

function buildNetToy() {
  const g = new THREE.Group();
  const layers = [[-.8, [-.45, .45]], [0, [-.72, 0, .72]], [.8, [-.45, .45]]];
  const cols = [PALETTE.teal, PALETTE.yellow, PALETTE.coral];
  const nodes = [];
  const pts = [];
  layers.forEach(([x, ys], li) => {
    ys.forEach(y => {
      const n = new THREE.Mesh(new THREE.SphereGeometry(.17, 14, 10), candyMat(cols[li], { roughness: .35 }));
      n.position.set(x, y, 0);
      n.userData.li = li;
      g.add(n);
      nodes.push(n);
    });
  });
  for (const a of nodes) for (const b of nodes) {
    if (b.userData.li === a.userData.li + 1) pts.push(a.position, b.position);
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
  g.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: .4 })));
  return {
    group: g,
    update(t, dt, ex) {
      // a forward pass ripples through the layers
      const ph = (t * (1.1 + ex * 3)) % 3;
      for (const n of nodes) {
        const k = Math.max(0, 1 - Math.abs(ph - n.userData.li - .5) * 2);
        n.scale.setScalar(1 + k * (.45 + ex * .5));
      }
    }
  };
}

function buildMugToy() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.52, .46, .85, 20), candyMat(PALETTE.pink, { roughness: .45 }));
  g.add(body);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(.46, .46, .04, 20), candyMat(0x5a3a28, { roughness: .8 }));
  coffee.position.y = .43;
  g.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.28, .08, 10, 18), candyMat(PALETTE.pink, { roughness: .45 }));
  handle.position.x = .58;
  g.add(handle);
  return { group: g, update() {} };
}

function buildWaveToy() {
  const geo = new THREE.PlaneGeometry(1.9, 1.3, 16, 10);
  const count = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: .5, side: THREE.DoubleSide
  }));
  mesh.rotation.x = -.85;
  const g = new THREE.Group();
  g.add(mesh);
  const pos = geo.attributes.position, col = geo.attributes.color;
  const a = new THREE.Color(PALETTE.teal), b = new THREE.Color(PALETTE.coral);
  return {
    group: g,
    update(t, dt, ex) {
      const sp = 1 + ex * 3;
      for (let i = 0; i < count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const z = .16 * Math.sin(x * 3.4 - t * 2.2 * sp) * Math.cos(y * 2.6 + t * 1.1 * sp);
        pos.setZ(i, z);
        const k = THREE.MathUtils.clamp((z + .18) / .36, 0, 1);
        col.setXYZ(i, a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k);
      }
      pos.needsUpdate = col.needsUpdate = true;
      geo.computeVertexNormals();
    }
  };
}

/* ---------- placement ---------- */

function anchorSlots(world) {
  // Anchors hang around the polaroid on desktop; on narrow screens
  // (polaroid hidden) a small set floats in the strip under the CTAs.
  const hero = document.querySelector('section.hero');
  const pol = document.getElementById('polaroid');
  const sy = window.scrollY || 0;
  if (pol && getComputedStyle(pol).display !== 'none') {
    const r = pol.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + sy + r.height / 2;
    return [
      [cx - r.width * .96, cy - r.height * .42],
      [cx + r.width * .78, cy - r.height * .55],
      [cx + r.width * .92, cy + r.height * .18],
      [cx - r.width * .88, cy + r.height * .34],
      [cx - r.width * .55, cy - r.height * .68],
      [cx + r.width * .55, cy + r.height * .62],
    ];
  }
  const r = hero.getBoundingClientRect();
  const top = r.top + sy;
  const y = top + r.height - 62;      // inside the hero's extra bottom padding, clear of the CTAs
  return [
    [world.W * .18, y],
    [world.W * .5, y - 12],
    [world.W * .82, y],
  ];
}

/* ---------- the toy system ---------- */

export function initToys(world) {
  const small = world.W < 980;
  const defs = [
    { name: 'heart', build: buildHeartToy, r: 34, label: 'a little beating heart' },
    { name: 'nabla', build: buildNablaToy, r: 30, label: 'a nabla operator' },
    { name: 'net', build: buildNetToy, r: 36, label: 'a tiny neural network' },
    { name: 'gpu', build: buildGpuToy, r: 36, label: 'a GPU card' },
    { name: 'mug', build: buildMugToy, r: 28, label: 'a coffee mug' },
    { name: 'wave', build: buildWaveToy, r: 34, label: 'a wave tile' },
  ].slice(0, small ? 3 : 6);

  const toys = defs.map((d, i) => {
    const built = d.build();
    const r = d.r * (small ? .8 : 1);
    built.group.scale.setScalar(r);
    built.group.position.z = -80;                // toys render behind the buddy
    world.front.scene.add(built.group);
    const hit = world.makeProxy('toy', 'play with ' + d.label + ' (drag to throw)');
    const toy = {
      name: d.name, group: built.group, anim: built.update, hit, r,
      x: 0, y: 0, vx: 0, vy: 0, homeX: 0, homeY: 0,
      rotY: Math.random() * .6 - .3, rotVY: (Math.random() - .5) * .5,
      rotZ: 0, rotVZ: 0,
      bobPh: Math.random() * Math.PI * 2, bobSp: .6 + Math.random() * .5,
      grabbed: false, excite: 0, onScreen: false, ridden: false,
    };
    toy.pop = (kick = 1) => {
      toy.excite = Math.min(1.6, toy.excite + kick);
      toy.rotVZ += (Math.random() - .5) * 9 * kick;
    };
    return toy;
  });

  function layout(first) {
    const slots = anchorSlots(world);
    toys.forEach((toy, i) => {
      const s = slots[i % slots.length];
      toy.homeX = s[0]; toy.homeY = s[1];
      if (first) { toy.x = toy.homeX; toy.y = toy.homeY; }
    });
  }
  layout(true);
  addEventListener('resize', () => layout(false));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layout(false));
  addEventListener('load', () => layout(false));

  /* ---- dragging ---- */
  for (const toy of toys) {
    let offX = 0, offY = 0, downT = 0, downX = 0, downY = 0, lastX = 0, lastY = 0, lastT = 0;
    toy.hit.addEventListener('pointerdown', e => {
      e.preventDefault();
      toy.hit.setPointerCapture(e.pointerId);
      toy.hit.classList.add('dragging');
      const dy = e.clientY + world.scrollY;
      offX = toy.x - e.clientX; offY = toy.y - dy;
      toy.grabbed = true;
      downT = performance.now(); downX = e.clientX; downY = e.clientY;
      lastX = e.clientX; lastY = dy; lastT = downT;
      toy.vx = toy.vy = 0;
    });
    toy.hit.addEventListener('pointermove', e => {
      if (!toy.grabbed) return;
      const now = performance.now();
      const dy = e.clientY + world.scrollY;
      toy.x = e.clientX + offX;
      toy.y = dy + offY;
      // clamp inside the viewport while held
      toy.x = Math.max(toy.r, Math.min(world.W - toy.r, toy.x));
      toy.y = Math.max(world.scrollY + toy.r, Math.min(world.scrollY + world.H - toy.r, toy.y));
      const dtm = Math.max(8, now - lastT) / 1000;
      toy.vx = toy.vx * .4 + ((e.clientX - lastX) / dtm) * .6;
      toy.vy = toy.vy * .4 + ((dy - lastY) / dtm) * .6;
      lastX = e.clientX; lastY = dy; lastT = now;
    });
    const release = e => {
      if (!toy.grabbed) return;
      toy.grabbed = false;
      toy.hit.classList.remove('dragging');
      const quick = performance.now() - downT < 260 &&
        Math.abs(e.clientX - downX) < 8 && Math.abs(e.clientY - downY) < 8;
      if (quick) { toy.pop(1); toy.vy -= 320; }    // a tap makes it hop
      toy.rotVZ += toy.vx * .004;
    };
    toy.hit.addEventListener('pointerup', release);
    toy.hit.addEventListener('pointercancel', release);
    toy.hit.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toy.pop(1); toy.vy -= 320; }
    });
  }

  /* ---- physics ---- */
  world.addTicker((t, dt) => {
    let anyVisible = false;
    for (const toy of toys) {
      if (!toy.grabbed) {
        const bobY = Math.sin(t * toy.bobSp + toy.bobPh) * 9;
        const ax = (toy.homeX - toy.x) * SPRING - toy.vx * DAMP;
        const ay = (toy.homeY + bobY - toy.y) * SPRING - toy.vy * DAMP;
        toy.vx += ax * dt; toy.vy += ay * dt;
        toy.x += toy.vx * dt; toy.y += toy.vy * dt;
        // rubber-band leash so a hard throw can't lose a toy
        const dx = toy.x - toy.homeX, dyy = toy.y - toy.homeY;
        const d = Math.hypot(dx, dyy);
        if (d > MAX_LEASH) { toy.x = toy.homeX + dx / d * MAX_LEASH; toy.y = toy.homeY + dyy / d * MAX_LEASH; }
      }
      toy.excite = Math.max(0, toy.excite - dt * .8);
      toy.rotVY *= Math.pow(.5, dt); toy.rotVZ *= Math.pow(.25, dt);
      toy.rotY += toy.rotVY * dt; toy.rotZ += toy.rotVZ * dt;
      toy.rotZ += (0 - toy.rotZ) * Math.min(1, dt * 2);
    }
    // toys bump each other
    for (let i = 0; i < toys.length; i++) for (let j = i + 1; j < toys.length; j++) {
      const a = toys[i], b = toys[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy), min = (a.r + b.r) * .9;
      if (d > 0 && d < min) {
        const nx = dx / d, ny = dy / d, push = (min - d) * .5;
        if (!a.grabbed) { a.x -= nx * push; a.y -= ny * push; a.vx -= nx * 90; a.vy -= ny * 90; }
        if (!b.grabbed) { b.x += nx * push; b.y += ny * push; b.vx += nx * 90; b.vy += ny * 90; }
        if (Math.abs(a.vx - b.vx) + Math.abs(a.vy - b.vy) > 320) { a.pop(.5); b.pop(.5); }
      }
    }
    // draw + platforms + proxies
    for (const toy of toys) {
      const sx = toy.x, syc = toy.y - world.scrollY;
      toy.onScreen = syc > -120 && syc < world.H + 120;
      toy.group.visible = toy.onScreen;
      if (toy.onScreen) {
        anyVisible = true;
        toy.anim(t, dt, toy.excite);
        toy.group.position.x = sx;
        toy.group.position.y = world.H - syc;
        const wob = Math.sin(t * 1.3 + toy.bobPh) * .16;
        toy.group.rotation.set(0, toy.rotY + wob, toy.rotZ);
        const pulse = 1 + toy.excite * .12;
        toy.group.scale.setScalar(toy.r * pulse);
        world.placeProxy(toy.hit, sx, syc, toy.r);
        toy.hit.hidden = false;
        const speed = Math.hypot(toy.vx, toy.vy);
        if (speed < 420 && !toy.grabbed) {
          world.dynPlats.push({
            left: sx - toy.r * .85, right: sx + toy.r * .85,
            top: syc - toy.r * .55, el: null, kind: 'toy', toy
          });
        }
      } else {
        toy.hit.hidden = true;
      }
    }
    if (anyVisible) world.needRender = true;
  });

  return toys;
}
