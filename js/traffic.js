// 対向車線を走る一般車 (見た目だけ。中央の壁で仕切られているので当たらない)
import * as THREE from '../vendor/three.module.min.js';
import { OPP_OFF, LANE_W, yawOf } from './world.js';
import { mat, canvasTex } from './models.js';

const COLORS = [0xf2f2f2, 0x1a1a1a, 0x9aa0a6, 0x2a3f74, 0xb81f2a, 0xe8e2d0, 0x3d5a3d, 0x5a5f66];

function makeCar(r, night) {
  const g = new THREE.Group();
  const kind = r();
  const body = mat(COLORS[Math.floor(r() * COLORS.length)]);
  const glass = mat(0x22303a);
  if (kind < 0.18) {
    // トラック
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.4, 2.0), body);
    cab.position.set(0, 1.6, -3.0);
    g.add(cab);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 6.5), mat(r() < 0.5 ? 0xd8d8d8 : 0x3a6ab0));
    box.position.set(0, 1.9, 1.3);
    g.add(box);
    g.len = 9;
  } else {
    const len = kind < 0.35 ? 4.8 : 4.4;
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.8, len), body);
    b.position.y = 0.65;
    g.add(b);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.6, len * 0.5), glass);
    top.position.set(0, 1.35, 0.1);
    g.add(top);
    g.len = len;
  }
  // ヘッドライト (対向車は手前を向いて走ってくる)
  const hl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.18), new THREE.MeshBasicMaterial({ color: night ? 0xffffee : 0xdddddd }));
  hl.position.set(0, 0.7, -g.len / 2 - 0.02);
  hl.rotation.y = Math.PI;
  g.add(hl);
  if (night) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff6e0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.position.set(0, 0.7, -g.len / 2 - 0.3);
    glow.scale.setScalar(3.2);
    g.add(glow);
  }
  return g;
}

function glowTex() {
  return canvasTex('hglow', 64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,240,1)');
    gr.addColorStop(0.3, 'rgba(255,250,220,0.5)');
    gr.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}

export class Traffic {
  constructor(scene, course, night, r) {
    this.course = course;
    this.cars = [];
    for (let i = 0; i < 26; i++) {
      const m = makeCar(r, night);
      scene.add(m);
      this.cars.push({ m, s: 0, lane: r() < 0.5 ? 0 : 1, v: 17 + r() * 8, r });
    }
    this.placed = false;
    this.p = {};
  }

  update(dt, ps) {
    const c = this.course;
    if (!this.placed) {
      this.cars.forEach((car, i) => { car.s = ps - 300 + i * 85 + car.r() * 40; });
      this.placed = true;
    }
    for (const car of this.cars) {
      car.s -= car.v * dt;
      if (car.s < ps - 300) car.s = ps + 1700 + car.r() * 500;
      if (car.s > ps + 2300) car.s = ps - 250;
      const hide = car.s < 5 || car.s > c.length - 5 || c.inTunnel(car.s) || c.inTunnel(car.s + 60) || c.inTunnel(car.s - 60);
      car.m.visible = !hide;
      if (hide) continue;
      // 対向車線: 中央寄りが追越車線
      const off = OPP_OFF + (car.lane ? LANE_W / 2 + 0.1 : -LANE_W / 2 - 0.4);
      c.at(car.s, off, this.p);
      car.m.position.set(this.p.x, this.p.y, this.p.z);
      car.m.rotation.y = yawOf(this.p.a) + Math.PI;
    }
  }
}
