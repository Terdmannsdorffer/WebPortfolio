/* backdrop.js - what fills the dark behind the page.

   A flat near-black field reads as empty, so this paints a very faint
   layer over it. Like js/sky.js it is one fixed canvas blended with
   `screen`: the colours are light, so they lift the black and leave
   near-white text alone. That is also the only way to sit above .sheet,
   which is opaque by design (it slides over the hero).

   Everything here parallaxes with the scroll, which is the point: the
   background should keep giving you something new as the page moves.

   data-backdrop on <body> (or ?bg= on the URL) picks the kind:

     contours  iso-lines of a slowly morphing scalar field
     points    a sparse scatter of sample points at three depths
     wash      broad, barely-there variation in the lighting
     off       nothing

   Grain is separate (data-grain, pure CSS) and composes with any of them.
   Under prefers-reduced-motion each kind paints one still frame. */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function initBackdrop({ mode = 'contours' } = {}) {
  if (mode === 'off') return null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const c = document.createElement('canvas');
  c.className = 'backdrop';
  c.setAttribute('aria-hidden', 'true');
  document.body.appendChild(c);
  const ctx = c.getContext('2d');

  /* ---------- iso-lines of a scalar field ----------
     Marching squares over a coarse grid. The field drifts with time and
     scrolls with the page, so new contours keep arriving from below. */
  function contours(W, H) {
    const cell = 30, cols = Math.ceil(W / cell) + 2, rows = Math.ceil(H / cell) + 2;
    const LEVELS = [-1.05, -0.7, -0.35, 0, 0.35, 0.7, 1.05];
    const v = new Float32Array((cols + 1) * (rows + 1));
    const k = 0.055;                                   // world units per pixel
    return function draw(t, sy) {
      // the grid stays put on screen and the field flows through it, so the
      // sample position and the draw position have to agree exactly
      const oy = sy * 0.26, ox = sy * 0.035;
      for (let j = 0; j <= rows; j++) {
        const wy = (j * cell + oy) * k;
        for (let i = 0; i <= cols; i++) {
          const wx = (i * cell + ox) * k;
          v[j * (cols + 1) + i] =
              Math.sin(wx * 1.15 + t * 0.07) * Math.cos(wy * 0.83 - t * 0.05)
            + 0.55 * Math.sin(wx * 0.7 + wy * 1.31 - t * 0.04)
            + 0.4 * Math.cos(wx * 0.45 - wy * 0.57 + t * 0.025)
            + 0.5 * Math.sin(wy * 0.19 + wx * 0.11);   // slow swell, so a long scroll keeps changing
        }
      }
      ctx.lineWidth = 1;
      const half = (LEVELS.length - 1) / 2;
      for (let li = 0; li < LEVELS.length; li++) {
        const L = LEVELS[li];
        const p = new Path2D();
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
            const seg = (p1, p2) => { p.moveTo(p1[0], p1[1]); p.lineTo(p2[0], p2[1]); };
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
        // the middle line reads brightest, the outer ones fade away
        const w = 1 - Math.abs(li - half) / half;
        ctx.strokeStyle = 'rgba(255,214,205,' + (0.05 + 0.07 * w).toFixed(3) + ')';
        ctx.stroke(p);
      }
    };
  }

  /* ---------- a sparse scatter of sample points ----------
     Three depths, each parallaxing at its own rate; they wrap as the
     page scrolls, so the field is endless. */
  function points(W, H) {
    const n = Math.round(clamp((W * H) / 14000, 60, 190));
    const span = H * 2;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const z = Math.random();
      pts.push({
        x: Math.random() * W,
        y: Math.random() * span,
        r: 0.7 + z * 1.3,
        a: 0.06 + z * 0.16,
        ph: Math.random() * Math.PI * 2,
        sp: 0.35 + z * 0.9                       // parallax rate
      });
    }
    return function draw(t, sy) {
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

  /* ---------- broad, barely-there variation in the lighting ----------
     Not a halo: a few very large, very low blobs that drift, so the
     black stops being one flat value across the whole screen. */
  function wash(W, H) {
    const blobs = [
      { x: 0.18, y: 0.15, r: 0.85, a: 0.05, c: '255,150,135', sx: 0.021, sy: 0.013 },
      { x: 0.82, y: 0.55, r: 1.0, a: 0.036, c: '255,190,175', sx: -0.016, sy: 0.019 },
      { x: 0.5, y: 0.95, r: 0.9, a: 0.03, c: '170,180,255', sx: 0.012, sy: -0.011 }
    ];
    const m = Math.max(W, H);
    return function draw(t, sy) {
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

  const kinds = { contours, points, wash };
  if (!kinds[mode]) mode = 'contours';

  let W = 0, H = 0, sy = scrollY || 0, draw = null, dirty = true;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw = kinds[mode](W, H);
    dirty = true;
  }
  resize();
  addEventListener('resize', resize, { passive: true });
  addEventListener('scroll', () => { sy = scrollY || 0; dirty = true; }, { passive: true });

  /* ---------- loop: repaint on scroll and on a slow clock ---------- */
  let raf = 0, lastPaint = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    if (reduced) {                       // one still frame, repainted only on resize
      if (!dirty) return;
    } else if (!dirty && now - lastPaint < 50) {
      return;                            // the drift is slow, 20fps is plenty
    }
    dirty = false; lastPaint = now;
    ctx.clearRect(0, 0, W, H);
    draw(reduced ? 0 : now / 1000, sy);
  }
  raf = requestAnimationFrame(frame);

  return { mode, stop() { cancelAnimationFrame(raf); c.remove(); } };
}
