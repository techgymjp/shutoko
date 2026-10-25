#!/usr/bin/env python3
"""PLATEAU 東京都23区 CityGML (2020年度) から、コース沿いの建物の輪郭 (lod0RoofEdge)・高さ・地面の標高・名前を取り出す。

使い方: python3 tools/extract_bldg.py <CityGML の zip の URL> <path.json>
  zip 全体 (約4.5GB) はダウンロードせず、HTTP の Range で必要なメッシュのファイルだけ読む (tools/rzip.py)。
  結果は bldg/<3次メッシュ>.json に出る。
"""
import json, os, sys, shutil, xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from rzip import open_zip
NS = {'bldg': 'http://www.opengis.net/citygml/building/2.0', 'gml': 'http://www.opengis.net/gml',
      'core': 'http://www.opengis.net/citygml/2.0'}
B = '{%s}' % NS['bldg']; G = '{%s}' % NS['gml']; C = '{%s}' % NS['core']
url, path_file = sys.argv[1], sys.argv[2]

# 経路の周り (±700m) の3次メッシュ
def mesh3(lat, lon):
    a = lat * 1.5; p = int(a); a = (a - p) * 8; q = int(a); r = int((a - q) * 10)
    b = lon - 100; u = int(b); b = (b - u) * 8; v = int(b); w = int((b - v) * 10)
    return f'{p}{u}{q}{v}{r}{w}'
want = set()
for la, lo, *_ in json.load(open(path_file)):
    for dla in (-0.0065, 0, 0.0065):
        for dlo in (-0.008, 0, 0.008):
            want.add(mesh3(la + dla, lo + dlo))
files = {}
for info in open_zip(url).infolist():
    name = info.filename
    if '/udx/bldg/' in name and name.endswith('.gml'):
        code = name.split('/')[-1][:8]
        if code in want:
            files[code] = name
os.makedirs('bldg', exist_ok=True)

def parse(path):
    out = []
    for ev, el in ET.iterparse(path, events=('end',)):
        if el.tag != C + 'cityObjectMember':
            continue
        b = el.find(B + 'Building')
        if b is not None:
            h = b.find(B + 'measuredHeight')
            name = b.find(G + 'name')
            edge = b.find(B + 'lod0RoofEdge')
            if edge is None:
                edge = b.find(B + 'lod0FootPrint')
            if edge is not None:
                pl = edge.find('.//' + G + 'posList')
                v = list(map(float, pl.text.split()))
                ring = [(round(v[i], 7), round(v[i + 1], 7)) for i in range(0, len(v), 3)]
                # 地面の標高: lod1Solid の最小 z
                zmin = None
                solid = b.find(B + 'lod1Solid')
                if solid is not None:
                    zs = [float(x) for p in solid.iter(G + 'posList') for x in p.text.split()[2::3]]
                    zmin = min(zs) if zs else None
                out.append({'h': float(h.text) if h is not None and h.text else None, 'z': zmin,
                            'n': name.text if name is not None else None, 'r': ring})
        el.clear()
    return out

def work(code):
    dst = f'bldg/{code}.json'
    if os.path.exists(dst):
        return code, 'skip'
    z = open_zip(url)
    tmp = f'tmp_{code}.gml'
    with z.open(files[code]) as s, open(tmp, 'wb') as d:
        shutil.copyfileobj(s, d, 1 << 20)
    data = parse(tmp)
    os.remove(tmp)
    json.dump(data, open(dst, 'w'), ensure_ascii=False)
    return code, len(data)

with ThreadPoolExecutor(4) as ex:
    for code, n in ex.map(work, sorted(files)):
        print(code, n, flush=True)
