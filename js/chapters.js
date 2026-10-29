/* chapters.js - behind each demo chapter, a piece of that demo's own physics,
   full-bleed, running only while it is on screen. Plain 2D canvas: the page's
   WebGL contexts are the stage and the shared renderer in scenes.js (which
   draws the optimizer chapter).

   pinn   the exact viscous Burgers solution u(x,t) that the PINN demo trains
          toward, from the Cole-Hopf transform, swept through time
   rag    the demo's 24 passages as a wall of text; the demo's BM25 (same
          tokenizer, same boosts) lights up what each question retrieves
   fno    the finite-difference solver marching step by step against the
          Cole-Hopf operator answering in one call, as in the demo
   fluid  Jos Stam's stable fluids, stirred by two slow emitters and by you */

const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
const PAL = {
  bg: [10, 10, 12], text: '#f1f0ec', muted: '#a3a2a9', accent: '#ff5a4e',
  display: '600 1px "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif',
  serif: '1px "Source Serif 4", Georgia, serif'
};
const font = (spec, px) => spec.replace('1px', px + 'px');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => x * x * (3 - 2 * x);
const COUNT = new Intl.NumberFormat(document.documentElement.lang || 'en');

function fit(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const pw = Math.max(1, Math.round(w * DPR)), ph = Math.max(1, Math.round(h * DPR));
  if (canvas.width === pw && canvas.height === ph) return false;
  canvas.width = pw; canvas.height = ph;
  return true;
}

/* ================= Burgers, exact (Cole-Hopf) ================= */
// u_t + u u_x = nu u_xx on the periodic unit interval, u(x,0) = sin(2 pi x).
// phi = exp(-U / 2nu) with U the antiderivative of u turns it into the heat
// equation; for this initial condition U is analytic, so phi0 is exact and its
// cosine series decays fast. u = -2 nu phi_x / phi.
function burgers(nu, nx, K) {
  const phi0 = new Float64Array(nx), c = new Float64Array(K + 1);
  for (let j = 0; j < nx; j++) phi0[j] = Math.exp(-(1 - Math.cos(2 * Math.PI * j / nx)) / (2 * Math.PI) / (2 * nu));
  for (let k = 0; k <= K; k++) {
    let s = 0;
    for (let j = 0; j < nx; j++) s += phi0[j] * Math.cos(2 * Math.PI * k * j / nx);
    c[k] = s / nx;
  }
  const cs = new Float64Array(nx * (K + 1)), sn = new Float64Array(nx * (K + 1));
  for (let j = 0; j < nx; j++) for (let k = 0; k <= K; k++) {
    cs[j * (K + 1) + k] = Math.cos(2 * Math.PI * k * j / nx);
    sn[j * (K + 1) + k] = Math.sin(2 * Math.PI * k * j / nx);
  }
  return function at(t, out) {
    for (let j = 0; j < nx; j++) {
      let p = c[0], px = 0;
      for (let k = 1; k <= K; k++) {
        const d = c[k] * Math.exp(-nu * 4 * Math.PI * Math.PI * k * k * t), i = j * (K + 1) + k;
        p += 2 * d * cs[i];
        px -= 2 * d * 2 * Math.PI * k * sn[i];
      }
      out[j] = -2 * nu * px / p;
    }
    return out;
  };
}

// diverging map on the dark ground: slate for u<0, red for u>0, black at zero
function divergent(u) {
  const a = clamp(Math.abs(u), 0, 1);
  const stops = u >= 0
    ? [[10, 10, 12], [92, 24, 28], [255, 90, 78], [255, 214, 204]]
    : [[10, 10, 12], [30, 33, 50], [111, 123, 168], [214, 220, 245]];
  const xs = [0, 0.32, 0.78, 1];
  let i = 0; while (i < 2 && a > xs[i + 1]) i++;
  const f = (a - xs[i]) / (xs[i + 1] - xs[i]);
  return [0, 1, 2].map(k => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f);
}

function makePinn(canvas) {
  const ctx = canvas.getContext('2d');
  const NX = 220, NT = 180, T = 0.55, at = burgers(0.008, NX, 48);
  const field = new Float32Array(NT * NX), col = new Float32Array(NX);
  let done = 0;
  // collocation points, where a PINN evaluates its residual: random in space-time (t across the
  // screen, x down it), sorted by t so the sweep reaches them in order, coloured by the exact u
  const NP = 4600, P = new Float32Array(NP * 3);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  Array.from({ length: NP }, () => [rnd(), rnd()]).sort((a, b) => a[0] - b[0])
    .forEach(([tn, xn], i) => { P[i * 3] = tn; P[i * 3 + 1] = xn; P[i * 3 + 2] = -1; });
  const BINS = 40, fills = Array.from({ length: BINS }, (_, b) => {
    const [r, g, bl] = divergent(-1 + 2 * (b + 0.5) / BINS);
    return `rgb(${r | 0},${g | 0},${bl | 0})`;
  });
  function uAt(tn, xn) {                          // bilinear lookup in the solved field
    const ti = tn * (NT - 1), xi = xn * (NX - 1);
    const t0 = Math.min(NT - 2, ti | 0), x0 = Math.min(NX - 2, xi | 0), ft = ti - t0, fx = xi - x0;
    const a = field[t0 * NX + x0], b = field[t0 * NX + x0 + 1], c = field[(t0 + 1) * NX + x0], d = field[(t0 + 1) * NX + x0 + 1];
    return (a * (1 - fx) + b * fx) * (1 - ft) + (c * (1 - fx) + d * fx) * ft;
  }
  function computeSome(n) {                       // spread the solve over a few frames
    for (let m = 0; m < n && done < NT; m++, done++) {
      at(done / (NT - 1) * T, col);
      field.set(col, done * NX);
    }
    if (done === NT && P[2] < 0) {
      for (let i = 0; i < NP; i++) P[i * 3 + 2] = clamp(Math.floor((uAt(P[i * 3], P[i * 3 + 1]) + 1) / 2 * BINS), 0, BINS - 1);
    }
  }
  const paths = Array.from({ length: BINS }, () => null);
  return {
    fps: 30,                                       // an 8 s sweep needs no more
    frame(t) {
      if (done < NT) computeSome(18);
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, W, H);
      const cyc = t % 11, tc = smooth(clamp(cyc / 8, 0, 1)), fade = cyc > 10 ? 1 - (cyc - 10) : 1;
      const cx = tc * W, r0 = 1.7 * DPR;
      // points the sweep has not reached: faint, uncoloured
      ctx.globalAlpha = 0.16 * fade; ctx.fillStyle = PAL.muted; ctx.beginPath();
      for (let i = 0; i < NP; i++) if (P[i * 3] > tc) { const x = P[i * 3] * W, y = P[i * 3 + 1] * H; ctx.moveTo(x + r0, y); ctx.arc(x, y, r0 * 0.8, 0, 6.2832); }
      ctx.fill();
      if (P[2] >= 0) {                              // reached points, by colour bin; the newest pop
        for (let b = 0; b < BINS; b++) paths[b] = new Path2D();
        for (let i = 0; i < NP && P[i * 3] <= tc; i++) {
          const x = P[i * 3] * W, y = P[i * 3 + 1] * H, age = (tc - P[i * 3]) / 0.04;
          const r = r0 * (age < 1 ? 1 + 0.9 * (1 - age) : 1);
          paths[P[i * 3 + 2]].moveTo(x + r, y); paths[P[i * 3 + 2]].arc(x, y, r, 0, 6.2832);
        }
        ctx.globalAlpha = fade;
        for (let b = 0; b < BINS; b++) { ctx.fillStyle = fills[b]; ctx.fill(paths[b]); }
      }
      // the slice u(x, t) at the sweep: x down the screen, u across
      const ci = Math.min(done - 1, Math.round(tc * (NT - 1)));
      if (ci >= 0) {
        const amp = Math.min(W * 0.06, 90 * DPR);
        ctx.globalAlpha = 0.85 * fade; ctx.strokeStyle = PAL.text; ctx.lineWidth = 1.5 * DPR; ctx.beginPath();
        for (let j = 0; j < NX; j++) {
          const x = cx + field[ci * NX + j] * amp, y = (j + 0.5) / NX * H;
          j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    still() { computeSome(NT); this.frame(8.5); }
  };
}

/* ================= RAG: the corpus as a wall, BM25 as light ================= */
const QUERIES = [
  'How do physics-informed neural networks work?',
  'What is the Fourier Neural Operator and why is it resolution-invariant?',
  'Compare distillation and quantization for compression.',
  'What constitutive models are used for cardiac tissue?'
];
function stem(t) {                                 // the demo's stemmer, verbatim in behaviour
  if (t.length <= 4) return t;
  for (const s of ['ization', 'isation', 'ing', 'ions', 'ion', 'ies', 'ied', 'ed', 'es', 'ly', 'er', 's']) {
    if (t.endsWith(s) && t.length - s.length >= 3) return t.slice(0, -s.length);
  }
  return t;
}
const tokenize = s => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(t => t.length > 1).map(stem);

function bm25Index(corpus) {
  const docs = corpus.map(c => {
    const p = tokenize(c.paper), sec = tokenize(c.section);
    const tags = c.tags.flatMap(tag => tokenize(tag.replace(/-/g, ' ')));
    return [...p, ...p, ...p, ...sec, ...sec, ...tags, ...tags, ...tokenize(c.text)];
  });
  const N = docs.length, avgdl = docs.reduce((a, d) => a + d.length, 0) / N, df = {};
  docs.forEach(d => new Set(d).forEach(t => { df[t] = (df[t] || 0) + 1; }));
  const idf = {};
  Object.keys(df).forEach(t => { idf[t] = Math.log((N - df[t] + 0.5) / (df[t] + 0.5) + 1); });
  const tfs = docs.map(d => { const tf = {}; d.forEach(t => { tf[t] = (tf[t] || 0) + 1; }); return { tf, len: d.length }; });
  return query => {
    const q = tokenize(query), qs = new Set(q);
    return tfs.map((d, i) => {
      let s = 0;
      q.forEach(t => { const f = d.tf[t] || 0; if (f) s += (idf[t] || 0) * (f * 2.5) / (f + 1.5 * (0.25 + 0.75 * d.len / avgdl)); });
      let tag = 0;
      corpus[i].tags.forEach(g => tokenize(g.replace(/-/g, ' ')).forEach(tt => { if (qs.has(tt)) tag++; }));
      return { i, score: s + tag * 0.5 };
    }).sort((a, b) => b.score - a.score);
  };
}

function makeRag(canvas) {
  const ctx = canvas.getContext('2d');
  let corpus = null, search = null, words = [], blocks = [], base = null, lit = null, cur = null;
  fetch('./projects/rag-scientific-ml/corpus.json').then(r => r.json()).then(c => {
    corpus = c; search = bm25Index(c); layout();
  }).catch(() => {});

  function layout() {
    if (!corpus) return;
    const W = canvas.width, H = canvas.height, size = 13.5 * DPR, lh = size * 1.5;
    const pad = (W < 700 * DPR ? 20 : 32) * DPR, gap = 26 * DPR;
    const colW = Math.min(W - pad * 2, Math.max(220 * DPR, Math.min(300 * DPR, (W - pad * 2) / 5)));
    const cols = Math.max(1, Math.floor((W - pad * 2 + gap) / (colW + gap)));
    const top = H * 0.24;
    // the chapter's own copy sits bottom-left: columns over it stop short of it
    const copy = canvas.parentElement.querySelector('.chapter-copy'), cr = canvas.getBoundingClientRect();
    const r = copy ? copy.getBoundingClientRect() : null;
    const ob = r ? { x1: (r.right - cr.left + 28) * DPR, y0: (r.top - cr.top - 40) * DPR } : null;
    const floor = x => (ob && x < ob.x1 ? ob.y0 : H - lh);
    ctx.font = font(PAL.serif, size);
    words = []; blocks = [];
    let c = 0, x0 = pad, y = top;
    corpus.forEach((d, di) => {
      const toks = (d.paper.split(/\s+[-–—]\s+|\s+—\s+/)[0] + '. ' + d.text).split(/\s+/);
      if (y > floor(x0) - lh * 3) { c++; y = top; x0 = pad + c * (colW + gap); }
      if (c >= cols) return;
      const start = words.length, by = y;
      let x = x0;
      for (const w of toks) {
        const ww = ctx.measureText(w + ' ').width;
        if (x + ww > x0 + colW) { x = x0; y += lh; if (y > floor(x0)) break; }
        words.push({ x, y, w, tok: stem(w.toLowerCase().replace(/[^a-z0-9-]/g, '')), doc: di });
        x += ww;
      }
      blocks[di] = { x: x0, y: by, start, end: words.length };
      y += lh * 2;
    });
    base = document.createElement('canvas'); base.width = W; base.height = H;
    const b = base.getContext('2d');
    b.font = font(PAL.serif, size); b.fillStyle = PAL.muted; b.globalAlpha = 0.26; b.textBaseline = 'top';
    words.forEach(w => b.fillText(w.w, w.x, w.y));
    lit = null; cur = null;
  }

  function light(query) {
    const W = canvas.width, H = canvas.height, size = 13.5 * DPR;
    const res = search(query), top = res.slice(0, 4).filter(r => r.score > 0);
    const hits = new Set(top.map(r => r.i)), q = new Set(tokenize(query));
    lit = document.createElement('canvas'); lit.width = W; lit.height = H;
    const l = lit.getContext('2d');
    l.textBaseline = 'top';
    words.forEach(w => {
      const match = q.has(w.tok), inTop = hits.has(w.doc);
      if (!match && !inTop) return;
      l.font = font(match ? PAL.display : PAL.serif, size);
      l.fillStyle = match ? PAL.accent : PAL.text;
      l.globalAlpha = match ? 1 : 0.86;
      l.fillText(w.w, w.x, w.y);
    });
    l.globalAlpha = 1; l.font = font(PAL.display, 12.5 * DPR); l.fillStyle = PAL.accent;
    top.forEach((r, k) => { const bl = blocks[r.i]; if (bl) l.fillText(`#${k + 1}  BM25 ${r.score.toFixed(2)}`, bl.x, bl.y - 17 * DPR); });
    cur = query;
  }

  return {
    fps: 30,                                       // typing and slow fades only
    resize: layout,
    frame(t) {
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, W, H);
      if (!base) return;
      ctx.drawImage(base, 0, 0);
      const cyc = t % 9, q = QUERIES[Math.floor(t / 9) % QUERIES.length];
      if (q !== cur) light(q);
      const typed = q.slice(0, Math.floor(clamp(cyc / 2.2, 0, 1) * q.length));
      const show = cyc < 2.6 ? 0 : cyc < 3.4 ? (cyc - 2.6) / 0.8 : cyc < 8 ? 1 : 1 - (cyc - 8);
      if (lit && show > 0) { ctx.globalAlpha = clamp(show, 0, 1); ctx.drawImage(lit, 0, 0); ctx.globalAlpha = 1; }
      // the question, typed over the wall, wrapped to the screen
      const qs = clamp(W / 34, 20 * DPR, 46 * DPR), x = (W < 700 * DPR ? 20 : 32) * DPR;
      ctx.font = font(PAL.display, qs); ctx.textBaseline = 'alphabetic'; ctx.fillStyle = PAL.text;
      ctx.globalAlpha = cyc > 8 ? 1 - (cyc - 8) : 1;
      const lines = [''];
      for (const w of typed.split(' ')) {
        const next = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w;
        if (ctx.measureText(next).width > W - x * 2 && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = next;
      }
      let y = Math.max(H * 0.16 - (lines.length - 1) * qs * 1.1, 90 * DPR);
      lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * qs * 1.1));
      y += (lines.length - 1) * qs * 1.1;
      if (cyc < 2.6 && Math.floor(t * 2) % 2 === 0) ctx.fillRect(x + ctx.measureText(lines[lines.length - 1]).width + 4 * DPR, y - qs * 0.78, 3 * DPR, qs * 0.9);
      ctx.globalAlpha = 1;
    },
    still() { this.frame(6); }
  };
}

/* ================= FNO vs solver ================= */
function makeFno(canvas) {
  const ctx = canvas.getContext('2d');
  const NX = 256, NU = 0.01, T = 0.2, ICS = ['2sin', 'cos3', 'bump', 'sin'];
  let ic = null, u = null, target = null, step = 0, tSim = 0, dt = 0, k = -1, phase = 'run', hold = 0;
  function makeIC(type) {
    const v = new Float32Array(NX);
    for (let i = 0; i < NX; i++) {
      const x = i / NX;
      v[i] = type === 'sin' ? Math.sin(2 * Math.PI * x)
        : type === '2sin' ? Math.sin(2 * Math.PI * x) + 0.5 * Math.sin(4 * Math.PI * x + 0.7)
        : type === 'cos3' ? Math.cos(2 * Math.PI * x) + Math.sin(6 * Math.PI * x) / 3
        : Math.exp(-(((x - 0.5) / 0.08) ** 2)) - 0.4;
    }
    let m = 0; for (let i = 0; i < NX; i++) m += v[i]; m /= NX;
    for (let i = 0; i < NX; i++) v[i] -= m;
    return v;
  }
  function operator(u0, t) {                       // Cole-Hopf, mode-truncated, as in the demo
    const K = 48, M = 2 * K + 1, dx = 1 / NX, phi = new Float64Array(NX);
    let U = 0;
    for (let i = 0; i < NX; i++) { U += u0[i] * dx; phi[i] = Math.exp(-U / (2 * NU)); }
    const re = new Float64Array(M), im = new Float64Array(M);
    for (let m = 0; m < M; m++) {
      const kk = m - K;
      for (let j = 0; j < NX; j++) { const a = -2 * Math.PI * kk * j / NX; re[m] += phi[j] * Math.cos(a); im[m] += phi[j] * Math.sin(a); }
      re[m] /= NX; im[m] /= NX;
    }
    const out = new Float32Array(NX);
    for (let j = 0; j < NX; j++) {
      let p = 0, px = 0;
      for (let m = 0; m < M; m++) {
        const kk = m - K, dec = Math.exp(-NU * (2 * Math.PI * kk) ** 2 * t), a = 2 * Math.PI * kk * j / NX;
        const cr = re[m] * dec, ci = im[m] * dec, c = Math.cos(a), s = Math.sin(a), d = 2 * Math.PI * kk;
        p += cr * c - ci * s; px += -ci * d * c - cr * d * s;
      }
      out[j] = -2 * NU * px / p;
    }
    return out;
  }
  function fdStep() {
    const dx = 1 / NX, out = new Float32Array(NX);
    for (let i = 0; i < NX; i++) {
      const im = (i - 1 + NX) % NX, ip = (i + 1) % NX;
      out[i] = u[i] + dt * (-u[i] * (u[ip] - u[im]) / (2 * dx) + NU * (u[ip] - 2 * u[i] + u[im]) / (dx * dx));
    }
    u = out;
  }
  function next() {
    k = (k + 1) % ICS.length;
    ic = makeIC(ICS[k]); u = ic.slice(); step = 0; tSim = 0;
    let mx = 0; for (let i = 0; i < NX; i++) mx = Math.max(mx, Math.abs(ic[i]));
    const dx = 1 / NX; dt = Math.min(0.5 * dx * dx / (2 * NU), 0.5 * dx / Math.max(0.1, mx));
    target = operator(ic, T); phase = 'run'; hold = 0;
  }
  function curve(arr, x0, w, yMid, amp, color, alpha, lw) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
    for (let i = 0; i <= NX; i++) {
      const x = x0 + i / NX * w, y = yMid - arr[i % NX] * amp;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  next();
  return {
    frame(t, dtFrame) {
      if (phase === 'run') {
        for (let s = 0; s < 3 && tSim < T; s++) { fdStep(); step++; tSim += dt; }
        if (tSim >= T) phase = 'hold';
      } else if ((hold += dtFrame) > 2.6) next();
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = '#0a0a0c'; ctx.fillRect(0, 0, W, H);
      const pad = 32 * DPR, gap = 40 * DPR, pw = (W - pad * 2 - gap) / 2;
      const yMid = H * 0.33, amp = H * 0.14, lw = 2 * DPR;
      const fade = phase === 'hold' && hold > 2.1 ? 1 - (hold - 2.1) / 0.5 : 1;
      [[pad, 'Finite differences', `step ${COUNT.format(step)}`, u, PAL.text],
       [pad + pw + gap, 'Neural operator', '1 call', target, PAL.accent]].forEach(([x0, name, count, arr, color]) => {
        ctx.globalAlpha = 0.12; ctx.fillStyle = PAL.text; ctx.fillRect(x0, yMid, pw, 1 * DPR); ctx.globalAlpha = 1;
        curve(ic, x0, pw, yMid, amp, PAL.muted, 0.28 * fade, 1.2 * DPR);
        curve(arr, x0, pw, yMid, amp, color, fade, lw);
        ctx.font = font(PAL.display, 15 * DPR); ctx.fillStyle = PAL.muted; ctx.textBaseline = 'top';
        ctx.fillText(name, x0, H * 0.1);
        ctx.font = font(PAL.display, clamp(W / 40, 20 * DPR, 40 * DPR)); ctx.fillStyle = color;
        ctx.fillText(count, x0, H * 0.1 + 24 * DPR);
      });
    },
    still() { while (tSim < T) { fdStep(); step++; tSim += dt; } phase = 'hold'; this.frame(0, 0); }
  };
}

/* ================= stable fluids ================= */
function makeFluid(canvas) {
  const ctx = canvas.getContext('2d');
  const N = 128, S = (N + 2) * (N + 2), IX = (i, j) => i + (N + 2) * j;
  let u = new Float32Array(S), v = new Float32Array(S), u0 = new Float32Array(S), v0 = new Float32Array(S);
  const dR = new Float32Array(S), dG = new Float32Array(S), dB = new Float32Array(S), d0 = new Float32Array(S), curl = new Float32Array(S);
  const DT = 0.1, KEEP = 0.995, VORT = 2.2;
  const INKS = [[1, 0.35, 0.31], [1, 0.79, 0.74], [0.95, 0.94, 0.91], [0.44, 0.48, 0.66]];
  function bnd(b, x) {
    for (let i = 1; i <= N; i++) {
      x[IX(0, i)] = b === 1 ? -x[IX(1, i)] : x[IX(1, i)];
      x[IX(N + 1, i)] = b === 1 ? -x[IX(N, i)] : x[IX(N, i)];
      x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
      x[IX(i, N + 1)] = b === 2 ? -x[IX(i, N)] : x[IX(i, N)];
    }
  }
  function lin(b, x, x0, a, c, it) {
    const cr = 1 / c;
    for (let k = 0; k < it; k++) {
      for (let j = 1; j <= N; j++) for (let i = 1, id = IX(1, j); i <= N; i++, id++) {
        x[id] = (x0[id] + a * (x[id - 1] + x[id + 1] + x[id - N - 2] + x[id + N + 2])) * cr;
      }
      bnd(b, x);
    }
  }
  function advect(b, d, dp, uu, vv) {
    const dt0 = DT * N;
    for (let j = 1; j <= N; j++) for (let i = 1; i <= N; i++) {
      const id = IX(i, j);
      const x = clamp(i - dt0 * uu[id], 0.5, N + 0.5), y = clamp(j - dt0 * vv[id], 0.5, N + 0.5);
      const i0 = x | 0, j0 = y | 0, s1 = x - i0, t1 = y - j0;
      d[id] = (1 - s1) * ((1 - t1) * dp[IX(i0, j0)] + t1 * dp[IX(i0, j0 + 1)]) + s1 * ((1 - t1) * dp[IX(i0 + 1, j0)] + t1 * dp[IX(i0 + 1, j0 + 1)]);
    }
    bnd(b, d);
  }
  function project(uu, vv, p, div) {
    for (let j = 1; j <= N; j++) for (let i = 1; i <= N; i++) {
      const id = IX(i, j);
      div[id] = -0.5 * (uu[id + 1] - uu[id - 1] + vv[id + N + 2] - vv[id - N - 2]) / N; p[id] = 0;
    }
    bnd(0, div); bnd(0, p); lin(0, p, div, 1, 4, 16);
    for (let j = 1; j <= N; j++) for (let i = 1; i <= N; i++) {
      const id = IX(i, j);
      uu[id] -= 0.5 * N * (p[id + 1] - p[id - 1]); vv[id] -= 0.5 * N * (p[id + N + 2] - p[id - N - 2]);
    }
    bnd(1, uu); bnd(2, vv);
  }
  function vorticity() {
    for (let j = 1; j <= N; j++) for (let i = 1; i <= N; i++) {
      const id = IX(i, j); curl[id] = 0.5 * (v[id + 1] - v[id - 1] - u[id + N + 2] + u[id - N - 2]);
    }
    for (let j = 2; j < N; j++) for (let i = 2; i < N; i++) {
      const id = IX(i, j);
      let dx = 0.5 * (Math.abs(curl[id + 1]) - Math.abs(curl[id - 1])), dy = 0.5 * (Math.abs(curl[id + N + 2]) - Math.abs(curl[id - N - 2]));
      const len = Math.hypot(dx, dy) + 1e-5; dx /= len; dy /= len;
      u[id] += DT * VORT * dy * curl[id]; v[id] -= DT * VORT * dx * curl[id];
    }
  }
  function step() {
    vorticity();
    project(u, v, u0, v0);
    u0.set(u); v0.set(v);
    advect(1, u, u0, u0, v0); advect(2, v, v0, u0, v0);
    project(u, v, u0, v0);
    for (const d of [dR, dG, dB]) { for (let k = 0; k < S; k++) d0[k] = d[k] * KEEP; advect(0, d, d0, u, v); }
  }
  function inject(gx, gy, dx, dy, amt, ink) {
    const rad = 3.6;
    for (let oj = -4; oj <= 4; oj++) for (let oi = -4; oi <= 4; oi++) {
      const i = Math.round(gx) + oi, j = Math.round(gy) + oj;
      if (i < 1 || i > N || j < 1 || j > N) continue;
      const f = Math.max(0, 1 - (oi * oi + oj * oj) / (rad * rad + 1)), id = IX(i, j);
      u[id] += dx * 12 * f; v[id] += dy * 12 * f;
      dR[id] = Math.min(1.5, dR[id] + ink[0] * amt * f); dG[id] = Math.min(1.5, dG[id] + ink[1] * amt * f); dB[id] = Math.min(1.5, dB[id] + ink[2] * amt * f);
    }
  }
  // the square grid is drawn to cover the canvas; map screen <-> grid through that crop
  function crop() {
    const W = canvas.width, H = canvas.height, s = Math.max(W, H);
    return { s, ox: (W - s) / 2, oy: (H - s) / 2 };
  }
  let px = null, py = null, inkI = 0, drag = false;
  const toGrid = e => {
    const r = canvas.getBoundingClientRect(), c = crop();
    const x = ((e.clientX - r.left) * DPR - c.ox) / c.s * N, y = ((e.clientY - r.top) * DPR - c.oy) / c.s * N;
    return [x + 1, y + 1];
  };
  canvas.addEventListener('pointerdown', e => { drag = true; [px, py] = toGrid(e); inkI = (inkI + 1) % 3; });
  canvas.addEventListener('pointermove', e => {
    if (!drag && e.pointerType !== 'mouse') return;
    const [x, y] = toGrid(e);
    if (px !== null && (drag || e.buttons)) inject(x, y, (x - px) * 0.5, (y - py) * 0.5, 0.6, INKS[inkI]);
    px = x; py = y;
  });
  addEventListener('pointerup', () => { drag = false; });
  const img = new ImageData(N, N), off = document.createElement('canvas');
  off.width = N; off.height = N;
  const offCtx = off.getContext('2d');
  let last = [[0, 0], [0, 0]];
  return {
    frame(t) {
      // two slow emitters on Lissajous paths keep it alive between visitors
      [[0, 0.31, 0.47, 0], [1, 0.23, 0.37, 2.1]].forEach(([n, fx, fy, ph]) => {
        const x = 1 + N * (0.5 + 0.3 * Math.sin(fx * t + ph)), y = 1 + N * (0.42 + 0.22 * Math.sin(fy * t + 2 * ph));
        const [lx, ly] = last[n];
        if (lx) inject(x, y, (x - lx) * 0.9, (y - ly) * 0.9, 0.5, INKS[(n * 2 + Math.floor(t / 7)) % INKS.length]);
        last[n] = [x, y];
      });
      step();
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const id = IX(i + 1, j + 1), p = (j * N + i) * 4;
        img.data[p] = 10 + 245 * (1 - Math.exp(-dR[id] * 2.2));
        img.data[p + 1] = 10 + 245 * (1 - Math.exp(-dG[id] * 2.2));
        img.data[p + 2] = 12 + 243 * (1 - Math.exp(-dB[id] * 2.2));
        img.data[p + 3] = 255;
      }
      offCtx.putImageData(img, 0, 0);
      const c = crop();
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(off, 0, 0, N, N, c.ox, c.oy, c.s, c.s);
    },
    still() { for (let k = 0; k < 240; k++) this.frame(k / 30); }
  };
}

const MAKERS = { pinn: makePinn, rag: makeRag, fno: makeFno, fluid: makeFluid };

export function initChapters({ reduced = false } = {}) {
  const list = [];
  document.querySelectorAll('canvas[data-chapter]').forEach(canvas => {
    const make = MAKERS[canvas.dataset.chapter];
    if (!make) return;
    const art = canvas.closest('.chapter');
    const ch = { canvas, art, make, inst: null, active: false, drawn: false, t: 0, acc: 0 };
    list.push(ch);
    // build a screen early (the Burgers solve and the corpus fetch take a moment), run only on screen
    new IntersectionObserver(([e]) => { if (e.isIntersecting && !ch.inst) ch.inst = make(canvas); }, { rootMargin: '100% 0px' }).observe(art);
    new IntersectionObserver(([e]) => { ch.active = e.isIntersecting; }, { rootMargin: '60px 0px' }).observe(art);
  });
  return {
    render(t, dt) {
      for (const ch of list) {
        if (!ch.active || !ch.inst) continue;
        if (fit(ch.canvas)) { ch.drawn = false; if (ch.inst.resize) ch.inst.resize(); }
        if (reduced) { if (!ch.drawn) { ch.inst.still(); ch.drawn = true; } }
        else {
          ch.t += dt; ch.acc += dt;
          if (ch.inst.fps && ch.acc < 1 / ch.inst.fps && ch.drawn) continue;
          ch.inst.frame(ch.t, ch.acc); ch.acc = 0; ch.drawn = true;
        }
        ch.art.classList.add('live');
      }
    }
  };
}
