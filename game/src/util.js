// Shared helpers for Coral Bay Syndicate: a seeded random generator (so screenshot
// scenes and city layout are deterministic), small math helpers, a geometry merger
// that bakes transformed, vertex-coloured boxes and cylinders into one mesh, and
// canvas-texture / text-sprite factories used for facades, signs and labels.
const THREE = window.THREE;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const randRange = (rand, lo, hi) => lo + rand() * (hi - lo);
export const randPick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length];
export const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function turnToward(current, target, maxStep) {
  const d = wrapAngle(target - current);
  return current + clamp(d, -maxStep, maxStep);
}

// Merge simple parts into one BufferGeometry with a colour per part.
// Each part: { geo, x, y, z, rx, ry, rz, sx, sy, sz, color } — transform + tint.
export function mergeParts(parts) {
  const positions = [], normals = [], colors = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const nm = new THREE.Matrix3(), v = new THREE.Vector3(), col = new THREE.Color();
  for (const p of parts) {
    const geo = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    e.set(p.rx || 0, p.ry || 0, p.rz || 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0), q, new THREE.Vector3(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1));
    nm.getNormalMatrix(m);
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    col.set(p.color ?? 0xffffff);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      positions.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      normals.push(v.x, v.y, v.z);
      colors.push(col.r, col.g, col.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return out;
}

export const boxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cylGeo = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const sphGeo = (r, seg = 10) => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2));
export const coneGeo = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);

export function vertexColorMaterial(opts = {}) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
}

export function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
  tex.anisotropy = 4;
  return tex;
}

// A floating text label (shop signs, landmark names) as a sprite.
export function textSprite(text, { size = 44, color = '#ffffff', bg = 'rgba(8,20,32,0.55)', scale = 1 } = {}) {
  const pad = 18;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `800 ${size}px "Segoe UI", Arial, sans-serif`;
  c.width = Math.ceil(g.measureText(text).width) + pad * 2;
  c.height = size + pad * 2;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, 14); ctx.fill();
  ctx.font = `800 ${size}px "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const h = 2.2 * scale;
  spr.scale.set(h * (c.width / c.height), h, 1);
  return spr;
}
