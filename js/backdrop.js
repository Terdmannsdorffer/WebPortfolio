/* backdrop.js - what fills the dark behind the page.

   A flat near-black field reads as empty, so this paints a very faint
   layer over it, sitting above .sheet (which is opaque by design, so it
   can slide over the hero).

   It has to animate without costing anything, because it is on screen
   while you scroll. The trick: the contour field is drawn ONCE into two
   tiles whose fields are exactly periodic, and then nothing is ever
   repainted. Both tiles drift continuously in opposite directions and at
   different rates, and because their periods differ the pattern where
   they cross never settles - so the background is always moving, but the
   only per-frame work is two transforms, which the compositor applies.

   data-backdrop on <body> (or ?bg= on the URL) picks the kind:

     contours  two drifting fields of iso-lines (default)
     points    a sparse scatter of sample points at three depths
     wash      broad, barely-there variation in the lighting
     off       nothing

   Grain is separate (data-grain, pure CSS) and composes with any of them.
   Under prefers-reduced-motion the drift stops; scroll parallax remains. */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* Iso-lines of a scalar field, marching squares, into an offscreen canvas.
   Every vertical frequency is snapped to a multiple of the tile's own base
   frequency, which is what lets the tile repeat with no visible seam. */
function contourTile(W, H, period, cell, levels, phase, alphaLo, alphaHi) {
  const k = 0.055;
  const rowsP = Math.round(period / cell);
  const TH = rowsP * cell;
  const rows = rowsP + Math.ceil(H / cell) + 1;
  const cols = Math.ceil(W / cell) + 1;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = TH + H;
  const g = cv.getContext('2d');

  const w0 = 2 * Math.PI / (TH * k);
  const snap = f => Math.max(1, Math.round(f / w0)) * w0;
  const f1 = snap(0.83), f2 = snap(1.31), f3 = snap(0.57), f4 = snap(0.19);

  const v = new Float32Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) {
    const wy = j * cell * k;
    for (let i = 0; i <= cols; i++) {
      const wx = i * cell * k + phase;
      v[j * (cols + 1) + i] =
          Math.sin(wx * 1.15) * Math.cos(wy * f1)
        + 0.55 * Math.sin(wx * 0.7 + wy * f2)
        + 0.4 * Math.cos(wx * 0.45 - wy * f3)
        + 0.5 * Math.sin(wy * f4 + wx * 0.11);
    }
  }

  g.lineWidth = 1;
  const half = (levels.length - 1) / 2;
  for (let li = 0; li < levels.length; li++) {
    const L = levels[li];
    const path = new Path2D();
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = v[j * (cols + 1) + i];
        const b = v[j * (cols + 1) + i + 1];
        const d = v[(j + 1) * (cols + 1) + i + 1];
        const e = v[(j + 1) * (cols + 1) + i];
        let idx = 0;
        if (a > L) idx |= 8;
        if (b > L) idx |= 4;
        if (d > L) idx |= 2;
        if (e > L) idx |= 1;
        if (idx === 0 || idx === 15) continue;
        const x0 = i * cell, y0 = j * cell;
        const eT = () => [x0 + cell * (L - a) / (b - a), y0];
        const eR = () => [x0 + cell, y0 + cell * (L - b) / (d - b)];
        const eB = () => [x0 + cell * (L - e) / (d - e), y0 + cell];
        const eL = () => [x0, y0 + cell * (L - a) / (e - a)];
        const seg = (p1, p2) => { path.moveTo(p1[0], p1[1]); path.lineTo(p2[0], p2[1]); };
        switch (idx) {
          case 1: case 14: seg(eL(), eB()); break;
          case 2: case 13: seg(eB(), eR()); break;
          case 3: case 12: seg(eL(), eR()); break;
          case 4: case 11: seg(eT(), eR()); break;
          case 6: case 9: seg(eT(), eB()); break;
          case 7: case 8: seg(eT(), eL()); break;
          case 5: seg(eT(), eL()); seg(eB(), eR()); break;
          case 10: seg(eT(), eR()); seg(eL(), eB()); break;
        }
      }
    }
    // the middle contour reads brightest, the outer ones fall away
    const w = half > 0 ? 1 - Math.abs(li - half) / half : 1;
    g.strokeStyle = 'rgba(255,216,206,' + (alphaLo + (alphaHi - alphaLo) * w).toFixed(3) + ')';
    g.stroke(path);
  }
  return { cv, TH };
}

export function initBackdrop({ mode = 'contours' } = {}) {
  if (mode === 'off') return null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============ default: two drifting contour fields, transforms only ============ */
  if (mode === 'contours') {
    const wrap = document.createElement('div');
    wrap.className = 'backdrop';
    wrap.setAttribute('aria-hidden', 'true');
    document.body.appendChild(wrap);

    // two layers: different periods, different drift directions and rates, so
    // where they cross the pattern keeps changing and never repeats visibly
    const LAYERS = [
      { period: 1080, cell: 30, levels: 9, span: 1.2, drift: 7, par: 0.30, sway: 0, lo: 0.040, hi: 0.095, phase: 0 },
      { period: 1440, cell: 38, levels: 5, span: 1.0, drift: -4.5, par: 0.16, sway: 26, lo: 0.030, hi: 0.055, phase: 3.7 }
    ];
    const built = [];

    function build() {
      const W = innerWidth, H = innerHeight;
      wrap.textContent = '';
      built.length = 0;
      for (const L of LAYERS) {
        const period = Math.round(clamp(H * (L.period / 900), L.period * 0.7, L.period * 1.5));
        const levels = [];
        for (let i = 0; i < L.levels; i++) {
          levels.push(-L.span + (2 * L.span) * (i / (L.levels - 1)));
        }
        const pad = L.sway * 2;
        const { cv, TH } = contourTile(W + pad, H, period, L.cell, levels, L.phase, L.lo, L.hi);
        cv.style.cssText = 'position:absolute;top:0;left:' + (-L.sway) + 'px;width:' + (W + pad) +
          'px;height:' + cv.height + 'px;will-change:transform';
        wrap.appendChild(cv);
        built.push({ cfg: L, cv, TH, last: '' });
      }
    }

    function place(t) {
      const sy = scrollY || 0;
      for (const b of built) {
        const y = -(((sy * b.cfg.par + (reduced ? 0 : t * b.cfg.drift)) % b.TH) + b.TH) % b.TH;
        const x = b.cfg.sway && !reduced ? Math.sin(t * 0.06 + b.cfg.phase) * b.cfg.sway : 0;
        const tr = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
        if (tr === b.last) continue;
        b.last = tr;
        b.cv.style.transform = tr;
      }
    }

    build();
    const t0 = performance.now();
    place(0);
    if (reduced) {
      addEventListener('scroll', () => place(0), { passive: true });
    } else {
      // one transform per layer per frame: no paint, no layout, no readback
      (function loop(now) {
        requestAnimationFrame(loop);
        if (document.hidden) return;
        place((now - t0) / 1000);
      })(t0);
    }
    addEventListener('resize', () => { build(); place((performance.now() - t0) / 1000); }, { passive: true });
    return { mode, rebuild: build };
  }

  /* ============ the other kinds: a viewport canvas, drawn per frame ============ */
  const c = document.createElement('canvas');
  c.className = 'backdrop';
  c.setAttribute('aria-hidden', 'true');
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  let W = 0, H = 0, sy = scrollY || 0, draw = null, dirty = true, dpr = 1;

  function points(W, H) {
    const n = Math.round(clamp((W * H) / 14000, 60, 190));
    const span = H * 2;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const z = Math.random();
      pts.push({
        x: Math.random() * W, y: Math.random() * span,
        r: 0.7 + z * 1.3, a: 0.06 + z * 0.16,
        ph: Math.random() * Math.PI * 2, sp: 0.35 + z * 0.9
      });
    }
    return function (t, sy) {
      for (const p of pts) {
        const y = ((p.y - sy * p.sp * 0.35) % span + span) % span - H * 0.5;
        if (y < -20 || y > H + 20) continue;
        const tw = 0.75 + 0.25 * Math.sin(t * 0.6 + p.ph);
        ctx.fillStyle = 'rgba(255,226,218,' + (p.a * tw).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
  }

  function wash(W, H) {
    const blobs = [
      { x: 0.18, y: 0.15, r: 0.85, a: 0.05, c: '255,150,135', sx: 0.021, sy: 0.013 },
      { x: 0.82, y: 0.55, r: 1.0, a: 0.036, c: '255,190,175', sx: -0.016, sy: 0.019 },
      { x: 0.5, y: 0.95, r: 0.9, a: 0.03, c: '170,180,255', sx: 0.012, sy: -0.011 }
    ];
    const m = Math.max(W, H);
    return function (t, sy) {
      for (const b of blobs) {
        const px = (b.x + Math.sin(t * b.sx) * 0.06) * W;
        const py = (b.y + Math.cos(t * b.sy) * 0.05) * H - (sy * 0.05) % (H * 1.5);
        const r = b.r * m * 0.55;
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(' + b.c + ',' + b.a + ')');
        g.addColorStop(0.55, 'rgba(' + b.c + ',' + (b.a * 0.28).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + b.c + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    };
  }

  const kinds = { points, wash };
  if (!kinds[mode]) mode = 'points';

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    c.style.height = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw = kinds[mode](W, H);
    dirty = true;
  }
  resize();
  addEventListener('resize', resize, { passive: true });
  addEventListener('scroll', function () { sy = scrollY || 0; dirty = true; }, { passive: true });

  let raf = 0, lastPaint = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    if (reduced && !dirty) return;
    if (now - lastPaint < 50) return;
    dirty = false; lastPaint = now;
    ctx.clearRect(0, 0, W, H);
    draw(reduced ? 0 : now / 1000, sy);
  }
  raf = requestAnimationFrame(frame);
  return { mode, stop() { cancelAnimationFrame(raf); c.remove(); } };
}
