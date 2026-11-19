// actor.js — Rico Solano himself: third-person walking with mouse
// look (real pointer lock), sprinting, a pistol, entering and stealing
// cars, the driving inputs, and both cameras. The interaction prompt
// and the action share one condition function, so what the HUD offers
// is always exactly what E will do.

import { clamp, wrapAngle } from './base.js';
import { G, pushOutOfBuildings } from './state.js';
import { CAR_NAMES } from './autos.js';
import { reportCrime } from './law.js';
import { spawnFleeingPed } from './crowd.js';

export function buildHero(THREE, scene) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xb57a3e, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xff5340, roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x232c3d, roughness: 0.95 });
  const mkLimb = (mat, w, h, d, x, y, z) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true;
    g.add(m); return m;
  };
  const hero = {
    g, hp: 100, yaw: Math.PI, pitch: 0.12, moveSpeed: 0,
    legL: mkLimb(pants, 0.16, 0.54, 0.18, -0.12, 0.56, 0),
    legR: mkLimb(pants, 0.16, 0.54, 0.18, 0.12, 0.56, 0),
    armL: mkLimb(shirt, 0.12, 0.52, 0.14, -0.31, 1.14, 0),
    armR: mkLimb(shirt, 0.12, 0.52, 0.14, 0.31, 1.14, 0),
    phase: 0, shootCd: 0, lastHurtAt: -99, gun: null,
  };
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.25), shirt);
  torso.position.y = 0.88; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin);
  head.position.y = 1.36; head.castShadow = true; g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x191c20, roughness: 0.5, metalness: 0.6 }));
  gun.position.set(0, -0.5, 0.14);
  hero.armR.add(gun);
  hero.gun = gun;
  g.position.set(-48, 0, 112.5);
  hero.yaw = Math.PI / 2; // face east, toward Celia's corner
  g.rotation.y = hero.yaw;
  scene.add(g);
  G.hero = hero;
  return hero;
}

// The one and only "can I get in that car" test, used by prompt + key.
export function carCandidate() {
  const h = G.hero.g.position;
  let best = null, bd = 3.6;
  for (const car of G.cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.g.position.x - h.x, car.g.position.z - h.z);
    if (d < bd && Math.abs(car.speed) < 7) { bd = d; best = car; }
  }
  return best;
}

function enterCar(THREE, scene, car) {
  const hero = G.hero;
  if (car.kind === 'cop') {
    if (G.snd) G.snd.denied();
    G.promptLock = 'Locked — police Interceptor';
    return;
  }
  const wasParked = car.role === 'parked';
  const wasTraffic = car.role === 'traffic';
  if (wasTraffic) {
    const ti = G.traffic.findIndex((t) => t.car === car);
    if (ti >= 0) G.traffic.splice(ti, 1);
    spawnFleeingPed(THREE, scene, car.g.position.x + 1.6, car.g.position.z, car.g.position.x, car.g.position.z);
  }
  car.role = 'player';
  G.driveCar = car;
  hero.g.visible = false;
  if (wasParked || wasTraffic) {
    reportCrime(26, car.g.position.x, car.g.position.z);
    G.events.theft = { car, t: G.time };
    if (G.snd) G.snd.blip(220, 0.15, 'square', 0.15);
  }
}

function exitCar() {
  const car = G.driveCar;
  if (!car) return;
  car.role = 'parked';
  car.ctl = { thr: 0, steer: 0, brake: true };
  G.driveCar = null;
  const h = G.hero;
  const side = car.head + Math.PI / 2;
  h.g.position.set(
    car.g.position.x + Math.sin(side) * 2.2, 0,
    car.g.position.z + Math.cos(side) * 2.2);
  h.yaw = car.head;
  h.g.visible = true;
}

export function updateActor(THREE, scene, dt) {
  const hero = G.hero;
  const keys = G.keys;
  hero.shootCd -= dt;
  if (hero.hp < 100 && G.time - hero.lastHurtAt > 6) {
    hero.hp = Math.min(100, hero.hp + dt * 6);
  }
  if (G.driveCar) {
    const car = G.driveCar;
    car.ctl = {
      thr: (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0),
      steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (keys.KeyD || keys.ArrowRight ? -1 : 0),
      brake: !!keys.Space,
    };
    hero.g.position.copy(car.g.position);
    hero.moveSpeed = Math.abs(car.speed);
    if (keys.KeyE) { keys.KeyE = false; exitCar(); }
    if (car.dmg >= 1 && !car.dead) {
      car.dead = true;
      exitCar();
      G.notice = 'The engine is wrecked!';
      G.noticeT = G.time + 2.5;
    }
    updateCarCamera(dt);
    G.prompt = '';
    return;
  }
  // ---------- on foot
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0);
  const strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) + (keys.KeyA || keys.ArrowLeft ? -1 : 0);
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  const speed = sprint ? 8.2 : 4.6;
  const fx = Math.sin(hero.yaw), fz = Math.cos(hero.yaw);
  const rx = -fz, rz = fx;
  let mx = fx * fwd + rx * strafe, mz = fz * fwd + rz * strafe;
  const ml = Math.hypot(mx, mz);
  hero.moveSpeed = ml > 0 ? speed : 0;
  if (ml > 0) {
    mx = mx / ml * speed; mz = mz / ml * speed;
    const p = hero.g.position;
    p.x += mx * dt; p.z += mz * dt;
    const [nx, nz] = pushOutOfBuildings(p.x, p.z, 0.42);
    p.x = clamp(nx, -154, 194); p.z = clamp(nz, -154, 154);
    // cars are solid too: slide around them
    for (const car of G.cars) {
      const dx = p.x - car.g.position.x, dz = p.z - car.g.position.z;
      const d2 = dx * dx + dz * dz, rr = car.radius + 0.35;
      if (d2 < rr * rr && d2 > 0.001) {
        const d = Math.sqrt(d2);
        p.x = car.g.position.x + dx / d * rr;
        p.z = car.g.position.z + dz / d * rr;
      }
    }
    hero.phase += dt * speed * 1.9;
    hero.g.rotation.y = Math.atan2(mx, mz);
  }
  const sw = Math.sin(hero.phase) * (ml > 0 ? 0.6 : 0);
  hero.legL.rotation.x = sw; hero.legR.rotation.x = -sw;
  hero.armL.rotation.x = -sw * 0.7;
  const aiming = G.mouseDown;
  hero.armR.rotation.x = aiming ? -1.35 : sw * 0.7;
  if (aiming) hero.g.rotation.y = hero.yaw;
  hero.g.position.y = ml > 0 ? Math.abs(Math.sin(hero.phase)) * 0.05 : 0;
  // ---------- shooting
  if (G.mouseDown && hero.shootCd <= 0 && G.mode === 'play') {
    hero.shootCd = 0.27;
    shoot(THREE);
  }
  // ---------- interaction
  const cand = carCandidate();
  if (G.promptLock) { G.prompt = G.promptLock; G.promptLock = null; }
  else if (cand) G.prompt = cand.kind === 'cop' ? 'Police Interceptor — locked' : `E — Steal the ${CAR_NAMES[cand.kind]}`;
  else G.prompt = '';
  if (keys.KeyE) {
    keys.KeyE = false;
    if (cand) enterCar(THREE, scene, cand);
  }
  updateFootCamera(dt);
}

function shoot(THREE) {
  const hero = G.hero;
  const p = hero.g.position;
  G.events.shot = { x: p.x, z: p.z, t: G.time };
  if (G.snd) G.snd.shot();
  reportCrime(14, p.x, p.z);
  // hitscan along the camera's line: nearest car within a narrow cone
  const fx = Math.sin(hero.yaw), fz = Math.cos(hero.yaw);
  let best = null, bd = 46;
  for (const car of G.cars) {
    const dx = car.g.position.x - p.x, dz = car.g.position.z - p.z;
    const along = dx * fx + dz * fz;
    const lat = Math.abs(dx * fz - dz * fx);
    if (along > 2 && along < bd && lat < 1.7) { bd = along; best = car; }
  }
  const gx = p.x + fx * 1.2, gz = p.z + fz * 1.2;
  if (best) {
    best.dmg = Math.min(1, best.dmg + 0.13);
    if (G.fx) G.fx.sparks(best.g.position.x, 0.9, best.g.position.z, 9);
    if (best.kind === 'cop') reportCrime(20, p.x, p.z);
  } else if (G.fx) {
    G.fx.sparks(gx + fx * 6, 1.3, gz + fz * 6, 3);
  }
  void THREE;
}

const camPos = { x: 0, y: 3, z: 0, init: false };
function smoothCam(dt, tx, ty, tz, lx, ly, lz, snap) {
  const c = G.three.camera;
  const k = snap ? 1 : 1 - Math.exp(-dt * 7);
  camPos.x += (tx - camPos.x) * k;
  camPos.y += (ty - camPos.y) * k;
  camPos.z += (tz - camPos.z) * k;
  c.position.set(camPos.x, camPos.y, camPos.z);
  c.lookAt(lx, ly, lz);
}

function updateFootCamera(dt) {
  const hero = G.hero;
  const p = hero.g.position;
  const fx = Math.sin(hero.yaw), fz = Math.cos(hero.yaw);
  const dist = 6.4;
  const tx = p.x - fx * dist * Math.cos(hero.pitch);
  const tz = p.z - fz * dist * Math.cos(hero.pitch);
  const ty = 2.3 + dist * Math.sin(hero.pitch);
  smoothCam(dt, tx, ty, tz, p.x + fx * 7, 1.25 + hero.pitch * 6, p.z + fz * 7, !camPos.init);
  camPos.init = true;
}

function updateCarCamera(dt) {
  const car = G.driveCar;
  const p = car.g.position;
  const fx = Math.sin(car.head), fz = Math.cos(car.head);
  const tx = p.x - fx * 8.8, tz = p.z - fz * 8.8;
  smoothCam(dt, tx, 3.2, tz, p.x + fx * 9, 1.1, p.z + fz * 9, false);
}

// Apply accumulated mouse movement to the hero's look angles.
export function applyLook() {
  const hero = G.hero;
  if (!hero || G.driveCar) { G.mouseDX = 0; G.mouseDY = 0; return; }
  hero.yaw -= G.mouseDX * 0.0024;
  hero.pitch = clamp(hero.pitch + G.mouseDY * 0.002, -0.42, 0.62);
  G.mouseDX = 0; G.mouseDY = 0;
  void wrapAngle;
}
