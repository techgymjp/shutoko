// 首都高F1グランプリ メイン (レース進行・操作・AI・カメラ・HUD)
import * as THREE from '../vendor/three.module.min.js';
import { COURSES } from './courses.js';
import { Course, rng } from './route.js';
import { World, THEMES, HALF, LANES, yawOf } from './world.js';
import { makeF1, TEAMS } from './models.js';
import { Cockpit } from './cockpit.js';
import { Effects } from './effects.js';
import { Traffic } from './traffic.js';
import { Sound } from './audio.js';

// ---------------- 定数 ----------------
const KMH = 3.6;
const VMAX = 340 / KMH;      // 最高速 (m/s)
const A0 = 12.5;             // 発進加速 (m/s²) 0→100km/h ≒ 2.5 秒
const BRAKE = 34;            // ブレーキ (m/s²)
const GRIP = 27;             // 横方向のグリップ限界 (m/s²)
const CAR_L = 5.3, CAR_W = 1.95;
const EDGE = HALF - 1.0;     // 車の中心が動ける範囲
const N_CARS = 12;
const BOOST_MAX = 0.08;      // 最下位のときのスピードボーナス
// 先頭の重圧: トップに立って LEAD_GRACE 秒たつと LEAD_PEN_T 秒のあいだ最高速が脚質ごとの割合だけ下がる
// (先頭は風よけがない)。ゴール前 FINAL_FREE m からは起きない
const LEAD_GRACE = 2.5, LEAD_PEN_T = 12, LEAD_CD = 6, FINAL_FREE = 500;
const ERS_SEC = 8;           // ERS 1 本ぶんで全開にできる秒数
// マシンの脚質 (ダービージョッキーの逃げ・先行・差し・追込)
// band: 走っていて心地よい順位の範囲 (0 = 先頭, 1 = 最後尾)。この範囲だと ERS がよく溜まり、
// 前に出すぎるとマシンが熱を持って回生できない。leadPen: 先頭の重圧で下がる最高速の割合
const MACHINES = {
  nige: { name: '逃げ', vmax: 350, accel: 1.08, grip: 29, ers: 0.5, ersPow: 0.07, band: [0, 0.1], leadPen: 0.05,
    desc: '先頭で風を受けても落ちにくい。ERSは短い。スタートから前へ出て押し切る。', stats: [5, 5, 5, 1] },
  senko: { name: '先行', vmax: 344, accel: 1.04, grip: 28, ers: 0.8, ersPow: 0.09, band: [0.08, 0.36], leadPen: 0.1,
    desc: '2〜4番手が心地よい。前の集団で風よけを使い、残り1kmで抜け出す。', stats: [5, 4, 4, 2] },
  sashi: { name: '差し', vmax: 338, accel: 1.0, grip: 27, ers: 1.1, ersPow: 0.11, band: [0.4, 0.72], leadPen: 0.12,
    desc: '中団（5〜8番手）でERSを溜め、ゴール前で一気に差す。', stats: [4, 4, 4, 4] },
  oikomi: { name: '追込', vmax: 332, accel: 0.97, grip: 26, ers: 1.6, ersPow: 0.13, band: [0.74, 1], leadPen: 0.14,
    desc: '後方で我慢するほどERSが満ちる。最後の直線で大外からまくる。', stats: [3, 3, 3, 5] },
};
const MACHINE_KEYS = Object.keys(MACHINES);

const GEARS = [0, 95, 135, 170, 205, 240, 275, 310, 400];
const EYE_H = 0.95;

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const store = {
  get(k, d) { try { const v = localStorage.getItem('shutoko.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('shutoko.' + k, JSON.stringify(v)); } catch { /* 保存できなくても遊べる */ } },
};
const fmt = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
};

// ---------------- レンダラー ----------------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.autoClear = false;
const camera = new THREE.PerspectiveCamera(72, 1, 0.12, 20000);

let G = null; // 1回のレースの状態
let theme = store.get('theme', 'day');
let selected = 0;
let machineKey = store.get('machine', 'sashi');
// ミステリーマシン: 脚質は隠れていて、走りと無線で見抜く。1位になると判明する
let mystery = store.get('mystery', null); // { style, revealed, races }

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (G) G.cockpit.resize(w / h);
}
window.addEventListener('resize', resize);

// ---------------- 入力 ----------------
const input = { left: false, right: false, accel: false, brake: false, ers: false };
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'accel', KeyW: 'accel', Space: 'accel', KeyZ: 'accel',
  ArrowDown: 'brake', KeyS: 'brake', KeyX: 'brake',
  ShiftLeft: 'ers', ShiftRight: 'ers', KeyE: 'ers', KeyC: 'ers',
};
window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'Enter' && !$('title').hidden) startRace();
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) input[KEYMAP[e.code]] = false; });
window.addEventListener('blur', () => { for (const k in input) input[k] = false; if (G && G.mode === 'race') togglePause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.mode === 'race') togglePause(true); });

for (const b of document.querySelectorAll('#touch [data-k]')) {
  const k = b.dataset.k;
  const on = (e) => { e.preventDefault(); input[k] = true; b.classList.add('on'); Sound.init(); };
  const off = (e) => { e.preventDefault(); input[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('pointerleave', off);
}

// ---------------- タイトル ----------------
function buildTitle() {
  const list = $('courses');
  list.innerHTML = '';
  COURSES.forEach((c, i) => {
    const el = document.createElement('button');
    el.className = 'course-card' + (c.playable ? '' : ' locked') + (i === selected ? ' sel' : '');
    el.innerHTML = `
      <div class="cc-no">${i + 1}</div>
      <div class="cc-body">
        <div class="cc-title">${c.title}</div>
        <div class="cc-sub">${c.sub}</div>
        ${c.note ? `<div class="cc-note">${c.note}</div>` : ''}
      </div>
      <div class="cc-km">${c.playable ? '<b>PLAY</b>' : '<span>準備中</span>'}${c.km ? `<small>${c.km}km</small>` : ''}</div>`;
    el.addEventListener('click', () => {
      if (!c.playable) { flashMsg('このルートは準備中です'); return; }
      selected = i;
      buildTitle();
    });
    list.appendChild(el);
  });
  for (const b of document.querySelectorAll('#themes button')) {
    b.classList.toggle('sel', b.dataset.t === theme);
  }
  // 脚質
  const ms = $('machines');
  ms.innerHTML = '';
  const labels = ['最高速', '加速', 'コーナー', 'ERS 末脚'];
  const cards = [...MACHINE_KEYS, 'mystery'];
  for (const key of cards) {
    const el = document.createElement('button');
    el.className = 'machine' + (key === machineKey ? ' sel' : '') + (key === 'mystery' ? ' mystery' : '');
    if (key === 'mystery') {
      const known = mystery && mystery.revealed ? MACHINES[mystery.style].name : null;
      el.innerHTML = `<div class="m-name">ミステリー <small>${known ? '脚質: ' + known : '脚質: ？？？'}</small></div>
        <div class="m-desc">ダービージョッキー方式。脚質は隠れていて、無線とレース後のコメントで見抜く。1位になると判明する。${mystery ? `（${mystery.races}戦）` : ''}</div>
        ${mystery ? '<span class="m-new" data-new>新しいマシンに乗り換える</span>' : ''}`;
    } else {
      const m = MACHINES[key];
      el.innerHTML = `<div class="m-name">${m.name}</div><div class="m-desc">${m.desc}</div>` +
        m.stats.map((v, i) => `<div class="m-stat"><span>${labels[i]}</span>${'<i class="f"></i>'.repeat(v)}${'<i></i>'.repeat(5 - v)}</div>`).join('');
    }
    el.addEventListener('click', (e) => {
      if (e.target.dataset.new !== undefined) {
        mystery = null;
        store.set('mystery', null);
        flashMsg('新しいミステリーマシンに乗り換えました');
      }
      machineKey = key;
      store.set('machine', key);
      buildTitle();
    });
    ms.appendChild(el);
  }
  const best = store.get('best.' + COURSES[selected].id, null);
  $('best').textContent = best ? `ベスト ${fmt(best.time)}（${best.pos}位）` : '';
}
for (const b of document.querySelectorAll('#themes button')) {
  b.addEventListener('click', () => { theme = b.dataset.t; store.set('theme', theme); buildTitle(); });
}
$('btn-start').addEventListener('click', () => startRace());
$('btn-resume').addEventListener('click', () => togglePause(false));
$('btn-retry').addEventListener('click', () => { closeOverlays(); startRace(); });
$('btn-quit').addEventListener('click', () => toTitle());
$('btn-again').addEventListener('click', () => { closeOverlays(); startRace(); });
$('btn-title').addEventListener('click', () => toTitle());
$('btn-pause').addEventListener('click', () => togglePause());
$('btn-mute').addEventListener('click', () => toggleMute());

function flashMsg(t) {
  const el = $('toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(flashMsg.t);
  flashMsg.t = setTimeout(() => el.classList.remove('show'), 1600);
}
function closeOverlays() { $('pause').hidden = true; $('result').hidden = true; }
function toggleMute() {
  Sound.setMuted(!Sound.muted);
  $('btn-mute').textContent = Sound.muted ? '🔇' : '🔊';
}
function togglePause(force) {
  if (!G || (G.mode !== 'race' && G.mode !== 'paused' && G.mode !== 'countdown')) return;
  const pause = force ?? G.mode !== 'paused';
  if (pause && G.mode !== 'paused') {
    G.prevMode = G.mode;
    G.mode = 'paused';
    $('pause').hidden = false;
    Sound.silence();
  } else if (!pause && G.mode === 'paused') {
    G.mode = G.prevMode;
    $('pause').hidden = true;
  }
}
function toTitle() {
  closeOverlays();
  disposeGame();
  $('hud').hidden = true;
  $('touch').hidden = true;
  $('title').hidden = false;
  Sound.silence();
  buildTitle();
}

// ---------------- レースの準備 ----------------
function disposeGame() {
  if (!G) return;
  G.scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
  G = null;
}

function startRace() {
  Sound.init();
  disposeGame();
  $('title').hidden = true;
  $('hud').hidden = false;
  $('touch').hidden = !matchMedia('(pointer: coarse)').matches;
  const def = COURSES[selected];
  const course = new Course(def);
  const scene = new THREE.Scene();
  const T = THEMES[theme] || THEMES.day;
  const world = new World(scene, course, theme);
  const r = rng((Math.random() * 1e9) | 0);
  const startS = course.marks[0].s + 40;
  const goalS = course.marks[course.marks.length - 1].s;
  world.startS = startS;
  world.goalS = goalS;

  // チーム (自分は SAKURA) と スタート位置 (ランダム)
  const playerTeam = TEAMS[0];
  const rivals = TEAMS.slice(1);
  // 脚質 (ミステリーマシンは隠れている)
  let styleKey = machineKey, hidden = false;
  if (machineKey === 'mystery') {
    if (!mystery) { mystery = { style: MACHINE_KEYS[Math.floor(Math.random() * 4)], revealed: false, races: 0 }; store.set('mystery', mystery); }
    styleKey = mystery.style;
    hidden = !mystery.revealed;
  }
  // いつも最後尾からスタート
  const playerSlot = N_CARS - 1;
  const racers = [];
  let ri = 0;
  for (let slot = 0; slot < N_CARS; slot++) {
    const isP = slot === playerSlot;
    const team = isP ? playerTeam : rivals[ri++];
    const s = startS - 8 * slot - (slot % 2) * 4;
    const car = {
      team, player: isP, slot,
      s, x: LANES[slot % 2], v: 0, vx: 0, spin: 0, spinV: 0,
      // ポールに近いほど速い。後ろのほうでも 300km/h は出る
      skill: isP ? 1 : 0.985 - (slot / N_CARS) * 0.06 + (r() - 0.5) * 0.02,
      laneT: LANES[slot % 2], laneTimer: 4 + r() * 8, react: 0.1 + r() * 0.5,
      finished: false, time: 0, hitCd: 0, startDelay: isP ? 0 : 0.05 + r() * 0.2,
      model: null,
    };
    if (!isP) {
      car.model = makeF1(team, { night: T.night });
      scene.add(car.model);
    }
    racers.push(car);
  }
  const player = racers[playerSlot];
  const cockpit = new Cockpit(playerTeam, T);
  const effects = new Effects(scene);
  const traffic = new Traffic(scene, course, T.night, r);

  // 夜は自分のヘッドライトで前を照らす
  let headlight = null;
  if (T.night) {
    headlight = new THREE.SpotLight(0xfff2dc, 900, 220, 0.42, 0.55, 1.6);
    scene.add(headlight, headlight.target);
  }
  G = {
    def, course, scene, world, racers, player, cockpit, effects, traffic, T, headlight,
    mode: 'countdown', t: 0, raceT: 0, countdown: 0, lightsOut: 5.1 + Math.random() * 1.2,
    startS, goalS,
    shake: 0, flash: 0, red: 0, slowmo: 0, roll: 0, jolt: 0,
    steer: 0, gear: 1, rpm: 4000, lastGear: 1,
    rank: playerSlot + 1, prevRank: playerSlot + 1, boost: 0, slip: 0,
    sectionIdx: -1, scrapeT: 0, hits: 0, overtakes: 0, best: 0, tunnel: 0,
    towerT: 0, finishT: 0, spots: new Set(), hitLog: [],
    M: MACHINES[styleKey], styleKey, hidden, ers: 0, ersOn: false, leadT: 0, penalty: 0, penCd: 0, calls: new Set(),
    fit: 'behind', fitT: { ahead: 0, fit: 0, behind: 0 }, radioT: 12, lastRadio: '', ersEmptyAt: null,
  };
  G.ers = G.M.ers;
  world.prebuild(player.s);
  resize();
  // ミニマップ
  buildMinimap();
  // スタートシグナル
  $('lights').hidden = false;
  for (const l of document.querySelectorAll('#lights i')) l.className = '';
  $('grid-msg').innerHTML = `スタート位置 <b>${playerSlot + 1}</b>番グリッド`;
  $('grid-msg').classList.add('show');
  setTimeout(() => $('grid-msg').classList.remove('show'), 3500);
  showTelop(def.sections?.[0]?.main || def.title, `${playerSlot + 1}番グリッドからスタート`, def.en);
  $('hud-course').textContent = def.title;
  $('hud-style').textContent = G.hidden ? '？？？' : G.M.name;
}

// ---------------- ミニマップ ----------------
let mini = null;
function buildMinimap() {
  const c = G.course;
  const cv = $('minimap');
  const W = cv.width, H = cv.height;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < c.N; i += 10) {
    x0 = Math.min(x0, c.X[i]); x1 = Math.max(x1, c.X[i]);
    z0 = Math.min(z0, c.Z[i]); z1 = Math.max(z1, c.Z[i]);
  }
  const sc = Math.min((W - 30) / (x1 - x0), (H - 30) / (z1 - z0));
  const ox = (W - (x1 - x0) * sc) / 2, oz = (H - (z1 - z0) * sc) / 2;
  const P = (x, z) => [ox + (x - x0) * sc, oz + (z - z0) * sc];
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  const g = bg.getContext('2d');
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [w, col] of [[9, '#0c1118'], [5, '#5d6b7a']]) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    for (let i = 0; i < c.N; i += 5) g.lineTo(...P(c.X[i], c.Z[i]));
    g.stroke();
  }
  // トンネル
  g.strokeStyle = '#2b333d';
  g.lineWidth = 5;
  for (const [a, b] of c.tunnels) {
    g.beginPath();
    for (let s = a; s <= b; s += 10) { const p = c.at(s); g.lineTo(...P(p.x, p.z)); }
    g.stroke();
  }
  g.font = 'bold 15px "Noto Sans JP", sans-serif';
  for (const m of c.marks) {
    if (m.kind === 'ic' && !['高井戸', '渋谷', '霞が関'].includes(m.name)) continue;
    const p = c.at(m.s);
    const [x, y] = P(p.x, p.z);
    g.fillStyle = m.kind === 'jct' ? '#7fe0ff' : '#ffd23a';
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#dfe8f2';
    const label = m.name.replace('JCT', '');
    g.textAlign = x > W * 0.6 ? 'right' : 'left';
    g.fillText(label, x + (x > W * 0.6 ? -7 : 7), y + (m.name === '谷町JCT' ? 14 : -6));
  }
  mini = { bg, P };
}
function drawMinimap() {
  const cv = $('minimap');
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  g.drawImage(mini.bg, 0, 0);
  const p = {};
  for (const r of G.racers) {
    if (r.player) continue;
    G.course.at(r.s, 0, p);
    const [x, y] = mini.P(p.x, p.z);
    g.fillStyle = '#' + r.team.body.toString(16).padStart(6, '0');
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  G.course.at(G.player.s, 0, p);
  const [x, y] = mini.P(p.x, p.z);
  g.fillStyle = '#ff2a6a';
  g.strokeStyle = '#fff';
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(x, y, 6.5, 0, Math.PI * 2); g.fill(); g.stroke();
}

// ---------------- 演出 ----------------
let telopTimer = null;
function showTelop(main, sub, en) {
  const el = $('telop');
  $('telop-main').textContent = main;
  $('telop-sub').textContent = sub || '';
  $('telop-en').textContent = en || '';
  el.className = '';
  void el.offsetWidth;
  el.className = 'show';
  clearTimeout(telopTimer);
  telopTimer = setTimeout(() => { el.className = 'hide'; }, 2600);
}
let alertTimer = null;
function showAlert(text, cls = '', ms = 900) {
  const el = $('alert');
  el.textContent = text;
  el.className = 'show ' + cls;
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => { el.className = ''; }, ms);
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
function carVel(r, out = new THREE.Vector3()) {
  const p = G.course.at(r.s);
  return out.set(p.tx * r.v, 0, p.tz * r.v);
}
function worldPos(r, dy = 0.4, ds = 0, dx = 0, out = new THREE.Vector3()) {
  const p = G.course.at(r.s + ds, r.x + dx);
  return out.set(p.x, p.y + dy, p.z);
}

// ぶつかった時の演出。power 0..1
function hitFx(power, pos, vel, kind, color = 0xf3f3f3) {
  power = clamp(power, 0.1, 1);
  G.shake = Math.max(G.shake, 0.18 + power * 0.7);
  G.flash = Math.max(G.flash, 0.25 + power * 0.55);
  G.red = Math.max(G.red, 0.3 + power * 0.6);
  G.jolt += (Math.random() < 0.5 ? -1 : 1) * power * 0.12;
  G.effects.sparks(pos, 30 + power * 90, vel);
  G.effects.shards(pos, Math.round(4 + power * 18), vel, color);
  G.effects.puff(pos, vel, 1.2 + power * 2);
  Sound.crash(power);
  if (navigator.vibrate) try { navigator.vibrate(Math.round(40 + power * 160)); } catch { /* 振動できない端末 */ }
  if (power > 0.55) G.slowmo = 0.45;
  const words = kind === 'wall'
    ? (power > 0.6 ? ['ガシャーン!!', '壁にヒット!!'] : ['ガリガリッ!', '壁に接触!'])
    : (power > 0.6 ? ['ドカン!!', '激突!!', 'ガツン!!'] : ['接触!', 'コツン!', 'バチッ!']);
  showAlert(words[Math.floor(Math.random() * words.length)], power > 0.6 ? 'big' : '', 900);
  G.hits++;
  G.hitLog.push(`${kind}:${power.toFixed(2)}@${Math.round(G.player.s)}`);
}

// ---------------- 物理 ----------------
function rankBonus(rank) {
  return 1 + (BOOST_MAX * (rank - 1)) / (N_CARS - 1);
}

// 前を走る車のスリップストリーム (0..1)
function slipFor(car) {
  let best = 0;
  for (const o of G.racers) {
    if (o === car) continue;
    const ds = o.s - car.s;
    if (ds > 4 && ds < 40 && Math.abs(o.x - car.x) < 1.6) best = Math.max(best, 1 - ds / 40);
  }
  return best;
}

function updatePlayer(dt) {
  const P = G.player;
  const c = G.course;
  const p = c.at(P.s);
  const racing = G.mode === 'race' && !P.finished;
  const M = G.M;
  const bonus = racing ? rankBonus(G.rank) : 1;
  G.boost = bonus - 1;
  G.slip = racing ? slipFor(P) : 0;
  // 先頭の重圧 (トップに立ってしばらくすると、一定時間ペースが落ちる)
  const remain = G.goalS - P.s;
  G.leadT = racing && G.rank === 1 ? G.leadT + dt : 0;
  G.penCd = Math.max(0, G.penCd - dt);
  if (G.penalty > 0) {
    G.penalty -= dt;
    if (G.penalty <= 0) { G.penalty = 0; G.penCd = LEAD_CD; }
  } else if (G.leadT > LEAD_GRACE && G.penCd <= 0 && remain > FINAL_FREE) {
    G.penalty = LEAD_PEN_T;
    G.penCount = (G.penCount || 0) + 1;
    showAlert('先頭の重圧! ペースダウン', 'warn', 1600);
  }
  const penK = G.penalty > 0 ? 1 - M.leadPen : 1;
  // ERS: 押している間だけ最高速と加速が上がる。風よけ (スリップストリーム) とブレーキで溜まる
  G.ersOn = racing && input.ers && input.accel && G.ers > 0;
  if (G.ersOn) G.ers = Math.max(0, G.ers - dt / ERS_SEC);
  else if (racing) {
    // 心地よい位置ならよく溜まる。前に出すぎると熱で回生できない
    const pos = (G.rank - 1) / (N_CARS - 1);
    const fit = pos < M.band[0] ? 'ahead' : pos > M.band[1] ? 'behind' : 'fit';
    G.fitT[fit] += dt;
    G.fit = fit;
    const rate = fit === 'fit' ? 1 / 40 : fit === 'behind' ? 1 / 90 : -1 / 120;
    G.ers = clamp(G.ers + dt * (rate + G.slip * 0.05 + (input.brake ? 0.05 : 0)), 0, M.ers);
  }
  const ersK = G.ersOn ? 1 + M.ersPow : 1;
  const vtop = (M.vmax / KMH) * bonus * penK * ersK + G.slip * 9;
  const sp = P.v / vtop;
  let a;
  if (P.finished) a = P.v > 25 ? -6 : (P.v > 0 ? -3 : 0);
  else if (!racing) a = 0;
  else if (input.brake) a = -BRAKE - 4 * sp * sp;
  else if (input.accel) a = A0 * M.accel * bonus * (G.ersOn ? 1.35 : 1) * (1 + G.slip * 0.3) * (1 - 0.5 * sp) - A0 * 0.5 * sp * sp;
  else a = -(A0 * 0.45 * sp * sp + 2.0);
  // 最高速を超えている時 (重圧が始まった直後など) は早めに落ちる
  if (racing && P.v > vtop) a = Math.min(a, -3 - (P.v - vtop) * 0.4);
  a -= 9.8 * p.grade * 0.6;
  // スピン中は失速
  if (Math.abs(P.spin) > 0.25) a -= 9;
  P.v = Math.max(0, P.v + a * dt);
  if (P.finished && P.s > c.length - 60) P.v = Math.max(0, P.v - 30 * dt);

  // ハンドル (キーは滑らかに)
  let target = 0;
  if (racing && input.left) target += 1;
  if (racing && input.right) target -= 1;
  if (P.finished) target = clamp((LANES[0] - P.x) * 0.3, -0.5, 0.5);
  G.steer = lerp(G.steer, target, Math.min(1, dt * (target === 0 ? 7 : 5)));
  // 横方向: ハンドルの力 − 遠心力 (グリップを超えた分は外へ滑る)
  const need = P.v * P.v * p.k;
  const over = Math.max(0, Math.abs(need) - M.grip) * Math.sign(need);
  const steerA = 15 * Math.min(1, P.v / 14) * (1 - 0.35 * sp);
  const ax = G.steer * steerA - need * 0.12 - over;
  P.vx += ax * dt;
  P.vx *= Math.exp(-dt * 4.5);
  P.x += P.vx * dt;
  G.skid = Math.abs(over) / 12 + (Math.abs(P.spin) > 0.2 ? 0.6 : 0);

  // 壁
  if (Math.abs(P.x) > EDGE) {
    const side = Math.sign(P.x);
    P.x = side * EDGE;
    const impact = Math.max(0, P.vx * side) + P.v * Math.abs(Math.sin(P.spin)) * 0.5;
    if (impact > 3.5 && G.scrapeT <= 0) {
      const pos = worldPos(P, 0.35, 1.2, side * 0.9);
      hitFx(impact / 18, pos, carVel(P), 'wall');
      P.v *= 1 - clamp(impact / 60, 0.03, 0.25);
      P.spinV += -side * impact * 0.04;
      G.scrapeT = 0.35;
    }
    P.vx = -side * Math.min(3, Math.abs(P.vx) * 0.35 + 0.8);
    // こすっている間: 減速・火花・振動
    if (P.v > 5) {
      P.v -= 7 * dt;
      G.scraping = 0.15;
      G.shake = Math.max(G.shake, 0.08);
      G.effects.sparks(worldPos(P, 0.2, 0.5 + Math.random() * 1.5, side * 0.95, _v), 3, carVel(P, _w), side);
    }
  }
  G.scrapeT -= dt;
  G.scraping = Math.max(0, (G.scraping || 0) - dt);
  spinStep(P, dt);
  P.s = Math.min(P.s + P.v * dt, c.length - 2);
}

function spinStep(car, dt) {
  car.spinV += (-26 * car.spin - 5.5 * car.spinV) * dt;
  car.spin = clamp(car.spin + car.spinV * dt, -1.2, 1.2);
  car.hitCd = Math.max(0, car.hitCd - dt);
}

function updateAI(dt) {
  const c = G.course;
  const P = G.player;
  for (const car of G.racers) {
    if (car.player) continue;
    const racing = G.mode === 'race' && G.raceT > car.startDelay;
    // 目標速度
    let vt = VMAX * car.skill;
    const gap = car.s - P.s;
    // 自分より先に行きすぎた車は少し手を抜き、置いていかれた車は少し頑張る
    if (gap > 120) vt *= 1 - Math.min(0.09, (gap - 120) / 2500);
    else if (gap < 0 && G.rank === 1 && G.mode === 'race') {
      // 自分がトップの時は後続が本気で追い上げてくる (離れるほど速い)
      vt *= 1.03 + Math.min(0.06, -gap / 1800);
    } else if (gap < -150) vt *= 1 + Math.min(0.05, (-gap - 150) / 2500);
    const slip = slipFor(car);
    vt += slip * 8;
    // コーナー手前で減速
    const look = (car.v * car.v) / (2 * 22) + 25;
    const kmax = c.maxCurv(car.s, look);
    if (kmax > 1e-4) vt = Math.min(vt, Math.sqrt((GRIP * 0.97) / kmax));
    // 前の車 (自分も含む) に詰まったら車線変更、無理なら合わせる
    let blocker = null;
    for (const o of G.racers) {
      if (o === car) continue;
      const ds = o.s - car.s;
      if (ds > 0 && ds < 14 + Math.max(0, car.v - o.v) * 1.6 && Math.abs(o.x - car.laneT) < 2.0 && o.v < car.v + 2) {
        if (!blocker || ds < blocker.s - car.s) blocker = o;
      }
    }
    if (blocker) {
      const other = Math.abs(car.laneT - LANES[0]) < 0.5 ? LANES[1] : LANES[0];
      const free = G.racers.every((o) => o === car || Math.abs(o.x - other) > 2.1 || o.s - car.s < -9 || o.s - car.s > 16);
      if (free && car.laneTimer < 9) { car.laneT = other; car.laneTimer = 2.5 + Math.random() * 5; }
      else vt = Math.min(vt, blocker.v - 0.5);
    }
    car.laneTimer -= dt;
    if (car.laneTimer < 0) {
      // 気まぐれにラインを変える
      car.laneT = Math.random() < 0.5 ? LANES[0] : LANES[1];
      car.laneTimer = 5 + Math.random() * 9;
    }
    let a;
    const sp = car.v / VMAX;
    if (car.finished) vt = car.s > c.length - 120 ? 0 : 30;
    if (!racing && !car.finished) a = 0;
    else if (car.v < vt) a = Math.min(A0 * (1 - 0.5 * sp) - A0 * 0.5 * sp * sp * 0.9, (vt - car.v) * 3);
    else a = -Math.min(26, (car.v - vt) * 2.5 + 2);
    if (Math.abs(car.spin) > 0.25) a = Math.min(a, -9);
    car.v = Math.max(0, car.v + a * dt);
    // 横移動
    const want = clamp((car.laneT - car.x) * 1.5, -4.2, 4.2);
    car.vx = lerp(car.vx, want, Math.min(1, dt * 3));
    car.x = clamp(car.x + car.vx * dt, -EDGE, EDGE);
    spinStep(car, dt);
    car.s = Math.min(car.s + car.v * dt, c.length - 2);
  }
}

// 車どうしの接触 (大破はしない。押し合い・失速・スピン)
function collide() {
  const R = G.racers;
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      const ds = b.s - a.s, dx = b.x - a.x;
      if (Math.abs(ds) >= CAR_L || Math.abs(dx) >= CAR_W) continue;
      const pS = CAR_L - Math.abs(ds), pX = CAR_W - Math.abs(dx);
      let impact, rear, front;
      if (pS / CAR_L < pX / CAR_W) {
        // 追突
        [rear, front] = ds > 0 ? [a, b] : [b, a];
        rear.s -= pS * 0.55;
        front.s += pS * 0.45;
        const rv = rear.v - front.v;
        impact = Math.max(0, rv);
        if (rv > 0) {
          rear.v -= rv * 0.75 + 0.5;
          front.v += rv * 0.45;
        }
        // 角に当たるとスピン
        const off = front.x - rear.x;
        if (Math.abs(off) > 0.5 && impact > 2) {
          front.spinV += Math.sign(off) * impact * 0.1;
          rear.spinV -= Math.sign(off) * impact * 0.05;
        }
      } else {
        // 横から当たった
        const sd = Math.sign(dx) || 1;
        a.x -= sd * pX * 0.5;
        b.x += sd * pX * 0.5;
        impact = Math.abs(a.vx - b.vx) + 2;
        a.vx = -sd * 3.2;
        b.vx = sd * 3.2;
        a.v *= 0.985;
        b.v *= 0.985;
        a.spinV -= sd * 0.6;
        b.spinV += sd * 0.6;
        if (!a.player) a.laneT = clamp(a.x - sd * 0.6, -EDGE, EDGE);
        if (!b.player) b.laneT = clamp(b.x + sd * 0.6, -EDGE, EDGE);
        rear = a; front = b;
      }
      a.x = clamp(a.x, -EDGE, EDGE);
      b.x = clamp(b.x, -EDGE, EDGE);
      if ((a.player || b.player) && a.hitCd <= 0 && b.hitCd <= 0) {
        const other = a.player ? b : a;
        const pos = worldPos(G.player, 0.5, (other.s - G.player.s) * 0.5, (other.x - G.player.x) * 0.5);
        if (impact > 3) hitFx(impact / 16, pos, carVel(G.player), 'car', other.team.body);
        else {
          // 軽く当たっただけ: 小さな火花と振動
          G.effects.sparks(pos, 12, carVel(G.player));
          G.shake = Math.max(G.shake, 0.12);
        }
        a.hitCd = b.hitCd = 0.4;
      } else if (a.hitCd <= 0 && Math.abs(a.s - G.player.s) < 200 && impact > 3) {
        G.effects.sparks(worldPos(a, 0.4, ds * 0.5, dx * 0.5), 25, carVel(a));
        G.effects.shards(worldPos(a, 0.4, ds * 0.5, dx * 0.5), 6, carVel(a), b.team.body);
        a.hitCd = b.hitCd = 0.4;
      }
    }
  }
}

function updateRanks() {
  const list = [...G.racers].sort((p, q) => {
    if (p.finished && q.finished) return p.time - q.time;
    if (p.finished) return -1;
    if (q.finished) return 1;
    return q.s - p.s;
  });
  list.forEach((r, i) => { r.rank = i + 1; });
  G.order = list;
  G.rank = G.player.rank;
  G.otT = (G.otT || 0) - (G.dt || 0);
  if (G.mode === 'race' && G.rank < G.prevRank) {
    G.overtakes += G.prevRank - G.rank;
    // 抜きつ抜かれつの時に表示が出すぎないよう 2.5 秒あける
    if (G.otT <= 0) { showAlert(`OVERTAKE!  P${G.rank}`, 'good', 900); G.otT = 2.5; }
  }
  G.prevRank = G.rank;
}

// ---------------- 進行 ----------------
function updateCountdown(dt) {
  G.countdown += dt;
  const lights = document.querySelectorAll('#lights i');
  const n = Math.min(5, Math.floor(G.countdown - 0.8) + 1);
  lights.forEach((l, i) => {
    const on = G.countdown > 0.8 && i < n;
    if (on && !l.classList.contains('on')) { l.classList.add('on'); Sound.beep(false); }
  });
  if (G.countdown >= G.lightsOut) {
    lights.forEach((l) => l.classList.remove('on'));
    G.mode = 'race';
    G.raceT = 0;
    Sound.beep(true);
    showAlert('GO!!', 'good go', 1000);
    setTimeout(() => { $('lights').hidden = true; }, 900);
  }
}

function checkFinish() {
  for (const r of G.racers) {
    if (!r.finished && r.s >= G.goalS) {
      r.finished = true;
      r.time = G.raceT;
      if (r.player) {
        G.finishT = 0;
        Sound.fanfare();
        showTelop('FINISH', `${r.rank}位でゴール！  ${fmt(r.time)}`, 'YOGA');
      }
    }
  }
  if (G.player.finished) {
    G.finishT += G.dt;
    if (G.finishT > 4 && $('result').hidden) showResult();
  }
}

function showResult() {
  G.mode = 'result';
  const P = G.player;
  const key = 'best.' + G.def.id;
  const best = store.get(key, null);
  let isBest = false;
  if (!best || P.time < best.time) { store.set(key, { time: P.time, pos: P.rank }); isBest = true; }
  $('res-pos').textContent = P.rank;
  $('res-pos').className = P.rank <= 3 ? 'podium p' + P.rank : '';
  $('res-time').textContent = fmt(P.time) + (isBest ? '  ★ベスト更新' : '');
  $('res-stats').innerHTML = `
    <span>スタート <b>${P.slot + 1}番グリッド</b></span>
    <span>オーバーテイク <b>${G.overtakes}</b></span>
    <span>接触 <b>${G.hits}</b>回</span>
    <span>最高速 <b>${Math.round(G.best * KMH)}</b>km/h</span>`;
  // 最終順位 (まだ走っている車は予想タイム)
  const rows = [...G.racers].map((r) => ({ r, t: r.finished ? r.time : G.raceT + (G.goalS - r.s) / Math.max(30, r.v) }))
    .sort((a, b) => a.t - b.t);
  // チーフエンジニアのコメント (ダービージョッキーの騎手コメントにあたる)
  const tot = G.fitT.ahead + G.fitT.fit + G.fitT.behind || 1;
  const notes = [];
  if (G.fitT.ahead / tot > 0.35) notes.push('道中ずっと前に出すぎて、マシンが熱を持っていた。もっと後ろで脚を溜めたほうがいいかもしれない。');
  else if (G.fitT.ahead / tot > 0.15) notes.push('前半、少し前に出すぎてバッテリーが苦しそうだった。');
  if (G.fitT.fit / tot > 0.5) notes.push('マシンが気持ちよく走れる位置だった。この位置取りは合っている。');
  if (G.fitT.behind / tot > 0.5) notes.push('後ろにいる時間が長かった。マシンはもう少し前を走りたがっていたかもしれない。');
  if (G.ers / G.M.ers > 0.3) notes.push('ゴールしてもERSがたっぷり残っていた。仕掛けが遅かったか、使い切れていない。');
  if (G.ersEmptyAt != null && G.ersEmptyAt > 1500) notes.push(`ゴールまで${(G.ersEmptyAt / 1000).toFixed(1)}kmでERSを使い切った。仕掛けが早すぎた。`);
  if ((G.penCount || 0) >= 2) notes.push('先頭に立つのが早すぎて、何度も「先頭の重圧」に捕まった。');
  if (G.hidden && mystery) {
    mystery.races++;
    if (P.rank === 1) {
      mystery.revealed = true;
      notes.unshift(`優勝！ このマシンの脚質は「${G.M.name}」だった！`);
    }
    store.set('mystery', mystery);
  } else if (machineKey === 'mystery' && mystery) {
    mystery.races++;
    store.set('mystery', mystery);
  }
  if (!notes.length) notes.push('悪くない走りだった。次は仕掛けどころを変えてみよう。');
  $('res-notes').innerHTML = `<div class="n-head">📻 チーフエンジニア${G.hidden ? '（脚質: ？？？）' : `（脚質: ${G.M.name}）`}</div>` + notes.map((n) => `<p>${n}</p>`).join('');
  $('res-table').innerHTML = rows.map(({ r, t }, i) => `
    <tr class="${r.player ? 'me' : ''}"><td>${i + 1}</td>
    <td><i style="background:#${r.team.body.toString(16).padStart(6, '0')}"></i>${r.player ? 'YOU (' + r.team.name + ')' : r.team.name}</td>
    <td>${fmt(t)}</td></tr>`).join('');
  $('result').hidden = false;
  Sound.silence();
}

// タイミングタワー (左の順位表)
function updateTower() {
  const el = $('tower');
  const leader = G.order[0];
  el.innerHTML = G.order.map((r) => {
    const gap = r === leader ? 'LEADER' : r.finished ? fmt(r.time) : '+' + ((leader.s - r.s) / Math.max(20, r.v)).toFixed(1);
    return `<div class="${r.player ? 'me' : ''}"><b>${r.rank}</b><i style="background:#${r.team.body.toString(16).padStart(6, '0')}"></i><span>${r.player ? 'YOU' : r.team.name.split(' ')[0].slice(0, 6)}</span><em>${gap}</em></div>`;
  }).join('');
}

// ---------------- カメラ ----------------
const camP = {};
function updateCamera(dt) {
  const P = G.player;
  const c = G.course;
  c.at(P.s + 0.2, P.x, camP);
  const sp = P.v / VMAX;
  // 車の向き = 道路の向き + 横滑り + スピン + 衝突の揺れ
  const slide = Math.atan2(P.vx, Math.max(8, P.v));
  G.jolt *= Math.exp(-dt * 5);
  const head = camP.a + slide + P.spin + G.jolt;
  const dx = Math.cos(head), dz = -Math.sin(head);
  // 振動: 速度で細かく、衝突で大きく
  G.shake *= Math.exp(-dt * 4);
  const vib = 0.006 + sp * sp * 0.018 + G.shake * 0.12;
  const sx = (Math.random() - 0.5) * vib, sy = (Math.random() - 0.5) * vib;
  const eyeY = camP.y + EYE_H + sy;
  camera.position.set(camP.x + sx * camP.lx, eyeY, camP.z + sx * camP.lz);
  const ahead = c.at(P.s + 30, P.x);
  const pitch = (ahead.y - camP.y) / 30;
  camera.up.set(0, 1, 0);
  _v.set(camera.position.x + dx * 30, eyeY + pitch * 30 - 0.4, camera.position.z + dz * 30);
  camera.lookAt(_v);
  // ロール: コーナーで体が傾く + 衝突
  G.roll = lerp(G.roll, clamp(-P.v * P.v * camP.k * 0.0016, -0.06, 0.06) + G.steer * -0.012 + G.jolt * 0.4, Math.min(1, dt * 4));
  camera.rotateZ(G.roll);
  if (G.headlight) {
    G.headlight.position.set(camP.x, camP.y + 0.7, camP.z);
    G.headlight.target.position.set(camP.x + dx * 40, camP.y - 1.5, camP.z + dz * 40);
  }
  // 速度で視野が広がる (酷道168 と同じ考え方)
  const fovBase = camera.aspect < 1 ? 88 : 68;
  const fov = fovBase + sp * sp * 22 + G.boost * 20 + G.slip * 4 + (G.ersOn ? 7 : 0) - (G.penalty > 0 ? 3 : 0);
  camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 3));
  camera.updateProjectionMatrix();
  return { sx, sy, sp };
}

// ---------------- 他の車の表示 ----------------
const rp = {};
function placeCars(dt) {
  const c = G.course;
  for (const r of G.racers) {
    if (r.player) continue;
    const m = r.model;
    const near = Math.abs(r.s - G.player.s) < 1500;
    m.visible = near;
    if (!near) continue;
    c.at(r.s, r.x, rp);
    m.position.set(rp.x, rp.y, rp.z);
    const slide = Math.atan2(r.vx, Math.max(8, r.v));
    m.rotation.set(0, yawOf(rp.a + slide + r.spin), 0);
    for (const w of m.wheels) w.rotation.x -= (r.v / 0.36) * dt;
    // 雨用ライト (ブレーキ中・トンネル内で点灯)
    const lit = G.T.night || c.inTunnel(r.s) || (Math.floor(G.t * 8) % 2 === 0 && r.v < 30);
    m.rainLight.material.color.setHex(lit ? 0xff2020 : 0x400000);
  }
}

// ---------------- HUD ----------------
let hudT = 0;
function updateHUD(dt) {
  const P = G.player;
  const kmh = Math.round(P.v * KMH);
  G.best = Math.max(G.best, P.v);
  $('hud-speed').textContent = kmh;
  // ギア (速度から決める)
  let gear = 1;
  while (gear < 8 && kmh > GEARS[gear] - (input.accel ? 0 : 12)) gear++;
  if (gear !== G.gear) { if (gear > G.gear) Sound.shift(); G.gear = gear; }
  const lo = GEARS[gear - 1] * 0.62, hi = GEARS[gear];
  const rpmK = clamp((kmh - lo) / (hi - lo), 0, 1);
  G.rpm = lerp(G.rpm, 5500 + rpmK * 7000 + (input.accel && G.mode === 'race' ? 300 : 0), Math.min(1, dt * 12));
  if (G.mode === 'countdown') G.rpm = input.accel ? 11000 + Math.random() * 600 : 4500;
  $('hud-gear').textContent = kmh < 2 && G.mode !== 'race' ? 'N' : gear;
  $('rpm-bar').style.width = (clamp((G.rpm - 4000) / 8500, 0, 1) * 100).toFixed(1) + '%';
  $('hud-pos').textContent = G.rank;
  // トップの時は後続との差を出し、迫ってきたら知らせる
  const behind = G.order && G.rank === 1 && !P.finished ? G.order[1] : null;
  $('row-behind').hidden = !behind;
  if (behind) {
    const gapM = P.s - behind.s;
    $('hud-behind').textContent = '+' + (gapM / Math.max(20, P.v)).toFixed(1);
    G.warnT = (G.warnT || 0) - dt;
    if (gapM < 25 && G.warnT <= 0 && G.mode === 'race') {
      showAlert('後続が迫る!', '', 900);
      G.warnT = 6;
    }
  }
  $('hud-time').textContent = fmt(P.finished ? P.time : G.raceT);
  const remain = Math.max(0, G.goalS - P.s);
  $('hud-remain').textContent = (remain / 1000).toFixed(1);
  // 次の出口・JCT
  const nxt = G.course.marks.find((m) => m.s > P.s + 5);
  if (nxt) {
    $('hud-next').textContent = nxt.name;
    $('hud-nextd').textContent = ((nxt.s - P.s) / 1000).toFixed(1) + 'km';
  }
  $('boost').classList.toggle('on', G.boost > 0.005 && G.mode === 'race');
  // チーム無線 (脚質を見抜く手がかり)
  if (G.mode === 'race' && !P.finished) {
    G.radioT -= dt;
    if (G.ers <= 0.001 && G.ersEmptyAt == null) G.ersEmptyAt = G.goalS - P.s;
    if (G.radioT <= 0) {
      let msg;
      if (G.ers >= G.M.ers - 0.001 && G.fit !== 'ahead') msg = 'ERS満タンだ。いつでも行けるぞ';
      else if (G.fit === 'ahead') msg = '前に出すぎだ! マシンが熱を持って回生できていない';
      else if (G.fit === 'fit') msg = 'いいペースだ。バッテリーがよく溜まっている';
      else msg = 'このあたりはマシンが少し退屈そうだ。もう少し前でもいい';
      if (msg !== G.lastRadio || G.radioT < -20) {
        const el = $('radio');
        $('radio-msg').textContent = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 4500);
        G.lastRadio = msg;
        G.radioT = 14;
      }
    }
  }
  // ERS ゲージと先頭の重圧
  $('ers-bar').style.width = ((G.ers / G.M.ers) * 100).toFixed(1) + '%';
  $('ers-cap').style.width = (G.M.ers / 1.6 * 100).toFixed(0) + '%';
  $('ersbox').classList.toggle('on', G.ersOn);
  $('ersbox').classList.toggle('empty', G.ers <= 0.001);
  $('pen').classList.toggle('on', G.penalty > 0);
  if (G.penalty > 0) $('pen-t').textContent = Math.ceil(G.penalty);
  // 仕掛けどころの声かけ
  const left = G.goalS - P.s;
  for (const [d, msg] of [[3000, '残り3km 位置取りを決めろ!'], [1500, '残り1.5km そろそろ仕掛けどころ!'], [600, 'ゴール前 全開! ERSを使い切れ!']]) {
    if (G.mode === 'race' && left < d && !G.calls.has(d)) {
      G.calls.add(d);
      const el = $('announce');
      el.textContent = msg;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 3000);
    }
  }
  $('boost-v').textContent = '+' + Math.round(G.boost * VMAX * KMH);
  $('slip').classList.toggle('on', G.slip > 0.15);
  hudT -= dt;
  if (hudT <= 0) {
    hudT = 0.25;
    updateTower();
    drawMinimap();
  }
  // 区間テロップ
  const secs = G.course.sections;
  let si = -1;
  for (let i = 0; i < secs.length; i++) if (secs[i].s <= P.s + 30) si = i;
  if (si !== G.sectionIdx) {
    if (G.sectionIdx !== -1 || si > 0) {
      const sc = secs[si];
      if (sc) showTelop(sc.main, sc.sub, sc.en);
    }
    G.sectionIdx = si;
  }
  // 沿道の名所のお知らせ
  for (const L of G.course.landmarks) {
    if (L.spot && !G.spots.has(L.name) && P.s > L.s - 450 && P.s < L.s) {
      G.spots.add(L.name);
      const el = $('announce');
      el.textContent = L.spot;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 4000);
    }
  }
  // 画面効果
  const sp = P.v / VMAX;
  $('speedlines').style.opacity = clamp((sp - 0.45) * 1.6 + G.boost * 2 + (G.ersOn ? 0.35 : 0), 0, 0.95).toFixed(2);
  $('speedlines').style.transform = `rotate(${(Math.random() * 3).toFixed(1)}deg) scale(${(1 + Math.random() * 0.04).toFixed(3)})`;
  G.flash *= Math.exp(-dt * 7);
  G.red *= Math.exp(-dt * 3);
  $('flash').style.opacity = G.flash.toFixed(3);
  $('redv').style.opacity = G.red.toFixed(3);
  $('tunnelfade').style.opacity = (G.tunnel * 0.25).toFixed(3);
  return { kmh, gear, rpmK };
}

// ---------------- ループ ----------------
let last = performance.now();
function frame(now, noRender) {
  if (noRender === undefined) requestAnimationFrame(frame);
  let dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  if (!G) { renderer.clear(); return; }
  if (G.mode === 'paused') { render(); return; }
  if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.35; }
  G.dt = dt;
  G.t += dt;
  if (G.mode === 'countdown') updateCountdown(dt);
  if (G.mode === 'race' || G.mode === 'result') G.raceT += dt;
  // 物理は細かく刻む
  const n = 2;
  for (let i = 0; i < n; i++) {
    updatePlayer(dt / n);
    updateAI(dt / n);
    collide();
  }
  updateRanks();
  if (G.mode === 'race') checkFinish();
  const P = G.player;
  // トンネルの暗さ
  const inT = G.course.inTunnel(P.s + 5) ? 1 : 0;
  G.tunnel = lerp(G.tunnel, inT, Math.min(1, dt * 3));
  const cam = updateCamera(dt);
  placeCars(dt);
  G.traffic.update(dt, P.s);
  G.world.update(P.s, camera.position, G.t);
  G.effects.update(dt);
  // スピン中のタイヤスモーク
  if (Math.abs(P.spin) > 0.2 && P.v > 10 && Math.random() < 0.5) G.effects.puff(worldPos(P, 0.3, 2.5, (Math.random() - 0.5) * 1.6), carVel(P), 1.5);
  const h = updateHUD(dt);
  G.cockpit.update(dt, {
    steer: G.steer + P.spin * 0.6, wheelSpin: P.v / 0.36, gear: h.kmh < 2 && G.mode !== 'race' ? 'N' : h.gear,
    kmh: h.kmh, pos: G.rank, rpmK: clamp((G.rpm - 5500) / 7000, 0, 1),
    shake: { x: cam.sx * 0.6, y: cam.sy * 0.6 }, roll: G.roll * 0.3, dark: G.tunnel,
  });
  // 音
  const racing = G.mode === 'race' || G.mode === 'countdown';
  if (G.mode === 'result') {
    // 結果画面では音を止めたまま (ここで鳴らし直さない)
    if (!noRender) render();
    return;
  }
  Sound.engine(G.rpm, (input.accel && racing) ? 1 : 0.15, P.v / VMAX, true);
  Sound.skid(G.skid || 0);
  Sound.scrape(G.scraping > 0 ? 1 : 0);
  let nearest = null, nd = 1e9;
  for (const r of G.racers) {
    if (r.player) continue;
    const d = Math.hypot(r.s - P.s, (r.x - P.x) * 2);
    if (d < nd) { nd = d; nearest = r; }
  }
  if (nearest) Sound.rival(nd, nearest.v, nearest.v - P.v, (P.x - nearest.x) * 0.5);
  if (!noRender) render();
}

function render() {
  renderer.clear();
  renderer.render(G.scene, camera);
  renderer.clearDepth();
  renderer.render(G.cockpit.scene, G.cockpit.camera);
}

// ---------------- 起動 ----------------
// ?debug を付けると、テスト用にシミュレーションを外から進められる
if (location.search.includes('debug')) {
  window.dbg = {
    get G() { return G; },
    input,
    warp(s) { G.player.s = s; G.racers.forEach((r, i) => { if (!r.player) r.s = s + 30 + i * 9; }); },
    step(sec, fps = 30) {
      const n = Math.round(sec * fps);
      for (let i = 0; i < n; i++) { const t = performance.now(); last = t - 1000 / fps; frame(t, i < n - 1); }
    },
  };
}
resize();
buildTitle();
requestAnimationFrame(frame);
