// テクスチャと 3D モデル (F1 マシン・ランドマーク)
import * as THREE from '../vendor/three.module.min.js';

const texCache = new Map();
export function canvasTex(key, w, h, draw, opt = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opt.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}

const matCache = new Map();
export function mat(color, opt = {}) {
  const key = color + JSON.stringify(opt);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opt }));
  return matCache.get(key);
}

const JP = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';

// ---------------- 道路まわりのテクスチャ ----------------
// 路面 (2車線 + 路肩)。u: 幅方向 0..1 = 道路幅, v: 20m で1周
export function asphaltTex(roadW, laneW, shoulderL) {
  return canvasTex('asphalt', 512, 1024, (g, w, h) => {
    g.fillStyle = '#4a4d52';
    g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 26;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    // 轍 (タイヤの通る所は少し暗く)
    const px = (m) => (m / roadW) * w;
    g.fillStyle = 'rgba(20,20,24,0.18)';
    for (const lane of [0, 1]) {
      const c = shoulderL + laneW * (lane + 0.5);
      g.fillRect(px(c - 1.0) - 14, 0, 28, h);
      g.fillRect(px(c + 1.0) - 14, 0, 28, h);
    }
    // 外側線 (実線)
    g.fillStyle = '#e8e8e2';
    g.fillRect(px(shoulderL) - 5, 0, 10, h);
    g.fillRect(px(shoulderL + laneW * 2) - 5, 0, 10, h);
    // 車線境界線 (破線 8m 線 / 12m 空き)
    g.fillRect(px(shoulderL + laneW) - 5, 0, 10, (h * 8) / 20);
    // 路肩の縁
    g.fillStyle = '#3a3c40';
    g.fillRect(0, 0, 6, h);
    g.fillRect(w - 6, 0, 6, h);
  }, { repeat: true });
}

export function concreteTex() {
  return canvasTex('concrete', 256, 256, (g, w, h) => {
    g.fillStyle = '#b7b4ab';
    g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(70,64,56,0.25)';
    g.fillRect(0, h - 40, w, 40); // 雨だれの汚れ
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, 3, h); // 目地
  }, { repeat: true });
}

// 遮音壁 (半透明の板 + 支柱)
export function barrierTex() {
  return canvasTex('barrier', 256, 128, (g, w, h) => {
    g.fillStyle = 'rgba(170,200,215,0.35)';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(0, 10, w, 3);
    g.fillStyle = '#5c646b';
    g.fillRect(0, 0, 10, h);
    g.fillRect(0, h - 8, w, 8);
    g.fillRect(0, 0, w, 6);
  }, { repeat: true });
}

// トンネル壁 (白いパネル + 内装板の目地)
export function tunnelWallTex() {
  return canvasTex('tunnelwall', 256, 256, (g, w, h) => {
    g.fillStyle = '#d8d6cf';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#b9b7b0';
    for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h);
    g.fillStyle = '#62666b';
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = '#2d8a46'; // 非常口の緑ライン
    g.fillRect(0, h * 0.74, w, 5);
  }, { repeat: true });
}

// ビルの窓。u: 4m で1周, v: 3.5m (1フロア) で1周。昼と夜で2種類
export function windowTex(night, style = 0) {
  return canvasTex(`win${night ? 'n' : 'd'}${style}`, 128, 128, (g, w, h) => {
    const r = Math.random;
    if (style === 0) {
      g.fillStyle = night ? '#1a1d24' : '#bcc2c7';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const lit = r() < 0.38;
          g.fillStyle = night ? (lit ? (r() < 0.7 ? '#ffe3a8' : '#dff4ff') : '#20262f') : (r() < 0.25 ? '#6e8597' : '#56697a');
          g.fillRect(x * 32 + 4, y * 32 + 7, 24, 18);
        }
      }
    } else {
      // ガラス張りのオフィス (横長の帯)
      g.fillStyle = night ? '#141820' : '#2f4252';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) {
        g.fillStyle = night ? '#252b35' : '#4f6476';
        g.fillRect(0, y * 32 + 4, w, 22);
        if (night) {
          for (let x = 0; x < 8; x++) {
            if (r() < 0.42) {
              g.fillStyle = r() < 0.8 ? '#fff4d6' : '#cfe8ff';
              g.fillRect(x * 16 + 1, y * 32 + 6, 14, 18);
            }
          }
        } else {
          const gr = g.createLinearGradient(0, y * 32, w, y * 32 + 26);
          gr.addColorStop(0, 'rgba(200,220,235,0.35)');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fillRect(0, y * 32 + 4, w, 22);
        }
        g.fillStyle = night ? '#0c0e12' : '#9aa6ae';
        g.fillRect(0, y * 32 + 26, w, 6);
      }
    }
  }, { repeat: true });
}

// 首都高の案内標識 (緑地に白文字)
export function signTex(key, lines, routeNo) {
  return canvasTex('sign-' + key, 1024, 384, (g, w, h) => {
    g.fillStyle = '#0d7a3a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff';
    g.lineWidth = 10;
    g.strokeRect(14, 14, w - 28, h - 28);
    let x0 = 50;
    if (routeNo) {
      // 路線番号 (六角形)
      const cx = 140, cy = h / 2, r = 90;
      g.fillStyle = '#fff';
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.fillStyle = '#0d7a3a';
      g.font = `900 ${routeNo.length > 1 ? 80 : 110}px ${JP}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(routeNo, cx, cy + 6);
      x0 = 260;
    }
    g.fillStyle = '#fff';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((ln, i) => {
      const y = h / 2 + (i - (n - 1) / 2) * (n > 1 ? 130 : 0);
      let size = n > 1 ? 104 : 140;
      g.font = `900 ${size}px ${JP}`;
      while (g.measureText(ln).width > w - x0 - 50 && size > 40) {
        size -= 4;
        g.font = `900 ${size}px ${JP}`;
      }
      g.fillText(ln, x0, y);
    });
  });
}

export function bannerTex(key, text, bg = '#c8102e', fg = '#fff') {
  return canvasTex('banner-' + key, 1024, 160, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // チェッカー
    const sq = 20;
    for (let y = 0; y < h; y += sq) {
      for (let x = 0; x < 120; x += sq) {
        if (((x + y) / sq) % 2 === 0) {
          g.fillStyle = '#111';
          g.fillRect(x, y, sq, sq);
          g.fillRect(w - 120 + x, y, sq, sq);
        } else {
          g.fillStyle = '#fff';
          g.fillRect(x, y, sq, sq);
          g.fillRect(w - 120 + x, y, sq, sq);
        }
      }
    }
    g.fillStyle = fg;
    g.font = `900 92px ${JP}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

export function checkerTex() {
  return canvasTex('checker', 256, 64, (g, w, h) => {
    const sq = 32;
    for (let y = 0; y < h; y += sq) {
      for (let x = 0; x < w; x += sq) {
        g.fillStyle = ((x + y) / sq) % 2 === 0 ? '#111' : '#f4f4f4';
        g.fillRect(x, y, sq, sq);
      }
    }
  }, { repeat: true });
}

export function plateTex(key, text, bg, fg, font = 64) {
  return canvasTex('plate-' + key, 256, 128, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = `900 ${font}px ${JP}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

// ---------------- F1 マシン ----------------
// 前方 = -z, 長さ ≒ 5.6m, 幅 2.0m
export const TEAMS = [
  { name: 'SAKURA', body: 0xf3f3f3, accent: 0xe4007f, no: 7 },
  { name: 'ROSSO', body: 0xc8102e, accent: 0xffd200, no: 16 },
  { name: 'SILVER ARROW', body: 0x8f9aa3, accent: 0x00d2be, no: 44 },
  { name: 'BULL', body: 0x1e2a5a, accent: 0xe10600, no: 1 },
  { name: 'PAPAYA', body: 0xff8000, accent: 0x111111, no: 4 },
  { name: 'EMERALD', body: 0x005a46, accent: 0xc8e600, no: 14 },
  { name: 'ALPINE BLUE', body: 0x1265c8, accent: 0xff7fc0, no: 10 },
  { name: 'KABUTO', body: 0xf0d020, accent: 0x111111, no: 22 },
  { name: 'SAMURAI', body: 0x111111, accent: 0xd4af37, no: 63 },
  { name: 'MIDORI', body: 0x37b24d, accent: 0xffffff, no: 23 },
  { name: 'FUJI', body: 0x6ea8ff, accent: 0xffffff, no: 31 },
  { name: 'EDO', body: 0x6b2fa0, accent: 0xffffff, no: 81 },
];

let wheelGeo, tyreMat;
function wheel() {
  if (!wheelGeo) {
    wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.38, 18);
    wheelGeo.rotateZ(Math.PI / 2);
    tyreMat = mat(0x18191b);
  }
  const g = new THREE.Group();
  const t = new THREE.Mesh(wheelGeo, tyreMat);
  g.add(t);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 12).rotateZ(Math.PI / 2), mat(0x2a2c30));
  g.add(rim);
  // タイヤのサイドウォール (ソフト=赤)
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 4, 18).rotateY(Math.PI / 2), mat(0xd8262e));
  band.position.x = 0.2;
  g.add(band);
  const band2 = band.clone();
  band2.position.x = -0.2;
  g.add(band2);
  return g;
}

function box(w, h, d, m, x, y, z) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  return b;
}

// 断面を前後方向に掃引した胴体 (幅・高さを前から後ろへ変化させる)
function tub(profile, m) {
  // profile: [z, 半幅, 下端y, 上端y]
  const pos = [], idx = [];
  const ring = (z, hw, y0, y1) => [
    [-hw * 0.7, y0, z], [hw * 0.7, y0, z], [hw, (y0 + y1) / 2, z], [hw * 0.75, y1, z], [-hw * 0.75, y1, z], [-hw, (y0 + y1) / 2, z],
  ];
  profile.forEach((p) => ring(...p).forEach((v) => pos.push(...v)));
  const n = 6;
  for (let j = 0; j < profile.length - 1; j++) {
    for (let k = 0; k < n; k++) {
      const a = j * n + k, b = j * n + ((k + 1) % n), c = a + n, d = b + n;
      idx.push(a, c, b, b, c, d);
    }
  }
  // 両端のふた
  const last = (profile.length - 1) * n;
  for (let k = 1; k < n - 1; k++) {
    idx.push(0, k + 1, k);
    idx.push(last, last + k, last + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, m);
}

export function makeF1(team, opt = {}) {
  const car = new THREE.Group();
  const body = new THREE.MeshPhongMaterial({ color: team.body, shininess: 70, specular: 0x666666, side: THREE.DoubleSide });
  const accent = new THREE.MeshPhongMaterial({ color: team.accent, shininess: 50 });
  const carbon = mat(0x1b1c1f);
  // ノーズ〜モノコック〜エンジンカバー
  car.add(tub([
    [-2.75, 0.06, 0.18, 0.3],
    [-2.2, 0.16, 0.16, 0.42],
    [-1.4, 0.3, 0.14, 0.58],
    [-0.7, 0.42, 0.12, 0.72],
    [0.0, 0.42, 0.12, 0.76],
    [0.6, 0.4, 0.12, 0.98],  // エアボックス
    [1.4, 0.3, 0.12, 0.8],
    [2.1, 0.16, 0.14, 0.48],
    [2.5, 0.1, 0.16, 0.36],
  ], body));
  // サイドポッド
  for (const sx of [-1, 1]) {
    const pod = tub([
      [-0.6, 0.2, 0.1, 0.45],
      [-0.2, 0.32, 0.08, 0.62],
      [0.8, 0.3, 0.08, 0.52],
      [1.7, 0.12, 0.1, 0.3],
    ], body);
    pod.position.x = sx * 0.55;
    car.add(pod);
    car.add(box(0.06, 0.32, 0.9, accent, sx * 0.9, 0.36, 0.2));
  }
  // フロアと板
  car.add(box(1.5, 0.04, 3.4, carbon, 0, 0.07, 0.3));
  // フロントウイング
  car.add(box(1.9, 0.05, 0.45, accent, 0, 0.12, -2.65));
  car.add(box(1.9, 0.04, 0.3, body, 0, 0.2, -2.45));
  for (const sx of [-1, 1]) car.add(box(0.03, 0.26, 0.6, carbon, sx * 0.95, 0.2, -2.55));
  // リアウイング
  car.add(box(1.0, 0.05, 0.35, accent, 0, 0.95, 2.35));
  car.add(box(1.0, 0.04, 0.22, body, 0, 1.05, 2.25));
  for (const sx of [-1, 1]) car.add(box(0.04, 0.6, 0.6, body, sx * 0.5, 0.72, 2.3));
  car.add(box(0.06, 0.6, 0.08, carbon, 0, 0.62, 2.2));
  // ヘイロー
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 6, 16, Math.PI), carbon);
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(0, 0.92, -0.35);
  car.add(halo);
  car.add(box(0.05, 0.2, 0.05, carbon, 0, 0.82, -0.72));
  // ヘルメット
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), new THREE.MeshPhongMaterial({ color: team.accent, shininess: 90 }));
  helm.position.set(0, 0.88, -0.25);
  car.add(helm);
  // サスペンションアーム
  for (const [z, w] of [[-1.7, 0.75], [1.65, 0.65]]) {
    for (const sx of [-1, 1]) car.add(box(w, 0.025, 0.05, carbon, sx * (0.35 + w / 2), 0.35, z));
  }
  // タイヤ
  car.wheels = [];
  for (const [x, z] of [[-0.82, -1.7], [0.82, -1.7], [-0.8, 1.65], [0.8, 1.65]]) {
    const wh = wheel();
    wh.position.set(x, 0.36, z);
    if (z > 0) wh.scale.set(1.15, 1.03, 1.03);
    car.add(wh);
    car.wheels.push(wh);
  }
  // テールのレインライト
  const rain = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.03), new THREE.MeshBasicMaterial({ color: 0x400000 }));
  rain.position.set(0, 0.55, 2.52);
  car.add(rain);
  car.rainLight = rain;
  // ゼッケン
  const no = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshBasicMaterial({ map: plateTex('no' + team.no, String(team.no), '#fff', '#111', 92), transparent: false }));
  no.rotation.x = -Math.PI / 2 + 0.25;
  no.position.set(0, 0.36, -1.85);
  car.add(no);
  // 影 (簡易)
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 5.4), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.02;
  car.add(sh);
  return car;
}

// ---------------- ランドマーク ----------------
// すべて原点が地面、y が上。実寸 (m)
function glassMat(night, style = 1) {
  const m = new THREE.MeshLambertMaterial({ map: windowTex(night, style).clone() });
  m.map.needsUpdate = true;
  return m;
}
function texBox(w, h, d, night, style = 1, tint = 0xffffff) {
  const g = new THREE.BoxGeometry(w, h, d);
  // 面ごとに UV を実寸にあわせる
  const uv = g.attributes.uv;
  const n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const sx = nx > 0.5 ? d : w;
    if (ny > 0.5) { uv.setXY(i, 0, 0); continue; }
    uv.setXY(i, (uv.getX(i) * sx) / 4, (uv.getY(i) * h) / 3.5);
  }
  const m = new THREE.MeshLambertMaterial({ map: windowTex(night, style), color: tint });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = h / 2;
  return mesh;
}

const MODELS = {
  // テックジム (千代田区平河町2丁目)。屋上と壁面に看板
  techgym(night) {
    const g = new THREE.Group();
    const b = texBox(26, 38, 22, night, 1, 0xd8dde2);
    g.add(b);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(27, 1.2, 23), mat(0x5c646b));
    crown.position.y = 38.6;
    g.add(crown);
    const tex = canvasTex('techgym-sign', 1024, 320, (c, w, h) => {
      c.fillStyle = '#0b1a2e';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ff7a00';
      c.fillRect(0, 0, w, 16);
      c.fillRect(0, h - 16, w, 16);
      c.fillStyle = '#ffffff';
      c.font = `900 150px "Orbitron", ${JP}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('TECH GYM', w / 2, h * 0.42);
      c.fillStyle = '#ffb347';
      c.font = `900 64px ${JP}`;
      c.fillText('テックジム  平河町', w / 2, h * 0.8);
    });
    const signMat = new THREE.MeshBasicMaterial({ map: tex, color: night ? 0xffffff : 0xeeeeee, side: THREE.DoubleSide });
    // 屋上の看板 (近づいてくる車の方へ向け、少し道路側へ振る)
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(22, 6.9), signMat);
    roof.position.set(0, 43.5, 4);
    roof.rotation.y = 0.35;
    g.add(roof);
    for (const sx of [-8, 0, 8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), mat(0x444a50));
      leg.position.set(sx, 41.2, 3.2);
      g.add(leg);
    }
    // 道路側の壁面に縦の看板
    const vt = canvasTex('techgym-v', 160, 640, (c, w, h) => {
      c.fillStyle = '#ff7a00';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.font = `900 96px ${JP}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      ['テ', 'ッ', 'ク', 'ジ', 'ム'].forEach((ch, i) => c.fillText(ch, w / 2, 70 + i * 122));
    });
    const v = new THREE.Mesh(new THREE.PlaneGeometry(3, 12), new THREE.MeshBasicMaterial({ map: vt, color: night ? 0xffffff : 0xeeeeee }));
    v.position.set(13.05, 28, 6);
    v.rotation.y = Math.PI / 2;
    g.add(v);
    return g;
  },
  chimney(night) {
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 5, 160, 20), mat(0xe8e8e8));
    c.position.y = 80;
    g.add(c);
    for (const y of [140, 150]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 6, 20), mat(0xd23a2a));
      band.position.y = y;
      g.add(band);
    }
    const plant = texBox(90, 30, 60, night, 0, 0xdddddd);
    plant.position.x = 50;
    g.add(plant);
    return g;
  },
  tocho(night) {
    const g = new THREE.Group();
    const low = texBox(110, 160, 50, night, 0, 0xd7d2c6);
    g.add(low);
    for (const sx of [-1, 1]) {
      const t = texBox(36, 82, 36, night, 0, 0xd7d2c6);
      t.position.set(sx * 30, 160 + 41, 0);
      t.rotation.y = Math.PI / 4;
      g.add(t);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 6, 8), mat(0xbfb9ac));
      cap.position.set(sx * 30, 245, 0);
      g.add(cap);
    }
    return g;
  },
  parktower(night) {
    const g = new THREE.Group();
    [[0, 235, 40], [42, 215, 40], [84, 195, 40]].forEach(([x, h, w]) => {
      const b = texBox(w, h - 20, w, night, 1, 0xcfd6dc);
      b.position.x = x - 42;
      g.add(b);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.72, 20, 4), mat(0x8e979e));
      roof.rotation.y = Math.PI / 4;
      roof.position.set(x - 42, h - 10, 0);
      g.add(roof);
    });
    return g;
  },
  operacity(night) {
    const g = new THREE.Group();
    const b = texBox(55, 225, 45, night, 1, 0xc8ccd0);
    g.add(b);
    const top = new THREE.Mesh(new THREE.BoxGeometry(40, 12, 30), mat(0x777e86));
    top.position.y = 231;
    g.add(top);
    const hall = texBox(120, 30, 60, night, 0, 0xcccccc);
    hall.position.set(0, 0, 60);
    g.add(hall);
    return g;
  },
  cocoon(night) {
    const g = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector2(22 + Math.sin(t * Math.PI) * 10 - t * 10, t * 204));
    }
    pts.push(new THREE.Vector2(0, 204));
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), new THREE.MeshLambertMaterial({ color: 0x8faabb, emissive: night ? 0x1a2a3a : 0 }));
    g.add(m);
    return g;
  },
  docomo(night) {
    const g = new THREE.Group();
    const b = texBox(45, 150, 40, night, 0, 0xd8d0c0);
    g.add(b);
    const mid = texBox(38, 45, 34, night, 0, 0xd8d0c0);
    mid.position.y = 150 + 22.5;
    g.add(mid);
    const top = texBox(26, 20, 26, night, 0, 0xd8d0c0);
    top.position.y = 195 + 10;
    g.add(top);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: night ? 0xfff4d0 : 0xf6f2e6 }));
    clock.position.set(0, 205, 13.1);
    g.add(clock);
    const clock2 = clock.clone();
    clock2.rotation.y = -Math.PI / 2;
    clock2.position.set(-13.1, 205, 0);
    g.add(clock2);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(4, 25, 8), mat(0x9a9ea2));
    spire.position.y = 227;
    g.add(spire);
    return g;
  },
  stadium() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(150, 160, 47, 40, 1, true), mat(0x9c7a52, { side: THREE.DoubleSide }));
    ring.position.y = 23.5;
    g.add(ring);
    for (let i = 0; i < 4; i++) {
      const eave = new THREE.Mesh(new THREE.CylinderGeometry(165 - i * 2, 165 - i * 2, 2.5, 40, 1, true), mat(0x7a5a3a, { side: THREE.DoubleSide }));
      eave.position.y = 12 + i * 11;
      g.add(eave);
    }
    const roof = new THREE.Mesh(new THREE.RingGeometry(80, 150, 40), mat(0xdedede, { side: THREE.DoubleSide }));
    roof.rotation.x = -Math.PI / 2;
    roof.position.y = 47;
    g.add(roof);
    // 植栽
    const green = new THREE.Mesh(new THREE.CylinderGeometry(150, 150, 1, 40), mat(0x4f7a3a));
    green.position.y = 46;
    g.add(green);
    return g;
  },
  diet() {
    const g = new THREE.Group();
    const stone = mat(0xd9d1bd);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(206, 21, 88), stone);
    wing.position.y = 10.5;
    g.add(wing);
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), stone);
    c1.position.y = 31;
    g.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), stone);
    c2.position.y = 48;
    g.add(c2);
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(21, 16, 4), stone);
    pyr.rotation.y = Math.PI / 4;
    pyr.position.y = 63;
    g.add(pyr);
    return g;
  },
  tokyotower(night) {
    const g = new THREE.Group();
    const red = new THREE.MeshLambertMaterial({ color: 0xe8461e, emissive: night ? 0xb03a10 : 0x000000 });
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2, emissive: night ? 0x806040 : 0x000000 });
    // 鉄骨を細い脚で表現
    const seg = [[0, 80, 48, 30], [80, 150, 30, 15], [150, 250, 15, 6], [250, 333, 6, 1]];
    let band = 0;
    seg.forEach(([y0, y1, r0, r1]) => {
      const steps = Math.ceil((y1 - y0) / 25);
      for (let i = 0; i < steps; i++) {
        const a = y0 + ((y1 - y0) * i) / steps, b = y0 + ((y1 - y0) * (i + 1)) / steps;
        const ra = r0 + ((r1 - r0) * i) / steps, rb = r0 + ((r1 - r0) * (i + 1)) / steps;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, b - a, 4, 1, true), band++ % 2 ? white : red);
        m.material.side = THREE.DoubleSide;
        m.rotation.y = Math.PI / 4;
        m.position.y = (a + b) / 2;
        g.add(m);
      }
    });
    const deck1 = new THREE.Mesh(new THREE.BoxGeometry(34, 10, 34), white);
    deck1.position.y = 150;
    g.add(deck1);
    const deck2 = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 14), white);
    deck2.position.y = 250;
    g.add(deck2);
    return g;
  },
  toranomon(night) {
    const g = new THREE.Group();
    const b = texBox(70, 255, 55, night, 1, 0xb8c6d0);
    g.add(b);
    return g;
  },
  arkhills(night) {
    const g = new THREE.Group();
    const b = texBox(60, 153, 45, night, 0, 0xd8c8b0);
    g.add(b);
    const b2 = texBox(40, 100, 40, night, 1, 0xd0d0d0);
    b2.position.set(-70, 0, 30);
    g.add(b2);
    return g;
  },
  midtown(night) {
    const g = new THREE.Group();
    const b = texBox(60, 225, 45, night, 1, 0xd0d8e0);
    g.add(b);
    const top = texBox(42, 23, 32, night, 1, 0xd0d8e0);
    top.position.y = 225 + 11.5;
    g.add(top);
    return g;
  },
  mori(night) {
    const g = new THREE.Group();
    const pts = [];
    pts.push(new THREE.Vector2(0, 0));
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector2(42 - t * 6 + Math.sin(t * Math.PI) * 4, t * 220));
    }
    pts.push(new THREE.Vector2(26, 238));
    pts.push(new THREE.Vector2(0, 238));
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 8), new THREE.MeshLambertMaterial({ map: windowTex(night, 1), color: 0xa8b4bc }));
    m.material.map = m.material.map.clone();
    m.material.map.repeat.set(16, 60);
    m.material.map.needsUpdate = true;
    g.add(m);
    return g;
  },
  scramble(night) {
    const g = new THREE.Group();
    const b = texBox(70, 200, 55, night, 1, 0xc4ccd4);
    g.add(b);
    // 頂部のガラスの吹き抜け (SHIBUYA SKY)
    const top = new THREE.Mesh(new THREE.BoxGeometry(68, 30, 53), new THREE.MeshLambertMaterial({ color: 0xb0c8d8, transparent: true, opacity: 0.55, emissive: night ? 0x334455 : 0 }));
    top.position.y = 215;
    g.add(top);
    return g;
  },
  hikarie(night) {
    const g = new THREE.Group();
    const b = texBox(55, 183, 45, night, 1, 0xb8c0c8);
    b.scale.x = 1;
    g.add(b);
    const base = texBox(70, 70, 60, night, 0, 0xe0e0e0);
    g.add(base);
    return g;
  },
  cerulean(night) {
    const g = new THREE.Group();
    const b = texBox(46, 184, 46, night, 0, 0xc8ced6);
    b.rotation.y = Math.PI / 6;
    g.add(b);
    return g;
  },
  carrot(night) {
    const g = new THREE.Group();
    const b = texBox(40, 106, 40, night, 0, 0xe8d8c0);
    g.add(b);
    const top = new THREE.Mesh(new THREE.BoxGeometry(34, 18, 34), new THREE.MeshLambertMaterial({ color: 0xff7a1a, emissive: night ? 0x802a00 : 0 }));
    top.position.y = 115;
    g.add(top);
    return g;
  },
  gbs(night) {
    const g = new THREE.Group();
    const b = texBox(44, 121, 44, night, 1, 0xc0c8cc);
    g.add(b);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(18, 22, 10, 8), mat(0x8a9196));
    crown.position.y = 126;
    g.add(crown);
    return g;
  },
  skytree(night) {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: night ? 0x8fb8ff : 0xd8e2ea, fog: false });
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(34, 0), new THREE.Vector2(16, 300), new THREE.Vector2(10, 450), new THREE.Vector2(3, 634), new THREE.Vector2(0, 634)];
    g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 8), m));
    for (const [y, r] of [[350, 22], [450, 14]]) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 14, 12), m);
      d.position.y = y;
      g.add(d);
    }
    g.renderOrder = -1;
    return g;
  },
  fuji(night) {
    const g = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new THREE.Vector2(19000 * Math.pow(1 - t, 1.6) + 400, t * 3776));
    }
    pts.push(new THREE.Vector2(0, 3776));
    const col = night ? 0x1c2638 : 0x7d8fa8;
    const m = new THREE.MeshBasicMaterial({ color: col, fog: false });
    g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), m));
    const snow = [];
    for (let i = 0; i <= 6; i++) {
      const t = 0.62 + (i / 6) * 0.38;
      snow.push(new THREE.Vector2(19000 * Math.pow(1 - t, 1.6) + 400 + 20, t * 3776 + 5));
    }
    snow.push(new THREE.Vector2(0, 3790));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(snow, 24), new THREE.MeshBasicMaterial({ color: night ? 0x445066 : 0xf2f4f8, fog: false })));
    g.renderOrder = -2;
    return g;
  },
};

export function makeLandmark(name, night) {
  const f = MODELS[name];
  return f ? f(night) : null;
}
