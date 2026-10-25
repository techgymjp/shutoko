// コースの中心線 (course-data.js の道路の線 → 2m 間隔)
// 座標系: x = 東, z = 南 (three.js), y = 上。距離 s はスタートからの道のり (m)

export const STEP = 2;

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Course {
  constructor(def) {
    this.def = def;
    const D = def.data;
    [this.lat0, this.lon0] = D.origin;
    this.kx = 111320 * Math.cos((this.lat0 * Math.PI) / 180);
    this.kz = 110574;
    // course-data.js の 5m 間隔の点を 2m 間隔に取り直す
    const n0 = D.x.length;
    this.length = (n0 - 1) * D.step;
    const N = Math.floor(this.length / STEP) + 1;
    this.N = N;
    const X = new Float32Array(N), Z = new Float32Array(N), Y = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const f = Math.min(n0 - 1.0001, (i * STEP) / D.step);
      const k = Math.floor(f), t = f - k;
      X[i] = D.x[k] + (D.x[k + 1] - D.x[k]) * t;
      Z[i] = D.z[k] + (D.z[k + 1] - D.z[k]) * t;
      Y[i] = D.h[k] + (D.h[k + 1] - D.h[k]) * t;
    }
    // 方位と曲率
    const A = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 2), b = Math.min(N - 1, i + 2);
      A[i] = Math.atan2(-(Z[b] - Z[a]), X[b] - X[a]);
    }
    const K = new Float32Array(N);
    const R = 6;
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - R), b = Math.min(N - 1, i + R);
      let d = A[b] - A[a];
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      K[i] = d / Math.max(STEP, (b - a) * STEP);
    }
    this.X = X; this.Y = Y; this.Z = Z; this.A = A; this.K = K;

    this.tunnels = D.tunnels.map((t) => [...t]);
    // 区間・出口の位置: OSM の出口・JCT の名前 / 緯度経度 / ゴールからの距離
    const junc = new Map(D.junctions);
    const posOf = (x) => x.s != null ? x.s
      : x.junction != null ? junc.get(x.junction) ?? 0
        : x.fromEnd != null ? this.length - x.fromEnd
          : this.nearest(this.project(x.at[0], x.at[1]));
    this.sections = (def.sections || []).map((x) => ({ ...x, s: posOf(x) })).sort((a, b) => a.s - b.s);
    this.marks = (def.marks || []).map((x) => ({ ...x, s: posOf(x) })).sort((a, b) => a.s - b.s);
    this.routeNo = (def.routeNo || []).map((x) => ({ ...x, s: posOf(x) })).sort((a, b) => a.s - b.s);
    // 道路わきの広告看板: { junction, before: その何m手前 }
    this.ads = (def.ads || []).map((x) => ({ ...x, s: posOf(x) - (x.before || 0) }));
    this.parks = (def.parks || []).map((x) => ({ ...x, ...this.project(x.lat, x.lon) }));
    this.landmarks = (def.landmarks || []).map((x) => {
      const L = { ...x, ...this.project(x.lat, x.lon) };
      L.s = this.nearest(L);
      // 1周のコース: ゴールのあとの区間 (スタートの先と同じ場所) ではなく、1周目の位置を使う
      if (D.loop && L.s > D.loop) L.s -= D.loop;
      return L;
    });

    // 近傍探索用のグリッド (建物が道路に重ならないように)
    this.grid = new Map();
    for (let i = 0; i < N; i += 5) {
      const key = this.cell(X[i], Z[i]);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(i);
    }
  }

  project(lat, lon) {
    return { x: (lon - this.lon0) * this.kx, z: -(lat - this.lat0) * this.kz };
  }

  cell(x, z) { return Math.floor(x / 100) + ',' + Math.floor(z / 100); }

  // 中心線までの最短距離 (おおよそ)
  // range: 探す範囲 (m)。これより遠い時は大きな値を返す
  distToRoad(x, z, range = 100) {
    const cx = Math.floor(x / 100), cz = Math.floor(z / 100);
    const n = Math.ceil(range / 100);
    let best = 1e9;
    for (let dx = -n; dx <= n; dx++) {
      for (let dz = -n; dz <= n; dz++) {
        const list = this.grid.get((cx + dx) + ',' + (cz + dz));
        if (!list) continue;
        for (const i of list) {
          const d = (this.X[i] - x) ** 2 + (this.Z[i] - z) ** 2;
          if (d < best) best = d;
        }
      }
    }
    return Math.sqrt(best);
  }

  nearest(p) {
    let best = 1e18, bi = 0;
    for (let i = 0; i < this.N; i++) {
      const d = (this.X[i] - p.x) ** 2 + (this.Z[i] - p.z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    return bi * STEP;
  }

  idx(s) {
    const f = Math.max(0, Math.min(this.N - 1.0001, s / STEP));
    const i = Math.floor(f);
    return [i, f - i];
  }

  // 道のり s・横位置 off (左が +) の点。out に x, y, z, tx, tz, lx, lz, a, k を入れる
  at(s, off = 0, out = {}) {
    const [i, t] = this.idx(s);
    const x = this.X[i] + (this.X[i + 1] - this.X[i]) * t;
    const z = this.Z[i] + (this.Z[i + 1] - this.Z[i]) * t;
    let da = this.A[i + 1] - this.A[i];
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const a = this.A[i] + da * t;
    out.a = a;
    out.tx = Math.cos(a);
    out.tz = -Math.sin(a);
    out.lx = out.tz;
    out.lz = -out.tx;
    out.x = x + out.lx * off;
    out.z = z + out.lz * off;
    out.y = this.Y[i] + (this.Y[i + 1] - this.Y[i]) * t;
    out.k = this.K[i] + (this.K[i + 1] - this.K[i]) * t;
    out.grade = (this.Y[i + 1] - this.Y[i]) / STEP;
    return out;
  }

  curv(s) {
    const [i, t] = this.idx(s);
    return this.K[i] + (this.K[i + 1] - this.K[i]) * t;
  }
  // s から先 len m の最大曲率 (AI のブレーキ判断)
  maxCurv(s, len) {
    let m = 0;
    for (let d = 0; d <= len; d += 8) m = Math.max(m, Math.abs(this.curv(s + d)));
    return m;
  }

  inTunnel(s) {
    for (const t of this.tunnels) if (s >= t[0] && s <= t[1]) return t;
    return null;
  }

  sectionAt(s) {
    let cur = this.sections[0];
    for (const x of this.sections) if (x.s <= s) cur = x;
    return cur;
  }

  routeNoAt(s) {
    let cur = this.routeNo[0];
    for (const x of this.routeNo) if (x.s <= s + 1) cur = x;
    return cur;
  }

  inPark(x, z, pad = 0) {
    for (const p of this.parks) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + pad) ** 2) return p;
    return null;
  }

}
