// law.js — the Coral Bay police and the wanted system. Crimes add heat;
// heat sets the star count; the star count sets how many Interceptors
// hunt the player. Pursuit steering aims at the player's predicted
// position, officers shoot at three stars and up when they have a clear
// line, standing still surrounded fills the bust meter, and staying
// unseen lets the heat cool until the stars go out.

import { clamp, rand, wrapAngle } from './base.js';
import { G, later, sightBlocked } from './state.js';
import { makeCar } from './autos.js';

const STAR_HEAT = [0, 18, 45, 85, 135, 200];   // heat needed per star
export function starsForHeat(heat) {
  let s = 0;
  for (let i = 1; i <= 5; i++) if (heat >= STAR_HEAT[i]) s = i;
  return s;
}
const WANTED_COUNT = [0, 2, 3, 4, 6, 8];

export function addHeat(amount) {
  const w = G.wanted;
  w.heat = clamp(w.heat + amount, 0, 260);
  w.stars = starsForHeat(w.heat);
}

export function reportCrime(amount, x, z) {
  // a crime only counts when someone could have seen it
  let witnessed = false;
  for (const ped of G.peds) {
    if (Math.hypot(ped.g.position.x - x, ped.g.position.z - z) < 15) { witnessed = true; break; }
  }
  if (!witnessed) for (const cop of G.cops) {
    if (Math.hypot(cop.g.position.x - x, cop.g.position.z - z) < 40) { witnessed = true; break; }
  }
  addHeat(witnessed ? amount : amount * 0.35);
}

function heroPos() {
  const c = G.driveCar;
  return c ? c.g.position : G.hero.g.position;
}

export function spawnCop(THREE, scene) {
  const rng = G.world;
  const car = makeCar(THREE, 'cop', 0xffffff);
  car.role = 'cop';
  // appear on a road 60-95 m away, preferably out of the player's view
  const hp = heroPos();
  let x = hp.x, z = hp.z;
  for (let tries = 0; tries < 8; tries++) {
    const a = rng() * Math.PI * 2, d = rand(rng, 60, 95);
    x = clamp(hp.x + Math.sin(a) * d, -134, 134);
    z = clamp(hp.z + Math.cos(a) * d, -134, 134);
    // snap to the nearest avenue crossing area
    x = nearestAvenue(x); z = Math.round(z / 4) * 4;
    if (Math.hypot(x - hp.x, z - hp.z) > 45) break;
  }
  car.g.position.set(x, 0, z);
  car.head = Math.atan2(hp.x - x, hp.z - z);
  car.g.rotation.y = car.head;
  scene.add(car.g);
  G.cars.push(car);
  const cop = { car, shootCd: rand(rng, 0.5, 1.4), stuckT: 0, revT: 0 };
  G.cops.push(cop);
  return cop;
}

function nearestAvenue(v) {
  const A = [-120, -72, -24, 24, 72, 120];
  let best = A[0];
  for (const a of A) if (Math.abs(a - v) < Math.abs(best - v)) best = a;
  return best;
}

export function updateLaw(THREE, scene, dt) {
  const w = G.wanted;
  const hp = heroPos();
  const heroSpeed = G.driveCar ? Math.abs(G.driveCar.speed) : (G.hero ? G.hero.moveSpeed : 0);
  // --- who can see the player right now?
  w.seenNow = false;
  for (const cop of G.cops) {
    const cp = cop.car.g.position;
    const d = Math.hypot(cp.x - hp.x, cp.z - hp.z);
    if (d < 58 && !sightBlocked(cp.x, cp.z, hp.x, hp.z)) { w.seenNow = true; break; }
  }
  if (w.seenNow) w.lastSeenAt = G.time;
  // --- heat cools while unseen; stars follow heat
  if (!w.seenNow && G.time - w.lastSeenAt > 6 && w.heat > 0) {
    w.heat = Math.max(0, w.heat - dt * 2.6);
    w.stars = starsForHeat(w.heat);
  }
  // --- keep the force at the size the stars demand
  const want = WANTED_COUNT[w.stars];
  for (let i = G.cops.length - 1; i >= 0; i--) {
    if (G.cops[i].car.dead) { removeCop(scene, i); }
  }
  if (G.cops.length < want) {
    spawnCop(THREE, scene);
  } else if (G.cops.length > want) {
    // the farthest unit gives up and leaves the world
    let far = -1, fd = -1;
    G.cops.forEach((cop, i) => {
      const d = Math.hypot(cop.car.g.position.x - hp.x, cop.car.g.position.z - hp.z);
      if (d > fd) { fd = d; far = i; }
    });
    if (far >= 0 && fd > 55) removeCop(scene, far);
  }
  // --- pursuit, gunfire, bust
  let busting = 0;
  for (const cop of G.cops) {
    const car = cop.car;
    if (cop.hold) { // staged units stay exactly where they were put
      car.ctl = { thr: 0, steer: 0, brake: true };
      continue;
    }
    const cp = car.g.position;
    const dx = hp.x - cp.x, dz = hp.z - cp.z;
    const dist = Math.hypot(dx, dz);
    // predicted intercept point
    const hvx = G.driveCar ? Math.sin(G.driveCar.head) * G.driveCar.speed : 0;
    const hvz = G.driveCar ? Math.cos(G.driveCar.head) * G.driveCar.speed : 0;
    const lead = clamp(dist / 34, 0, 1) * 0.85;
    const aimX = hp.x + hvx * lead, aimZ = hp.z + hvz * lead;
    let steer = clamp(wrapAngle(Math.atan2(aimX - cp.x, aimZ - cp.z) - car.head) * 2.0, -1, 1);
    // pace control: arrive fast, then match the target's speed about
    // eleven metres back instead of ramming through it
    const want = heroSpeed + clamp((dist - 11) * 0.55, -4, 13);
    let thr = clamp((want - car.speed) * 0.35, -1, 1);
    // stuck against a wall or the player: back out and swing round
    if (Math.abs(car.speed) < 0.8 && thr > 0) cop.stuckT += dt; else cop.stuckT = 0;
    if (cop.stuckT > 0.9) { cop.revT = 0.85; cop.stuckT = 0; }
    if (cop.revT > 0) {
      cop.revT -= dt;
      thr = -1; steer = -steer;
    }
    car.ctl = { thr, steer, brake: dist < 5.5 && heroSpeed < 2 && Math.abs(car.speed) > 3 };
    // gunfire at three stars and up, with a clear line
    cop.shootCd -= dt;
    if (w.stars >= 3 && dist < 44 && cop.shootCd <= 0 && !sightBlocked(cp.x, cp.z, hp.x, hp.z)) {
      cop.shootCd = rand(G.world, 0.7, 1.3);
      if (G.snd) G.snd.shot();
      if (G.fx) G.fx.sparks(hp.x, 1.1, hp.z, 5);
      if (G.world() < 0.62) {
        if (G.driveCar) {
          G.driveCar.dmg = Math.min(1, G.driveCar.dmg + 0.045);
          if (G.world() < 0.4 && G.hero) G.hero.hp -= 2.5;
        } else if (G.hero) {
          G.hero.hp -= rand(G.world, 4, 8);
          G.hero.lastHurtAt = G.time;
        }
      }
    }
    if (dist < 8 && heroSpeed < 1.6) busting++;
  }
  // --- bust meter and roadblocks
  if (busting > 0 && w.stars > 0) {
    G.bust = Math.min(1, (G.bust || 0) + dt / 3.2);
    if (G.bust >= 1 && G.mode === 'play') endByArrest();
  } else {
    G.bust = Math.max(0, (G.bust || 0) - dt / 2);
  }
  if (w.stars >= 4 && !G.roadblockDone) {
    G.roadblockDone = true;
    later(1.2, () => placeRoadblock(THREE, scene));
  }
  if (w.stars < 4) G.roadblockDone = false;
}

function removeCop(scene, i) {
  const cop = G.cops[i];
  scene.remove(cop.car.g);
  const ci = G.cars.indexOf(cop.car);
  if (ci >= 0) G.cars.splice(ci, 1);
  G.cops.splice(i, 1);
}

function placeRoadblock(THREE, scene) {
  if (G.mode !== 'play') return;
  const hp = heroPos();
  const head = G.driveCar ? G.driveCar.head : G.hero.yaw;
  const bx = clamp(hp.x + Math.sin(head) * 46, -130, 130);
  const bz = clamp(hp.z + Math.cos(head) * 46, -130, 130);
  for (const off of [-3.4, 3.4]) {
    const car = makeCar(THREE, 'cop', 0xffffff);
    car.role = 'cop';
    car.g.position.set(bx + Math.cos(head) * off, 0, bz - Math.sin(head) * off);
    car.head = head + Math.PI / 2;
    car.g.rotation.y = car.head;
    scene.add(car.g);
    G.cars.push(car);
    G.cops.push({ car, shootCd: 1, stuckT: 0, revT: 0 });
  }
}

function endByArrest() {
  G.mode = 'over';
  G.overWhy = 'busted';
  G.bust = 0;
}
