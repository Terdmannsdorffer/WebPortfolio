"""heartmesh.py - turn a tetrahedral four-chamber heart mesh (legacy ASCII VTK
unstructured grid, or CARP .pts/.elem) into a small binary surface for the hero.

usage: python heartmesh.py <file.vtk | dir-with-.pts-and-.elem> <out.bin> [target_tris]

Output layout (little-endian):
  'HRT1' | u32 nVerts | u32 nTris | f32 scale | f32x3 (unused)
  i16 x nVerts*3   positions, world = q / 32767 * scale (already centred)
  u16|u32 x nTris*3 indices (u16 when nVerts <= 65535)
  u8  x nVerts     region id (0..k-1; the tag->id map is printed)
"""
import sys, os, re, glob, json, struct, time
import numpy as np

src, out = sys.argv[1], sys.argv[2]
target = int(sys.argv[3]) if len(sys.argv) > 3 else 40000
t0 = time.time()
log = lambda *a: print(*a, f'[{time.time()-t0:.1f}s]', flush=True)


def read_vtk(path):
    txt = open(path, 'r', errors='ignore').read()
    log('read', len(txt) // 1_000_000, 'MB')
    heads = [(m.start(), m.group(1)) for m in re.finditer(r'^(POINTS|CELLS|CELL_TYPES|CELL_DATA|POINT_DATA)\b', txt, re.M)]
    heads.append((len(txt), 'END'))
    log('sections', [h[1] for h in heads[:-1]])

    def block(name):
        for i, (pos, nm) in enumerate(heads):
            if nm == name:
                line_end = txt.index('\n', pos)
                return txt[pos:line_end].split(), txt[line_end:heads[i + 1][0]]
        return None, ''

    hdr, body = block('POINTS')
    n = int(hdr[1])
    pts = np.fromstring(body, dtype=np.float64, sep=' ')[:n * 3].reshape(n, 3)
    log('points', pts.shape)
    hdr, body = block('CELLS')
    m, size = int(hdr[1]), int(hdr[2])
    cells = np.fromstring(body, dtype=np.int64, sep=' ')[:size]
    if size == m * 5:
        tets = cells.reshape(m, 5)[:, 1:]
    else:                                   # mixed cell types: keep the 4-node ones
        tets, p = [], 0
        for _ in range(m):
            c = cells[p]
            if c == 4:
                tets.append(cells[p + 1:p + 5])
            p += c + 1
        tets = np.array(tets, dtype=np.int64)
    log('tets', tets.shape)
    tags = np.zeros(len(tets), dtype=np.int32)
    hdr, body = block('CELL_DATA')
    if hdr:
        m2 = re.search(r'SCALARS\s+\S+\s+\S+(?:\s+\d+)?[ \t]*\n(?:LOOKUP_TABLE\s+\S+[ \t]*\n)?', body)
        if m2:
            start = m2.end()
            m3 = re.search(r'^(VECTORS|SCALARS|NORMALS|FIELD|TENSORS)', body[start:], re.M)
            end = start + (m3.start() if m3 else len(body) - start)
            vals = np.fromstring(body[start:end], dtype=np.float64, sep=' ')
            if len(vals) >= m:
                tags = vals[:m].astype(np.int32)
        log('cell data tags', np.unique(tags).tolist())
    return pts, tets, tags


def read_carp(d):
    pts_file = sorted(glob.glob(os.path.join(d, '**', '*.pts'), recursive=True), key=os.path.getsize)[-1]
    elem_file = sorted(glob.glob(os.path.join(d, '**', '*.elem'), recursive=True), key=os.path.getsize)[-1]
    with open(pts_file) as f:
        n = int(f.readline())
    pts = np.loadtxt(pts_file, skiprows=1, dtype=np.float64, max_rows=n)
    tets, tags = [], []
    with open(elem_file) as f:
        f.readline()
        for line in f:
            p = line.split()
            if p and p[0] == 'Tt':
                tets.append((int(p[1]), int(p[2]), int(p[3]), int(p[4])))
                tags.append(int(p[5]) if len(p) > 5 else 0)
    return pts, np.array(tets, dtype=np.int64), np.array(tags, dtype=np.int32)


pts, tets, tags = read_vtk(src) if src.lower().endswith('.vtk') else read_carp(src)

# boundary faces = faces that belong to exactly one tet
f_idx = np.array([[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]])
opp_idx = np.array([3, 2, 1, 0])
faces = tets[:, f_idx].reshape(-1, 3)
face_tag = np.repeat(tags, 4)
face_tet = np.repeat(np.arange(len(tets)), 4)
face_opp = np.tile(opp_idx, len(tets))
key = np.sort(faces, axis=1)
order = np.lexsort((key[:, 2], key[:, 1], key[:, 0]))
ks = key[order]
eq = (ks[1:] == ks[:-1]).all(1)
single = ~(np.r_[False, eq] | np.r_[eq, False])
sel = order[single]
bfaces, btags = faces[sel], face_tag[sel]
log('boundary faces', len(bfaces))

# orient outward: the tet's opposite vertex must be behind the face
p0, p1, p2 = pts[bfaces[:, 0]], pts[bfaces[:, 1]], pts[bfaces[:, 2]]
nrm = np.cross(p1 - p0, p2 - p0)
inside = pts[tets[face_tet[sel], face_opp[sel]]] - p0
flip = (nrm * inside).sum(1) > 0
bfaces[flip] = bfaces[flip][:, [0, 2, 1]]

# compact vertices; per-vertex tag = majority of incident faces
used, inv = np.unique(bfaces, return_inverse=True)
V = pts[used]
F = inv.reshape(-1, 3)


def majority(F_or_map, ftags, nv):
    vt = np.zeros(nv, dtype=np.int32); best = np.zeros(nv)
    for t in np.unique(ftags):
        cnt = np.bincount(F_or_map[ftags == t].ravel(), minlength=nv)
        better = cnt > best
        vt[better] = t; best[better] = cnt[better]
    return vt


vt = majority(F, btags, len(V))
log('surface', len(V), 'verts', len(F), 'tris')

try:
    import fast_simplification
    red = max(0.0, 1.0 - target / len(F))
    V2, F2, collapses = fast_simplification.simplify(V.astype(np.float32), F.astype(np.int32),
                                                     target_reduction=red, return_collapses=True)
    _, _, mapping = fast_simplification.replay_simplification(V.astype(np.float32), F.astype(np.int32), collapses)
    vt = majority(np.asarray(mapping), vt, len(V2))
    V, F = V2.astype(np.float64), F2.astype(np.int64)
    log('quadric decimation ->', len(V), 'verts', len(F), 'tris')
except Exception as e:
    log('fast_simplification unavailable:', e, '- vertex clustering instead')
    ext = V.max(0) - V.min(0)
    cell = (ext.prod() / (target * 0.9)) ** (1 / 3)
    for _ in range(12):
        g = np.floor((V - V.min(0)) / cell).astype(np.int64)
        kid = g[:, 0] * 1_000_003 + g[:, 1] * 1_009 + g[:, 2]
        uk, inv2 = np.unique(kid, return_inverse=True)
        Fc = inv2[F]
        Fc = Fc[(Fc[:, 0] != Fc[:, 1]) & (Fc[:, 1] != Fc[:, 2]) & (Fc[:, 0] != Fc[:, 2])]
        if len(Fc) <= target * 1.15:
            break
        cell *= 1.12
    cnt = np.bincount(inv2, minlength=len(uk))
    Vc = np.stack([np.bincount(inv2, weights=V[:, d], minlength=len(uk)) / cnt for d in range(3)], 1)
    vt = majority(inv2, vt, len(uk))
    V, F = Vc, Fc
    log('clustered ->', len(V), 'verts', len(F), 'tris')

used, inv = np.unique(F, return_inverse=True)
V, vt, F = V[used], vt[used], inv.reshape(-1, 3)
center = (V.max(0) + V.min(0)) / 2
V = V - center
scale = float((V.max(0) - V.min(0)).max() / 2)
Vq = np.clip(np.round(V / scale * 32767), -32767, 32767).astype('<i2')
tag_ids = {int(t): i for i, t in enumerate(sorted(np.unique(vt).tolist()))}
vt8 = np.array([tag_ids[int(t)] for t in vt], dtype=np.uint8)
counts = {int(t): int((vt == t).sum()) for t in np.unique(vt)}
log('tag -> id', json.dumps(tag_ids)); log('verts per tag', json.dumps(counts))
log('extent (x,y,z)', (V.max(0) - V.min(0)).round(1).tolist(), 'centroid', V.mean(0).round(2).tolist())

with open(out, 'wb') as f:
    f.write(b'HRT1')
    f.write(struct.pack('<IIf3f', len(V), len(F), scale, 0.0, 0.0, 0.0))
    f.write(Vq.tobytes())
    f.write((F.astype('<u2') if len(V) <= 65535 else F.astype('<u4')).tobytes())
    f.write(vt8.tobytes())
log('wrote', out, os.path.getsize(out), 'bytes')
