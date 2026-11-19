// autos.js — vehicle factory and arcade driving physics. A car is a
// plain record { g, head, speed, steer, dmg, kind, ... } whose three.js
// group is built from boxes and cylinders: glossy paint, a dark glass
// cabin, spinning wheels, brake lights, and for the police an emissive
// light bar. stepCar integrates throttle/steering, then resolves the
// car against building AABBs and the world edge.

import { clamp } from './base.js';
import { G, pushOutOfBuildings } from './state.js';

export const CAR_NAMES = {
  sedan: 'Sunset Sedan', taxi: 'Cab Coral', sport: 'Comet GT',
  van: 'Marina Van', cop: 'Interceptor', coupe: 'Palma Coupe',
};
const PAINTS = [0xff5a76, 0x3ec6b8, 0xffb340, 0xf2f2f2, 0x5a8aff, 0xff7e47, 0x9fe870, 0xc95dd8, 0x384048];

let carSeq = 0;

export function makeCar(THREE, kind, paint) {
  const g = new THREE.Group();
  const sport = kind === 'sport', van = kind === 'van', cop = kind === 'cop';
  const bodyCol = cop ? 0xf4f6f8 : kind === 'taxi' ? 0xffc21f : paint;
  const paintMat = new THREE.MeshPhongMaterial({ color: bodyCol, specular: 0xbfe0ff, shininess: 85 });
  const darkMat = new THREE.MeshPhongMaterial({ color: 0x1d2733, specular: 0x99ccee, shininess: 120 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.8 });
  const bodyH = van ? 1.15 : sport ? 0.5 : 0.62;
  const bodyY = van ? 0.95 : 0.58;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, bodyH, van ? 4.6 : 4.35), paintMat);
  body.position.y = bodyY; body.castShadow = true;
  g.add(body);
  if (cop) {
    const doors = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.5, 2.2), trimMat);
    doors.position.set(0, 0.62, 0.1); g.add(doors);
  }
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, van ? 0.72 : 0.52, van ? 2.4 : 2.1), darkMat);
  cabin.position.set(0, bodyY + bodyH / 2 + (van ? 0.34 : 0.25), van ? -0.5 : -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  if (sport) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.42), trimMat);
    wing.position.set(0, 1.02, -2.0); g.add(wing);
  }
  if (kind === 'taxi') {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, toneMapped: false }));
    cap.position.set(0, 1.42, -0.25); g.add(cap);
  }
  const lightGeo = new THREE.BoxGeometry(0.34, 0.13, 0.06);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6cf, toneMapped: false });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x881111, toneMapped: false });
  for (const sx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(lightGeo, headMat); hl.position.set(sx, 0.66, 2.19); g.add(hl);
    const tl = new THREE.Mesh(lightGeo, tailMat); tl.position.set(sx, 0.7, -2.19); g.add(tl);
  }
  let barRed = null, barBlue = null;
  if (cop) {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.1, 0.46), trimMat);
    barBase.position.set(0, 1.42, -0.25); g.add(barBase);
    barRed = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2222, toneMapped: false }));
    barRed.position.set(-0.32, 1.53, -0.25); g.add(barRed);
    barBlue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2266ff, toneMapped: false }));
    barBlue.position.set(0.32, 1.53, -0.25); g.add(barBlue);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.95 });
  const wheels = [];
  for (const [wx, wz] of [[-0.88, 1.42], [0.88, 1.42], [-0.88, -1.42], [0.88, -1.42]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.37, wz);
    const tyre = new THREE.Mesh(wheelGeo, wheelMat);
    tyre.rotation.z = Math.PI / 2; tyre.castShadow = true;
    pivot.add(tyre); g.add(pivot); wheels.push(pivot);
  }
  const car = {
    id: carSeq++, kind, g, wheels, paintMat, tailMat, barRed, barBlue,
    head: 0, speed: 0, steerVis: 0, dmg: 0, radius: 2.05,
    maxSpeed: sport ? 41 : cop ? 40 : van ? 27 : 33,
    accel: sport ? 17 : cop ? 16.5 : 12.5,
    role: 'parked',        // parked | traffic | cop | player
    dead: false, smokeAt: 0,
  };
  g.userData.car = car;
  return car;
}

export function paintFor(rng) { return PAINTS[Math.floor(rng() * PAINTS.length) % PAINTS.length]; }

// ctl: { thr: -1..1, steer: -1..1, brake: bool }
export function stepCar(car, ctl, dt) {
  if (car.dead) { car.speed = 0; return; }
  const spd = car.speed;
  if (ctl.brake) {
    car.speed -= Math.sign(spd) * Math.min(Math.abs(spd), 24 * dt);
  } else if (ctl.thr > 0) {
    car.speed += ctl.thr * car.accel * dt * (spd < 0 ? 2.2 : 1);
  } else if (ctl.thr < 0) {
    car.speed += ctl.thr * car.accel * 0.55 * dt * (spd > 0.5 ? 2.2 : 1);
  }
  car.speed -= car.speed * 0.32 * dt;
  if (Math.abs(car.speed) < 0.12 && !ctl.thr) car.speed = 0;
  car.speed = clamp(car.speed, -10, car.maxSpeed * (1 - car.dmg * 0.45));
  const steerMax = 0.58 / (1 + Math.abs(car.speed) * 0.055);
  car.steerVis += ((ctl.steer * steerMax) - car.steerVis) * Math.min(1, dt * 9);
  car.head += car.steerVis * car.speed * dt * 0.44;
  const fx = Math.sin(car.head), fz = Math.cos(car.head);
  car.g.position.x += fx * car.speed * dt;
  car.g.position.z += fz * car.speed * dt;
  // building collision: two sample points (nose and tail) with a small
  // radius, so the car keeps its length against walls yet can still
  // hug a kerb; a fast hit crumples and reports
  const p = car.g.position;
  const before = car.speed;
  let hitWall = false;
  for (const s of [1.5, -1.5]) {
    const sx = p.x + fx * s, sz = p.z + fz * s;
    const [cx2, cz2] = pushOutOfBuildings(sx, sz, 1.0);
    if (cx2 !== sx || cz2 !== sz) { p.x += cx2 - sx; p.z += cz2 - sz; hitWall = true; }
  }
  if (hitWall) {
    if (Math.abs(before) > 6.5) {
      car.dmg = Math.min(1, car.dmg + Math.abs(before) * 0.016);
      G.events.crash = { x: p.x, z: p.z, t: G.time, by: car };
      if (G.fx) G.fx.dust(p.x, 0.7, p.z, 10);
      if (G.snd) G.snd.crash(Math.abs(before));
    }
    car.speed = -before * 0.22;
  }
  p.x = clamp(p.x, -152, 193);
  p.z = clamp(p.z, -152, 152);
  car.g.rotation.y = car.head;
  // wheels: front pair steers, all spin with travel
  const spin = car.speed * dt / 0.37;
  car.wheels[0].rotation.y = car.wheels[1].rotation.y = car.steerVis * 1.15;
  for (const w of car.wheels) w.children[0].rotation.x += spin;
  car.tailMat.color.setHex(ctl.brake || ctl.thr < 0 ? 0xff2a22 : 0x881111);
  if (car.barRed) {
    const ph = (G.wall * 6 + car.id) % 2 < 1;
    car.barRed.material.color.setHex(G.wanted.stars > 0 && car.role === 'cop' ? (ph ? 0xff2222 : 0x551111) : 0x771111);
    car.barBlue.material.color.setHex(G.wanted.stars > 0 && car.role === 'cop' ? (ph ? 0x2266ff : 0x111155) : 0x112277);
  }
}

// Pairwise car-to-car resolution with an oriented-box test (cars are
// long, not round: lane neighbours must pass without touching). The
// overlap is measured in one car's frame, then the other's, and the
// pair is separated along the shallowest penetration axis.
function pairPush(a, b) {
  const dx = b.g.position.x - a.g.position.x;
  const dz = b.g.position.z - a.g.position.z;
  if (dx * dx + dz * dz > 30) return null;
  for (const [lead, dxl, dzl] of [[a, dx, dz], [b, -dx, -dz]]) {
    const fx = Math.sin(lead.head), fz = Math.cos(lead.head);
    const along = dxl * fx + dzl * fz;
    const lat = dxl * fz - dzl * fx;
    if (Math.abs(along) < 3.7 && Math.abs(lat) < 1.8) {
      const penAlong = 3.7 - Math.abs(along);
      const penLat = 1.8 - Math.abs(lat);
      if (penAlong < penLat) return { x: fx * Math.sign(along || 1) * penAlong, z: fz * Math.sign(along || 1) * penAlong };
      return { x: fz * Math.sign(lat || 1) * penLat, z: -fx * Math.sign(lat || 1) * penLat };
    }
  }
  return null;
}

export function resolveCarPairs() {
  const cars = G.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      const push = pairPush(a, b);
      if (!push) continue;
      const aFree = a.role !== 'parked', bFree = b.role !== 'parked';
      if (aFree) { a.g.position.x -= push.x / 2; a.g.position.z -= push.z / 2; }
      if (bFree) { b.g.position.x += push.x / 2; b.g.position.z += push.z / 2; }
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 5) {
        a.dmg = Math.min(1, a.dmg + rel * 0.008);
        b.dmg = Math.min(1, b.dmg + rel * 0.008);
        G.events.crash = { x: (a.g.position.x + b.g.position.x) / 2, z: (a.g.position.z + b.g.position.z) / 2, t: G.time, by: a.role === 'player' ? a : b.role === 'player' ? b : a };
        if (G.fx) G.fx.dust(a.g.position.x, 0.7, a.g.position.z, 8);
      }
      if (aFree) a.speed *= 0.72;
      if (bFree) b.speed *= 0.72;
    }
  }
}
