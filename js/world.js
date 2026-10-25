// 首都高と沿線の 3D 世界 (道のりに沿ってチャンク単位で生成・破棄する)
import * as THREE from '../vendor/three.module.min.js';
import { rng, STEP } from './route.js';
import {
  asphaltTex, concreteTex, barrierTex, tunnelWallTex, windowTex, signTex, bannerTex, checkerTex,
  plateTex, makeLandmark, makeTechGymBoard, mat, canvasTex,
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

// 建物の色 (タイル・塗装・ガラス)。テクスチャに掛け合わせる
const FACADE = [0xf2ece0, 0xe9dcc4, 0xd9c7a8, 0xc98f6e, 0xb86b52, 0xe8e2d8, 0xd7d9dc, 0xf0d8c8, 0xc9d8e2, 0xe6e0b8, 0xb0b8c0, 0xf4f0ea, 0xd8b88f, 0xa8c4b0];
const GLASS = [0x9ec4e6, 0x7fb0d8, 0x8fd0d0, 0xa8d0b8, 0xc8b89a, 0xb8c8e0, 0x9aa8c8, 0xd0d8e0, 0x88c0e8];
const ROOFC = [0x8a9096, 0x6c7378, 0xa7aca8, 0xc0c4c0];
const AERIAL = 0xd03a2a;
// 屋上広告 (架空の店・会社)
const ADS = [
  ['ラーメン', '#c8102e', '#fff'], ['焼肉', '#1a1a1a', '#ffcc00'], ['カラオケ', '#7b2cbf', '#fff'], ['不動産', '#0b5fa5', '#fff'],
  ['英会話', '#ff6b00', '#fff'], ['TECH GYM', '#0b1a2e', '#ff9a3c'], ['首都高GP', '#e4007f', '#fff'], ['お茶', '#2e7d32', '#fff'],
  ['家電', '#ffd400', '#d00'], ['ビール', '#f4a300', '#3a1a00'], ['温泉', '#00897b', '#fff'], ['SALE', '#e53935', '#fff'],
  ['寿司', '#fafafa', '#c8102e'], ['ホテル', '#283593', '#ffd54f'], ['眼鏡', '#00acc1', '#fff'], ['プログラミング', '#111', '#3dff8a'],
];
function adAtlas() {
  return canvasTex('ads', 1024, 1024, (g, w, h) => {
    const cw = w / 4, ch = h / 4;
    ADS.forEach(([txt, bg, fg], i) => {
      const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
      g.fillStyle = '#555';
      g.fillRect(x, y, cw, ch);
      g.fillStyle = bg;
      g.fillRect(x + 6, y + 40, cw - 12, ch - 80);
      g.fillStyle = fg;
      let size = 64;
      g.font = `900 ${size}px "Noto Sans JP", sans-serif`;
      while (g.measureText(txt).width > cw - 30 && size > 20) { size -= 4; g.font = `900 ${size}px "Noto Sans JP", sans-serif`; }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, x + cw / 2, y + ch / 2 + 2);
    });
    g.fillStyle = '#4a4f55';
    g.fillRect(0, 0, 8, 8);
  });
}

const polyArea = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
};

// ---------------- 時間帯 ----------------
export const THEMES = {
  day: {
    label: '昼', night: false,
    skyTop: 0x3f7fd0, skyBottom: 0xcfe0ee, fog: 0xc6d4e0, fogNear: 250, fogFar: 3200,
    hemiSky: 0xdfeeff, hemiGround: 0x6a6a60, hemi: 1.6, sun: 0xfff3e0, sunI: 2.2, sunDir: [-0.4, 0.8, 0.3],
    ground: '#6c6e6c', lamp: 0x000000,
  },
  // 夕焼け: 地平線の金色と真っ赤な茜色から、紫、群青へ。太陽は西南西の地平線すれすれ
  dusk: {
    label: '夕暮れ', night: false, dusk: true,
    skyTop: 0x141c4a, skyBottom: 0xff5a30, fog: 0xd8745e, fogNear: 400, fogFar: 4200,
    sky: [[-0.05, 0x5a2438], [0, 0xff8a3a], [0.025, 0xff4a2a], [0.09, 0xe8486a], [0.2, 0x9a4890], [0.42, 0x3c3c8c], [1, 0x141c4a]],
    glow: 0xffd070, glowBack: 0x8a5aa8,
    hemiSky: 0xff9a7a, hemiGround: 0x4a2a5a, hemi: 1.25, sun: 0xff7a30, sunI: 3.0, sunDir: [-0.95, 0.07, 0.3],
    ground: '#4f4048', lamp: 0xffb060,
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
  // 輪郭 pts ([[x, z], ...]) を高さ h まで押し出した建物。壁の UV は m 単位 (4m × 3.5m で1周)
  extrude(pts, h, color) {
    const n = pts.length;
    let a2 = 0;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n];
      a2 += x0 * z1 - x1 * z0;
    }
    const sg = a2 > 0 ? 1 : -1; // 頂点の回り方で法線の向きを決める
    let u = 0;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) continue;
      const nx = (-(z1 - z0) / len) * sg, nz = ((x1 - x0) / len) * sg;
      const u1 = u + len / 4, v = h / 3.5;
      if (sg > 0) this.quad([x1, 0, z1], [x0, 0, z0], [x0, h, z0], [x1, h, z1], [-nx, 0, -nz], [u1, 0, u, 0, u, v, u1, v], color);
      else this.quad([x0, 0, z0], [x1, 0, z1], [x1, h, z1], [x0, h, z0], [-nx, 0, -nz], [u, 0, u1, 0, u1, v, u, v], color);
      u = u1;
    }
    // 屋根
    const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const base = this.n;
    for (const [x, z] of pts) {
      this.pos.push(x, h, z);
      this.nor.push(0, 1, 0);
      this.uv.push(0.01, 0.01);
      if (color) this.col.push(color.r * 0.85, color.g * 0.85, color.b * 0.85);
    }
    this.n += n;
    for (const [a, b, c] of tris) {
      // 上から見て反時計回り (法線が上) になるように
      const ax = pts[a][0], az = pts[a][1], bx = pts[b][0], bz = pts[b][1], cx = pts[c][0], cz = pts[c][1];
      const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (cross < 0) this.idx.push(base + a, base + b, base + c);
      else this.idx.push(base + a, base + c, base + b);
    }
  }
  // 木の葉 (上下2つの角錐を合わせた形)
  diamond(cx, cy, cz, w, h, yaw, color) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ring = [[1, 0], [0.5, 0.87], [-0.5, 0.87], [-1, 0], [-0.5, -0.87], [0.5, -0.87]].map(([x, z]) => [cx + (x * c + z * s) * w / 2, cy + h * 0.4, cz + (-x * s + z * c) * w / 2]);
    const top = [cx, cy + h, cz], bot = [cx, cy, cz];
    for (let i = 0; i < 6; i++) {
      const a = ring[i], b = ring[(i + 1) % 6];
      for (const [tip, up] of [[top, 1], [bot, -1]]) {
        const ux = b[0] - a[0], uz = b[2] - a[2];
        const mx = (a[0] + b[0]) / 2 - cx, mz = (a[2] + b[2]) / 2 - cz;
        const l = Math.hypot(mx, mz) || 1;
        const n = [mx / l * 0.8, up * 0.6, mz / l * 0.8];
        if (up > 0) this.quad(a, b, tip, tip, n, null, color);
        else this.quad(b, a, tip, tip, n, null, color);
        void ux; void uz;
      }
    }
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
      board: new THREE.MeshBasicMaterial({ map: adAtlas(), color: night ? 0xffffff : 0xe8e8e8 }),
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
    const skyGeo = new THREE.SphereGeometry(18000, 48, 32);
    const top = new THREE.Color(T.skyTop), bot = new THREE.Color(T.skyBottom), fog = new THREE.Color(T.fog);
    const col = [];
    const pa = skyGeo.attributes.position;
    const sunXZ = new THREE.Vector2(T.sunDir[0], T.sunDir[2]).normalize();
    const stops = T.sky && T.sky.map(([y, c]) => [y, new THREE.Color(c)]);
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i) / 18000;
      let c;
      if (stops) {
        // 高さごとの色の帯 + 太陽の方角ほど金色に燃え、反対側は紫に沈む
        c = stops[0][1].clone();
        for (let k = 0; k < stops.length - 1; k++) {
          const [y0, c0] = stops[k], [y1, c1] = stops[k + 1];
          if (y >= y0 && y <= y1) c = c0.clone().lerp(c1, (y - y0) / (y1 - y0));
          else if (y > y1) c = c1.clone();
        }
        const h = new THREE.Vector2(pa.getX(i), pa.getZ(i));
        const d = h.length() > 1 ? h.normalize().dot(sunXZ) : 0;
        const low = 1 - Math.min(1, Math.max(0, y) / 0.35);
        if (d > 0) c.lerp(new THREE.Color(T.glow), Math.pow(d, 5) * low * 0.9);
        else c.lerp(new THREE.Color(T.glowBack), Math.pow(-d, 2) * low * 0.45);
      } else {
        c = y < 0 ? fog.clone() : y < 0.08 ? fog.clone().lerp(bot, y / 0.08) : bot.clone().lerp(top, Math.pow((y - 0.08) / 0.92, 0.6));
      }
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
    this.sun.scale.setScalar(T.night ? 500 : T.dusk ? 1700 : 1400);
    this.sunDir = new THREE.Vector3(...T.sunDir).normalize();
    scene.add(this.sun);
    if (T.dusk) {
      // 夕日のまわりの大きな光のにじみ
      this.sun.material.color.setHex(0xffe0a0);
      this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, color: 0xff8a40, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }));
      this.sunGlow.scale.set(9000, 5000, 1);
      scene.add(this.sunGlow);
    }
    // 雲 (昼・夕暮れ)
    if (!T.night) {
      const cloudTex = canvasTex('cloud', 256, 128, (g, w, h) => {
        const rr = rng(11);
        for (let i = 0; i < 18; i++) {
          const x = w * (0.15 + rr() * 0.7), y = h * (0.45 + rr() * 0.25), rad = 20 + rr() * 34;
          const gr = g.createRadialGradient(x, y, 0, x, y, rad);
          gr.addColorStop(0, 'rgba(255,255,255,0.85)');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fillRect(0, 0, w, h);
        }
      });
      const cm = new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true, color: 0xffffff, opacity: 0.9 });
      this.clouds = new THREE.Group();
      const rr = rng(5);
      const sunA = Math.atan2(T.sunDir[2], T.sunDir[0]);
      const n = T.dusk ? 70 : 45;
      for (let i = 0; i < n; i++) {
        // 夕暮れは太陽の側に雲を多めに、低くたなびかせる
        const a = T.dusk && i < 35 ? sunA + (rr() - 0.5) * 1.6 : rr() * Math.PI * 2;
        const d = 2500 + rr() * 9000;
        let mat = cm;
        if (T.dusk) {
          // 太陽の側は金色、横はオレンジとピンク、反対側は紫
          const f = Math.cos(a - sunA);
          const c = new THREE.Color(f > 0.75 ? 0xffd27a : f > 0.3 ? 0xff9a5a : f > -0.3 ? 0xff7a8a : 0xa07ab8);
          mat = new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true, color: c, opacity: 0.95 });
        }
        const sp = new THREE.Sprite(mat);
        sp.position.set(Math.cos(a) * d, (T.dusk ? 250 : 700) + rr() * (T.dusk ? 900 : 1100), Math.sin(a) * d);
        const sc = 900 + rr() * 1600;
        sp.scale.set(sc * (T.dusk ? 1.8 : 1), sc * (T.dusk ? 0.3 : 0.45), 1);
        this.clouds.add(sp);
      }
      this.clouds.renderOrder = -9;
      scene.add(this.clouds);
    }
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
      if (L.crown) this.addCrown(L);
      const o = L.model && makeLandmark(L.model, T.night);
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
        if (L.face) {
          // 正面 (+z) を指定の地点へ向ける
          const f = c.project(L.face[0], L.face[1]);
          o.rotation.y = Math.atan2(f.x - x, f.z - z);
        }
      }
      o.position.set(x, 0, z);
      this.scene.add(o);
      o.updateMatrixWorld(true);
      if (T.night && !L.far) this.addAviationLight(o, x, z);
    }
    // 夜は高いビル (100m 以上) の屋上に航空障害灯
    if (T.night) {
      const D = c.def.data;
      for (let ch = 0; ch < D.bidx.length - 1; ch++) {
        for (const b of this.buildingsIn(ch)) if (b.h >= 100) (this.aviation = this.aviation || []).push([b.cx, b.h + 1, b.cz]);
      }
    }
  }

  // その場所でいちばん高いビルの屋上に、色の付いた飾り (ニューオータニの青いラウンジ、キャロットタワーの橙の屋上など)
  addCrown(L) {
    const D = this.course.def.data;
    const k = Math.floor(L.s / D.chunk);
    let best = null;
    for (let ch = k - 3; ch <= k + 3; ch++) {
      for (const b of this.buildingsIn(ch)) {
        if ((b.cx - L.x) ** 2 + (b.cz - L.z) ** 2 < L.r * L.r && (!best || b.h > best.h)) best = b;
      }
    }
    if (!best) return;
    const r = Math.min(16, Math.sqrt(polyArea(best.pts)) * 0.45);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 7, 24), new THREE.MeshLambertMaterial({ color: L.crown, emissive: new THREE.Color(L.crown).multiplyScalar(this.theme.night ? 0.6 : 0.15) }));
    m.position.set(best.cx, best.h + 3.5, best.cz);
    this.scene.add(m);
  }

  addAviationLight(o, x, z) {
    if (o.userData.aviation) {
      const v = new THREE.Vector3(...o.userData.aviation).applyMatrix4(o.matrixWorld);
      (this.aviation = this.aviation || []).push([v.x, v.y, v.z]);
      return;
    }
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
    if (this.sunGlow) this.sunGlow.position.copy(camPos).addScaledVector(this.sunDir, 16000);
    if (this.stars) this.stars.position.copy(camPos);
    if (this.clouds) this.clouds.position.set(camPos.x * 0.7, 0, camPos.z * 0.7);
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
  // PLATEAU の建物 (輪郭を高さぶん押し出す) と公園の木
  buildCity(g, k, s0, s1) {
    const c = this.course;
    const D = c.def.data;
    const r = rng(1000 + k * 7919);
    const b0 = new Geo(), b1 = new Geo(), trees = new Geo(), boards = new Geo(), roof = new Geo();
    const col = new THREE.Color();
    // このチャンクの道路の点 (看板の向きを決める)
    const road = [];
    for (let s = s0; s <= s1; s += 20) road.push(c.at(s));
    const nearRoad = (x, z) => {
      let best = 1e18, bp = road[0];
      for (const q of road) {
        const d = (q.x - x) ** 2 + (q.z - z) ** 2;
        if (d < best) { best = d; bp = q; }
      }
      return [Math.sqrt(best), bp];
    };
    const ch = Math.floor(s0 / D.chunk);
    for (const b of this.buildingsIn(ch)) {
      const { h, pts, cx, cz, id } = b;
      const rb = rng(id * 7 + 3);
      const style = h > 45 || rb() < 0.25 ? 1 : 0;
      const pal = style ? GLASS : FACADE;
      col.set(pal[Math.floor(rb() * pal.length)]);
      col.multiplyScalar(0.85 + rb() * 0.25);
      (style ? b1 : b0).extrude(pts, h, col);
      // 屋上: 広告看板・給水塔・アンテナ
      const roll = rb();
      const [dr, q] = nearRoad(cx, cz);
      if (dr < 80 && h > 9 && h < 70 && roll < 0.3) {
        const side = (cx - q.x) * q.lx + (cz - q.z) * q.lz > 0 ? 1 : -1;
        const span = Math.sqrt(polyArea(pts));
        this.billboard(boards, rb, { x: cx, z: cz }, side, span, span, h, yawOf(q.a));
      } else if (roll < 0.5 && h < 120) {
        roof.box(cx + (rb() - 0.5) * 4, h, cz + (rb() - 0.5) * 4, 3 + rb() * 4, 2 + rb() * 2.5, 3 + rb() * 4, rb() * 3, ROOFC[Math.floor(rb() * ROOFC.length)]);
      }
      if (h > 60 && rb() < 0.6) roof.box(cx, h, cz, 0.6, 8 + rb() * 10, 0.6, 0, AERIAL);
    }
    // 公園の木 (建物のない所)
    const p = {};
    for (const side of [1, -1]) {
      for (let off = 22; off < 360; off += 26) {
        for (let s = s0 + r() * 20; s < s1; s += 22 + r() * 10) {
          c.at(s, side > 0 ? off + r() * 8 : OPP_OFF - off - r() * 8, p);
          const park = c.inPark(p.x, p.z);
          if (!park || park.kind !== 'park') continue;
          if (this.occupied(p.x, p.z) || c.distToRoad(p.x, p.z) < 24) continue;
          this.addTrees(trees, r, p.x, p.z, 2 + Math.floor(r() * 3));
        }
      }
    }
    if (b0.n) g.add(b0.mesh(this.M.bldg0));
    if (b1.n) g.add(b1.mesh(this.M.bldg1));
    if (trees.n) g.add(trees.mesh(this.M.tree));
    if (boards.n) g.add(boards.mesh(this.M.board));
    if (roof.n) g.add(roof.mesh(this.M.tree));
  }

  // course-data.js の建物を取り出す。b = [高さ×2, 点の数, x0×2, z0×2, Δx×2, Δz×2, ...] の並び
  buildingsIn(ch) {
    const D = this.course.def.data;
    if (ch < 0 || ch >= D.bidx.length - 1) return [];
    const out = [];
    const B = D.b;
    let i = D.bidx[ch];
    const end = D.bidx[ch + 1];
    while (i < end) {
      const id = i;
      const h = B[i] / 2, n = B[i + 1];
      let x = B[i + 2], z = B[i + 3];
      const pts = [[x / 2, z / 2]];
      i += 4;
      for (let j = 1; j < n; j++) {
        x += B[i]; z += B[i + 1];
        pts.push([x / 2, z / 2]);
        i += 2;
      }
      let cx = 0, cz = 0;
      for (const [px, pz] of pts) { cx += px; cz += pz; }
      out.push({ id, h, pts, cx: cx / n, cz: cz / n });
    }
    return out;
  }

  // 建物のある所 (10m 四方のマス)。公園の木を建物に重ねないため
  occupied(x, z) {
    if (!this.occ) {
      this.occ = new Set();
      const D = this.course.def.data;
      for (let ch = 0; ch < D.bidx.length - 1; ch++) {
        for (const b of this.buildingsIn(ch)) {
          let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
          for (const [px, pz] of b.pts) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
          for (let gx = Math.floor(x0 / 10); gx <= Math.floor(x1 / 10); gx++) {
            for (let gz = Math.floor(z0 / 10); gz <= Math.floor(z1 / 10); gz++) this.occ.add(gx * 100000 + gz);
          }
        }
      }
    }
    return this.occ.has(Math.floor(x / 10) * 100000 + Math.floor(z / 10));
  }

  // 屋上の広告看板 (道路から見える向き)。広告の絵は1枚のテクスチャに 4×4 で並べてある
  billboard(geo, r, p, side, w, d, h, yaw) {
    const bw = Math.min(w * 0.9, 10 + r() * 8), bh = bw * 0.36;
    const k = Math.floor(r() * 16);
    const u0 = (k % 4) / 4, v0 = 1 - (Math.floor(k / 4) + 1) / 4;
    const uv = [u0, v0, u0 + 0.25, v0, u0 + 0.25, v0 + 0.25, u0, v0 + 0.25];
    // 近づいてくる車の方 (後ろ) へ向け、少し道路側へ振る
    const a = yaw + side * 0.45;
    const c = Math.cos(a), sn = Math.sin(a);
    const cx = p.x, cz = p.z, y0 = h + 1.2;
    const P = (x, y) => [cx + x * c, y0 + y, cz - x * sn];
    const nrm = [sn, 0, c];
    geo.quad(P(-bw / 2, 0), P(bw / 2, 0), P(bw / 2, bh), P(-bw / 2, bh), nrm, uv);
    // 裏側 (骨組みの色)
    geo.quad(P(bw / 2, 0), P(-bw / 2, 0), P(-bw / 2, bh), P(bw / 2, bh), [-sn, 0, -c], [0.001, 0.001, 0.002, 0.001, 0.002, 0.002, 0.001, 0.002]);
  }

  addTrees(geo, r, x, z, n) {
    const leaf = new THREE.Color(), trunk = new THREE.Color(0x5a4630);
    const night = this.theme.night;
    for (let i = 0; i < n; i++) {
      const tx = x + (r() - 0.5) * 24, tz = z + (r() - 0.5) * 24;
      const h = 6 + r() * 10, w = 4 + r() * 5;
      // 10月の東京: 緑の中に銀杏の黄色と紅葉の赤が混じる
      const k = r();
      if (k < 0.18) leaf.setHSL(0.13, 0.85, 0.5);
      else if (k < 0.28) leaf.setHSL(0.02 + r() * 0.04, 0.75, 0.42);
      else leaf.setHSL(0.22 + r() * 0.1, 0.5, 0.24 + r() * 0.12);
      if (night) leaf.multiplyScalar(0.3);
      geo.box(tx, 0, tz, 0.6, h * 0.4, 0.6, 0, trunk);
      geo.diamond(tx, h * 0.25, tz, w, h * 0.75, r() * 3, leaf);
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
    // 道路わきの広告看板 (左側の壁高欄の上)
    for (const ad of c.ads) {
      if (!inRange(ad.s)) continue;
      // 壁高欄の上に支柱を立てる
      c.at(ad.s, HALF + 0.3, p);
      const o = makeTechGymBoard(this.theme.night);
      o.position.set(p.x, p.y + 1.0, p.z);
      // 近づいてくる車の方へ向け、少し道路側へ振る
      o.rotation.y = yawOf(p.a) - 0.35;
      g.add(o);
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
