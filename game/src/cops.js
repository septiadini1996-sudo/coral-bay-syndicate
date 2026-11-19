// cops.js — consequences: the wanted system with its heat model, police
// pursuit AI and roadblocks, the spotlight helicopter at four stars, the
// busted check, hitscan combat, and the pooled particle effects (smoke,
// sparks, dust, exhaust, tracers, muzzle flash).
import { G, clamp, lerp, wrapAng, d2, ROAD_LINES } from './defs.js';
import { spawnVehicle, stepVehicle } from './rides.js';
import { playerPos } from './folks.js';
import { sfx } from './sound.js';

// --- particle pool -----------------------------------------------------------
let puffs = [], puffIdx = 0, tracers = [], tracerIdx = 0, flash, flashLight;
function puffTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
export function initFx(scene) {
  const tex = puffTexture();
  for (let i = 0; i < 130; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.visible = false; s.scale.setScalar(0.5);
    scene.add(s);
    puffs.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 0, fade: 1 });
  }
  const tGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 }));
    m.visible = false; scene.add(m);
    tracers.push({ m, life: 0 });
  }
  flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffc46b, transparent: true, opacity: 0, depthWrite: false }));
  flash.scale.setScalar(0.9); scene.add(flash);
  flashLight = new THREE.PointLight(0xffb45e, 0, 16);
  scene.add(flashLight);
}
export function puff(x, y, z, o = {}) {
  const p = puffs[puffIdx++ % puffs.length];
  p.s.visible = true;
  p.s.position.set(x, y, z);
  p.s.material.color.setHex(o.color ?? 0xcccccc);
  p.s.material.opacity = o.opacity ?? 0.5;
  p.s.scale.setScalar(o.size ?? 0.6);
  p.life = p.max = o.life ?? 0.8;
  p.vx = o.vx ?? 0; p.vy = o.vy ?? 1; p.vz = o.vz ?? 0;
  p.grow = o.grow ?? 1.6; p.fade = o.opacity ?? 0.5;
}
function updateFx(dt) {
  for (const p of puffs) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.s.visible = false; p.s.material.opacity = 0; continue; }
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    const k = p.life / p.max;
    p.s.material.opacity = p.fade * k;
    p.s.scale.addScalar(p.grow * dt);
  }
  for (const t of tracers) {
    if (t.life <= 0) continue;
    t.life -= dt;
    t.m.material.opacity = Math.max(0, t.life / 0.06);
    if (t.life <= 0) t.m.visible = false;
  }
  if (flash.material.opacity > 0) flash.material.opacity = Math.max(0, flash.material.opacity - dt * 9);
  flashLight.intensity = Math.max(0, flashLight.intensity - dt * 26);
}

// --- crime & heat --------------------------------------------------------------
export function addHeat(n, witnessed = true) {
  G.heat = clamp(G.heat + n * (witnessed ? 1 : 0.4), 0, 5.6);
  G.lastCrimeAt = G.time;
}
function anyWitness(x, z, r) {
  for (const p of G.peds) if (d2(x, z, p.g.position.x, p.g.position.z) < r) return true;
  for (const c of G.cops) if (d2(x, z, c.group.position.x, c.group.position.z) < r + 8) return true;
  return false;
}
export const crime = {
  steal(v) { addHeat(1, anyWitness(v.group.position.x, v.group.position.z, 26)); },
  assault(x, z) { addHeat(1, anyWitness(x, z, 24)); },
  pedHit(v) { if (v.driver === 'player') addHeat(1.2, true); },
  shotFired(x, z) { addHeat(0.8, anyWitness(x, z, 30)); },
  crash(v, mag) { if (v.driver === 'player' && mag > 12) addHeat(0.35, anyWitness(v.group.position.x, v.group.position.z, 22)); },
  mission() { addHeat(1.4, true); },
};

// --- combat ----------------------------------------------------------------------
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _h = new THREE.Vector3();
export function shoot(ox, oy, oz, dx, dy, dz) {
  G.stats.shots++;
  G.lastShotAt = G.time;
  G.lastDangerAt = G.time; G.lastDangerX = ox; G.lastDangerZ = oz;
  sfx.shot();
  flash.position.set(ox + dx * 0.5, oy + dy * 0.5, oz + dz * 0.5);
  flash.material.opacity = 0.95; flashLight.intensity = 2.4;
  flashLight.position.copy(flash.position);
  _o.set(ox, oy, oz); _d.set(dx, dy, dz).normalize();
  let bestT = 70, hitV = null, hitP = null;
  for (const v of G.vehicles) {
    _h.copy(v.group.position); _h.y += 0.8;
    const t = raySphere(_o, _d, _h, v.radius + 0.4);
    if (t > 0 && t < bestT) { bestT = t; hitV = v; hitP = null; }
  }
  for (const p of G.peds) {
    _h.copy(p.g.position); _h.y += 1.05;
    const t = raySphere(_o, _d, _h, 0.5);
    if (t > 0 && t < bestT) { bestT = t; hitP = p; hitV = null; }
  }
  // Ground plane caps the ray.
  if (_d.y < -0.001) {
    const t = -_o.y / _d.y;
    if (t > 0 && t < bestT) { bestT = t; hitV = null; hitP = null; }
  }
  const hx = ox + dx * bestT, hy = Math.max(0.05, oy + dy * bestT), hz = oz + dz * bestT;
  // Tracer.
  const tr = tracers[tracerIdx++ % tracers.length];
  tr.m.visible = true; tr.life = 0.06;
  tr.m.position.set((ox + hx) / 2, (oy + hy) / 2, (oz + hz) / 2);
  tr.m.lookAt(hx, hy, hz); tr.m.scale.set(1, 1, bestT);
  tr.m.material.opacity = 0.9;
  if (hitV) {
    hitV.damage = Math.min(1.2, hitV.damage + 0.085);
    puff(hx, hy, hz, { color: 0xffca7a, size: 0.35, life: 0.3, vy: 0.4, opacity: 0.8 });
    if (hitV.driver === 'cop') addHeat(0.7, true);
  } else if (hitP) {
    hitP.state = 'down'; hitP.downT = 3;
    addHeat(1.2, true);
    puff(hx, hy, hz, { color: 0xd8d8d8, size: 0.3, life: 0.3, vy: 0.3 });
  } else {
    puff(hx, hy, hz, { color: 0xffe1a8, size: 0.3, life: 0.25, vy: 0.5, opacity: 0.7 });
    puff(hx, hy + 0.1, hz, { color: 0x9a8f80, size: 0.5, life: 0.6, vy: 0.7, opacity: 0.35 });
  }
  crime.shotFired(ox, oz);
}
function raySphere(o, d, c, r) {
  const ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z;
  const tca = ox * d.x + oy * d.y + oz * d.z;
  if (tca < 0) return -1;
  const dSq = ox * ox + oy * oy + oz * oz - tca * tca;
  if (dSq > r * r) return -1;
  return tca - Math.sqrt(r * r - dSq);
}
export function punch(P) {
  G.stats.punches++;
  const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
  const hx = P.g.position.x + fx * 1.3, hz = P.g.position.z + fz * 1.3;
  for (const p of G.peds) {
    if (d2(hx, hz, p.g.position.x, p.g.position.z) < 1.15 && p.state !== 'down') {
      p.state = 'down'; p.downT = 2.2;
      sfx.punch();
      crime.assault(hx, hz);
      return true;
    }
  }
  for (const v of G.vehicles) {
    if (d2(hx, hz, v.group.position.x, v.group.position.z) < v.radius + 0.7) {
      v.damage = Math.min(1.2, v.damage + 0.03);
      sfx.punch();
      puff(hx, 1, hz, { color: 0xffca7a, size: 0.3, life: 0.25, vy: 0.5 });
      if (v.driver === 'cop') crime.assault(hx, hz);
      return true;
    }
  }
  return false;
}

// --- police ------------------------------------------------------------------------
let heli = null, heliState = 'off', bustMeter = 0, blockTimer = 0;
const blocks = [];
function buildHeli(scene) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2b3440 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 4.4), bodyMat);
  body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 1.2), new THREE.MeshLambertMaterial({ color: 0x9fd4e8 }));
  nose.position.set(0, -0.1, 2.5); g.add(nose);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.6), bodyMat);
  boom.position.set(0, 0.25, -4.2); g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.9), new THREE.MeshLambertMaterial({ color: 0xd94f3d }));
  fin.position.set(0, 0.7, -6.4); g.add(fin);
  const rotor = new THREE.Group(); rotor.position.y = 1.05;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.06, 0.5), new THREE.MeshLambertMaterial({ color: 0x222428 }));
  rotor.add(blade);
  const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2; rotor.add(blade2);
  g.add(rotor);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x555a60 });
  for (const sx of [-0.8, 0.8]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.4), skidMat);
    skid.position.set(sx, -1.15, 0.2); g.add(skid);
  }
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(6.5, 30, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide })
  );
  cone.position.y = -15.8; g.add(cone);
  const spot = new THREE.SpotLight(0xfff0b8, 0, 95, 0.34, 0.55, 0.6);
  spot.position.set(0, -0.6, 0);
  g.add(spot); g.add(spot.target);
  spot.target.position.set(0, -30, 0.5);
  g.visible = false;
  scene.add(g);
  return { g, rotor, spot, cone };
}
export function initCops(scene) {
  initFx(scene);
  heli = buildHeli(scene);
  G.heli = heli;
}

function spawnCopNear() {
  const pp = playerPos();
  // Pick a road junction 55-90 m out, biased ahead of the player.
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * Math.PI * 2, r = 55 + Math.random() * 35;
    let x = pp.x + Math.cos(a) * r, z = pp.z + Math.sin(a) * r;
    x = ROAD_LINES.reduce((b, L) => (Math.abs(L - x) < Math.abs(b - x) ? L : b), ROAD_LINES[0]);
    z = clamp(z, -165, 165);
    if (d2(x, z, pp.x, pp.z) < 40) continue;
    const v = spawnVehicle('police', x, z, Math.atan2(pp.x - x, pp.z - z), { driver: 'cop' });
    v.copAI = { ram: Math.random() * 0.4 };
    G.cops.push(v);
    return;
  }
}
function refreshBlocks() {
  for (const b of blocks) { b.dead = true; }
  blocks.length = 0;
  if (G.wanted < 3) return;
  const pp = playerPos();
  const pv = G.player.vehicle;
  const dirx = pv ? Math.sin(pv.heading) : Math.sin(G.player.heading);
  const dirz = pv ? Math.cos(pv.heading) : Math.cos(G.player.heading);
  for (let k = 0; k < 2; k++) {
    const bx = pp.x + dirx * (46 + k * 26), bz = pp.z + dirz * (46 + k * 26);
    const line = ROAD_LINES.reduce((b, L) => (Math.abs(L - bx) < Math.abs(b - bx) ? L : b), ROAD_LINES[0]);
    const v = spawnVehicle('police', line, clamp(bz, -165, 165), Math.PI / 2 + 0.5, { parked: true });
    v.blockade = true;
    blocks.push(v);
  }
}

export function updateCops(dt) {
  updateFx(dt);
  const pp = playerPos();
  // Heat decays only while no officer has eyes on the player.
  let eyesOn = false;
  for (const c of G.cops) if (d2(pp.x, pp.z, c.group.position.x, c.group.position.z) < 46) { eyesOn = true; break; }
  if (!eyesOn && G.time - (G.lastCrimeAt ?? -99) > 5) G.heat = Math.max(0, G.heat - dt * 0.045);
  G.wanted = clamp(Math.floor(G.heat + 0.0001), 0, 5);
  // Cop fleet size follows the stars.
  const want = G.wanted === 0 ? 0 : Math.min(6, G.wanted + 1);
  for (let i = G.cops.length - 1; i >= 0; i--) {
    const c = G.cops[i];
    if (d2(pp.x, pp.z, c.group.position.x, c.group.position.z) > 175 || (G.wanted === 0 && c.speed < 0.5 && d2(pp.x, pp.z, c.group.position.x, c.group.position.z) > 60)) {
      c.dead = true; G.cops.splice(i, 1);
    }
  }
  if (G.cops.length < want) spawnCopNear();
  // Pursuit inputs.
  const pv = G.player.vehicle;
  const tx = pp.x + (pv ? Math.sin(pv.heading) * pv.speed * 0.35 : 0);
  const tz = pp.z + (pv ? Math.cos(pv.heading) * pv.speed * 0.35 : 0);
  for (const c of G.cops) {
    const pos = c.group.position;
    const dist = d2(pos.x, pos.z, pp.x, pp.z);
    const wantHeading = Math.atan2(tx - pos.x, tz - pos.z);
    const steer = clamp(wrapAng(wantHeading - c.heading) * 1.7, -1, 1);
    let thr = 1, brake = false;
    if (!pv && dist < 6.5) { thr = 0; brake = c.speed > 0.3; } // foot chase: they box you in
    else if (dist < 3.4) { thr = 0.25; }
    stepVehicle(c, { thr, steer, brake }, dt);
    // Light bar strobes.
    const ph = (G.time * 6 + c.id) % 2 < 1;
    if (c.barR) { c.barR.color.setHex(ph ? 0xff3b30 : 0x571512); c.barB.color.setHex(ph ? 0x122a57 : 0x2f7bff); }
  }
  // Roadblocks.
  blockTimer -= dt;
  if (G.wanted >= 3 && blockTimer <= 0) { refreshBlocks(); blockTimer = 16; }
  if (G.wanted < 3 && blocks.length) refreshBlocks();
  for (let i = G.vehicles.length - 1; i >= 0; i--) {
    const v = G.vehicles[i];
    if (v.dead) {
      if (v.group.parent) v.group.parent.remove(v.group);
      G.vehicles.splice(i, 1);
    }
  }
  // Helicopter at four stars.
  if (G.wanted >= 4) {
    if (heliState === 'off') { heliState = 'on'; heli.g.visible = true; heli.g.position.set(pp.x + 60, 30, pp.z - 60); }
    const a = G.time * 0.24;
    const orbitR = G.heliLow ? 15 : 11, orbitAlt = G.heliLow ? 16.5 : 27;
    const hx = pp.x + Math.cos(a) * orbitR, hz = pp.z + Math.sin(a) * orbitR;
    heli.g.position.x = lerp(heli.g.position.x, hx, 1 - Math.exp(-1.6 * dt));
    heli.g.position.z = lerp(heli.g.position.z, hz, 1 - Math.exp(-1.6 * dt));
    heli.g.position.y = lerp(heli.g.position.y, orbitAlt + Math.sin(G.time * 0.7) * 1.6, 1 - Math.exp(-2 * dt));
    heli.g.rotation.y = Math.atan2(pp.x - heli.g.position.x, pp.z - heli.g.position.z);
    heli.rotor.rotation.y += dt * 28;
    heli.spot.intensity = 2.6;
    heli.cone.material.opacity = 0.10 + getDarkPulse();
  } else if (heliState === 'on') {
    heliState = 'off';
    heli.g.visible = false;
    heli.spot.intensity = 0;
  }
  // Busted check.
  const pSpeed = pv ? Math.abs(pv.speed) : G.player.speed;
  let nearCop = 99;
  for (const c of G.cops) nearCop = Math.min(nearCop, d2(pp.x, pp.z, c.group.position.x, c.group.position.z));
  if (G.wanted > 0 && nearCop < 7 && pSpeed < 1.1) {
    bustMeter += dt;
    if (bustMeter > (pv ? 3 : 2.1)) {
      bustMeter = 0;
      G.heat = 0; G.wanted = 0;
      if (G.hooks.onBusted) G.hooks.onBusted();
    }
  } else bustMeter = Math.max(0, bustMeter - dt * 2.2);
  G.bustMeter = bustMeter;
  // Engine smoke and exhaust from the whole fleet.
  for (const v of G.vehicles) {
    if (v.damage > 0.5 && (v.driver || v.speed > 0.5)) {
      v.smokeT = (v.smokeT ?? 0) - dt;
      if (v.smokeT <= 0) {
        v.smokeT = 0.14;
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        puff(v.group.position.x + fx * v.radius * 0.7, 1.15, v.group.position.z + fz * v.radius * 0.7,
          { color: v.damage > 0.85 ? 0x2c2c30 : 0x8a8a8a, size: 0.7, life: 1.1, vy: 1.7, opacity: 0.4, grow: 2.2 });
      }
    }
  }
  // Nearest-cop siren pressure for the audio module.
  let siren = 0;
  if (G.cops.length) siren = clamp(1 - nearCop / 55, 0, 1);
  G.siren01 = siren;
}
function getDarkPulse() { return 0.03 + Math.sin(G.time * 7) * 0.012; }
export function bustAmount() { return bustMeter; }
