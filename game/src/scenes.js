// scenes.js — deterministic staging for the four screenshots. With
// ?shot=<name>&seed=1 the boot skips the menu, seeds the world rng,
// and calls stage() to arrange a living moment: a chase, a downtown
// drive, a quiet marina, a standoff. Traffic cars used as props get
// their lane legs rewritten to where they were placed, the player's
// car is taken out of the traffic system, and the mission banner is
// dismissed so the frame stays clean.

import { G, later, AVENUES } from './state.js';
import { addHeat } from './law.js';
import { stageMission } from './jobs.js';

function putCar(car, x, z, head, speed) {
  car.g.position.set(x, 0, z);
  car.head = head; car.g.rotation.y = head;
  car.speed = speed;
}

function nearestAvenue(v) {
  let best = AVENUES[0];
  for (const a of AVENUES) if (Math.abs(a - v) < Math.abs(best - v)) best = a;
  return best;
}

// Place a traffic car AND rewrite its lane leg to match, so its own
// driver keeps it on this avenue instead of steering back to its old
// route. Returns the traffic record.
function placeTraffic(car, x, z, head, speed, cruise) {
  putCar(car, x, z, head, speed);
  const rec = G.traffic.find((t) => t.car === car);
  if (!rec) return null;
  const vertical = Math.abs(Math.sin(head)) < 0.5;
  const dir = vertical ? (Math.cos(head) > 0 ? 1 : -1) : (Math.sin(head) > 0 ? 1 : -1);
  const axis = vertical ? z : x;
  const sorted = [...AVENUES].sort((a, b) => a - b);
  let from = sorted[0], to = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (axis >= sorted[i] && axis <= sorted[i + 1]) {
      from = dir > 0 ? sorted[i] : sorted[i + 1];
      to = dir > 0 ? sorted[i + 1] : sorted[i];
    }
  }
  rec.leg = { vertical, fixed: nearestAvenue(vertical ? x : z), dir, from, to };
  rec.along = 0.4;
  if (cruise) rec.cruise = cruise;
  return rec;
}

// Take a car out of the traffic system and hand it to the player.
function claimAsPlayer(car, x, z, head, speed) {
  const ti = G.traffic.findIndex((t) => t.car === car);
  if (ti >= 0) G.traffic.splice(ti, 1);
  car.role = 'player';
  putCar(car, x, z, head, speed);
  G.driveCar = car;
  G.hero.g.visible = false;
  G.hero.g.position.copy(car.g.position);
}

export function stage(THREE, scene, name) {
  const hero = G.hero;
  const trafficCars = G.traffic.map((t) => t.car);
  if (name === 'chase') {
    const car = G.cars.find((c) => c.role === 'parked' && !c.marked) || trafficCars[0];
    claimAsPlayer(car, 27.1, -6, 0, 17);
    car.paintMat.color.setHex(0xff4040); // a hero car the camera can read
    G.shotDrive = { speed: 17 }; // cruise control: boot holds this pace
    addHeat(150);       // four stars: the force, plus a roadblock ahead
    G.wanted.lastSeenAt = G.time;
    later(0.05, () => {
      const spots = [[27.1, -28, 0, 17], [20.9, -20, 0.08, 17], [27.1, -38, -0.05, 16]];
      G.cops.slice(0, 3).forEach((cop, i) => {
        const [x, z, h, s] = spots[i] || spots[0];
        putCar(cop.car, x, z, h, s);
      });
    });
    trafficCars.filter((c) => c !== car).slice(0, 2)
      .forEach((c, i) => placeTraffic(c, 27.1, 44 + i * 18, 0, 11, 11));
    stageMission(0);
  } else if (name === 'drive') {
    const car = G.cars.find((c) => c.kind === 'taxi') || trafficCars[0];
    claimAsPlayer(car, -27.1, 34, Math.PI, 14);
    G.keys.KeyW = true;
    trafficCars.filter((c) => c !== car).slice(0, 2)
      .forEach((c, i) => placeTraffic(c, -27.1, -2 - i * 18, Math.PI, 11, 13));
    stageMission(3);
  } else if (name === 'marina') {
    hero.g.position.set(156, 0, 80);
    hero.yaw = 0.95;
    hero.g.rotation.y = hero.yaw;
    stageMission(1);
  } else if (name === 'combat') {
    hero.g.position.set(-11, 0, 30);
    hero.yaw = -2.35;
    hero.g.rotation.y = hero.yaw;
    addHeat(95);        // three stars
    G.wanted.lastSeenAt = G.time;
    later(0.05, () => {
      if (G.cops[0]) { putCar(G.cops[0].car, -27.1, 6, 0, 0); G.cops[0].hold = true; }
      if (G.cops[1]) { putCar(G.cops[1].car, -20.9, -2, 0, 0); G.cops[1].hold = true; }
    });
    // a gunshot in the recent past: nearby peds are mid-reaction
    G.events.shot = { x: -20, z: 28, t: G.time - 0.4 };
    stageMission(1);
  }
  G.noticeT = 0; // keep the staged frame free of the mission banner
  void THREE; void scene;
}
