// base.js — small shared toolbox for Coral Bay Syndicate: a seeded random
// generator, numeric helpers, a canvas-texture painter and a geometry
// merger used to fuse static props into single draw calls.

export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (rng, lo, hi) => lo + rng() * (hi - lo);
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Wrap an angle to [-PI, PI) so steering math never spins the long way round.
export function wrapAngle(a) {
  while (a >= Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Paint a canvas and hand it back as a THREE texture. The painter receives
// the 2d context and the pixel size; repeat/encoding options are applied.
export function paintTexture(THREE, w, h, painter, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  painter(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  return tex;
}

// Merge a list of { geo, mtx, color } parts into one BufferGeometry with
// position/normal/uv/color attributes, so a whole forest of props renders
// as a single mesh with vertex colours.
export function mergeParts(THREE, parts) {
  const pos = [], nor = [], uv = [], col = [];
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  const c = new THREE.Color();
  for (const part of parts) {
    let g = part.geo;
    if (g.index) g = g.toNonIndexed();
    if (part.mtx) {
      g = g.clone();
      g.applyMatrix4(part.mtx);
    }
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    c.set(part.color === undefined ? 0xffffff : part.color);
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      col.push(c.r, c.g, c.b);
    }
    if (part.geo !== g && g.dispose) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  void v; void nm;
  return out;
}

// A matrix that places a unit part at (x, y, z) with yaw and scale.
export function placeMtx(THREE, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  return m;
}
