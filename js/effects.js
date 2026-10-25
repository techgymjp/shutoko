// ぶつかった時の演出 (火花・カーボンの破片・タイヤスモーク)
import * as THREE from '../vendor/three.module.min.js';
import { canvasTex } from './models.js';

const MAX_SPARK = 600;
const MAX_DEBRIS = 80;
const MAX_SMOKE = 40;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // 火花
    this.sp = [];
    const pos = new Float32Array(MAX_SPARK * 3);
    const col = new Float32Array(MAX_SPARK * 3);
    this.spGeo = new THREE.BufferGeometry();
    this.spGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.spGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dot = canvasTex('spark', 32, 32, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.4, 'rgba(255,220,120,0.9)');
      gr.addColorStop(1, 'rgba(255,120,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
    this.points = new THREE.Points(this.spGeo, new THREE.PointsMaterial({
      size: 0.35, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    // 破片
    this.debris = [];
    this.dMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_DEBRIS);
    this.dMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dMesh.count = 0;
    this.dMesh.frustumCulled = false;
    scene.add(this.dMesh);
    // スモーク
    const smoke = canvasTex('smoke', 64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(230,230,230,0.8)');
      gr.addColorStop(1, 'rgba(200,200,200,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
    this.smoke = [];
    for (let i = 0; i < MAX_SMOKE; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      scene.add(s);
      this.smoke.push({ s, life: 0, max: 1, v: new THREE.Vector3() });
    }
    this.smokeI = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._c = new THREE.Color();
  }

  // 火花を散らす。dir: 車の進行方向 (火花は後ろへ流れる)
  sparks(pos, n, carVel, side = 0) {
    for (let i = 0; i < n; i++) {
      if (this.sp.length >= MAX_SPARK) this.sp.shift();
      this.sp.push({
        p: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6)),
        v: carVel.clone().multiplyScalar(0.55 + Math.random() * 0.3).add(new THREE.Vector3(
          (Math.random() - 0.5) * 8 + side * 4, 1 + Math.random() * 5, (Math.random() - 0.5) * 8,
        )),
        life: 0.25 + Math.random() * 0.5,
        t: 0,
      });
    }
  }

  // カーボンの破片 (色は車の色とカーボンの黒)
  shards(pos, n, carVel, color) {
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= MAX_DEBRIS) this.debris.shift();
      this.debris.push({
        p: pos.clone().add(new THREE.Vector3((Math.random() - 0.5), 0.3 + Math.random() * 0.4, (Math.random() - 0.5))),
        v: carVel.clone().multiplyScalar(0.7 + Math.random() * 0.25).add(new THREE.Vector3((Math.random() - 0.5) * 10, 3 + Math.random() * 6, (Math.random() - 0.5) * 10)),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
        size: new THREE.Vector3(0.1 + Math.random() * 0.35, 0.02 + Math.random() * 0.04, 0.1 + Math.random() * 0.3),
        color: Math.random() < 0.5 ? 0x1b1c1f : color,
        t: 0,
        ground: pos.y,
      });
    }
  }

  puff(pos, carVel, size = 1.5) {
    const s = this.smoke[this.smokeI++ % MAX_SMOKE];
    s.s.position.copy(pos);
    s.v.copy(carVel).multiplyScalar(0.6).add(new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2));
    s.life = 0;
    s.max = 0.8 + Math.random() * 0.6;
    s.size = size;
    s.s.visible = true;
  }

  update(dt) {
    // 火花
    const pos = this.spGeo.attributes.position.array;
    const col = this.spGeo.attributes.color.array;
    let n = 0;
    for (let i = this.sp.length - 1; i >= 0; i--) {
      const p = this.sp[i];
      p.t += dt;
      if (p.t > p.life) { this.sp.splice(i, 1); continue; }
      p.v.y -= 14 * dt;
      p.p.addScaledVector(p.v, dt);
    }
    for (const p of this.sp) {
      pos[n * 3] = p.p.x; pos[n * 3 + 1] = p.p.y; pos[n * 3 + 2] = p.p.z;
      const k = 1 - p.t / p.life;
      col[n * 3] = 1; col[n * 3 + 1] = 0.5 + 0.5 * k; col[n * 3 + 2] = 0.2 * k;
      n++;
    }
    this.spGeo.setDrawRange(0, n);
    this.spGeo.attributes.position.needsUpdate = true;
    this.spGeo.attributes.color.needsUpdate = true;
    // 破片
    let m = 0;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      if (d.t > 3) { this.debris.splice(i, 1); continue; }
    }
    for (const d of this.debris) {
      d.v.y -= 20 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.ground + 0.03) {
        d.p.y = d.ground + 0.03;
        d.v.multiplyScalar(0.5);
        d.v.y = Math.abs(d.v.y) * 0.3;
        d.w.multiplyScalar(0.6);
      }
      d.r.addScaledVector(d.w, dt);
      this._q.setFromEuler(this._e.set(d.r.x, d.r.y, d.r.z));
      this._m.compose(d.p, this._q, d.size);
      this.dMesh.setMatrixAt(m, this._m);
      this.dMesh.setColorAt(m, this._c.set(d.color));
      m++;
    }
    this.dMesh.count = m;
    this.dMesh.instanceMatrix.needsUpdate = true;
    if (this.dMesh.instanceColor) this.dMesh.instanceColor.needsUpdate = true;
    // スモーク
    for (const s of this.smoke) {
      if (!s.s.visible) continue;
      s.life += dt;
      if (s.life > s.max) { s.s.visible = false; continue; }
      const k = s.life / s.max;
      s.s.position.addScaledVector(s.v, dt);
      s.v.multiplyScalar(1 - dt * 2);
      s.s.scale.setScalar(s.size * (1 + k * 3));
      s.s.material.opacity = 0.55 * (1 - k);
    }
  }
}
