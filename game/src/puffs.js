// puffs.js — pooled particle effects. Three fixed-size point clouds
// (sparks, dust, smoke) recycle their slots in place: spawning writes
// into preallocated arrays and the per-frame update touches only live
// particles, so the hot loop never allocates.

import { G } from './state.js';

class Pool {
  constructor(THREE, scene, n, size, color, additive) {
    this.n = n; this.alive = 0;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.span = new Float32Array(n);
    this.base = new Float32Array(n * 3);
    this.grav = 0; this.drag = 0; this.rise = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size, vertexColors: true, transparent: true, opacity: additive ? 0.95 : 0.5,
      depthWrite: false, sizeAttenuation: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.tint = new THREE.Color(color);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -999;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, span, shade) {
    if (this.alive >= this.n) return;
    const i = this.alive++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = 0; this.span[i] = span;
    const c = shade * (0.85 + Math.random() * 0.3);
    this.base[i * 3] = this.tint.r * c;
    this.base[i * 3 + 1] = this.tint.g * c;
    this.base[i * 3 + 2] = this.tint.b * c;
  }
  kill(i) {
    const last = --this.alive;
    if (i !== last) {
      for (let k = 0; k < 3; k++) {
        this.pos[i * 3 + k] = this.pos[last * 3 + k];
        this.vel[i * 3 + k] = this.vel[last * 3 + k];
        this.base[i * 3 + k] = this.base[last * 3 + k];
      }
      this.life[i] = this.life[last]; this.span[i] = this.span[last];
    }
    this.pos[last * 3 + 1] = -999;
  }
  update(dt) {
    for (let i = this.alive - 1; i >= 0; i--) {
      this.life[i] += dt;
      if (this.life[i] >= this.span[i]) { this.kill(i); continue; }
      const d = Math.max(0, 1 - this.drag * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + (this.rise - this.grav) * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) this.pos[i * 3 + 1] = 0.05;
      const f = 1 - this.life[i] / this.span[i];
      this.col[i * 3] = this.base[i * 3] * f;
      this.col[i * 3 + 1] = this.base[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    this.points.geometry.setDrawRange(0, this.alive);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export function initFx(THREE, scene) {
  const sparks = new Pool(THREE, scene, 240, 0.32, 0xffc860, true);
  sparks.grav = 9;
  const dust = new Pool(THREE, scene, 260, 1.15, 0xcbb28a, false);
  dust.drag = 1.6; dust.rise = 0.5;
  const smoke = new Pool(THREE, scene, 200, 2.4, 0x555049, false);
  smoke.drag = 0.7; smoke.rise = 1.5;
  const R = Math.random;
  G.fx = {
    sparks(x, y, z, n = 10) {
      for (let i = 0; i < n; i++) {
        sparks.spawn(x, y, z, (R() - 0.5) * 7, R() * 4.5, (R() - 0.5) * 7, 0.3 + R() * 0.45, 1);
      }
    },
    dust(x, y, z, n = 8) {
      for (let i = 0; i < n; i++) {
        dust.spawn(x + (R() - 0.5) * 1.6, y, z + (R() - 0.5) * 1.6, (R() - 0.5) * 2.4, 0.8 + R() * 1.4, (R() - 0.5) * 2.4, 0.6 + R() * 0.9, 1);
      }
    },
    smokePuff(x, y, z, dark = 1) {
      smoke.spawn(x + (R() - 0.5) * 0.5, y, z + (R() - 0.5) * 0.5, (R() - 0.5) * 0.5, 1 + R() * 0.8, (R() - 0.5) * 0.5, 1.3 + R() * 1.2, dark);
    },
    update(dt) { sparks.update(dt); dust.update(dt); smoke.update(dt); },
  };
  return G.fx;
}
