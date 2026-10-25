// ドライバー目線のコクピット (ノーズ・前輪・ヘイロー・ステアリング)
// 別のシーンとカメラで最後に重ねて描く (視野角が変わってもコクピットは歪まない)
import * as THREE from '../vendor/three.module.min.js';
import { mat } from './models.js';

function tub(profile, m) {
  // profile: [z, 半幅, 下端y, 上端y] (目の位置が原点)
  const pos = [], idx = [];
  const ring = (z, hw, y0, y1) => [
    [-hw * 0.8, y0, z], [hw * 0.8, y0, z], [hw, y0 + (y1 - y0) * 0.55, z], [hw * 0.55, y1, z], [-hw * 0.55, y1, z], [-hw, y0 + (y1 - y0) * 0.55, z],
  ];
  profile.forEach((p) => ring(...p).forEach((v) => pos.push(...v)));
  const n = 6;
  for (let j = 0; j < profile.length - 1; j++) {
    for (let k = 0; k < n; k++) {
      const a = j * n + k, b = j * n + ((k + 1) % n), c = a + n, d = b + n;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, m);
}

export class Cockpit {
  constructor(team, theme) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 50);
    this.hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemi * 1.1);
    this.sun = new THREE.DirectionalLight(theme.sun, theme.sunI * 0.9);
    this.sun.position.set(0.3, 1, 0.4);
    if (theme.dusk) {
      // 夕焼けの色そのままだと車体が真っ赤に染まるので、少し白に寄せる
      this.sun.color.lerp(new THREE.Color(0xffffff), 0.5);
      this.sun.intensity *= 0.6;
      this.hemi.color.lerp(new THREE.Color(0xffffff), 0.45);
    }
    this.scene.add(this.hemi, this.sun);
    this.baseHemi = this.hemi.intensity;
    this.baseSun = this.sun.intensity;

    const g = new THREE.Group();
    this.group = g;
    this.scene.add(g);
    const body = new THREE.MeshPhongMaterial({ color: team.body, shininess: 80, specular: 0x777777, side: THREE.DoubleSide });
    const accent = new THREE.MeshPhongMaterial({ color: team.accent, shininess: 60 });
    const carbon = new THREE.MeshPhongMaterial({ color: 0x18191c, shininess: 40, specular: 0x333333 });

    // ノーズ (目の下から前へ細くなる)
    g.add(tub([
      [-0.35, 0.42, -0.95, -0.32],
      [-0.9, 0.36, -0.9, -0.36],
      [-1.6, 0.27, -0.85, -0.45],
      [-2.4, 0.16, -0.8, -0.6],
      [-2.95, 0.07, -0.78, -0.7],
    ], body));
    // ノーズの上のライン
    const stripe = tub([
      [-0.9, 0.08, -0.37, -0.355],
      [-2.4, 0.05, -0.61, -0.595],
    ], accent);
    g.add(stripe);
    // ミラー
    for (const sx of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.03), carbon);
      stalk.position.set(sx * 0.7, -0.44, -0.8);
      g.add(stalk);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.075, 0.05), body);
      mirror.position.set(sx * 0.72, -0.35, -0.82);
      g.add(mirror);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.06), new THREE.MeshBasicMaterial({ color: 0x8aa0b4 }));
      glass.position.set(sx * 0.72, -0.35, -0.794);
      g.add(glass);
      this['mirror' + (sx < 0 ? 'L' : 'R')] = glass;
      // コクピットの縁
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.9), body);
      rim.position.set(sx * 0.42, -0.56, -0.3);
      g.add(rim);
    }
    // フロントサスペンション
    for (const sx of [-1, 1]) {
      for (const dy of [0, -0.12]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.025, 0.05), carbon);
        arm.position.set(sx * 0.48, -0.64 + dy, -2.1);
        arm.rotation.z = sx * 0.08;
        g.add(arm);
      }
    }
    // 前輪
    this.wheels = [];
    const tyre = new THREE.CylinderGeometry(0.36, 0.36, 0.38, 24);
    tyre.rotateZ(Math.PI / 2);
    for (const sx of [-1, 1]) {
      const steer = new THREE.Group();
      const w = new THREE.Group();
      steer.add(w);
      w.add(new THREE.Mesh(tyre, mat(0x151618)));
      // 回転がわかるように溝とホイールのスポーク
      for (let i = 0; i < 6; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.05), mat(0x3a3d42));
        sp.rotation.x = (i * Math.PI) / 6;
        sp.position.x = sx * -0.2;
        w.add(sp);
      }
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 4, 24).rotateY(Math.PI / 2), mat(0xd8262e));
      band.position.x = sx * -0.195;
      w.add(band);
      steer.position.set(sx * 0.86, -0.64, -2.1);
      g.add(steer);
      this.wheels.push({ steer, w });
    }
    // フロントウイング (下の方にちらっと見える)
    const fw = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.04, 0.45), accent);
    fw.position.set(0, -0.88, -3.1);
    g.add(fw);
    // ヘイロー: 頭上の輪 (中央の柱は視界の邪魔なので付けない)
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 8, 24, Math.PI), carbon);
    hoop.rotation.x = -Math.PI / 2;
    hoop.position.set(0, 0.24, -0.01);
    hoop.scale.set(1, 1.3, 1);
    g.add(hoop);
    // ステアリング
    const wheel = new THREE.Group();
    const grip = new THREE.MeshPhongMaterial({ color: 0x222326, shininess: 10 });
    const center = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.13, 0.05), carbon);
    wheel.add(center);
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.07), grip);
      h.position.set(sx * 0.15, -0.01, 0.01);
      h.rotation.z = sx * 0.15;
      wheel.add(h);
      // グローブ
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshPhongMaterial({ color: team.accent }));
      glove.scale.set(1, 1.3, 1);
      glove.position.set(sx * 0.155, 0.0, 0.03);
      wheel.add(glove);
    }
    // 画面 (ギア・速度)
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 96;
    this.dispCtx = cv.getContext('2d');
    this.dispTex = new THREE.CanvasTexture(cv);
    this.dispTex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshBasicMaterial({ map: this.dispTex }));
    disp.position.set(0, -0.005, 0.027);
    wheel.add(disp);
    // シフトランプ
    this.leds = [];
    for (let i = 0; i < 10; i++) {
      const led = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      led.position.set(-0.063 + i * 0.014, 0.047, 0.027);
      wheel.add(led);
      this.leds.push(led);
    }
    wheel.position.set(0, -0.37, -0.55);
    wheel.rotation.x = -0.35;
    g.add(wheel);
    this.wheel = wheel;
    this.dispT = 0;
    this.lastDisp = '';
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    // 縦長の画面ではコクピットを少し引いて見せる
    this.camera.fov = aspect < 1 ? 95 : 74;
    this.camera.updateProjectionMatrix();
  }

  update(dt, o) {
    // o: { steer, wheelSpin, gear, kmh, rpmK, shake: {x,y}, roll, dark }
    // 左 (steer > 0) に切るとハンドルは反時計回り、前輪は左を向く
    this.wheel.rotation.z = o.steer * 1.4;
    for (const { steer, w } of this.wheels) {
      steer.rotation.y = o.steer * 0.3;
      w.rotation.x = (w.rotation.x - o.wheelSpin * dt) % (Math.PI * 2);
    }
    this.group.position.set(o.shake.x * 0.4, o.shake.y * 0.4, 0);
    this.group.rotation.z = o.roll;
    const dark = o.dark;
    this.hemi.intensity = this.baseHemi * (1 - dark * 0.7);
    this.sun.intensity = this.baseSun * (1 - dark);
    for (const sx of ['mirrorL', 'mirrorR']) this[sx].material.color.setHex(dark > 0.5 ? 0x2a2a30 : 0x8aa0b4);
    // シフトランプ
    const on = Math.round(o.rpmK * 10);
    this.leds.forEach((l, i) => {
      const lit = i < on;
      const c = i < 4 ? 0x20ff40 : i < 8 ? 0xff2020 : 0x3060ff;
      l.material.color.setHex(lit ? (o.rpmK > 0.95 && Math.floor(performance.now() / 60) % 2 ? 0x111111 : c) : 0x111111);
    });
    // 画面は 0.1 秒ごとに書き換え
    this.dispT -= dt;
    const txt = `${o.gear}|${o.kmh}|${o.pos}`;
    if (this.dispT <= 0 && txt !== this.lastDisp) {
      this.dispT = 0.1;
      this.lastDisp = txt;
      const g = this.dispCtx;
      g.fillStyle = '#05070a';
      g.fillRect(0, 0, 256, 96);
      g.fillStyle = '#ffd23a';
      g.font = 'bold 76px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(o.gear), 128, 52);
      g.font = 'bold 34px monospace';
      g.fillStyle = '#e8f0ff';
      g.textAlign = 'left';
      g.fillText(String(o.kmh), 8, 30);
      g.textAlign = 'right';
      g.fillStyle = '#3dff8a';
      g.fillText('P' + o.pos, 248, 30);
      this.dispTex.needsUpdate = true;
    }
  }
}
