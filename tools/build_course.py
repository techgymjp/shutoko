#!/usr/bin/env python3
"""高井戸→霞が関→用賀コースのデータ (js/course-data.js) を作る。

入力:
  path.json   … tools/osm_route.py が OpenStreetMap の首都高から求めた走行経路
                ([緯度, 経度, 橋?, トンネル?, layer, 路線番号, 路線名] の並び)
  bldg/*.json … PLATEAU CityGML から取り出した建物 (輪郭・高さ・名前)
出典:
  © OpenStreetMap contributors (ODbL)
  国土交通省 Project PLATEAU 3D都市モデル 東京都23区 (2020年度)

使い方:
  python3 tools/build_course.py <path.json> <bldg ディレクトリ> [変数名] [--loop] > js/course-data.js
    --loop … path.json が1周の経路 (最初と最後が同じ点) のとき。ゴールのあとも走れるよう
              スタートの先 900m を後ろにつなげ、その区間の建物も複製する
"""
import bisect, glob, json, math, sys

args = [a for a in sys.argv[1:] if not a.startswith('--')]
path_file, bldg_dir = args[0], args[1]
VAR = args[2] if len(args) > 2 else 'COURSE_DATA'
LOOP_MODE = '--loop' in sys.argv
CONT = 900
raw = json.load(open(path_file))
LOOP = None
if LOOP_MODE:
    # 1周の長さを測り、最初の CONT m ぶんの点を後ろに足す
    def d(a, b):
        return math.hypot((b[1] - a[1]) * 111320 * math.cos(math.radians(a[0])), (b[0] - a[0]) * 110574)
    LOOP = sum(d(a, b) for a, b in zip(raw, raw[1:]))
    acc0, k = 0, 1
    while k < len(raw) and acc0 < CONT + 50:
        acc0 += d(raw[k - 1], raw[k])
        k += 1
    raw = raw + raw[1:k]
LAT0, LON0 = raw[0][0], raw[0][1]
KX = 111320 * math.cos(math.radians(LAT0))
KZ = 110574
def proj(lat, lon):
    return ((lon - LON0) * KX, -(lat - LAT0) * KZ)

# ---------- 経路: 5m 間隔に取り直して平滑化 ----------
P = [proj(p[0], p[1]) for p in raw]
def raw_height(p):
    bridge, tunnel, layer = p[2], p[3], p[4]
    if len(p) > 8 and p[8]:
        return p[8]  # レインボーブリッジなど、高さを指定した橋
    if tunnel:
        return -10 if layer > -2 else -14
    if bridge:
        return min(22, max(8, 6 + 3.5 * layer))
    return -6 if layer < 0 else 1.0
H = [raw_height(p) for p in raw]
T = [1 if p[3] else 0 for p in raw]
JN = [p[7] if len(p) > 7 else '' for p in raw]
acc = [0.0]
for a, b in zip(P, P[1:]):
    acc.append(acc[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
L = acc[-1]
junctions = []
for i, n in enumerate(JN):
    if n and not any(j[0] == n for j in junctions):
        junctions.append([n, round(acc[i])])
STEP = 5
N = int(L // STEP) + 1
xs, zs, hs, ts = [], [], [], []
k = 0
for i in range(N):
    s = i * STEP
    while k < len(acc) - 2 and acc[k + 1] < s:
        k += 1
    t = (s - acc[k]) / max(1e-6, acc[k + 1] - acc[k])
    xs.append(P[k][0] + (P[k + 1][0] - P[k][0]) * t)
    zs.append(P[k][1] + (P[k + 1][1] - P[k][1]) * t)
    # 橋・トンネルの印は点 k から次の点までの区間のもの
    hs.append(H[k])
    ts.append(T[k])
def smooth(v, r, n=1):
    for _ in range(n):
        out = []
        for i in range(len(v)):
            a, b = max(0, i - r), min(len(v), i + r + 1)
            out.append(sum(v[a:b]) / (b - a))
        v = out
    return v
xs = smooth(xs, 3, 2)   # ±15m: OSM の折れ線の角をならす
zs = smooth(zs, 3, 2)
hs = smooth(hs, 24, 2)  # ±120m: 高架の上り下りをなだらかに
# トンネル区間 (短い途切れはつなぐ)
tunnels = []
i = 0
while i < N:
    if ts[i]:
        j = i
        while j < N and ts[j]:
            j += 1
        if tunnels and i * STEP - tunnels[-1][1] < 60:
            tunnels[-1][1] = j * STEP
        else:
            tunnels.append([i * STEP, j * STEP])
        i = j
    else:
        i += 1

# ---------- 近傍探索 ----------
CELL = 50
grid = {}
for i in range(N):
    grid.setdefault((int(xs[i] // CELL), int(zs[i] // CELL)), []).append(i)
def nearest(x, z, rad=450):
    cx, cz, r = int(x // CELL), int(z // CELL), int(rad // CELL) + 1
    best, bi = 1e18, -1
    for dx in range(-r, r + 1):
        for dz in range(-r, r + 1):
            for i in grid.get((cx + dx, cz + dz), ()):
                d = (xs[i] - x) ** 2 + (zs[i] - z) ** 2
                if d < best:
                    best, bi = d, i
    return bi, math.sqrt(best)
def side_offset(i, x, z):
    a, b = max(0, i - 1), min(N - 1, i + 1)
    tx, tz = xs[b] - xs[a], zs[b] - zs[a]
    l = math.hypot(tx, tz) or 1
    tx, tz = tx / l, tz / l
    lx, lz = tz, -tx  # 進行方向の左
    return (x - xs[i]) * lx + (z - zs[i]) * lz
def in_tunnel(s):
    return any(a - 20 <= s <= b + 20 for a, b in tunnels)

# ---------- 建物 ----------
def simplify(pts, eps):
    if len(pts) < 4:
        return pts
    def rdp(seg):
        a, b = seg[0], seg[-1]
        dx, dz = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dz) or 1e-9
        md, mi = 0, 0
        for i in range(1, len(seg) - 1):
            d = abs((seg[i][0] - a[0]) * dz - (seg[i][1] - a[1]) * dx) / l
            if d > md:
                md, mi = d, i
        if md > eps:
            return rdp(seg[:mi + 1])[:-1] + rdp(seg[mi:])
        return [a, b]
    # 閉じた多角形は最も遠い2点で分けて処理
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    out = rdp(pts[:far + 1])[:-1] + rdp(pts[far:] + [pts[0]])[:-1]
    return out if len(out) >= 3 else pts
def area(pts):
    return abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2

LEFT_CLEAR, RIGHT_CLEAR = 11, 19
# 手作りのモデルに置き換える所 (緯度, 経度, 半径m) … ここの PLATEAU の建物は除く
REPLACE = [
    (35.68037, 139.72879, 75),   # 迎賓館
    (35.67740, 139.72000, 55),   # 明治記念館
    (35.67870, 139.71870, 60),   # 聖徳記念絵画館
    (35.67590, 139.74480, 110),  # 国会議事堂
    (35.67790, 139.71460, 175),  # 国立競技場
    (35.67450, 139.71700, 100),  # 明治神宮野球場
    (35.65860, 139.74540, 60),   # 東京タワー
    (35.68022, 139.74014, 24),   # テックジム (平河町2-7-2 VORT永田町。PLATEAU 2020年度は建て替え前)
    (35.65950, 139.69870, 16),   # SHIBUYA109
    (35.62990, 139.79430, 70),   # 東京ビッグサイト 会議棟
]
rep_xy = [(*proj(a, b), r) for a, b, r in REPLACE]

CHUNK = 200
recs, names, dropped = [], [], 0
for f in sorted(glob.glob(bldg_dir + '/*.json')):
    for bd in json.load(open(f)):
        h = bd['h']
        if not h or h < 2.5:
            continue
        pts = [proj(la, lo) for la, lo in bd['r']]
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3:
            continue
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        i, d = nearest(cx, cz)
        if i < 0 or d > 430:
            continue
        a = area(pts)
        if a < 20 or (d > 160 and a < 45):
            continue
        if any((cx - x) ** 2 + (cz - z) ** 2 < r * r for x, z, r in rep_xy):
            continue
        # 道路にかかる建物は除く (トンネルの上はそのまま)
        hit = False
        if d < 120:
            offs = []
            for x, z in pts:
                j, dd = nearest(x, z, 200)
                if j < 0:
                    continue
                if in_tunnel(j * STEP):
                    continue
                o = side_offset(j, x, z)
                offs.append(o)
                if -RIGHT_CLEAR < o < LEFT_CLEAR and dd < 25:
                    hit = True
            if offs and min(offs) < 0 < max(offs) and min(abs(o) for o in offs) < 40:
                hit = True
        if hit:
            dropped += 1
            continue
        pts = simplify(pts, 0.8)
        q = [(round(x * 2), round(z * 2)) for x, z in pts]
        rec = [round(h * 2), len(q), q[0][0], q[0][1]]
        for (x0, z0), (x1, z1) in zip(q, q[1:]):
            rec += [x1 - x0, z1 - z0]
        sb = i * STEP
        if LOOP and sb >= LOOP:
            sb -= LOOP
        recs.append((int(sb // CHUNK), rec, bd['n'] if bd['n'] and h >= 40 else None))
        # 1周のコース: スタート付近の建物はゴールのあとの区間にも置く
        if LOOP and sb < CONT + 300 and sb + LOOP < L:
            recs.append((int((sb + LOOP) // CHUNK), rec, None))

# チャンク (200m) ごとに並べる。bidx[k] = チャンク k の先頭の位置 (b の添字)
recs.sort(key=lambda r: r[0])
out, flat, bidx = [], [], []
for ch, rec, nm in recs:
    while len(bidx) <= ch:
        bidx.append(len(flat))
    if nm:
        names.append([len(out), nm])
    out.append(rec)
    flat += rec
nch = int(L // CHUNK) + 1
while len(bidx) <= nch:
    bidx.append(len(flat))
data = {
    'source': '© OpenStreetMap contributors (ODbL) / 国土交通省 Project PLATEAU (東京都23区 2020年度)',
    'origin': [LAT0, LON0],
    'step': STEP,
    'x': [round(v, 1) for v in xs],
    'z': [round(v, 1) for v in zs],
    'h': [round(v, 1) for v in hs],
    'tunnels': tunnels,
    'loop': round(LOOP) if LOOP else None,
    'junctions': junctions,
    'chunk': CHUNK,
    'bidx': bidx,
    'bcount': len(out),
    'b': flat,
    'names': names,
}
sys.stderr.write(f'length {L:.0f}m points {N} buildings {len(out)} dropped {dropped} ints {len(flat)} tunnels {tunnels}\n')
sys.stdout.write('// 自動生成 (tools/build_course.py)。' + data['source'] + '\n')
sys.stdout.write('export const ' + VAR + ' = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
