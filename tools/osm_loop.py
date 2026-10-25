#!/usr/bin/env python3
"""OpenStreetMap の環状線 (路線リレーションの全データ) から、指定した向きで1周する経路を求める。

使い方:
  python3 tools/osm_loop.py rc1.osm "Inner directions" 35.65385 139.74786 > path.json
    rc1.osm … /api/0.6/relation/4256008/full (首都高速都心環状線)
    role    … リレーションの member の role (内回り "Inner directions" / 外回り "Outer directions")
    緯度経度 … スタート地点 (この近くの点から1周してここへ戻る)
  出力は tools/osm_route.py と同じ形式 ([緯度, 経度, 橋?, トンネル?, layer, 路線番号, 路線名, 出口・JCT名])。
© OpenStreetMap contributors (ODbL)
"""
import heapq, json, math, sys
import xml.etree.ElementTree as ET

src, role, lat0, lon0 = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
r = ET.parse(src).getroot()
nodes, ntags = {}, {}
for n in r.findall('node'):
    nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')))
    t = {x.get('k'): x.get('v') for x in n.findall('tag')}
    if t.get('highway') == 'motorway_junction' or 'name' in t:
        ntags[n.get('id')] = t.get('name', '')
rel = r.find('relation')
roles = {m.get('ref'): m.get('role') for m in rel.findall('member') if m.get('type') == 'way'}
ways = {}
for w in r.findall('way'):
    if roles.get(w.get('id')) not in (role, ''):
        continue
    t = {x.get('k'): x.get('v') for x in w.findall('tag')}
    ways[w.get('id')] = {'nd': [x.get('ref') for x in w.findall('nd')], 't': t}

def dist(a, b):
    (la1, lo1), (la2, lo2) = nodes[a], nodes[b]
    return math.hypot((lo2 - lo1) * 111320 * math.cos(math.radians(la1)), (la2 - la1) * 110574)

G = {}
for wid, w in ways.items():
    nd = w['nd']
    pairs = list(zip(nd, nd[1:]))
    if w['t'].get('oneway') == '-1':
        pairs = [(b, a) for a, b in pairs]
    for a, b in pairs:
        G.setdefault(a, []).append((b, dist(a, b), wid))

# スタート: 指定地点にいちばん近い点
start = min((k for k in G), key=lambda k: (nodes[k][0] - lat0) ** 2 + (nodes[k][1] - lon0) ** 2)
# start の次の点から start へ戻る最短の道 = 1周
first, d0, w0 = G[start][0]
pq, prev, seen = [(d0, first)], {first: (start, w0)}, set()
while pq:
    d, u = heapq.heappop(pq)
    if u in seen:
        continue
    seen.add(u)
    if u == start:
        break
    for v, w, wid in G.get(u, []):
        if v not in seen and (v not in prev or v == start):
            prev.setdefault(v, (u, wid))
            heapq.heappush(pq, (d + w, v))
path = [start]
while True:
    p = prev[path[-1]][0]
    path.append(p)
    if p == start:
        break
path = path[::-1]
wayOf = {}
for a, b in zip(path, path[1:]):
    wayOf[a] = prev[b][1] if b in prev else None
L = sum(dist(a, b) for a, b in zip(path, path[1:]))
sys.stderr.write(f'1周 {L:.0f}m  点 {len(path)}\n')
out = []
for i, n in enumerate(path):
    wid = wayOf.get(n) or wayOf.get(path[i - 1])
    t = ways[wid]['t']
    out.append([nodes[n][0], nodes[n][1], t.get('bridge') in ('yes', 'viaduct'), t.get('tunnel') in ('yes', 'building_passage'),
                int(t.get('layer', '0') or 0), t.get('ref') or '', t.get('name') or '', ntags.get(n, '')])
json.dump(out, sys.stdout, ensure_ascii=False)
