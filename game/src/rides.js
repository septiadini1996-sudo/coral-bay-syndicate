// rides.js — the vehicle roster and everything that moves on wheels:
// procedural vehicle meshes, arcade driving physics with drift, damage, and
// the traffic AI that follows lanes, queues, honks and panics.
import { G, clamp, lerp, wrapAng, angToward, collide, d2, mulberry, ROAD_LINES } from './defs.js';
import { groundOk } from './city.js';
import { sfx } from './sound.js';

// top/acc in m/s and m/s^2; two = two wheels (leans, fragile, nimble).
export const TYPES = {
  sedan: { label: 'Paloma Sedan', top: 34, acc: 13, turn: 1.85, grip: 7, hp: 100, r: 2.3 },
  pickup: { label: 'Bison Pickup', top: 31, acc: 12, turn: 1.65, grip: 7, hp: 130, r: 2.4 },
  van: { label: 'Hauler Van', top: 28, acc: 10, turn: 1.5, grip: 7, hp: 140, r: 2.5 },
  taxi: { label: 'Coral Cab', top: 33, acc: 13, turn: 1.85, grip: 7, hp: 100, r: 2.3 },
  bus: { label: 'City Cruiser', top: 25, acc: 8, turn: 1.15, grip: 8, hp: 190, r: 3.6 },
  police: { label: 'Interceptor', top: 39, acc: 16, turn: 2.0, grip: 8, hp: 130, r: 2.3 },
  sport: { label: 'Comet GT', top: 47, acc: 20, turn: 2.15, grip: 8, hp: 90, r: 2.3 },
  vintage: { label: 'Heritage Roadster', top: 30, acc: 11, turn: 1.75, grip: 6, hp: 85, r: 2.3 },
  monster: { label: 'Dune Crusher', top: 33, acc: 14, turn: 1.55, grip: 7, hp: 220, r: 2.6, crush: true },
  bike: { label: 'Marlin 250', top: 40, acc: 19, turn: 2.9, grip: 9, hp: 45, r: 1.15, two: true },
  sportbike: { label: 'Falco RR', top: 53, acc: 25, turn: 3.1, grip: 9, hp: 40, r: 1.15, two: true },
  bicycle: { label: 'Beach Cruiser', top: 11.5, acc: 6.5, turn: 3.0, grip: 10, hp: 30, r: 1.0, two: true, pedal: true },
};
const CAR_COLORS = [0xd94f3d, 0x3d7ea6, 0xe8b13c, 0x7fb069, 0xe8e2d4, 0x5b5f97, 0xbc4b8f, 0x40b8a8, 0x8a8f98, 0x2f4858];

const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2b36 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1c });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0xc8ccd2 });
function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true;
  parent.add(m); return m;
}
function wheel(r, w, x, y, z, parent, pivot) {
  const geo = new THREE.CylinderGeometry(r, r, w, 12);
  geo.rotateZ(Math.PI / 2); // axle along x, so mesh.rotation.x is pure spin
  const m = new THREE.Mesh(geo, tyreMat);
  m.castShadow = true;
  const hubGeo = new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.02, 8);
  hubGeo.rotateZ(Math.PI / 2);
  m.add(new THREE.Mesh(hubGeo, chromeMat));
  if (pivot) { const g = new THREE.Group(); g.position.set(x, y, z); g.add(m); m.position.set(0, 0, 0); parent.add(g); return { spin: m, pivot: g }; }
  m.position.set(x, y, z); parent.add(m);
  return { spin: m, pivot: null };
}

function buildMesh(type, color) {
  const g = new THREE.Group();
  const tilt = new THREE.Group(); g.add(tilt); // bikes lean on this child
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x24262a });
  const wheels = [];
  const st = TYPES[type];
  if (st.two) {
    const r = type === 'bicycle' ? 0.35 : 0.32;
    const wf = wheel(r, 0.09, 0, r, 0.78, tilt, true);
    const wb = wheel(r, 0.09, 0, r, -0.72, tilt, false);
    wheels.push(wf, wb);
    if (type === 'bicycle') {
      const tube = new THREE.MeshLambertMaterial({ color });
      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 5), tube);
      t1.rotation.x = 1.1; t1.position.set(0, 0.62, 0.05); tilt.add(t1);
      const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 5), tube);
      t2.rotation.x = -0.5; t2.position.set(0, 0.6, -0.35); tilt.add(t2);
      box(0.3, 0.06, 0.24, dark, 0, 0.92, -0.42, tilt); // saddle
      box(0.44, 0.05, 0.05, chromeMat, 0, 0.98, 0.62, tilt); // bars
    } else {
      const sporty = type === 'sportbike';
      const body = box(0.34, 0.34, 1.25, paint, 0, 0.62, -0.05, tilt);
      body.rotation.x = sporty ? 0.16 : 0.05;
      box(0.3, 0.22, 0.5, dark, 0, 0.82, -0.5, tilt); // seat/tail
      const tank = box(0.36, 0.26, 0.55, paint, 0, 0.78, 0.18, tilt);
      tank.rotation.x = -0.2;
      if (sporty) { const fair = box(0.4, 0.42, 0.7, paint, 0, 0.5, 0.55, tilt); fair.rotation.x = 0.5; }
      box(0.4, 0.05, 0.05, dark, 0, 1.0, 0.72, tilt); // handlebar
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), chromeMat);
      pipe.rotation.x = Math.PI / 2; pipe.position.set(0.16, 0.42, -0.4); tilt.add(pipe);
    }
    return { group: g, tilt, wheels, bodyMat: paint };
  }
  // Four-wheeled family. Dimensions per type.
  const dims = {
    sedan: [1.8, 0.55, 4.3, 0.5], taxi: [1.8, 0.55, 4.3, 0.5], police: [1.85, 0.56, 4.4, 0.52],
    pickup: [1.9, 0.62, 4.6, 0.55], van: [1.95, 1.5, 4.6, 0.45], bus: [2.4, 2.2, 9.2, 0.6],
    sport: [1.9, 0.42, 4.4, 0.34], vintage: [1.75, 0.6, 4.2, 0.5], monster: [2.3, 0.7, 4.8, 1.15],
  }[type];
  const [W, bodyH, L, rideH] = dims;
  const wr = type === 'monster' ? 0.88 : type === 'bus' ? 0.46 : 0.34;
  const wy = wr;
  const wf = wheel(wr, type === 'monster' ? 0.62 : 0.26, -W / 2 + 0.1, wy, L / 2 - 1.0, tilt, true);
  const wf2 = wheel(wr, type === 'monster' ? 0.62 : 0.26, W / 2 - 0.1, wy, L / 2 - 1.0, tilt, true);
  const wb = wheel(wr, type === 'monster' ? 0.62 : 0.26, -W / 2 + 0.1, wy, -L / 2 + 1.0, tilt, false);
  const wb2 = wheel(wr, type === 'monster' ? 0.62 : 0.26, W / 2 - 0.1, wy, -L / 2 + 1.0, tilt, false);
  wheels.push(wf, wf2, wb, wb2);
  const bodyY = rideH + bodyH / 2;
  let bodyMat = paint;
  if (type === 'van' || type === 'bus') {
    box(W, bodyH, L, paint, 0, bodyY, 0, tilt);
    box(W + 0.04, bodyH * 0.34, L * 0.8, glassMat, 0, bodyY + bodyH * 0.18, 0, tilt); // window band
    box(W * 0.8, 0.5, 0.1, glassMat, 0, bodyY + bodyH * 0.22, L / 2, tilt);
  } else if (type === 'pickup') {
    box(W, bodyH, L * 0.45, paint, 0, bodyY, -L * 0.27, tilt); // bed walls block
    box(W, bodyH + 0.5, L * 0.42, paint, 0, bodyY + 0.22, L * 0.26, tilt); // cab base
    box(W * 0.9, 0.5, L * 0.36, glassMat, 0, bodyY + bodyH + 0.25, L * 0.26, tilt);
    box(W, 0.35, L * 0.45, dark, 0, rideH + 0.2, -L * 0.27, tilt); // bed floor shadow
  } else if (type === 'monster') {
    box(W, bodyH, L, paint, 0, bodyY, 0, tilt);
    box(W * 0.82, 0.62, L * 0.4, glassMat, 0, bodyY + bodyH / 2 + 0.3, 0.2, tilt);
    box(W + 0.5, 0.18, L + 0.4, dark, 0, rideH - 0.1, 0, tilt); // skid plate
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, W * 0.8, 6), dark);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, bodyY + 0.75, -1.2); tilt.add(bar);
  } else if (type === 'vintage') {
    const body = box(W, bodyH, L * 0.8, paint, 0, bodyY, -0.2, tilt);
    body.geometry = new THREE.BoxGeometry(W, bodyH, L * 0.8);
    const hood = box(W * 0.8, bodyH * 0.7, L * 0.3, paint, 0, bodyY - 0.05, L * 0.42, tilt);
    hood.rotation.x = -0.06;
    box(W * 0.86, 0.55, L * 0.4, dark, 0, bodyY + bodyH / 2 + 0.24, -0.5, tilt); // convertible top
    for (const sx of [-1, 1]) { // sweeping fenders
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.24, 10, 1, false, 0, Math.PI), paint);
      f.rotation.z = Math.PI / 2; f.rotation.y = Math.PI / 2;
      f.position.set(sx * (W / 2 - 0.05), wy, L / 2 - 1.0); tilt.add(f);
      const f2 = f.clone(); f2.position.z = -L / 2 + 1.0; tilt.add(f2);
    }
    const spare = wheel(0.36, 0.16, 0, bodyY + 0.1, -L / 2 - 0.15, tilt, false);
    spare.spin.rotation.y = Math.PI / 2; // spare rides flat against the tail
    box(W * 0.9, 0.12, 0.12, chromeMat, 0, 0.42, L / 2 + 0.12, tilt); // bumpers
    box(W * 0.9, 0.12, 0.12, chromeMat, 0, 0.42, -L / 2 - 0.12, tilt);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    hl.position.set(-W / 2 + 0.2, bodyY + 0.25, L / 2 + 0.05); tilt.add(hl);
    const hr = hl.clone(); hr.position.x = W / 2 - 0.2; tilt.add(hr);
  } else {
    // sedan / taxi / police / sport: sleek two-box shape
    box(W, bodyH, L, paint, 0, bodyY, 0, tilt);
    const cabH = type === 'sport' ? 0.4 : 0.52;
    const cab = box(W * 0.84, cabH, L * 0.48, glassMat, 0, bodyY + bodyH / 2 + cabH / 2 - 0.04, type === 'sport' ? -0.25 : -0.1, tilt);
    cab.rotation.x = type === 'sport' ? -0.1 : 0;
    box(W * 0.9, 0.1, 0.5, paint, 0, bodyY + 0.12, L / 2 - 0.2, tilt); // nose lip
    if (type === 'sport') {
      box(W * 0.94, 0.07, 0.4, dark, 0, bodyY + 0.42, -L / 2 + 0.15, tilt); // spoiler blade
      box(0.08, 0.3, 0.3, dark, -W / 2 + 0.25, bodyY + 0.2, -L / 2 + 0.15, tilt);
      box(0.08, 0.3, 0.3, dark, W / 2 - 0.25, bodyY + 0.2, -L / 2 + 0.15, tilt);
    }
    if (type === 'taxi') {
      box(0.85, 0.22, 0.4, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), 0, bodyY + bodyH / 2 + cabH + 0.08, -0.1, tilt);
    }
    if (type === 'police') {
      box(W + 0.03, bodyH * 0.8, 1.1, dark, 0, bodyY, 0.35, tilt); // black doors band
      box(W + 0.03, bodyH * 0.8, 1.1, dark, 0, bodyY, -0.75, tilt);
      const barR = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
      const barB = new THREE.MeshBasicMaterial({ color: 0x2f7bff });
      box(0.5, 0.14, 0.34, barR, -0.28, bodyY + bodyH / 2 + cabH + 0.05, -0.1, tilt);
      box(0.5, 0.14, 0.34, barB, 0.28, bodyY + bodyH / 2 + cabH + 0.05, -0.1, tilt);
      g.userData.barR = barR; g.userData.barB = barB;
    }
  }
  // lights for every car
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  box(0.32, 0.12, 0.06, hlMat, -W / 2 + 0.3, bodyY, L / 2 + 0.01, tilt);
  box(0.32, 0.12, 0.06, hlMat, W / 2 - 0.3, bodyY, L / 2 + 0.01, tilt);
  const tlMat = new THREE.MeshBasicMaterial({ color: 0xd92b2b });
  box(0.3, 0.1, 0.06, tlMat, -W / 2 + 0.3, bodyY + 0.05, -L / 2 - 0.01, tilt);
  box(0.3, 0.1, 0.06, tlMat, W / 2 - 0.3, bodyY + 0.05, -L / 2 - 0.01, tilt);
  return { group: g, tilt, wheels, bodyMat: paint, barR: g.userData.barR, barB: g.userData.barB };
}

let vid = 0;
export function spawnVehicle(type, x, z, heading, opts = {}) {
  const color = opts.color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  const built = buildMesh(type, type === 'police' ? 0xf2f3f5 : color);
  built.group.position.set(x, 0, z);
  built.group.rotation.y = heading;
  const v = {
    id: vid++, type, stats: TYPES[type], group: built.group, tilt: built.tilt,
    wheels: built.wheels, bodyMat: built.bodyMat, baseColor: new THREE.Color(type === 'police' ? 0xf2f3f5 : color),
    barR: built.barR, barB: built.barB,
    heading, speed: 0, lat: 0, steer: 0, damage: 0,
    driver: opts.driver ?? null, // 'player' | 'traffic' | 'cop'
    parked: !!opts.parked, dead: false,
    ai: opts.driver === 'traffic' ? newTrafficAI(x, z, heading) : null,
    copAI: null, honkCd: 0, radius: TYPES[type].r,
  };
  if (scene3) scene3.add(built.group);
  G.vehicles.push(v);
  return v;
}
let scene3 = null;
export function initRides(scene) { scene3 = scene; }

function newTrafficAI(x, z, heading) {
  // Snap the car onto the lane network: pick the dominant travel axis.
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const axis = Math.abs(fx) > Math.abs(fz) ? 'x' : 'z';
  const sign = axis === 'x' ? (fx >= 0 ? 1 : -1) : (fz >= 0 ? 1 : -1);
  const perp = axis === 'x' ? z : x;
  let line = ROAD_LINES[0];
  for (const L of ROAD_LINES) if (Math.abs(L - perp) < Math.abs(line - perp)) line = L;
  return { axis, sign, line, cruise: 9 + Math.random() * 4, wait: 0, honkT: 0, panicT: 0, stuckT: 0 };
}
// Lane centre coordinate for an AI car: road line shifted to the right side.
function laneCoord(ai) {
  // travelling +axis keeps the lane on its right: for x-travel right is +z
  // when sign>0; for z-travel right is -x when sign>0.
  const off = ai.axis === 'x' ? (ai.sign > 0 ? 3 : -3) : (ai.sign > 0 ? -3 : 3);
  return ai.line + off;
}

export function stepVehicle(v, input, dt) {
  const st = v.stats;
  const dmgF = v.damage >= 1 ? 0.45 : 1 - v.damage * 0.25;
  let { thr, steer, brake } = input;
  if (v.dead) { thr = 0; brake = true; }
  const topF = st.top * dmgF, topR = st.top * 0.32;
  if (thr > 0) v.speed += st.acc * thr * dt * (1 - Math.max(0, v.speed) / topF);
  else if (thr < 0) {
    if (v.speed > 0.6) v.speed -= 26 * dt;
    else v.speed += st.acc * thr * dt * (1 - Math.max(0, -v.speed) / topR);
  }
  if (brake) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 30 * dt);
  if (!thr && !brake) v.speed -= v.speed * (st.pedal ? 1.4 : 0.5) * dt;
  v.speed -= v.speed * 0.12 * dt; // rolling drag
  if (Math.abs(v.speed) < 0.02 && !thr) v.speed = 0;
  const steerAuthority = clamp(Math.abs(v.speed) / 7, 0, 1) * Math.sign(v.speed || 1);
  const prevHeading = v.heading;
  v.heading += steer * st.turn * steerAuthority * dt * (Math.abs(v.speed) > 0.1 ? 1 : 0);
  const dHead = wrapAng(v.heading - prevHeading);
  v.lat += v.speed * Math.sin(dHead) * (1 - clamp(st.grip / 12, 0, 0.85)); // drift bleed
  v.lat *= Math.exp(-st.grip * dt);
  v.steer = lerp(v.steer, steer, 1 - Math.exp(-10 * dt));
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const rx = fz, rz = -fx; // right vector (x,z): facing +z, right is -x... mirrored below
  let nx = v.group.position.x + (fx * v.speed + rx * v.lat * -1) * dt;
  let nz = v.group.position.z + (fz * v.speed + rz * v.lat * -1) * dt;
  // Water and shore are walls; buildings push out via collide().
  if (!groundOk(nx, nz)) {
    if (groundOk(nx, v.group.position.z)) nz = v.group.position.z;
    else if (groundOk(v.group.position.x, nz)) nx = v.group.position.x;
    else { nx = v.group.position.x; nz = v.group.position.z; v.speed *= 0.4; }
    if (Math.abs(v.speed) > 6 && v.driver) { v.damage = Math.min(1.2, v.damage + 0.05); }
  }
  const before = v.speed;
  const [cx, cz] = collide(nx, nz, v.radius * 0.72);
  if ((cx !== nx || cz !== nz) && Math.abs(before) > 5) {
    v.damage = Math.min(1.2, v.damage + Math.abs(before) * 0.012);
    if (v.driver === 'player' || v.driver === 'cop') sfx.crash(Math.abs(before) / 30);
    if (G.hooks.onCrash) G.hooks.onCrash(v, Math.abs(before));
    v.speed = -before * 0.22; v.lat = 0;
  }
  v.group.position.x = cx; v.group.position.z = cz;
  v.group.rotation.y = v.heading;
  // Wheel spin + front steer + bike lean.
  const spin = (v.speed * dt) / 0.34;
  for (const w of v.wheels) {
    w.spin.rotation.x += spin;
    if (w.pivot) w.pivot.rotation.y = v.steer * 0.42;
  }
  if (st.two) v.tilt.rotation.z = lerp(v.tilt.rotation.z, -v.steer * clamp(Math.abs(v.speed) / 22, 0, 1) * 0.55, 1 - Math.exp(-8 * dt));
  else v.tilt.rotation.z = lerp(v.tilt.rotation.z, -v.steer * Math.abs(v.speed) * 0.0022, 0.6 * dt + 0.02);
  // Damage tints the paint.
  const dk = 1 - clamp(v.damage, 0, 1) * 0.5;
  v.bodyMat.color.copy(v.baseColor).multiplyScalar(dk);
  return v;
}

// Vehicle-vehicle soft collisions: circles push apart, speed is shared,
// hard closings cost damage (a monster truck shrugs off what flattens others).
export function collideVehicles() {
  const vs = G.vehicles;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i];
    for (let j = i + 1; j < vs.length; j++) {
      const b = vs[j];
      const dx = b.group.position.x - a.group.position.x;
      const dz = b.group.position.z - a.group.position.z;
      const rr = a.radius + b.radius;
      const dSq = dx * dx + dz * dz;
      if (dSq > rr * rr || dSq === 0) continue;
      const d = Math.sqrt(dSq), push = (rr - d) / 2;
      const ux = dx / d, uz = dz / d;
      const ma = a.stats.crush ? 3 : 1, mb = b.stats.crush ? 3 : 1;
      a.group.position.x -= ux * push * (mb / (ma + mb)) * 2 * 0.5;
      a.group.position.z -= uz * push * (mb / (ma + mb)) * 2 * 0.5;
      b.group.position.x += ux * push * (ma / (ma + mb));
      b.group.position.z += uz * push * (ma / (ma + mb));
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 6) {
        const hurt = (rel - 5) * 0.02;
        a.damage = Math.min(1.2, a.damage + hurt / ma);
        b.damage = Math.min(1.2, b.damage + hurt / mb);
        if (a.driver === 'player' || b.driver === 'player') {
          sfx.crash(rel / 26);
          if (G.hooks.onCrash) G.hooks.onCrash(a.driver === 'player' ? a : b, rel);
        }
        const avg = (a.speed * ma + b.speed * mb) / (ma + mb);
        a.speed = lerp(a.speed, avg, 0.6); b.speed = lerp(b.speed, avg, 0.6);
      }
    }
  }
}

// --- Traffic ---------------------------------------------------------------
const _ahead = { found: false, gap: 99, speed: 0 };
function scanAhead(v, ai, range) {
  _ahead.found = false; _ahead.gap = range;
  const fx = ai.axis === 'x' ? ai.sign : 0, fz = ai.axis === 'z' ? ai.sign : 0;
  for (const o of G.vehicles) {
    if (o === v) continue;
    const dx = o.group.position.x - v.group.position.x, dz = o.group.position.z - v.group.position.z;
    const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < _ahead.gap && side < 2.4) { _ahead.found = true; _ahead.gap = along; _ahead.speed = Math.abs(o.speed); }
  }
  for (const p of G.peds) {
    const dx = p.g.position.x - v.group.position.x, dz = p.g.position.z - v.group.position.z;
    const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && along < _ahead.gap && side < 2.2) { _ahead.found = true; _ahead.gap = along; _ahead.speed = 0; }
  }
  return _ahead;
}

export function updateTraffic(dt) {
  for (const v of G.vehicles) {
    if (v.driver !== 'traffic' || !v.ai) continue;
    const ai = v.ai;
    const pos = v.group.position;
    // Panic: gunfire nearby or a crash sends traffic swerving off-line.
    if (G.time - (G.lastShotAt ?? -99) < 1.2 && d2(pos.x, pos.z, G.player?.g.position.x ?? 0, G.player?.g.position.z ?? 0) < 34) ai.panicT = 1.4;
    ai.panicT = Math.max(0, ai.panicT - dt);
    const ahead = scanAhead(v, ai, 13);
    let want = ai.cruise * (ai.panicT > 0 ? 1.5 : 1);
    let brake = false;
    if (ahead.found) {
      if (ahead.gap < 6.5) { want = 0; brake = v.speed > 0.5; }
      else want = Math.min(want, ahead.speed + (ahead.gap - 6) * 0.5);
      if (v.speed < 0.4 && ahead.gap < 7) {
        ai.wait += dt;
        if (ai.wait > 1.7 && ai.honkT <= 0) { sfx.horn(); ai.honkT = 2.5 + Math.random() * 2; }
      } else ai.wait = 0;
    }
    ai.honkT -= dt;
    // Steering: aim at a point down the lane; near a junction, maybe turn.
    const along = ai.axis === 'x' ? pos.x : pos.z;
    const perpNow = ai.axis === 'x' ? pos.z : pos.x;
    let nextLine = Infinity;
    for (const L of ROAD_LINES) { const rel = (L - along) * ai.sign; if (rel > 4 && rel < nextLine) nextLine = rel; }
    let tx, tz;
    const lookAhead = 9 + Math.abs(v.speed) * 0.7;
    if (nextLine < lookAhead + 2 && Math.random() < 0.012 && ai.panicT <= 0) {
      // Turn at the junction: swap axis, keep world position continuous.
      const junction = along + nextLine * ai.sign;
      const newSign = Math.random() < 0.5 ? 1 : -1;
      ai.axis = ai.axis === 'x' ? 'z' : 'x';
      ai.line = Math.round(junction / 56) * 56;
      ai.line = clamp(ai.line, -168, 168);
      ai.sign = newSign;
      const lc = laneCoord(ai);
      if (ai.axis === 'x') { tx = pos.x + newSign * lookAhead; tz = lc; }
      else { tz = pos.z + newSign * lookAhead; tx = lc; }
    } else {
      const lc = laneCoord(ai) + (ai.panicT > 0 ? Math.sin(G.time * 9 + v.id) * 1.5 : 0);
      if (ai.axis === 'x') { tx = pos.x + ai.sign * lookAhead; tz = lc; }
      else { tz = pos.z + ai.sign * lookAhead; tx = lc; }
    }
    const wantHeading = Math.atan2(tx - pos.x, tz - pos.z);
    const steer = clamp(wrapAng(wantHeading - v.heading) * 1.6, -1, 1);
    const thr = v.speed < want ? 0.75 : 0;
    stepVehicle(v, { thr, steer, brake: brake || v.speed > want + 1.5 }, dt);
    // Keep the AI honest about its lane after collisions.
    if (Math.abs(perpNow - laneCoord(ai)) > 9) { ai.line = ROAD_LINES.reduce((best, L) => (Math.abs(L - perpNow) < Math.abs(best - perpNow) ? L : best), ROAD_LINES[0]); }
  }
}

// Populate the streets: moving traffic plus parked, stealable cars.
export function populateStreets() {
  const rnd = mulberry(4242);
  const trafficTypes = ['sedan', 'sedan', 'pickup', 'van', 'taxi', 'sedan', 'pickup', 'sport', 'vintage', 'bike'];
  for (let i = 0; i < 13; i++) {
    const horiz = rnd() < 0.5;
    const line = ROAD_LINES[Math.floor(rnd() * ROAD_LINES.length)];
    const along = -160 + rnd() * 320;
    const sign = rnd() < 0.5 ? 1 : -1;
    const off = horiz ? (sign > 0 ? 3 : -3) : (sign > 0 ? -3 : 3);
    const x = horiz ? along : line + off;
    const z = horiz ? line + off : along;
    const heading = horiz ? (sign > 0 ? Math.PI / 2 : -Math.PI / 2) : (sign > 0 ? 0 : Math.PI);
    const v = spawnVehicle(trafficTypes[i % trafficTypes.length], x, z, heading, { driver: 'traffic' });
    v.ai.cruise = 8.5 + rnd() * 4;
  }
  const parkedTypes = ['sedan', 'pickup', 'van', 'taxi', 'sport', 'vintage', 'monster', 'bike', 'sportbike', 'bicycle', 'sedan', 'pickup', 'sport', 'vintage', 'sedan', 'van', 'bike', 'bicycle', 'monster', 'sedan'];
  let placed = 0, guard = 0;
  while (placed < parkedTypes.length && guard++ < 300) {
    const horiz = rnd() < 0.5;
    const line = ROAD_LINES[Math.floor(rnd() * ROAD_LINES.length)];
    const along = -165 + rnd() * 330;
    const side = rnd() < 0.5 ? 5.9 : -5.9;
    const x = horiz ? along : line + side;
    const z = horiz ? line + side : along;
    let clear = true;
    for (const o of G.vehicles) if (d2(x, z, o.group.position.x, o.group.position.z) < 7) { clear = false; break; }
    if (!clear) continue;
    const heading = horiz ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? Math.PI : 0);
    spawnVehicle(parkedTypes[placed], x, z, heading, { parked: true });
    placed++;
  }
  // Two bicycles lean by the beach showers, one cruiser at the marina.
  spawnVehicle('bicycle', 40, 146, 0.4, { parked: true, color: 0xef476f });
  spawnVehicle('bicycle', -182, 60, Math.PI / 2, { parked: true, color: 0x06d6a0 });
}
