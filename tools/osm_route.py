#!/usr/bin/env python3
"""OpenStreetMap の首都高 (4号・C1・3号の路線リレーションと、三宅坂JCT・谷町JCT 付近のランプ) から
高井戸 → 霞が関 (C1 内回り) → 用賀 の走行経路を一方通行に従って求め、path.json に書き出す。

入力 (api.openstreetmap.org から取得):
  r4.osm  … /api/0.6/relation/4256522/full (首都高速4号新宿線)
  rc1.osm … /api/0.6/relation/4256008/full (首都高速都心環状線)
  r3.osm  … /api/0.6/relation/4256376/full (首都高速3号渋谷線)
  jmiyake.osm / jtani.osm … /api/0.6/map?bbox= で取った三宅坂JCT・谷町JCT 付近
© OpenStreetMap contributors (ODbL)
"""
import heapq, json, math, xml.etree.ElementTree as ET
nodes, ways, ntags = {}, {}, {}
for f in ('r4.osm', 'rc1.osm', 'r3.osm', 'jmiyake.osm', 'jtani.osm'):
    r = ET.parse(f).getroot()
    for n in r.findall('node'):
        nodes[n.get('id')] = (float(n.get('lat')), float(n.get('lon')))
        t = {x.get('k'): x.get('v') for x in n.findall('tag')}
        if t.get('highway') == 'motorway_junction' or t.get('barrier') == 'toll_booth' or 'name' in t:
            ntags[n.get('id')] = t.get('name', '')
    for w in r.findall('way'):
        t = {x.get('k'): x.get('v') for x in w.findall('tag')}
        if t.get('highway') not in ('motorway', 'motorway_link'):
            continue
        ways[w.get('id')] = {'nd': [x.get('ref') for x in w.findall('nd')], 't': t}
def dist(a, b):
    (la1, lo1), (la2, lo2) = nodes[a], nodes[b]
    return math.hypot((lo2 - lo1) * 111320 * math.cos(math.radians(35.67)), (la2 - la1) * 110574)
G = {}
for wid, w in ways.items():
    nd = w['nd']
    ow = w['t'].get('oneway', 'yes' if w['t']['highway'] == 'motorway' else 'no')
    pairs = list(zip(nd, nd[1:]))
    if ow == '-1': pairs = [(b, a) for a, b in pairs]
    for a, b in pairs:
        if a in nodes and b in nodes:
            G.setdefault(a, []).append((b, dist(a, b), wid))
            if ow == 'no': G.setdefault(b, []).append((a, dist(a, b), wid))
def near(lat, lon, rad=250):
    out = []
    for k, (la, lo) in nodes.items():
        if k not in G: continue
        d = math.hypot((lo - lon) * 90400, (la - lat) * 110574)
        if d < rad: out.append(k)
    return out
def dijkstra(srcs, dsts):
    dsts = set(dsts)
    pq = [(0, s, None) for s in srcs]; prev = {}; seen = set()
    while pq:
        d, u, p = heapq.heappop(pq)
        if u in seen: continue
        seen.add(u); prev[u] = p
        if u in dsts:
            path = [u]
            while prev[path[-1]]: path.append(prev[path[-1]][0])
            return d, path[::-1]
        for v, w, wid in G.get(u, []):
            if v not in seen: heapq.heappush(pq, (d + w, v, (u, wid)))
    return None, None
A = near(35.6805, 139.6050, 300)   # 高井戸 (4号の西の端)
K = near(35.6735, 139.7482, 250)   # 霞が関 (C1)
E = near(35.6268, 139.6330, 400)   # 用賀
d1, p1 = dijkstra(A, K)
d2, p2 = dijkstra([p1[-1]], E)
print('高井戸→霞が関', round(d1), 'm  霞が関→用賀', round(d2), 'm')
path = p1 + p2[1:]
# 各点の way のタグ (橋・トンネル・layer)
segs = []
wayOf = {}
for a, b in zip(path, path[1:]):
    for v, w, wid in G[a]:
        if v == b: wayOf[a] = wid; break
pts = []
for n in path:
    t = ways[wayOf.get(n, wayOf.get(path[-2]))]['t']
    pts.append([nodes[n][0], nodes[n][1], t.get('bridge') == 'yes' or t.get('bridge') == 'viaduct', t.get('tunnel') in ('yes', 'building_passage'), int(t.get('layer', '0') or 0), t.get('ref') or '', t.get('name') or '', ntags.get(n, '')])
json.dump(pts, open('path.json', 'w'), ensure_ascii=False)
print(len(pts), 'points')
prev = None
for p in pts:
    key = (p[5], p[2], p[3], p[4])
    if key != prev: print(p[:2], 'ref', p[5], 'bridge' if p[2] else '', 'tunnel' if p[3] else '', 'layer', p[4], p[6]); prev = key
