#!/usr/bin/env python3
"""OpenStreetMap の首都高のデータから、通過地点を順にたどる走行経路を求める (一方通行どおり)。

使い方:
  python3 tools/osm_path.py --osm r11.osm rB.osm j_ariake.osm --via 35.6440,139.7560 --via 35.6330,139.7930 --via 35.6010,139.7560 > path.json
    --osm … /api/0.6/relation/<id>/full や /api/0.6/map?bbox= で取ったデータ (路線とJCT のランプ)
    --via … 緯度,経度。最初がスタート、最後がゴール、途中は必ず通る地点
  出力は tools/osm_route.py と同じ形式。レインボーブリッジなど高い橋は 9番目に路面の高さ (m) を入れる。
© OpenStreetMap contributors (ODbL)
"""
import heapq, json, math, sys
import xml.etree.ElementTree as ET

files, vias, mode = [], [], None
for a in sys.argv[1:]:
    if a in ('--osm', '--via'):
        mode = a
    elif mode == '--osm':
        files.append(a)
    elif mode == '--via':
        vias.append(tuple(map(float, a.split(','))))

nodes, ways, ntags = {}, {}, {}
for f in files:
    r = ET.parse(f).getroot()
    for n in r.findall('node'):
        nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')))
        t = {x.get('k'): x.get('v') for x in n.findall('tag')}
        if t.get('highway') == 'motorway_junction' or ('name' in t and t.get('highway') != 'traffic_signals'):
            ntags[n.get('id')] = t.get('name', '')
    for w in r.findall('way'):
        t = {x.get('k'): x.get('v') for x in w.findall('tag')}
        if t.get('highway') in ('motorway', 'motorway_link'):
            ways[w.get('id')] = {'nd': [x.get('ref') for x in w.findall('nd')], 't': t}

def dist(a, b):
    (la1, lo1), (la2, lo2) = nodes[a], nodes[b]
    return math.hypot((lo2 - lo1) * 111320 * math.cos(math.radians(la1)), (la2 - la1) * 110574)

G = {}
for wid, w in ways.items():
    nd = [x for x in w['nd'] if x in nodes]
    ow = w['t'].get('oneway', 'yes' if w['t']['highway'] == 'motorway' else 'no')
    pairs = list(zip(nd, nd[1:]))
    if ow == '-1':
        pairs = [(b, a) for a, b in pairs]
    for a, b in pairs:
        G.setdefault(a, []).append((b, dist(a, b), wid))
        if ow == 'no':
            G.setdefault(b, []).append((a, dist(a, b), wid))

def near(lat, lon, rad):
    return [k for k in G if math.hypot((nodes[k][1] - lon) * 90400, (nodes[k][0] - lat) * 110574) < rad]

def dijkstra(srcs, dsts):
    dsts = set(dsts)
    pq = [(0, s, None) for s in srcs]
    prev, seen = {}, set()
    while pq:
        d, u, p = heapq.heappop(pq)
        if u in seen:
            continue
        seen.add(u)
        prev[u] = p
        if u in dsts:
            path = [u]
            while prev[path[-1]]:
                path.append(prev[path[-1]][0])
            return d, path[::-1]
        for v, w, wid in G.get(u, []):
            if v not in seen:
                heapq.heappush(pq, (d + w, v, (u, wid)))
    return None, None

path = None
total = 0
cur = near(*vias[0], 250)
for (la, lo) in vias[1:]:
    d, p = dijkstra(cur, near(la, lo, 250))
    if p is None:
        sys.exit(f'経路が見つからない: {la},{lo}')
    total += d
    path = p if path is None else path + p[1:]
    cur = [p[-1]]
sys.stderr.write(f'長さ {total:.0f}m  点 {len(path)}\n')
wayOf = {}
for a, b in zip(path, path[1:]):
    for v, w, wid in G[a]:
        if v == b:
            wayOf[a] = wid
            break
out = []
for i, n in enumerate(path):
    wid = wayOf.get(n) or wayOf.get(path[i - 1])
    t = ways[wid]['t']
    nm = (t.get('name') or '') + (t.get('bridge:name') or '')
    high = 48 if ('レインボーブリッジ' in nm or '東京港連絡橋' in nm) else None
    out.append([nodes[n][0], nodes[n][1], t.get('bridge') in ('yes', 'viaduct'), t.get('tunnel') in ('yes', 'building_passage'),
                int(t.get('layer', '0') or 0), t.get('ref') or '', t.get('name') or '', ntags.get(n, ''), high])
json.dump(out, sys.stdout, ensure_ascii=False)
