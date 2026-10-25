// 首都高と沿線の 3D 世界 (道のりに沿ってチャンク単位で生成・破棄する)
import * as THREE from '../vendor/three.module.min.js';
import { rng, STEP } from './route.js';
import {
  asphaltTex, concreteTex, barrierTex, tunnelWallTex, windowTex, signTex, bannerTex, checkerTex,
  plateTex, makeLandmark, mat, canvasTex,
} from './models.js';

// 道路の寸法 (m)。横位置は進行方向の左が +
export const LANE_W = 3.5;
export const SH_L = 1.0;   // 左路肩
export const SH_R = 0.75;  // 右路肩
export const ROAD_W = SH_L + LANE_W * 2 + SH_R;
export const HALF = ROAD_W / 2;
export const LANES = [HALF - SH_L - LANE_W / 2, HALF - SH_L - LANE_W * 1.5]; // 走行車線・追越車線の中心
export const OPP_OFF = -(ROAD_W + 1.3); // 対向車線の中心
const CHUNK = 200;
const AHEAD = 2600;
const BEHIND = 250;
export const yawOf = (a) => a - Math.PI / 2;

// ---------------- 時間帯 ----------------
export const THEMES = {
  day: {
    label: '昼', night: false,
    skyTop: 0x3f7fd0, skyBottom: 0xcfe0ee, fog: 0xc6d4e0, fogNear: 250, fogFar: 3200,
    hemiSky: 0xdfeeff, hemiGround: 0x6a6a60, hemi: 1.6, sun: 0xfff3e0, sunI: 2.2, sunDir: [-0.4, 0.8, 0.3],
    ground: '#6c6e6c', lamp: 0x000000,
  },
  dusk: {
    label: '夕暮れ', night: false,
    skyTop: 0x2b3f78, skyBottom: 0xf3a060, fog: 0xc89a80, fogNear: 220, fogFar: 2800,
    hemiSky: 0xffc8a0, hemiGround: 0x403848, hemi: 1.1, sun: 0xffa060, sunI: 1.8, sunDir: [-0.9, 0.22, 0.25],
    ground: '#57514f', lamp: 0xffb060,
  },
  night: {
    label: '夜', night: true,
    skyTop: 0x05070f, skyBottom: 0x1d2236, fog: 0x161a28, fogNear: 150, fogFar: 2400,
    hemiSky: 0x5a6a90, hemiGround: 0x202028, hemi: 0.75, sun: 0x8090c0, sunI: 0.35, sunDir: [0.3, 0.8, -0.2],
    ground: '#2a2b30', lamp: 0xffc070,
  },
};

// ---------------- ジオメトリ補助 ----------------
class Geo {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  quad(a, b, c, d, nrm, uvs, color) {
    const base = this.n;
    for (const [i, p] of [a, b, c, d].entries()) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nrm[0], nrm[1], nrm[2]);
      this.uv.push(uvs ? uvs[i * 2] : 0, uvs ? uvs[i * 2 + 1] : 0);
      if (color) this.col.push(color.r, color.g, color.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.n += 4;
  }
  // 箱 (cx, cy=底, cz, 幅 w, 高さ h, 奥行 d, 回転 yaw)。uvm: 側面の UV を m 単位で (4m×3.5m で1周)
  box(cx, cy, cz, w, h, d, yaw, color, uvm = false) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const N = (x, y, z) => [x * c + z * s, y, -x * s + z * c];
    const hw = w / 2, hd = d / 2;
    const fu = (len) => (uvm ? len / 4 : 1), fv = uvm ? h / 3.5 : 1;
    const faces = [
      [[-hw, 0, hd], [hw, 0, hd], [hw, h, hd], [-hw, h, hd], [0, 0, 1], w],
      [[hw, 0, -hd], [-hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd], [0, 0, -1], w],
      [[hw, 0, hd], [hw, 0, -hd], [hw, h, -hd], [hw, h, hd], [1, 0, 0], d],
      [[-hw, 0, -hd], [-hw, 0, hd], [-hw, h, hd], [-hw, h, -hd], [-1, 0, 0], d],
    ];
    for (const [a, b, cc, dd, n, len] of faces) {
      const u = fu(len);
      this.quad(P(...a), P(...b), P(...cc), P(...dd), N(...n), [0, 0, u, 0, u, fv, 0, fv], color);
    }
    // 屋上 (UV は窓のない所)
    this.quad(P(-hw, h, hd), P(hw, h, hd), P(hw, h, -hd), P(-hw, h, -hd), [0, 1, 0], [0.01, 0.01, 0.02, 0.01, 0.02, 0.02, 0.01, 0.02], color);
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

// 中心線に沿って断面を掃引する。section(p) → [[横位置, 高さ], ...]。u は断面に沿った長さ / uScale
function sweep(course, s0, s1, step, section, { uScale = 1, vScale = 1, uFixed = null } = {}) {
  const pos = [], uv = [], idx = [];
  const p = {};
  let n = 0, rows = 0;
  for (let s = s0; ; s += step) {
    const ss = Math.min(s, s1);
    course.at(ss, 0, p);
    const sec = section(p, ss);
    n = sec.length;
    let u = 0;
    for (let k = 0; k < n; k++) {
      const [off, y] = sec[k];
      if (k > 0) u += Math.hypot(off - sec[k - 1][0], y - sec[k - 1][1]);
      pos.push(p.x + p.lx * off, y, p.z + p.lz * off);
      uv.push(uFixed ? uFixed[k] : u / uScale, ss / vScale);
    }
    rows++;
    if (ss >= s1) break;
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let k = 0; k < n - 1; k++) {
      const a = j * n + k, b = a + n;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------- World ----------------
export class World {
  constructor(scene, course, themeKey) {
    this.scene = scene;
    this.course = course;
    this.theme = THEMES[themeKey] || THEMES.day;
    this.chunks = new Map();
    this.lightSprites = [];
    this.root = new THREE.Group();
    scene.add(this.root);
    this.initMaterials();
    this.initEnvironment();
    this.initStatic();
  }

  initMaterials() {
    const T = this.theme;
    const night = T.night;
    const conc = concreteTex();
    const lampDim = night ? 1 : 0.0;
    this.M = {
      road: new THREE.MeshLambertMaterial({ map: asphaltTex(ROAD_W, LANE_W, SH_L), color: night ? 0x8a8a8a : 0xffffff }),
      oppRoad: new THREE.MeshLambertMaterial({ map: asphaltTex(ROAD_W, LANE_W, SH_L), color: night ? 0x777777 : 0xdddddd }),
      wall: new THREE.MeshLambertMaterial({ map: conc, side: THREE.DoubleSide }),
      girder: new THREE.MeshLambertMaterial({ color: 0x8e9b98, side: THREE.DoubleSide }),
      pier: new THREE.MeshLambertMaterial({ map: conc, color: 0xcfcac0 }),
      barrier: new THREE.MeshLambertMaterial({ map: barrierTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      tunnel: new THREE.MeshLambertMaterial({ map: tunnelWallTex(), side: THREE.DoubleSide, color: 0xcfcac0 }),
      tunnelLamp: new THREE.MeshBasicMaterial({ color: 0xffc46a }),
      lamp: new THREE.MeshBasicMaterial({ color: night || T.lamp ? 0xfff0c8 : 0xe8eef0 }),
      pole: mat(0x7d8790),
      street: new THREE.MeshLambertMaterial({ map: this.streetTex(), color: night ? 0x777777 : 0xffffff }),
      bldg0: new THREE.MeshLambertMaterial({ map: windowTex(night, 0), vertexColors: true }),
      bldg1: new THREE.MeshLambertMaterial({ map: windowTex(night, 1), vertexColors: true }),
      tree: new THREE.MeshLambertMaterial({ vertexColors: true }),
      sign: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    };
    if (night) {
      for (const k of ['bldg0', 'bldg1']) {
        this.M[k].emissive = new THREE.Color(0xffffff);
        this.M[k].emissiveMap = this.M[k].map;
        this.M[k].emissiveIntensity = 0.7;
      }
    }
    this.lampDim = lampDim;
  }

  streetTex() {
    return canvasTex('street', 256, 512, (g, w, h) => {
      g.fillStyle = '#55585c';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8e8e0';
      for (const u of [0.04, 0.96]) g.fillRect(u * w - 2, 0, 4, h);
      for (const u of [0.2, 0.33, 0.67, 0.8]) g.fillRect(u * w - 2, 0, 4, h * 0.4);
      g.fillStyle = '#d8b030';
      g.fillRect(0.5 * w - 5, 0, 4, h);
      g.fillRect(0.5 * w + 1, 0, 4, h);
    }, { repeat: true });
  }

  initEnvironment() {
    const T = this.theme;
    const scene = this.scene;
    scene.fog = new THREE.Fog(T.fog, T.fogNear, T.fogFar);
    scene.background = new THREE.Color(T.fog);
    // 空 (グラデーションの球)
    const skyGeo = new THREE.SphereGeometry(18000, 24, 12);
    const top = new THREE.Color(T.skyTop), bot = new THREE.Color(T.skyBottom), fog = new THREE.Color(T.fog);
    const col = [];
    const pa = skyGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i) / 18000;
      const c = y < 0 ? fog.clone() : y < 0.08 ? fog.clone().lerp(bot, y / 0.08) : bot.clone().lerp(top, Math.pow((y - 0.08) / 0.92, 0.6));
      col.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    // 太陽・月
    const sunTex = canvasTex('sun', 128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,240,1)');
      gr.addColorStop(0.2, 'rgba(255,240,200,0.9)');
      gr.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, color: T.night ? 0xccd8ff : 0xffffff }));
    this.sun.scale.setScalar(T.night ? 500 : 1400);
    this.sunDir = new THREE.Vector3(...T.sunDir).normalize();
    scene.add(this.sun);
    // 星
    if (T.night) {
      const sp = [];
      const r = rng(7);
      for (let i = 0; i < 600; i++) {
        const a = r() * Math.PI * 2, e = 0.12 + r() * 1.3;
        sp.push(Math.cos(a) * Math.cos(e) * 16000, Math.sin(e) * 16000, Math.sin(a) * Math.cos(e) * 16000);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.6 }));
      scene.add(this.stars);
    }
    // 光源
    scene.add(new THREE.HemisphereLight(T.hemiSky, T.hemiGround, T.hemi));
    const dl = new THREE.DirectionalLight(T.sun, T.sunI);
    dl.position.copy(this.sunDir).multiplyScalar(100);
    scene.add(dl);
    // 地面 (カメラについてくる)
    const gt = canvasTex('ground-' + T.ground, 512, 512, (g, w, h) => {
      g.fillStyle = T.ground;
      g.fillRect(0, 0, w, h);
      const r = rng(3);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.05})`;
        g.fillRect(r() * w, r() * h, 10 + r() * 60, 10 + r() * 60);
      }
      g.fillStyle = T.night ? 'rgba(255,200,120,0.22)' : 'rgba(40,40,44,0.55)';
      for (let i = 0; i < w; i += 128) { g.fillRect(i, 0, 12, h); g.fillRect(0, i, w, 12); }
    }, { repeat: true });
    gt.repeat.set(100, 100);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshLambertMaterial({ map: gt }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.renderOrder = -5;
    scene.add(this.ground);
  }

  initStatic() {
    const c = this.course;
    const T = this.theme;
    // 公園・お濠
    for (const p of c.parks) {
      const water = p.kind === 'water';
      const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40), new THREE.MeshLambertMaterial({
        color: water ? (T.night ? 0x10202a : 0x3d6676) : (T.night ? 0x1d2a1c : 0x55783e),
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, water ? 0.04 : 0.08, p.z);
      this.scene.add(m);
    }
    // ランドマーク
    const center = c.at(c.length / 2);
    for (const L of c.landmarks) {
      const o = makeLandmark(L.model, T.night);
      if (!o) continue;
      let x = L.x, z = L.z;
      if (L.far) {
        // 遠くの山や塔は 14km 先に縮めて置く (見た目の大きさは同じ)
        const dx = x - center.x, dz = z - center.z;
        const d = Math.hypot(dx, dz);
        const D = Math.min(d, 14000);
        o.scale.setScalar(D / d);
        x = center.x + (dx / d) * D;
        z = center.z + (dz / d) * D;
        o.traverse((m) => { if (m.material) m.material.fog = false; });
      } else {
        o.rotation.y = c.at(L.s).a - Math.PI / 2;
      }
      o.position.set(x, 0, z);
      this.scene.add(o);
      if (T.night && !L.far) this.addAviationLight(o, x, z);
    }
  }

  addAviationLight(o, x, z) {
    const box = new THREE.Box3().setFromObject(o);
    if (box.max.y < 60) return;
    this.aviation = this.aviation || [];
    this.aviation.push([x, box.max.y + 1, z]);
  }

  // 夜の航空障害灯 (赤く点滅)
  buildAviation() {
    if (!this.aviation || this.avPoints) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.aviation.flat(), 3));
    this.avPoints = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff2a1a, size: 5, sizeAttenuation: false, fog: false, transparent: true }));
    this.scene.add(this.avPoints);
  }

  // ---------------- チャンク ----------------
  update(s, camPos, t) {
    const first = Math.max(0, Math.floor((s - BEHIND) / CHUNK));
    const last = Math.min(Math.floor(this.course.length / CHUNK), Math.floor((s + AHEAD) / CHUNK));
    for (const [k, ch] of this.chunks) {
      if (k < first || k > last) {
        this.root.remove(ch);
        ch.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        this.chunks.delete(k);
      }
    }
    // 1フレームに作るのは2チャンクまで (カクつき防止)
    let made = 0;
    for (let k = first; k <= last && made < 2; k++) {
      if (!this.chunks.has(k)) {
        const ch = this.buildChunk(k);
        this.root.add(ch);
        this.chunks.set(k, ch);
        made++;
      }
    }
    this.ground.position.set(Math.round(camPos.x / 40) * 40, 0, Math.round(camPos.z / 40) * 40);
    this.sky.position.copy(camPos);
    this.sun.position.copy(camPos).addScaledVector(this.sunDir, 15000);
    if (this.stars) this.stars.position.copy(camPos);
    this.buildAviation();
    if (this.avPoints) this.avPoints.material.opacity = Math.sin(t * 3) > 0 ? 1 : 0.15;
  }

  // 全チャンクを先に作る (スタート時)
  prebuild(s) {
    for (let i = 0; i < 30; i++) this.update(s, new THREE.Vector3(), 0);
  }

  buildChunk(k) {
    const c = this.course;
    const s0 = k * CHUNK, s1 = Math.min(c.length, s0 + CHUNK);
    const g = new THREE.Group();
    const segs = this.splitByTunnel(s0, s1);
    for (const [a, b, tun] of segs) {
      if (b - a < 0.5) continue;
      this.buildRoad(g, a, b, tun);
    }
    this.buildPiersAndLamps(g, s0, s1);
    this.buildCity(g, k, s0, s1);
    this.buildSigns(g, s0, s1);
    return g;
  }

  splitByTunnel(s0, s1) {
    const out = [];
    let a = s0;
    const cuts = [];
    for (const t of this.course.tunnels) {
      if (t[0] > s0 && t[0] < s1) cuts.push(t[0]);
      if (t[1] > s0 && t[1] < s1) cuts.push(t[1]);
    }
    cuts.sort((x, y) => x - y);
    for (const cut of [...cuts, s1]) {
      out.push([a, cut, !!this.course.inTunnel((a + cut) / 2)]);
      a = cut;
    }
    return out;
  }

  buildRoad(g, a, b, tun) {
    const c = this.course;
    const M = this.M;
    const st = 4;
    // 路面
    g.add(new THREE.Mesh(sweep(c, a, b, st, (p) => [[HALF, p.y], [-HALF, p.y]], { uFixed: [0, 1], vScale: 20 }), M.road));
    const isNight = this.theme.night;
    if (tun) {
      const W = HALF + 0.6;
      g.add(new THREE.Mesh(sweep(c, a, b, st, (p) => [
        [HALF + 0.2, p.y], [W, p.y + 0.9], [W, p.y + 4.6], [W - 1.2, p.y + 5.5], [-W + 1.2, p.y + 5.5], [-W, p.y + 4.6], [-W, p.y + 0.9], [-HALF - 0.2, p.y],
      ], { uScale: 4, vScale: 4 }), M.tunnel));
      // 照明 (天井の両肩に並ぶ)
      const lamps = new Geo();
      const p = {};
      for (let s = Math.ceil(a / 6) * 6; s < b; s += 6) {
        for (const off of [W - 0.9, -W + 0.9]) {
          c.at(s, off, p);
          lamps.box(p.x, p.y + 5.0, p.z, 0.35, 0.12, 1.6, yawOf(p.a));
        }
      }
      if (lamps.n) g.add(lamps.mesh(M.tunnelLamp));
      return;
    }
    // 路面が地面より低い所は擁壁 (掘割)
    const low = (p) => p.y < 2.5;
    // 両側の壁高欄 (左右)
    g.add(new THREE.Mesh(sweep(c, a, b, st, (p) => {
      const top = low(p) ? Math.max(p.y + 1.0, 1.0) : p.y + 1.05;
      return [[HALF, p.y], [HALF, top - 0.1], [HALF + 0.15, top], [HALF + 0.5, top], [HALF + 0.5, p.y - (low(p) ? 0 : 2.4)]];
    }, { uScale: 4, vScale: 4 }), M.wall));
    g.add(new THREE.Mesh(sweep(c, a, b, st, (p) => {
      const top = low(p) ? Math.max(p.y + 1.0, 1.0) : p.y + 1.05;
      return [[-HALF, p.y], [-HALF, top - 0.1], [-HALF - 0.15, top], [-HALF - 0.5, top], [-HALF - 0.5, p.y - (low(p) ? 0 : 2.4)]];
    }, { uScale: 4, vScale: 4 }), M.wall));
    // 桁 (高架の下面)
    g.add(new THREE.Mesh(sweep(c, a, b, st * 2, (p) => {
      const yb = p.y - (p.y > 4 ? 2.4 : 0.3);
      return [[HALF + 0.5, yb], [-HALF - 0.5, yb], [OPP_OFF - HALF - 0.5, yb]];
    }), M.girder));
    // 対向車線
    g.add(new THREE.Mesh(sweep(c, a, b, st, (p) => [[OPP_OFF - HALF, p.y], [OPP_OFF + HALF, p.y]], { uFixed: [0, 1], vScale: 20 }), M.oppRoad));
    g.add(new THREE.Mesh(sweep(c, a, b, st, (p) => {
      const top = low(p) ? Math.max(p.y + 1.0, 1.0) : p.y + 1.05;
      const o = OPP_OFF - HALF;
      return [[o, p.y], [o, top], [o - 0.5, top], [o - 0.5, p.y - (low(p) ? 0 : 2.4)]];
    }, { uScale: 4, vScale: 4 }), M.wall));
    // 遮音壁 (住宅地の区間)
    const barrierZones = this.barrierZones();
    for (const [za, zb] of barrierZones) {
      const ba = Math.max(a, za), bb = Math.min(b, zb);
      if (bb - ba < 1) continue;
      g.add(new THREE.Mesh(sweep(c, ba, bb, st, (p) => [[HALF + 0.35, p.y + 1.05], [HALF + 0.35, p.y + 4.0], [HALF - 0.4, p.y + 4.8]], { uScale: 3, vScale: 6 }), M.barrier));
      g.add(new THREE.Mesh(sweep(c, ba, bb, st, (p) => [[OPP_OFF - HALF - 0.35, p.y + 1.05], [OPP_OFF - HALF - 0.35, p.y + 4.0], [OPP_OFF - HALF + 0.4, p.y + 4.8]], { uScale: 3, vScale: 6 }), M.barrier));
    }
    // 地上の一般道 (甲州街道・六本木通り・玉川通り)
    g.add(new THREE.Mesh(sweep(c, a, b, 8, (p) => {
      const o = OPP_OFF / 2;
      return [[o + 15, 0.06], [o - 15, 0.06]];
    }, { uFixed: [0, 1], vScale: 30 }), M.street));
  }

  barrierZones() {
    if (this.bz) return this.bz;
    const m = (n) => this.course.marks.find((x) => x.name === n)?.s ?? 0;
    this.bz = [[300, m('初台') - 200], [m('池尻') + 300, this.course.length - 200]];
    return this.bz;
  }

  buildPiersAndLamps(g, s0, s1) {
    const c = this.course;
    const piers = new Geo(), poles = new Geo(), heads = new Geo();
    const p = {};
    for (let s = Math.ceil(s0 / 32) * 32; s < s1; s += 32) {
      if (c.inTunnel(s)) continue;
      c.at(s, OPP_OFF / 2, p);
      const yaw = yawOf(p.a);
      if (p.y > 5) {
        const h = p.y - 2.4;
        piers.box(p.x, 0, p.z, 3.2, h - 1.4, 2.4, yaw);
        piers.box(p.x, h - 1.6, p.z, ROAD_W * 2 + 2, 1.6, 2.2, yaw + Math.PI / 2 * 0); // 横梁
      }
    }
    // 照明柱 (中央分離帯に立ち、両側へ腕を伸ばす)
    for (let s = Math.ceil(s0 / 48) * 48; s < s1; s += 48) {
      if (c.inTunnel(s)) continue;
      c.at(s, -HALF - 0.6, p);
      const yaw = yawOf(p.a);
      poles.box(p.x, p.y + 1.0, p.z, 0.22, 9.2, 0.22, yaw);
      const q = {};
      c.at(s, -HALF + 1.6, q);
      poles.box((p.x + q.x) / 2, p.y + 10, (p.z + q.z) / 2, 2.4, 0.14, 0.14, yaw);
      heads.box(q.x, p.y + 9.75, q.z, 0.9, 0.18, 0.4, yaw);
      c.at(s, -HALF - 3.0, q);
      poles.box((p.x + q.x) / 2, p.y + 10, (p.z + q.z) / 2, 2.4, 0.14, 0.14, yaw);
      heads.box(q.x, p.y + 9.75, q.z, 0.9, 0.18, 0.4, yaw);
    }
    // 横梁は進行方向に直交させたいので, 箱の幅方向 = 横方向 (yaw はそのまま)
    if (piers.n) g.add(piers.mesh(this.M.pier));
    if (poles.n) g.add(poles.mesh(this.M.pole));
    if (heads.n) g.add(heads.mesh(this.M.lamp));
    // 夜は路面に灯りのにじみ
    if (this.theme.night || this.theme.lamp) {
      const glow = this.glowMat || (this.glowMat = new THREE.SpriteMaterial({
        map: canvasTex('glow', 64, 64, (gg, w, h) => {
          const gr = gg.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
          gr.addColorStop(0, 'rgba(255,230,180,0.9)');
          gr.addColorStop(1, 'rgba(255,180,80,0)');
          gg.fillStyle = gr;
          gg.fillRect(0, 0, w, h);
        }),
        color: this.theme.lamp, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      for (let s = Math.ceil(s0 / 48) * 48; s < s1; s += 48) {
        if (c.inTunnel(s)) continue;
        c.at(s, -HALF + 1.6, p);
        const sp = new THREE.Sprite(glow);
        sp.position.set(p.x, p.y + 9.6, p.z);
        sp.scale.setScalar(3.5);
        g.add(sp);
      }
    }
  }

  // ---------------- 街並み ----------------
  buildCity(g, k, s0, s1) {
    const c = this.course;
    const r = rng(1000 + k * 7919);
    const b0 = new Geo(), b1 = new Geo(), trees = new Geo();
    const col = new THREE.Color();
    const p = {};
    const ROWS = [30, 58, 92, 130, 175, 230, 300, 380];
    const lm = c.landmarks.filter((L) => !L.far);
    for (const side of [1, -1]) {
      for (const [ri, off0] of ROWS.entries()) {
        const gap = 18 + ri * 7;
        for (let s = s0 + r() * gap; s < s1; s += gap + r() * gap * 0.6) {
          const off = side > 0 ? off0 + r() * 10 : OPP_OFF - off0 - r() * 10;
          c.at(s, off, p);
          const w = 12 + r() * (16 + ri * 4), d = 12 + r() * 18;
          const rad = Math.max(w, d) * 0.6;
          if (c.distToRoad(p.x, p.z) < 26 + rad) continue;
          const park = c.inPark(p.x, p.z, rad * 0.5);
          if (park) {
            if (park.kind === 'park' && ri < 6) this.addTrees(trees, r, p.x, p.z, 3 + Math.floor(r() * 4));
            continue;
          }
          if (lm.some((L) => (L.x - p.x) ** 2 + (L.z - p.z) ** 2 < 80 * 80)) continue;
          // 高さ: 幹線沿いは中層, 奥は低層住宅。超高層の地区は高く
          let h = ri < 2 ? 14 + r() * 32 : 7 + r() * 18 + (r() < 0.12 ? 20 : 0);
          const dist = c.district(p.x, p.z);
          if (dist) {
            const [lo, hi] = dist.d.h;
            if (r() < 0.25 + dist.w * 0.6) h = Math.max(h, lo + (hi - lo) * r() * (0.4 + dist.w * 0.6));
          }
          h = Math.round(h / 3.5) * 3.5 + 1;
          const style = h > 50 || r() < 0.25 ? 1 : 0;
          const tone = 0.72 + r() * 0.32;
          if (style) col.setRGB(tone * 0.95, tone, tone * 1.03);
          else {
            const hue = r();
            col.setRGB(tone * (hue < 0.3 ? 1.0 : 0.93), tone * (hue < 0.3 ? 0.93 : 0.93), tone * (hue < 0.3 ? 0.84 : 0.92));
          }
          (style ? b1 : b0).box(p.x, 0, p.z, w, h, d, yawOf(p.a) + (r() - 0.5) * 0.1, col, true);
        }
      }
    }
    if (b0.n) g.add(b0.mesh(this.M.bldg0));
    if (b1.n) g.add(b1.mesh(this.M.bldg1));
    if (trees.n) g.add(trees.mesh(this.M.tree));
  }

  addTrees(geo, r, x, z, n) {
    const leaf = new THREE.Color(), trunk = new THREE.Color(0x5a4630);
    const night = this.theme.night;
    for (let i = 0; i < n; i++) {
      const tx = x + (r() - 0.5) * 24, tz = z + (r() - 0.5) * 24;
      const h = 6 + r() * 10, w = 4 + r() * 5;
      leaf.setHSL(0.25 + r() * 0.08, 0.45, night ? 0.08 : 0.24 + r() * 0.1);
      geo.box(tx, 0, tz, 0.6, h * 0.4, 0.6, 0, trunk);
      geo.box(tx, h * 0.3, tz, w, h * 0.7, w, r() * 3, leaf);
    }
  }

  // ---------------- 標識・ゲート ----------------
  buildSigns(g, s0, s1) {
    const c = this.course;
    const p = {};
    const inRange = (s) => s >= s0 && s < s1;
    // 出入口・JCT の予告 (1km / 500m 手前) と分岐
    for (const m of c.marks) {
      const no = c.routeNoAt(m.s - 600).no;
      if (m.kind === 'ic' && m.s > 400) {
        for (const d of [1000, 500]) {
          const s = m.s - d;
          if (inRange(s) && !c.inTunnel(s)) this.gantry(g, s, signTex(`${m.name}${d}`, [`出口 ${m.name}`, `EXIT  ${d === 1000 ? '1km' : '500m'}`], null), false);
        }
      } else if (m.kind === 'jct') {
        for (const d of [1200, 400]) {
          const s = m.s - d;
          if (inRange(s) && !c.inTunnel(s)) this.gantry(g, s, signTex(`${m.name}${d}`, [m.name, m.dest + (d > 1000 ? '  1km' : '')], no), true);
        }
      } else if (m.kind === 'goal') {
        const s = m.s - 1000;
        if (inRange(s)) this.gantry(g, s, signTex('goal1k', ['用賀 東名高速', 'GOAL まで 1km'], no), true);
      }
    }
    // キロポスト (100m ごと) と速度標識
    const kp = new Geo();
    for (let s = Math.ceil(s0 / 100) * 100; s < s1; s += 100) {
      c.at(s, HALF + 0.3, p);
      kp.box(p.x, p.y + 1.05, p.z, 0.3, 0.4, 0.05, yawOf(p.a));
    }
    if (kp.n) g.add(kp.mesh(mat(0x1f6fd0)));
    for (let s = Math.ceil(s0 / 1500) * 1500 + 700; s < s1; s += 1500) {
      if (c.inTunnel(s)) continue;
      this.speedSign(g, s);
    }
    // スタート・ゴール
    const start = this.startS ?? 0;
    if (inRange(start + 20)) this.raceGate(g, start + 20, 'START');
    const goal = this.goalS ?? c.length - 300;
    if (inRange(goal)) this.raceGate(g, goal, 'FINISH');
    // スタートのグリッド
    if (inRange(start - 10)) this.grid(g, start);
  }

  gantry(g, s, tex, wide) {
    const c = this.course;
    const p = {}, q = {};
    c.at(s, 0, p);
    const yaw = yawOf(p.a);
    const pole = mat(0x9aa4ab);
    const frame = new Geo();
    c.at(s, HALF + 0.9, q);
    frame.box(q.x, q.y, q.z, 0.35, 7.2, 0.35, yaw);
    c.at(s, -HALF - 0.9, q);
    frame.box(q.x, q.y, q.z, 0.35, 7.2, 0.35, yaw);
    // 梁は道路の幅方向。box の w は local x = 横方向
    c.at(s, 0, q);
    frame.box(q.x, q.y + 6.9, q.z, ROAD_W + 2.2, 0.35, 0.35, yaw);
    g.add(frame.mesh(pole));
    const w = wide ? 7.6 : 6.0;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), new THREE.MeshBasicMaterial({ map: tex, color: this.theme.night ? 0xb8c8b8 : 0xffffff }));
    c.at(s, wide ? 0 : HALF - 3.0, q);
    panel.position.set(q.x, q.y + 5.6, q.z);
    panel.rotation.y = yaw;
    panel.position.x += Math.cos(p.a) * -0.25;
    panel.position.z += -Math.sin(p.a) * -0.25;
    g.add(panel);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), mat(0x6c757c));
    back.position.copy(panel.position);
    back.rotation.y = yaw + Math.PI;
    g.add(back);
  }

  speedSign(g, s) {
    const c = this.course;
    const p = {};
    c.at(s, HALF + 0.35, p);
    const tex = canvasTex('limit60', 128, 128, (gg, w, h) => {
      gg.fillStyle = '#fff';
      gg.beginPath(); gg.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); gg.fill();
      gg.strokeStyle = '#d22';
      gg.lineWidth = 14;
      gg.beginPath(); gg.arc(w / 2, h / 2, w / 2 - 9, 0, Math.PI * 2); gg.stroke();
      gg.fillStyle = '#1a4fb8';
      gg.font = '900 64px sans-serif';
      gg.textAlign = 'center';
      gg.textBaseline = 'middle';
      gg.fillText('60', w / 2, h / 2 + 4);
    });
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({ map: tex, color: this.theme.night ? 0xaaaaaa : 0xffffff }));
    m.position.set(p.x, p.y + 3.2, p.z);
    m.rotation.y = yawOf(p.a);
    g.add(m);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), mat(0x9aa4ab));
    pole.position.set(p.x, p.y + 1.6, p.z);
    g.add(pole);
  }

  raceGate(g, s, text) {
    const c = this.course;
    const p = {}, q = {};
    c.at(s, 0, p);
    const yaw = yawOf(p.a);
    const frame = new Geo();
    for (const off of [HALF + 0.9, -HALF - 0.9]) {
      c.at(s, off, q);
      frame.box(q.x, q.y, q.z, 0.6, 7.5, 0.6, yaw);
    }
    g.add(frame.mesh(mat(0x222222)));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 2.4, 1.5), new THREE.MeshBasicMaterial({ map: bannerTex(text, text), side: THREE.DoubleSide }));
    panel.position.set(p.x, p.y + 7.0, p.z);
    panel.rotation.y = yaw;
    g.add(panel);
    // 路面のチェッカーライン
    const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 1.2), new THREE.MeshBasicMaterial({ map: checkerTex(), polygonOffset: true, polygonOffsetFactor: -2 }));
    line.material.map.repeat.set(ROAD_W / 2.4, 1);
    line.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
    line.rotation.y = yaw;
    line.position.set(p.x, p.y + 0.02, p.z);
    g.add(line);
  }

  grid(g, start) {
    const c = this.course;
    const p = {};
    const geo = new Geo();
    for (let i = 0; i < 12; i++) {
      const s = start - 8 * i - (i % 2) * 4;
      c.at(s - 2.6, LANES[i % 2], p);
      geo.box(p.x, p.y + 0.015, p.z, 2.2, 0.01, 0.25, yawOf(p.a));
    }
    g.add(geo.mesh(new THREE.MeshBasicMaterial({ color: 0xf0f0f0 })));
    for (let i = 0; i < 12; i++) {
      const s = start - 8 * i - (i % 2) * 4;
      c.at(s - 3.2, LANES[i % 2] + 1.25, p);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ map: plateTex('g' + (i + 1), String(i + 1), '#ffffff', '#111'), transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
      pl.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
      pl.rotation.y = yawOf(p.a) + Math.PI;
      pl.position.set(p.x, p.y + 0.02, p.z);
      g.add(pl);
    }
  }
}
