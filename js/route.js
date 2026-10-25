// コースの中心線 (緯度経度の通過点 → 2m 間隔の滑らかな中心線)
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

const smooth = (t) => t * t * (3 - 2 * t);

export class Course {
  constructor(def) {
    this.def = def;
    const [lat0, lon0] = def.wp[0];
    this.lat0 = lat0;
    this.lon0 = lon0;
    this.kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
    this.kz = 110574;
    const P = def.wp.map(([la, lo, h, f]) => ({ ...this.project(la, lo), h, f }));

    // centripetal Catmull-Rom で細かく分割 (通過点ごとの道のりも記録)
    const dense = [];
    const wpIdx = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const n = Math.max(4, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / 1));
      wpIdx.push(dense.length);
      for (let j = 0; j < n; j++) dense.push(cr(p0, p1, p2, p3, j / n));
    }
    wpIdx.push(dense.length);
    dense.push({ x: P[P.length - 1].x, z: P[P.length - 1].z });

    const acc = [0];
    for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z));
    this.length = acc[acc.length - 1];
    this.wpS = wpIdx.map((i) => acc[i]);

    // 等間隔に取り直す
    const N = Math.floor(this.length / STEP) + 1;
    this.N = N;
    const X = new Float32Array(N), Z = new Float32Array(N), Y = new Float32Array(N);
    let k = 0;
    for (let i = 0; i < N; i++) {
      const s = i * STEP;
      while (k < acc.length - 2 && acc[k + 1] < s) k++;
      const t = (s - acc[k]) / Math.max(1e-6, acc[k + 1] - acc[k]);
      X[i] = dense[k].x + (dense[k + 1].x - dense[k].x) * t;
      Z[i] = dense[k].z + (dense[k + 1].z - dense[k].z) * t;
    }
    // 高さ: 通過点の間を滑らかにつなぐ
    let w = 0;
    for (let i = 0; i < N; i++) {
      const s = i * STEP;
      while (w < this.wpS.length - 2 && this.wpS[w + 1] < s) w++;
      const t = Math.min(1, Math.max(0, (s - this.wpS[w]) / (this.wpS[w + 1] - this.wpS[w])));
      Y[i] = P[w].h + (P[w + 1].h - P[w].h) * smooth(t);
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

    // トンネル区間
    this.tunnels = [];
    P.forEach((p, i) => {
      if (p.f === 'T' && i < P.length - 1) {
        const last = this.tunnels[this.tunnels.length - 1];
        if (last && Math.abs(last[1] - this.wpS[i]) < 1) last[1] = this.wpS[i + 1];
        else this.tunnels.push([this.wpS[i], this.wpS[i + 1]]);
      }
    });

    const near = (at) => this.nearest(this.project(at[0], at[1]));
    this.sections = (def.sections || []).map((x) => ({ ...x, s: near(x.at) })).sort((a, b) => a.s - b.s);
    this.marks = (def.marks || []).map((x) => ({ ...x, s: near(x.at) })).sort((a, b) => a.s - b.s);
    this.routeNo = (def.routeNo || []).map((x) => ({ ...x, s: near(x.from) })).sort((a, b) => a.s - b.s);
    this.parks = (def.parks || []).map((x) => ({ ...x, ...this.project(x.lat, x.lon) }));
    this.districts = (def.districts || []).map((x) => ({ ...x, ...this.project(x.lat, x.lon) }));
    this.landmarks = (def.landmarks || []).map((x) => {
      const L = { ...x, ...this.project(x.lat, x.lon) };
      L.s = this.nearest(L);
      // side: 道路からの横位置 (左が +) を指定したものは、道路に沿わせて置く
      if (x.side) {
        const p = this.at(L.s, x.side);
        L.x = p.x;
        L.z = p.z;
      }
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

  district(x, z) {
    let best = null, bw = 0;
    for (const d of this.districts) {
      const w = 1 - Math.hypot(d.x - x, d.z - z) / d.r;
      if (w > bw) { bw = w; best = d; }
    }
    return best ? { d: best, w: bw } : null;
  }
}

function cr(p0, p1, p2, p3, t) {
  // centripetal Catmull-Rom (alpha = 0.5)
  const d = (a, b) => Math.max(1e-4, Math.pow(Math.hypot(b.x - a.x, b.z - a.z), 0.5));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => {
    const k = tb - ta < 1e-6 ? 0 : (u - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  };
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}
