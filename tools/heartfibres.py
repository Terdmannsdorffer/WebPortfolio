"""heartfibres.py - the hero's heart and its muscle fibres, from the average
four-chamber mesh of Rodero et al. 2021 (Zenodo 4593739, CC BY 4.0).

That mesh was built for electro-mechanics simulations, so besides the
tetrahedra it carries a rule-based fibre direction per element and universal
ventricular coordinates per point (Z apex->base, RHO endo->epi, PHI around,
V left/right). This script keeps all of it:

  heart.bin   the boundary surface (quadric-decimated), with per-vertex
              region, Z, RHO and an activation time, plus the long axis
  fibres.bin  streamlines of the fibre field traced through the ventricular
              wall, with Z, RHO and V per point

Both share one centred, scaled frame, so the page can move them together.

usage: python heartfibres.py <average.vtk | dir of .npy caches> <outdir> [target_tris] [n_seeds]

heart.bin (little-endian):
  'HRT2' | u32 nV | u32 nT | f32 scale
  f32x3 apex | f32x3 axis (unit, apex->base) | f32 length | f32x3 LA centre | f32x3 RA centre
  i16 x nV*3 positions (world = q / 32767, frame centred, half-extent 1)
  u16|u32 x nT*3 indices
  u8 x nV tag id | u8 x nV Z*255 | u8 x nV RHO*255 | u8 x nV activation (cycle fraction*255, 255 = none)

fibres.bin:
  'FIB1' | u32 nLines | u32 nPts | f32 scale
  u32 x (nLines+1) offsets
  i16 x nPts*3 positions | u8 x nPts Z*255 | u8 x nPts RHO*255 | u8 x nPts V (0 left, 1 right)
"""
import sys, os, re, struct, time
import numpy as np
from scipy.spatial import cKDTree

src, outdir = sys.argv[1], sys.argv[2]
target = int(sys.argv[3]) if len(sys.argv) > 3 else 40000
n_seeds = int(sys.argv[4]) if len(sys.argv) > 4 else 1200
os.makedirs(outdir, exist_ok=True)
rng = np.random.default_rng(7)
t0 = time.time()
log = lambda *a: print(*a, f'[{time.time()-t0:.1f}s]', flush=True)

LV, RV, LA, RA = 1, 2, 3, 4          # tags in the Rodero meshes


# ---------------------------------------------------------------- read
def read_vtk(path):
    txt = open(path, 'r', errors='ignore').read()
    heads = [(m.start(), m.group(1), m.group(0)) for m in
             re.finditer(r'^(POINTS|CELLS|CELL_TYPES|CELL_DATA|POINT_DATA|SCALARS|VECTORS|LOOKUP_TABLE)\b[^\n]*', txt, re.M)]
    heads.append((len(txt), 'END', ''))
    body = lambda i: txt[txt.index('\n', heads[i][0]) + 1:heads[i + 1][0]]
    a, cur = {}, None
    for i, (_, kind, line) in enumerate(heads[:-1]):
        p = line.split()
        if kind == 'POINTS':
            a['pts'] = np.fromstring(body(i), dtype=np.float32, sep=' ')[:int(p[1]) * 3].reshape(-1, 3)
        elif kind == 'CELLS':
            a['tets'] = np.fromstring(body(i), dtype=np.int64, sep=' ')[:int(p[2])].reshape(int(p[1]), 5)[:, 1:].astype(np.int32)
        elif kind in ('CELL_DATA', 'POINT_DATA'):
            cur = ('cell_' if kind == 'CELL_DATA' else 'pt_', int(p[1]))
        elif kind == 'SCALARS':
            j = i + 1 if heads[i + 1][1] == 'LOOKUP_TABLE' else i
            a[cur[0] + p[1].replace('.dat', '').lower()] = np.fromstring(body(j), dtype=np.float32, sep=' ')[:cur[1]]
        elif kind == 'VECTORS':
            a[cur[0] + p[1].lower()] = np.fromstring(body(i), dtype=np.float32, sep=' ')[:cur[1] * 3].reshape(-1, 3)
    return a


if os.path.isdir(src):
    A = {f[:-4]: np.load(os.path.join(src, f)) for f in os.listdir(src) if f.endswith('.npy')}
else:
    A = read_vtk(src)
pts, tets = A['pts'].astype(np.float64), A['tets'].astype(np.int64)
tag = A['cell_id'].astype(np.int32)
fib = A['cell_fibres'].astype(np.float64)
fib /= np.linalg.norm(fib, axis=1, keepdims=True)
Z, RHO, V = A['pt_z'], A['pt_rho'], A['pt_v']
valid = (Z > -1) & (RHO > -1)                      # -10 marks points outside the ventricles
log('mesh', len(pts), 'points', len(tets), 'tets')

# ---------------------------------------------------------------- surface
f_idx = np.array([[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]])
faces = tets[:, f_idx].reshape(-1, 3)
face_tag = np.repeat(tag, 4)
face_tet = np.repeat(np.arange(len(tets)), 4)
face_opp = np.tile(np.array([3, 2, 1, 0]), len(tets))
key = np.sort(faces, axis=1)
order = np.lexsort((key[:, 2], key[:, 1], key[:, 0]))
ks = key[order]
eq = (ks[1:] == ks[:-1]).all(1)
sel = order[~(np.r_[False, eq] | np.r_[eq, False])]
bf, btag = faces[sel], face_tag[sel]
p0, p1, p2 = pts[bf[:, 0]], pts[bf[:, 1]], pts[bf[:, 2]]
flip = (np.cross(p1 - p0, p2 - p0) * (pts[tets[face_tet[sel], face_opp[sel]]] - p0)).sum(1) > 0
bf[flip] = bf[flip][:, [0, 2, 1]]
used, inv = np.unique(bf, return_inverse=True)
SV, SF = pts[used], inv.reshape(-1, 3)


def majority(F_or_map, ftags, nv):
    vt, best = np.zeros(nv, dtype=np.int32), np.zeros(nv)
    for t in np.unique(ftags):
        cnt = np.bincount(np.asarray(F_or_map)[ftags == t].ravel(), minlength=nv)
        better = cnt > best
        vt[better], best[better] = t, cnt[better]
    return vt


s_tag = majority(SF, btag, len(SV))
s_z, s_rho, s_ok = Z[used].astype(np.float64), RHO[used].astype(np.float64), valid[used]
log('surface', len(SV), 'verts', len(SF), 'tris')

import fast_simplification
red = max(0.0, 1.0 - target / len(SF))
V2, F2, coll = fast_simplification.simplify(SV.astype(np.float32), SF.astype(np.int32), target_reduction=red, return_collapses=True)
_, _, mapping = fast_simplification.replay_simplification(SV.astype(np.float32), SF.astype(np.int32), coll)
mapping = np.asarray(mapping)
n2 = len(V2)
tag2 = majority(mapping, s_tag, n2)


def mean_valid(vals, ok):
    num = np.bincount(mapping[ok], weights=vals[ok], minlength=n2)
    den = np.bincount(mapping[ok], minlength=n2)
    out = np.full(n2, -10.0)
    out[den > 0] = num[den > 0] / den[den > 0]
    return out


z2, rho2 = mean_valid(s_z, s_ok), mean_valid(s_rho, s_ok)
F2 = np.asarray(F2, dtype=np.int64)
keep, inv2 = np.unique(F2, return_inverse=True)
V2, tag2, z2, rho2, F2 = np.asarray(V2, np.float64)[keep], tag2[keep], z2[keep], rho2[keep], inv2.reshape(-1, 3)
# a ventricle vertex without coordinates (where the walls meet the valve rings) borrows its nearest neighbour's,
# or the page would twist it as if it sat at the apex
ven2 = np.isin(tag2, [LV, RV])
bad, good = ven2 & (z2 < -1), ven2 & (z2 > -1)
if bad.any():
    _, nn = cKDTree(V2[good]).query(V2[bad])
    z2[bad], rho2[bad] = z2[good][nn], rho2[good][nn]
log('decimated', len(V2), 'verts', len(F2), 'tris;', int(bad.sum()), 'ventricle verts filled')

# shared frame: centre on the surface's bounding box, half-extent 1
centre = (V2.max(0) + V2.min(0)) / 2
scale = float((V2.max(0) - V2.min(0)).max() / 2)
to_frame = lambda X: (X - centre) / scale

# ---------------------------------------------------------------- long axis and activation
lv_pts = valid & (V < 0)                           # V = -1: left ventricle
apex = pts[lv_pts][np.argmin(Z[lv_pts] + 0.2 * (1 - RHO[lv_pts]))]   # epicardial apex
base = pts[lv_pts & (Z > 0.95)].mean(0)
axis = (base - apex) / np.linalg.norm(base - apex)
length = float(np.linalg.norm(base - apex))
la_c, ra_c = pts[np.unique(tets[tag == LA])].mean(0), pts[np.unique(tets[tag == RA])].mean(0)

# activation, as a fraction of one beat at 60 bpm: the sinus node fires at the top of
# the right atrium, the atria depolarise over ~90 ms, the AV node holds ~70 ms, then the
# ventricles fire from the apical endocardium outwards and up to the base in ~90 ms.
ra_v = tag2 == RA
sa = V2[ra_v][np.argmax((V2[ra_v] - apex) @ axis)]
act = np.full(len(V2), 255, dtype=np.int32)
atr = np.isin(tag2, [LA, RA])
d = np.linalg.norm(V2[atr] - sa, axis=1)
act[atr] = np.round((0.0 + 0.09 * d / d.max()) * 255)
ven = np.isin(tag2, [LV, RV]) & (z2 > -1)
act[ven] = np.round((0.16 + 0.075 * np.clip(z2[ven], 0, 1) + 0.02 * np.clip(rho2[ven], 0, 1)) * 255)
log('axis', axis.round(3).tolist(), 'length mm', round(length, 1))

tag_ids = {int(t): i for i, t in enumerate(sorted(np.unique(tag).tolist()))}
q = lambda X: np.clip(np.round(to_frame(X) * 32767), -32767, 32767).astype('<i2')
u8 = lambda x: np.clip(np.round(np.clip(x, 0, 1) * 255), 0, 255).astype(np.uint8)
with open(os.path.join(outdir, 'heart.bin'), 'wb') as f:
    f.write(b'HRT2')
    f.write(struct.pack('<IIf', len(V2), len(F2), scale))
    f.write(struct.pack('<3f3ff3f3f', *to_frame(apex), *axis, length / scale, *to_frame(la_c), *to_frame(ra_c)))
    f.write(q(V2).tobytes())
    f.write((F2.astype('<u2') if len(V2) <= 65535 else F2.astype('<u4')).tobytes())
    f.write(np.array([tag_ids[int(t)] for t in tag2], dtype=np.uint8).tobytes())
    f.write(u8(z2).tobytes()); f.write(u8(rho2).tobytes())
    f.write(act.astype(np.uint8).tobytes())
log('wrote heart.bin', os.path.getsize(os.path.join(outdir, 'heart.bin')), 'bytes')

# ---------------------------------------------------------------- fibre streamlines
vent = np.isin(tag, [LV, RV])
cent = pts[tets[vent]].mean(1)
F = fib[vent]
tree = cKDTree(cent)
spacing = float(np.median(tree.query(cent[rng.choice(len(cent), 4000, replace=False)], k=2)[0][:, 1]))
h, stop, max_steps = 0.55, 2.2 * spacing, 260          # mm, mm, steps per direction
log('centroid spacing', round(spacing, 3), 'mm')

# seeds stratified through the wall so every layer of the helix shows
vpts = np.where(valid & np.isin(np.arange(len(pts)), np.unique(tets[vent])))[0]
ptree = cKDTree(pts[vpts])
seed_t = rng.choice(len(cent), n_seeds * 3, replace=False)
_, near = ptree.query(cent[seed_t])
layer = np.clip((RHO[vpts[near]] * 6).astype(int), 0, 5)
seed_t = np.concatenate([seed_t[layer == k][:n_seeds // 6] for k in range(6)])
seeds = cent[seed_t]


def trace(sign):
    P = seeds.copy(); D = F[tree.query(P)[1]] * sign
    out = [P.copy()]; alive = np.ones(len(P), bool)
    for _ in range(max_steps):
        idx = np.where(alive)[0]
        if not len(idx): break
        dist, j = tree.query(P[idx])
        f1 = F[j]; f1 *= np.sign((f1 * D[idx]).sum(1, keepdims=True) + 1e-9)
        dist2, j2 = tree.query(P[idx] + 0.5 * h * f1)
        f2 = F[j2]; f2 *= np.sign((f2 * f1).sum(1, keepdims=True) + 1e-9)
        ok = (dist < stop) & (dist2 < stop) & ((f2 * D[idx]).sum(1) > 0.5)   # stay in the wall, no kinks
        alive[idx[~ok]] = False
        idx = idx[ok]
        P[idx] += h * f2[ok]; D[idx] = f2[ok]
        out.append(np.where(alive[:, None], P, np.nan))
    return np.stack(out, 1)                                  # seeds x steps x 3, nan once stopped


fwd, bwd = trace(1.0), trace(-1.0)
lines = []
for i in range(len(seeds)):
    a = fwd[i][~np.isnan(fwd[i][:, 0])]; b = bwd[i][~np.isnan(bwd[i][:, 0])]
    L = np.concatenate([b[::-1], a[1:]])
    if len(L) * h < 18: continue                            # drop stubs shorter than 18 mm
    lines.append(L[::4])                                     # keep a point every ~2.2 mm
log('streamlines', len(lines), 'of', len(seeds), 'seeds; mean length mm', round(np.mean([len(l) for l in lines]) * 4 * h, 1))

allp = np.concatenate(lines)
_, near = ptree.query(allp)
fz, frho, fv = Z[vpts[near]], RHO[vpts[near]], (V[vpts[near]] > 0).astype(np.uint8)
offs = np.cumsum([0] + [len(l) for l in lines]).astype('<u4')
with open(os.path.join(outdir, 'fibres.bin'), 'wb') as f:
    f.write(b'FIB1')
    f.write(struct.pack('<IIf', len(lines), len(allp), scale))
    f.write(offs.tobytes())
    f.write(q(allp).tobytes())
    f.write(u8(fz).tobytes()); f.write(u8(frho).tobytes()); f.write(fv.tobytes())
log('wrote fibres.bin', os.path.getsize(os.path.join(outdir, 'fibres.bin')), 'bytes,', len(allp), 'points')
