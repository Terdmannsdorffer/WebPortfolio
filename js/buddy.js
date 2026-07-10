/* buddy.js - the little guy who lives on the page.

   Reworked from the original single-file version:
   - platforms come from world.screenPlats(): cached document-space
     rects + arithmetic, so he no longer slides off cards mid-scroll
     and never forces layout in the hot loop.
   - when his card scrolls out of the safe band he ducks away politely
     instead of physics-falling across the viewport (the old mobile bug).
   - petting happens through an invisible fixed <button> that follows
     him, so tapping him no longer also clicks the card underneath,
     and it works with keyboard and touch.
   - the hero toys are platforms and playmates: he hops on them, gets
     bounced when you throw one at him, and pokes them like he pokes
     the heart and the smiley. */

import * as THREE from 'three';

export function initBuddy(world, toys) {
  const { front } = world;

  /* ---- speech bubble ---- */
  const bubble = document.createElement('div');
  bubble.className = 'buddy-bubble';
  bubble.setAttribute('aria-hidden', 'true');   // decorative chatter, keep it out of the a11y tree
  bubble.innerHTML = '<span class="bt"></span><button class="buddy-close" tabindex="-1" title="dismiss message" aria-label="Close this message">×</button>';
  document.body.appendChild(bubble);
  const bubbleText = bubble.querySelector('.bt');
  bubble.querySelector('.buddy-close').addEventListener('click', e => { e.stopPropagation(); hush(); quietT = 6; });

  const heartEl = document.getElementById('heart3d');
  const smileyEl = document.getElementById('smiley3d');

  /* ---- model ---- */
  const guy = new THREE.Group();
  const SWEAT = 0x474652, PANTS = 0x2f2e3b;
  const mat = (c, e = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .6, metalness: 0, ...e });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.32, .5, 6, 14), mat(SWEAT)); torso.position.y = .1; guy.add(torso);
  const head = new THREE.Group(); head.position.y = .78; guy.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(.40, 24, 18), mat(0x8d8478)));
  const faceTex = new THREE.TextureLoader().load('face.webp');
  faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.94, .94), new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false }));
  face.position.set(0, .03, .46); head.add(face);
  function limb(len, c) { const g = new THREE.CapsuleGeometry(.11, len, 5, 10); g.translate(0, -len / 2 - .11, 0); return new THREE.Mesh(g, mat(c)); }
  const legL = limb(.42, PANTS); legL.position.set(-.16, -.18, 0); guy.add(legL);
  const legR = limb(.42, PANTS); legR.position.set(.16, -.18, 0); guy.add(legR);
  const armL = limb(.40, SWEAT); armL.position.set(-.40, .42, 0); guy.add(armL);
  const armR = limb(.40, SWEAT); armR.position.set(.40, .42, 0); guy.add(armR);
  const FOOT = -0.82; guy.position.y = -FOOT;
  const rig = new THREE.Group(); rig.add(guy);
  front.scene.add(rig);

  const TOUCH = world.TOUCH;
  const pickSize = () => innerWidth < 640 ? 62 : innerWidth < 900 ? 78 : 94;
  let SIZE = pickSize(), S = SIZE / 2.0; rig.scale.setScalar(S);
  addEventListener('resize', () => { SIZE = pickSize(); S = SIZE / 2.0; });

  /* ---- pet hit-proxy (fixes tap-through on cards, adds a11y) ---- */
  const petBtn = world.makeProxy('buddy', 'pet the page buddy');
  petBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!rig.visible || behind) return;
    if (['gone', 'peekUp', 'peekHold', 'duck', 'climb', 'fall', 'jump', 'slip'].indexOf(st) >= 0) return;
    pet();
  });
  petBtn.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && rig.visible && !behind) { e.preventDefault(); pet(); }
  });

  /* ---- constants & state ---- */
  const GRAV = 2400, JUMP_V = 860, WALK = 92, TOP_LIMIT = 64, SNAP = 16;
  let px = world.W * .5, feet = 140, vx = WALK, vy = 0, dir = 1;
  let st = 'fall', stT = 0, cur = null, behind = false;   // cur: {el, kind, toy}
  let walkT = 0, actT = 2.0, onstageT = 22 + Math.random() * 24, goneT = 0, holdDur = 2, quietT = 0;
  let peekEl = null, peekTarget = 0, kick = 0, napT = 4, sideSign = 1;
  let touchKind = 'card', touchEl = null, touchToy = null, touchDone = false;
  let waving = false, pokeOnClimb = false, aimEl = null, visitT = 8 + Math.random() * 10;
  let nudgeCd = 0, knockCd = 0;
  let plats = [];

  /* ---- one-time welcome: walk in, wave, tell the visitor what's playable ---- */
  let intro = false, introLine = 0, introScroll = 0;
  try { intro = !sessionStorage.getItem('buddyIntro'); } catch (e) {}
  if (intro) { st = 'introWait'; rig.visible = false; }
  function markIntroDone() {
    intro = false;
    try { sessionStorage.setItem('buddyIntro', '1'); } catch (e) {}
  }

  /* ---- platform helpers (arithmetic only, no layout reads) ---- */
  const findPlat = c => {
    if (!c) return null;
    if (c.kind === 'floor') return plats.find(p => p.kind === 'floor');
    if (c.kind === 'toy') return plats.find(p => p.toy === c.toy);
    return plats.find(p => p.el === c.el);
  };
  const keyOf = p => p ? { el: p.el, kind: p.kind, toy: p.toy } : null;
  const liveTop = el => {
    const p = el ? plats.find(q => q.el === el) : plats.find(q => q.kind === 'floor');
    return p ? p.top : world.H - 4;
  };
  const visibleCards = () => plats.filter(p => p.el && p.top > TOP_LIMIT && p.top < world.H - 90 && (p.right - p.left) > 80);

  /* ---- speech ---- */
  const GREET = ['hi! 👋', 'hey!', 'hi there!', 'hello!', 'keep scrolling 👀', 'nice to see you!'];
  const PEEK_HI = ['peek-a-boo!', 'hi! 👋', 'found me?', 'hey there!', '👋', 'over here!', 'boo!'];
  const CHEER = ['woohoo!', 'yay! 🎉', 'wheee!', 'nailed it!', '✨', 'nice!'];
  const TOYLINES = ['boop!', 'my favorite ✦', 'science!', 'hehe'];
  const KNOCK = ['oof!', 'hey!!', 'whoa!', 'watch it! 😅'];
  const SECTION_LINES = {
    demos: ['these run live!', 'click one, really', 'my experiments ✦'],
    journey: ['all true, promise', 'good times'],
    projects: ['built these!', 'real code, this one'],
    skills: ['my toolbox', 'always learning'],
    contact: ['say hi!', 'he answers fast'],
    now: ['my desk, basically', 'lab days ♥'],
  };
  function greetLine(p) {
    if (p && p.el && Math.random() < .45) {
      const sec = p.el.closest('section');
      const lines = sec && SECTION_LINES[sec.id];
      if (lines) return lines[Math.random() * lines.length | 0];
    }
    return GREET[Math.random() * GREET.length | 0];
  }
  function say(t, think) { if (quietT > 0) return; bubbleText.textContent = t; bubble.classList.toggle('think', !!think); bubble.classList.add('show'); }
  function hush() { bubble.classList.remove('show'); }
  function setBehind(b) {
    if (behind === b) return;
    behind = b;
    world.setLayer(rig, b ? 'back' : 'front');
  }

  function pet() {
    if (intro) markIntroDone();          // they found the interaction on their own
    st = 'pet'; stT = 0; setBehind(false);
    say(['hehe', '🫶', 'hi!', '♥'][Math.random() * 4 | 0]); spawnHeart();
  }
  function spawnHeart() {
    const h = document.createElement('div'); h.className = 'buddy-heart'; h.textContent = '♥';
    h.style.left = px + 'px'; h.style.top = (feet - SIZE * .9) + 'px';
    document.body.appendChild(h); setTimeout(() => h.remove(), 1000);
  }
  function flashCard(el) {
    const cols = ['var(--coral)', 'var(--teal)', 'var(--violet)', 'var(--yellow)', 'var(--blue)', 'var(--pink)'];
    el.style.setProperty('--bflash', cols[Math.random() * cols.length | 0]);
    el.classList.remove('buddy-flash'); void el.offsetWidth; el.classList.add('buddy-flash');
    setTimeout(() => el.classList.remove('buddy-flash'), 650);
  }
  function wobbleCard(el) { el.classList.remove('buddy-wobble'); void el.offsetWidth; el.classList.add('buddy-wobble'); setTimeout(() => el.classList.remove('buddy-wobble'), 480); }
  function findHop() {
    let best = null, bd = 1e9;
    for (const p of plats) {
      const up = feet - p.top; if (up < 26 || up > 150 || p.top < TOP_LIMIT) continue;
      const cx = Math.max(p.left, Math.min(px, p.right)); const dx = Math.abs(cx - px); if (dx > 130) continue;
      const d = dx + up * .5; if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function goGone() { st = 'gone'; rig.visible = false; hush(); setBehind(false); goneT = 5 + Math.random() * 9; }
  function peekBehind(el) {            // duck behind a card, then pop up over the top edge
    peekEl = el; setBehind(true); waving = false;
    const target = liveTop(el) - 14 + SIZE * .45;
    feet = target + 80; peekTarget = target; st = 'peekUp'; stT = 0;
  }
  function emerge() {
    const cards = visibleCards();
    rig.visible = true;
    pokeOnClimb = false;
    if (!cards.length) { setBehind(false); st = 'walk'; cur = { kind: 'floor' }; dir = Math.random() < .5 ? 1 : -1; px = dir > 0 ? 20 : world.W - 20; feet = world.H - 4; onstageT = 14 + Math.random() * 16; aimEl = null; return; }
    let p = null;
    if (aimEl) { p = cards.find(c => c.el === aimEl); aimEl = null; }
    if (p) { pokeOnClimb = true; }
    else {
      const special = cards.filter(c => c.kind === 'heart' || c.kind === 'smiley' || c.kind === 'polaroid');
      if (special.length && Math.random() < .5) { p = special[Math.random() * special.length | 0]; pokeOnClimb = true; }
      else p = cards[Math.random() * cards.length | 0];
    }
    px = Math.max(p.left + 36, Math.min(p.left + (p.right - p.left) * Math.random(), p.right - 36));
    peekBehind(p.el);
  }
  function leave() {
    onstageT = 12 + Math.random() * 16;
    if (cur && cur.el && Math.random() < .7) { peekEl = cur.el; setBehind(true); st = 'duck'; stT = 0; peekTarget = liveTop(peekEl) - 14 + SIZE * .95 + 70; }
    else { st = 'bye'; dir = (px < world.W / 2) ? -1 : 1; vx = dir * WALK * 1.2; setBehind(false); }
  }

  /* ---- no-go zones: never loiter over the contact links or hero CTAs ----
     Only matters while he's floor-walking: the viewport-bottom floor can
     visually overlap those rows when they sit near the bottom of the screen. */
  function noGoZone(x) {
    const floorDoc = world.scrollY + world.H;          // doc-space y of the floor
    for (const z of world.noGo) {
      if (x > z.left - 30 && x < z.right + 30 &&
          z.botDoc > floorDoc - SIZE * 1.7 && z.topDoc < floorDoc + 8) return z;
    }
    return null;
  }
  function toyReactions(dt) {
    nudgeCd -= dt; knockCd -= dt;
    for (const toy of toys) {
      if (!toy.onScreen) continue;
      const ty = toy.y - world.scrollY;
      const dx = toy.x - px, dy = ty - (feet - SIZE * .45);
      const speed = Math.hypot(toy.vx, toy.vy);
      // a thrown toy slams into him: knocked off his feet
      if (knockCd <= 0 && speed > 520 && Math.abs(dx) < toy.r + SIZE * .4 && Math.abs(dy) < toy.r + SIZE * .5 &&
          ['walk', 'sit', 'greet', 'nap', 'cheer'].indexOf(st) >= 0) {
        knockCd = 2.5;
        setBehind(false);
        st = 'slip'; vy = -240; vx = Math.sign(toy.vx || dx || 1) * 150; dir = Math.sign(vx) || 1; cur = null;
        say(KNOCK[Math.random() * KNOCK.length | 0]);
        setTimeout(hush, 900);
        toy.pop(.8);
        toy.vx *= -.3; toy.vy *= -.3;
        continue;
      }
      // walking into a toy nudges it aside
      if (nudgeCd <= 0 && st === 'walk' && Math.abs(dy) < SIZE * .6 && Math.abs(dx) < toy.r + SIZE * .3 && Math.sign(dx) === dir) {
        nudgeCd = 1.2;
        toy.vx += dir * 300; toy.pop(.5);
        if (Math.random() < .4) { say('boop'); setTimeout(hush, 700); }
      }
    }
  }

  /* ---- per-state steps ---- */
  function stepWalk(dt) {
    onstageT -= dt; actT -= dt;
    px += vx * dt;
    if (px < 26) { px = 26; dir = 1; } if (px > world.W - 26) { px = world.W - 26; dir = -1; } vx = dir * WALK;
    const p = findPlat(cur);
    if (!p) { st = 'fall'; vy = 0; cur = null; return; }
    if (!(px > p.left - 6 && px < p.right + 6)) { st = 'fall'; vy = 0; cur = null; return; }
    if (p.top - feet > SNAP) { st = 'fall'; vy = 0; return; }
    if (p.el && (p.top < TOP_LIMIT || p.top > world.H - 24)) { goGone(); return; }   // card scrolled away: duck out politely
    feet = p.top; cur = keyOf(p);
    if (p.kind === 'toy' && p.toy) p.toy.vy += 140 * dt;      // his weight makes the toy bob
    // steer clear of the contact links / CTAs instead of standing on them
    let fleeing = false;
    if (p.kind === 'floor') {
      const z = noGoZone(px);
      if (z) {
        fleeing = true; hush();
        dir = px < (z.left + z.right) / 2 ? -1 : 1;
        vx = dir * WALK * 1.4;
        if (px < 30 || px > world.W - 30) { goGone(); return; }   // boxed in against a wall: duck out
      }
    }
    // notice the cursor passing nearby and wave hello (desktop only)
    if (!TOUCH && !fleeing && actT > .4 && Math.abs(world.mx - px) < SIZE * .85 && Math.abs(world.my - (feet - SIZE * .5)) < SIZE && Math.random() < .05) {
      st = 'greet'; stT = 0; actT = 2 + Math.random() * 2; say(greetLine(p)); return;
    }
    if (onstageT <= 0) { leave(); return; }
    if (actT <= 0 && !fleeing) {
      actT = 1.1 + Math.random() * 2.2; const r = Math.random();
      if ((p.kind === 'heart' || p.kind === 'smiley' || p.kind === 'toy' || p.kind === 'polaroid') && r < .7) {
        st = 'touch'; stT = 0; touchKind = p.kind; touchEl = p.el; touchToy = p.toy || null; touchDone = false;
      }
      else if (r < .14) { st = 'greet'; stT = 0; say(greetLine(p)); }
      else if (r < .34 && p.el) { st = 'touch'; stT = 0; touchKind = p.kind; touchEl = p.el; touchToy = null; touchDone = false; }
      else if (r < .50) { const h = findHop(); if (h) { vy = -JUMP_V; st = 'jump'; cur = null; dir = (h.left + h.right) / 2 > px ? 1 : -1; vx = dir * WALK * 1.4; } }
      else if (r < .66 && p.el) { st = 'sit'; stT = 0; sideSign = dir > 0 ? 1 : -1; }
      else if (r < .76) { dir = -dir; }
      else if (r < .86) { st = 'nap'; stT = 0; napT = 3 + Math.random() * 4; say('Zzz', true); }
      else if (r < .93) { st = 'cheer'; stT = 0; say(CHEER[Math.random() * CHEER.length | 0]); }
    }
  }
  function stepSit(dt) {
    onstageT -= dt; actT -= dt;
    const p = findPlat(cur);
    if (!p || !p.el) { st = 'fall'; vy = 0; return; }
    if (p.top < TOP_LIMIT || p.top > world.H - 24) { goGone(); return; }
    if (p.top - feet > SNAP) { st = 'fall'; vy = 0; return; }
    feet = p.top; cur = keyOf(p);
    if (stT > .8 && Math.abs(world.scrollDelta) > 26 && Math.random() < .3) { slip(); return; }
    if (onstageT <= 0) { leave(); return; }
    if (actT <= 0) {
      actT = 1.5 + Math.random() * 2.5; const r = Math.random();
      if (r < .3) { st = 'walk'; }
      else if (r < .45) { st = 'greet'; stT = 0; say(greetLine(p)); }
      else if (r < .6) { st = 'nap'; stT = 0; napT = 3 + Math.random() * 4; say('Zzz', true); }
      else kick = walkT;
    }
  }
  function slip() { setBehind(true); st = 'slip'; vy = 120; cur = null; say('whoa!'); setTimeout(hush, 700); }
  function stepAir(dt) {
    px += vx * dt;
    if (px < 20) { px = 20; dir = 1; vx = Math.abs(vx); } if (px > world.W - 20) { px = world.W - 20; dir = -1; vx = -Math.abs(vx); }
    const prev = feet; vy += GRAV * dt; feet += vy * dt;
    if (vy > 0) {
      let landed = null;
      for (const p of plats) { if (px > p.left - 6 && px < p.right + 6 && prev <= p.top + SNAP && feet >= p.top) { if (!landed || p.top < landed.top) landed = p; } }
      if (landed) {
        if (behind) { goGone(); return; }
        feet = landed.top; vy = 0; cur = keyOf(landed); vx = dir * WALK; onstageT = Math.max(onstageT, 6);
        if (landed.kind === 'toy' && landed.toy) { landed.toy.vy += 260; landed.toy.pop(.4); }   // lands with a thud
        if (landed.el && Math.random() < .3) { st = 'cheer'; stT = 0; say(CHEER[Math.random() * CHEER.length | 0]); }
        else st = 'walk';
        return;
      }
    }
    if (feet > world.H + 200) { if (behind) { goGone(); return; } feet = -40; vy = 0; px = 20 + Math.random() * (world.W - 40); }
  }
  function stepTouch(dt) {
    const p = findPlat(cur); if (p) feet = p.top;
    if (!touchDone && stT > .22) {
      touchDone = true;
      if (touchKind === 'heart' && heartEl) { heartEl.dispatchEvent(new MouseEvent('click', { bubbles: true })); say('♥', true); }
      else if (touchKind === 'smiley' && smileyEl) { smileyEl.dispatchEvent(new MouseEvent('click', { bubbles: true })); say('wheee'); }
      else if (touchKind === 'toy' && touchToy) { touchToy.pop(1.1); say(TOYLINES[Math.random() * TOYLINES.length | 0]); }
      else if (touchKind === 'polaroid' && touchEl) { wobbleCard(touchEl); say('that’s him!'); }
      else if (touchEl) { Math.random() < .6 ? flashCard(touchEl) : wobbleCard(touchEl); say(['tap!', 'boop', '✦'][Math.random() * 3 | 0]); }
    }
    if (stT > 1.1) { hush(); st = 'walk'; actT = 1 + Math.random() * 1.5; }
  }
  function stepNap(dt) {
    const p = findPlat(cur);
    if (p && p.el) { if (p.top < TOP_LIMIT || p.top > world.H - 24) { goGone(); return; } feet = p.top; }
    const near = Math.abs(world.mx - px) < SIZE * 1.2 && Math.abs(world.my - feet) < SIZE * 1.4;
    if (near || Math.abs(world.scrollDelta) > 20 || stT > napT) { hush(); st = 'walk'; actT = .5 + Math.random(); }
  }
  function stepPeek(dt) {
    if (!peekEl) { goGone(); return; }
    const top = liveTop(peekEl);
    if (top < -40 || top > world.H + 40) { goGone(); return; }
    const headPoke = top - 14 + SIZE * .45;
    if (st === 'peekUp') {
      peekTarget = headPoke; feet += (peekTarget - feet) * Math.min(1, dt * 6);
      if (Math.abs(feet - peekTarget) < 3) { st = 'peekHold'; stT = 0; holdDur = 1.8 + Math.random() * 2.0; waving = true; say(PEEK_HI[Math.random() * PEEK_HI.length | 0]); }
    } else if (st === 'peekHold') {
      feet = headPoke;
      if (stT > holdDur) { hush(); waving = false; if (pokeOnClimb || Math.random() < .55) { st = 'climb'; setBehind(false); } else { st = 'duck'; peekTarget = headPoke + 70; } stT = 0; }
    } else if (st === 'climb') {
      feet += (top - feet) * Math.min(1, dt * 5);
      if (Math.abs(feet - top) < 3) {
        feet = top; cur = keyOf(plats.find(p => p.el === peekEl) || null); vx = dir * WALK; onstageT = 20 + Math.random() * 24;
        if (pokeOnClimb && cur && (cur.kind === 'heart' || cur.kind === 'smiley' || cur.kind === 'polaroid')) {
          st = 'touch'; stT = 0; touchKind = cur.kind; touchEl = cur.el; touchToy = null; touchDone = false; pokeOnClimb = false;
        } else {
          st = Math.random() < .5 ? 'sit' : 'walk'; if (st === 'sit') sideSign = dir > 0 ? 1 : -1;
        }
      }
    } else if (st === 'duck') {
      feet += (peekTarget - feet) * Math.min(1, dt * 5);
      if (Math.abs(feet - peekTarget) < 4) goGone();
    }
  }

  /* ---- pose & placement (unchanged personality) ---- */
  function pose(dt) {
    const ph = walkT * 9; let look = 0;
    legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0);
    armL.rotation.set(0, 0, 0); armR.rotation.set(0, 0, 0);
    rig.rotation.z += (0 - rig.rotation.z) * .18;
    rig.rotation.x += ((st === 'sit' ? -.12 : 0) - rig.rotation.x) * .15;
    if (st === 'walk' || st === 'bye' || st === 'introWalk') {
      legL.rotation.x = Math.sin(ph) * .7; legR.rotation.x = -Math.sin(ph) * .7;
      armL.rotation.x = -Math.sin(ph) * .5; armR.rotation.x = Math.sin(ph) * .5;
      rig.rotation.y += (dir * .18 - rig.rotation.y) * .2; look = .12;
    } else if (st === 'sit') {
      const sw = Math.sin(walkT * 2) * .12;
      legL.rotation.x = .30 + sw; legL.rotation.z = .05;
      legR.rotation.x = -.18 - sw; legR.rotation.z = -.05;
      armL.rotation.x = .2; armL.rotation.z = .1;
      armR.rotation.x = .2; armR.rotation.z = -.1;
      const ty = Math.max(-.4, Math.min(.4, (world.mx - px) / 200));
      head.rotation.y += (ty - head.rotation.y) * .1;
      head.rotation.z += (Math.sin(walkT * 1.3) * .05 - head.rotation.z) * .1;
      head.rotation.x += (.08 - head.rotation.x) * .1;
      rig.rotation.y += (0 - rig.rotation.y) * .1; look = 0;
    } else if (st === 'fall' || st === 'jump' || st === 'slip') {
      legL.rotation.x = -.5; legR.rotation.x = .35; armL.rotation.x = -1.6; armR.rotation.x = -1.6; armR.rotation.z = -.2; armL.rotation.z = .2;
      rig.rotation.y += (dir * .12 - rig.rotation.y) * .2;
    } else if (st === 'greet' || st === 'introTalk') {
      legL.rotation.x *= .8; legR.rotation.x *= .8; armL.rotation.x = 0; armR.rotation.z = -2.1; armR.rotation.x = Math.sin(walkT * 11) * .5;
      head.rotation.z = Math.sin(walkT * 4) * .05; rig.rotation.y += (0 - rig.rotation.y) * .2;
    } else if (st === 'pet') {
      const w = Math.sin(walkT * 22);
      armL.rotation.z = .4 + w * .6; armR.rotation.z = -.4 - w * .6; armL.rotation.x = -.8; armR.rotation.x = -.8;
      legL.rotation.x = Math.sin(walkT * 16) * .2; legR.rotation.x = -Math.sin(walkT * 16) * .2;
      head.rotation.z = Math.sin(walkT * 16) * .12; rig.rotation.y += (0 - rig.rotation.y) * .3;
    } else if (st === 'touch') {
      legL.rotation.x *= .8; legR.rotation.x *= .8; armR.rotation.z = 0; armR.rotation.x = 1.2; armL.rotation.x = .2;
      rig.rotation.y += (dir * .25 - rig.rotation.y) * .25; head.rotation.x += (.2 - head.rotation.x) * .2;
    } else if (st === 'nap') {
      legL.rotation.x = .35; legR.rotation.x = .35; armL.rotation.x = .2; armR.rotation.x = .2;
      head.rotation.z += (.45 - head.rotation.z) * .1; head.rotation.x += (.06 - head.rotation.x) * .1; rig.rotation.y += (0 - rig.rotation.y) * .1;
    } else if (st === 'cheer') {
      armL.rotation.z = -2.4 + Math.sin(walkT * 16) * .15; armL.rotation.x = -.2;
      armR.rotation.z = 2.4 - Math.sin(walkT * 16) * .15; armR.rotation.x = -.2;
      legL.rotation.x = -.2; legR.rotation.x = .2;
      head.rotation.z = Math.sin(walkT * 16) * .1; rig.rotation.y += (0 - rig.rotation.y) * .2;
    } else { // peek family
      legL.rotation.x = .2; legR.rotation.x = .2; rig.rotation.y += (0 - rig.rotation.y) * .2;
      if (st === 'peekHold' && waving) {
        armL.rotation.x = -.2; armL.rotation.z = -2.15;
        armR.rotation.x = -.2; armR.rotation.z = 2.0 + Math.sin(walkT * 13) * .4;
        head.rotation.z = Math.sin(walkT * 4) * .06; head.rotation.x += (-.05 - head.rotation.x) * .1;
        head.rotation.y = Math.sin(walkT * 2) * .22;
      } else {
        armL.rotation.x = -1.4; armR.rotation.x = -1.4; armL.rotation.z = .3; armR.rotation.z = -.3;
        if (st === 'peekHold') head.rotation.y = Math.sin(walkT * 1.5) * .5;
      }
    }
    if (look > 0) {
      const hy = feet - SIZE * .72;
      const ty = Math.max(-.6, Math.min(.6, (world.mx - px) / 180));
      const tx = Math.max(-.3, Math.min(.35, (world.my - hy) / 240));
      head.rotation.y += (ty - head.rotation.y) * look;
      head.rotation.x += (tx - head.rotation.x) * look;
      head.rotation.z *= .85;
    }
  }
  function place() {
    let drawFeet = feet, drawX = px, sx = 1, sy = 1;
    const sitAmt = Math.max(0, Math.min(1, rig.rotation.x / -0.12));
    if (sitAmt > 0.001) drawFeet = feet + 30 * sitAmt;
    else if (st === 'nap') drawFeet = feet + 14;
    if (st === 'pet') { const b = Math.abs(Math.sin(walkT * 16)); sy = 1 + b * .06; sx = 1 - b * .04; }
    const bob = (st === 'walk' || st === 'bye' || st === 'introWalk') ? Math.abs(Math.sin(walkT * 9)) * 3
              : (st === 'cheer') ? Math.abs(Math.sin(walkT * 8)) * 10 : 0;
    rig.scale.set(S * sx, S * sy, S);
    rig.position.set(drawX, world.H - (drawFeet - bob), 0);
  }

  /* ---- ticker ---- */
  world.addTicker((t, dt) => {
    walkT += dt; stT += dt; if (quietT > 0) quietT -= dt;
    plats = world.screenPlats();

    // every so often, go play with the heart or the smiley if one is on screen
    visitT -= dt;
    if (visitT <= 0 && (st === 'walk' || st === 'sit' || st === 'nap')) {
      visitT = 16 + Math.random() * 14;
      const sp = visibleCards().find(c => c.kind === 'heart' || c.kind === 'smiley');
      if (sp) { aimEl = sp.el; hush(); goGone(); goneT = 1.5 + Math.random() * 2; }
    }

    if (rig.visible) toyReactions(dt);

    switch (st) {
      case 'walk': stepWalk(dt); break;
      case 'sit': stepSit(dt); break;
      case 'fall': case 'jump': case 'slip': stepAir(dt); break;
      case 'touch': stepTouch(dt); break;
      case 'nap': stepNap(dt); break;
      case 'greet': if (stT > 2.6) { hush(); st = 'walk'; actT = 1 + Math.random() * 1.5; } break;
      case 'cheer': if (stT > 1.5) { hush(); st = 'walk'; actT = 1 + Math.random() * 1.5; } break;
      case 'pet': if (stT > 1.5) { hush(); st = 'walk'; actT = 1 + Math.random(); } break;
      case 'peekUp': case 'peekHold': case 'duck': case 'climb': stepPeek(dt); break;
      case 'bye': { onstageT = 99; px += vx * dt; if (px < 14 || px > world.W - 14) goGone(); } break;
      case 'gone': goneT -= dt; if (goneT <= 0) emerge(); break;
      case 'introWait':
        if (stT > 1.4) {
          rig.visible = true; px = -30; feet = world.H - 4; dir = 1;
          cur = { kind: 'floor' }; st = 'introWalk'; stT = 0;
        }
        break;
      case 'introWalk':
        feet = world.H - 4;
        px += WALK * 1.5 * dt;
        if (px >= Math.min(world.W * .42, 470)) { st = 'introTalk'; stT = 0; introLine = 0; say('hi! I live on this page 👋'); }
        break;
      case 'introTalk':
        feet = world.H - 4;
        if (stT > 2.3 && introLine < 1) { introLine = 1; say('drag the toys, they bounce ✦'); }
        if (stT > 4.7 && introLine < 2) { introLine = 2; say('you can pet me too 🫶'); }
        if (stT > 7.0) { hush(); markIntroDone(); st = 'walk'; actT = 2; onstageT = 24; }
        break;
    }

    // a visitor who scrolls off during the intro has seen enough: wrap it up
    if (intro && (st === 'introWalk' || st === 'introTalk')) {
      introScroll += Math.abs(world.scrollDelta);
      if (introScroll > 900) { hush(); markIntroDone(); st = 'walk'; cur = { kind: 'floor' }; feet = world.H - 4; actT = 1.5; }
    }

    pose(dt); place();

    if (rig.visible) {
      world.needRender = true;
      if (behind) { petBtn.hidden = true; }
      else {
        petBtn.hidden = false;
        world.placeProxy(petBtn, px, feet - SIZE * .5, SIZE * .48);
      }
    } else {
      petBtn.hidden = true;
    }

    if (bubble.classList.contains('show')) {
      bubble.style.left = Math.max(66, Math.min(world.W - 66, px)) + 'px';
      bubble.style.top = Math.max(34, feet - SIZE * .95 - 6) + 'px';
    }
  });
}
