/* sky.js - an occasional streak of light across the dark background.

   One fixed canvas over the page, blended with `screen`, so the light
   reads as being behind anything bright (text stays white). The canvas is
   fixed but each event is anchored to the page: it remembers the scroll
   position it started at and is drawn with that offset, so it stays put
   over the content and scrolls away instead of riding along with you.

   Events are occasional: one a few seconds after load, then every
   16-30 s. Three kinds, picked with data-sky on <body> (or ?sky=):

     meteor  a thin warm streak that flies and burns out
     ecg     a heartbeat trace that draws itself across and fades
     glint   a distant point that brightens with a soft flare and dies
     off     nothing

   Disabled under prefers-reduced-motion. window.__sky.fire() triggers one. */

export function initSky({ mode = 'ecg' } = {}) {
  if (mode === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  const kinds = { meteor, ecg, glint };
  if (!kinds[mode]) mode = 'ecg';

  const c = document.createElement('canvas');
  c.className = 'sky';
  c.setAttribute('aria-hidden', 'true');
  c.style.display = 'none';        // only composited while something is on it
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener('resize', resize, { passive: true });

  const WARM = '255,241,230', ACCENT = '255,185,174';
  const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));

  /* ---- the three kinds. Each returns {dur, draw(t)} with t in seconds ---- */
  function meteor() {
    const x0 = W * (0.08 + Math.random() * 0.84), y0 = H * (0.04 + Math.random() * 0.5);
    const a = 0.32 + Math.random() * 0.3, side = Math.random() < 0.5 ? 1 : -1;
    const ux = Math.cos(a) * side, uy = Math.sin(a);
    const len = 240 + Math.random() * 280, speed = len / 0.75, tail = 150;
    const P = d => [x0 + ux * d, y0 + uy * d];
    return {
      dur: (len + tail) / speed + 0.3,
      draw(t) {
        const head = Math.min(len, speed * t), tailD = Math.max(0, speed * t - tail);
        if (tailD >= len) return;
        const burn = 1 - Math.max(0, (head / len - 0.72) / 0.28);           // dims over the last stretch
        const [hx, hy] = P(head), [tx, ty] = P(tailD);
        const g = ctx.createLinearGradient(tx, ty, hx, hy);
        g.addColorStop(0, `rgba(${WARM},0)`);
        g.addColorStop(1, `rgba(${WARM},${0.85 * burn})`);
        ctx.strokeStyle = g; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        const r = 7;
        const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
        glow.addColorStop(0, `rgba(255,255,255,${0.9 * burn})`);
        glow.addColorStop(0.35, `rgba(${WARM},${0.35 * burn})`);
        glow.addColorStop(1, `rgba(${WARM},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
      }
    };
  }

  function ecg() {
    const y = H * (0.18 + Math.random() * 0.64), x0 = W * (0.04 + Math.random() * 0.3);
    const len = Math.min(W * 0.62, W * (0.38 + Math.random() * 0.3));
    const drawFor = 1.7, fadeFor = 1.3;
    // one PQRST complex around the middle of the sweep, offsets in px (up is negative)
    const shape = u => -7 * gauss(u, 0.30, 0.028) + 3 * gauss(u, 0.437, 0.006)
                        - 44 * gauss(u, 0.452, 0.007) + 13 * gauss(u, 0.468, 0.007)
                        - 10 * gauss(u, 0.60, 0.05);
    return {
      dur: drawFor + fadeFor,
      draw(t) {
        const prog = Math.min(1, t / drawFor);
        const fade = t < drawFor ? 1 : Math.max(0, 1 - (t - drawFor) / fadeFor);
        ctx.strokeStyle = `rgba(${ACCENT},${0.55 * fade})`; ctx.lineWidth = 1; ctx.lineJoin = 'round';
        ctx.beginPath();
        const n = Math.max(2, Math.floor(len * prog / 2));
        for (let i = 0; i <= n; i++) {
          const u = (i / n) * prog, x = x0 + u * len, yy = y + shape(u);
          i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
        }
        ctx.stroke();
        if (prog < 1) {
          const px = x0 + prog * len, py = y + shape(prog);
          const glow = ctx.createRadialGradient(px, py, 0, px, py, 6);
          glow.addColorStop(0, `rgba(255,255,255,0.9)`);
          glow.addColorStop(1, `rgba(${ACCENT},0)`);
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
        }
      }
    };
  }

  function glint() {
    const x = W * (0.06 + Math.random() * 0.88), y = H * (0.05 + Math.random() * 0.75);
    const rise = 0.55, fall = 1.5, flare = 26 + Math.random() * 18;
    return {
      dur: rise + fall,
      draw(t) {
        const a = t < rise ? t / rise : Math.max(0, 1 - (t - rise) / fall);
        const e = a * a * (3 - 2 * a);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
        glow.addColorStop(0, `rgba(255,255,255,${0.95 * e})`);
        glow.addColorStop(0.25, `rgba(${WARM},${0.45 * e})`);
        glow.addColorStop(1, `rgba(${WARM},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 1;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const g = ctx.createLinearGradient(x - dx * flare, y - dy * flare, x + dx * flare, y + dy * flare);
          g.addColorStop(0, `rgba(${WARM},0)`);
          g.addColorStop(0.5, `rgba(${WARM},${0.7 * e})`);
          g.addColorStop(1, `rgba(${WARM},0)`);
          ctx.strokeStyle = g;
          ctx.beginPath(); ctx.moveTo(x - dx * flare, y - dy * flare); ctx.lineTo(x + dx * flare, y + dy * flare); ctx.stroke();
        }
      }
    };
  }

  /* ---- scheduling and the frame loop (only runs while something is on screen) ---- */
  const live = [];
  let raf = 0, last = 0, timer = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, W, H);
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i];
      e.t += dt;
      if (e.t >= e.dur) { live.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(0, e.sy - (window.scrollY || 0));
      e.draw(e.t);
      ctx.restore();
    }
    if (live.length) raf = requestAnimationFrame(frame);
    else { raf = 0; ctx.clearRect(0, 0, W, H); c.style.display = 'none'; }
  }
  function fire(kind = mode) {
    const e = (kinds[kind] || kinds[mode])();
    e.t = 0;
    e.sy = window.scrollY || 0;          // where the page was when it started
    live.push(e);
    c.style.display = '';
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function schedule(first) {
    const delay = first ? 3000 + Math.random() * 2000 : 16000 + Math.random() * 14000;
    timer = setTimeout(() => {
      if (!document.hidden) fire();
      schedule(false);
    }, delay);
  }
  schedule(true);

  return { fire, mode, stop() { clearTimeout(timer); } };
}
