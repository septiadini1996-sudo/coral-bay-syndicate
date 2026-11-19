// flow.js — civilian traffic. Cars follow lane "legs" between avenue
// intersections (right-hand lanes, turns chosen at each node), keep a
// gap to whatever is ahead of them, brake for pedestrians, honk when
// the player cuts in, swerve away from a fast oncoming player, and
// panic-stop when a crash happens close by.

import { clamp, rand, wrapAngle } from './base.js';
import { G, AVENUES } from './state.js';
import { makeCar, paintFor } from './autos.js';

const LANE = 3.1;

function randomLeg(rng) {
  const vertical = rng() < 0.5;
  const fixed = AVENUES[Math.floor(rng() * AVENUES.length)];
  const dir = rng() < 0.5 ? 1 : -1;
  const ni = Math.floor(rng() * (AVENUES.length - 1));
  const from = AVENUES[dir > 0 ? ni : ni + 1];
  const to = AVENUES[dir > 0 ? ni + 1 : ni];
  return { vertical, fixed, dir, from, to };
}

function legPose(leg, along) {
  // along: distance travelled from `from` toward `to`
  const axis = leg.from + (leg.to - leg.from) * along;
  if (leg.vertical) {
    return { x: leg.fixed + LANE * leg.dir, z: axis, head: leg.dir > 0 ? 0 : Math.PI };
  }
  return { x: axis, z: leg.fixed - LANE * leg.dir, head: leg.dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
}

function nextLeg(rng, leg) {
  const roll = rng();
  if (roll < 0.52) { // straight on: next stretch of the same avenue
    const idx = AVENUES.indexOf(leg.to);
    const nidx = idx + leg.dir;
    if (nidx < 0 || nidx >= AVENUES.length) { // avenue ends: turn around
      return { vertical: leg.vertical, fixed: leg.fixed, dir: -leg.dir, from: leg.to, to: leg.from };
    }
    return { vertical: leg.vertical, fixed: leg.fixed, dir: leg.dir, from: leg.to, to: AVENUES[nidx] };
  }
  // turn onto the crossing avenue at this node
  const dir = rng() < 0.5 ? 1 : -1;
  const crossing = leg.vertical
    ? { vertical: false, fixed: leg.to, dir, from: leg.fixed, to: 0 }
    : { vertical: true, fixed: leg.to, dir, from: leg.fixed, to: 0 };
  const idx = AVENUES.indexOf(leg.fixed);
  const nidx = idx + dir;
  if (nidx < 0 || nidx >= AVENUES.length) { crossing.dir = -dir; crossing.to = AVENUES[idx - dir]; }
  else crossing.to = AVENUES[nidx];
  return crossing;
}

export function spawnTraffic(THREE, scene, count) {
  const rng = G.world;
  const kinds = ['sedan', 'sedan', 'coupe', 'taxi', 'van', 'sport'];
  for (let i = 0; i < count; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const car = makeCar(THREE, kind, paintFor(rng));
    car.role = 'traffic';
    const leg = randomLeg(rng);
    const pose = legPose(leg, rng());
    car.g.position.set(pose.x, 0, pose.z);
    car.head = pose.head;
    car.g.rotation.y = car.head;
    scene.add(car.g);
    G.cars.push(car);
    G.traffic.push({
      car, leg, along: rng(), cruise: rand(rng, 8.5, 12.5),
      honkCd: rand(rng, 2, 6), panicT: 0, shift: 0, seenCrashAt: -1,
    });
  }
}

// Parked, stealable cars along the kerbs.
export function spawnParked(THREE, scene) {
  const rng = G.world;
  const kinds = ['sedan', 'coupe', 'sport', 'van', 'sedan'];
  const spots = [];
  for (const a of AVENUES) {
    for (const c of [-96, -48, 0, 48, 96]) {
      spots.push({ x: a + 4.75, z: c + rand(rng, -9, 9), head: 0 });
      spots.push({ x: a - 4.75, z: c + rand(rng, -9, 9), head: Math.PI });
      spots.push({ x: c + rand(rng, -9, 9), z: a + 4.75, head: Math.PI / 2 });
    }
  }
  let placed = 0;
  for (const s of spots) {
    if (placed >= 15 || rng() < 0.45) continue;
    const car = makeCar(THREE, kinds[Math.floor(rng() * kinds.length)], paintFor(rng));
    car.role = 'parked';
    car.g.position.set(s.x, 0, s.z);
    car.head = s.head + (rng() - 0.5) * 0.05;
    car.g.rotation.y = car.head;
    scene.add(car.g);
    G.cars.push(car);
    placed++;
  }
}

export function updateTraffic(dt) {
  const rng = G.world;
  const playerCar = G.driveCar;
  for (const t of G.traffic) {
    const car = t.car;
    if (car.dead) continue;
    const p = car.g.position;
    // advance the leg bookkeeping from the car's real position
    const axisPos = t.leg.vertical ? p.z : p.x;
    const span = t.leg.to - t.leg.from;
    t.along = clamp((axisPos - t.leg.from) / span, 0, 1);
    if (t.along >= 0.995) {
      t.leg = nextLeg(rng, t.leg);
      t.along = 0;
    }
    const pose = legPose(t.leg, t.along);
    // aim point: a little ahead on the lane, plus any swerve shift
    const fx = Math.sin(car.head), fz = Math.cos(car.head);
    const px = -fz, pz = fx; // screen-right of the car
    let shiftGoal = 0;
    let desired = t.cruise;
    // ---- leader scan: cars and the player ahead in my lane
    for (const other of G.cars) {
      if (other === car) continue;
      const dx = other.g.position.x - p.x, dz = other.g.position.z - p.z;
      const along = dx * fx + dz * fz;
      const lat = dx * px + dz * pz;
      if (along > 0 && along < 12 && Math.abs(lat) < 1.55) {
        desired = Math.min(desired, Math.abs(other.speed) * clamp((along - 4.6) / 5, 0, 1));
        if (along < 4.6) desired = 0;
      }
    }
    for (const ped of G.peds) {
      if (ped.down > 0) continue;
      const dx = ped.g.position.x - p.x, dz = ped.g.position.z - p.z;
      const along = dx * fx + dz * fz, lat = dx * px + dz * pz;
      if (along > 0 && along < 7.5 && Math.abs(lat) < 1.7) desired = 0;
    }
    // ---- reactions to the player
    if (playerCar) {
      const dx = playerCar.g.position.x - p.x, dz = playerCar.g.position.z - p.z;
      const along = dx * fx + dz * fz, lat = dx * px + dz * pz;
      const pSpeed = Math.abs(playerCar.speed);
      const pfx = Math.sin(playerCar.head), pfz = Math.cos(playerCar.head);
      const headOn = (fx * pfx + fz * pfz) < -0.4;
      if (pSpeed > 12 && headOn && along > 3 && along < 17 && Math.abs(lat) < 3.4) {
        shiftGoal = lat > 0 ? -1.15 : 1.15; // swerve away from the player's side
      }
      t.honkCd -= dt;
      if (t.honkCd <= 0 && along > 0.5 && along < 7 && Math.abs(lat) < 2.3 && pSpeed < car.speed - 1) {
        if (G.snd) G.snd.honk();
        t.honkCd = rand(rng, 3.5, 7);
      }
    }
    const crash = G.events.crash;
    if (crash && crash.t !== t.seenCrashAt) {
      t.seenCrashAt = crash.t;
      if (Math.hypot(crash.x - p.x, crash.z - p.z) < 20 && crash.by !== car) {
        t.panicT = rand(rng, 1.2, 2.6);
      }
    }
    if (t.panicT > 0) { t.panicT -= dt; desired = 0; }
    t.shift += (shiftGoal - t.shift) * Math.min(1, dt * 3);
    const aimX = pose.x + fx * 7 + px * t.shift;
    const aimZ = pose.z + fz * 7 + pz * t.shift;
    const steer = clamp(wrapAngle(Math.atan2(aimX - p.x, aimZ - p.z) - car.head) * 2.1, -1, 1);
    const ctl = { thr: 0, steer, brake: false };
    if (desired <= 0.05 && car.speed < 0.4) ctl.brake = car.speed > 0.05;
    else if (desired > car.speed + 0.4) ctl.thr = clamp((desired - car.speed) * 0.35, 0.2, 0.9);
    else if (desired < car.speed - 2.5) ctl.brake = true;
    else ctl.thr = clamp((desired - car.speed) * 0.2, -0.4, 0.4);
    car.ctl = ctl;
  }
}
