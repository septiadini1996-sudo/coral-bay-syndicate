// state.js — the one shared game state object every module reads and
// writes, plus the street plan constants of Coral Bay. Keeping the world
// layout here means the city builder, the traffic, the police and the
// minimap all agree on where the roads are.

import { makeRng } from './base.js';

// (avenue list lives here; scenes.js imports it through state)

// Avenue centre lines, identical on both axes: six streets each way,
// 48 m apart, each street 12 m wide, leaving 36 m square blocks.
export const AVENUES = [-120, -72, -24, 24, 72, 120];
export const BLOCK_CENTRES = [-96, -48, 0, 48, 96];
export const ROAD_HALF = 6;
export const CITY_EDGE = 138;      // last paved metre on each side
export const BEACH_X = 150;        // sand starts here, water past ~196
export const START_SPOT = { x: -48, z: 112.5 }; // Rico's first corner
export const GAME_NAME = 'Coral Bay Syndicate';

export const G = {
  mode: 'boot',            // boot | menu | play | pause | over
  time: 0,                 // game clock in seconds; frozen unless playing
  wall: 0,                 // unpaused clock for menus and blink effects
  three: null,             // { renderer, scene, camera, canvas }
  world: null,             // rng for gameplay placement (seeded per load)
  keys: Object.create(null),
  mouseDX: 0, mouseDY: 0, clicked: false,
  hero: null,              // the on-foot player (actor.js)
  driveCar: null,          // car the player is driving, or null
  cars: [],                // every vehicle in the world
  traffic: [],             // traffic AI records { car, leg, ... }
  bust: 0,                 // arrest meter, 0..1
  markedCar: null,         // the HOT METAL target car
  roadblockDone: false,
  mouseDown: false,
  promptLock: null,
  peds: [],
  cops: [],
  colliders: [],           // building AABBs { x0, z0, x1, z1 }
  blocks: [],              // block faces { x0, z0, x1, z1, district }
  timers: [],              // game-time scheduler queue { at, fn }
  events: { shot: null, crash: null },  // { x, z, t } stamps other AI reads
  wanted: { heat: 0, stars: 0, lastSeenAt: -99, seenNow: false },
  objective: null,         // { title, text, x, z, dist, timer } for the HUD
  prompt: '',              // contextual interaction line for the HUD
  notice: '', noticeT: 0,  // centre banner text and its expiry
  overWhy: '',             // 'wasted' | 'busted'
  save: { money: 350, story: 0, jobsDone: 0 },
  lastCrashAt: -99,
  snd: null,               // audio service, wired by boot
  fx: null,                // particle service, wired by boot
  shotScene: null,         // name of the staged screenshot scene, if any
  shotDrive: null,         // { speed } cruise control for staged drives
  city: null,              // handles the city module animates (water, boats)
};

// A fresh gameplay rng; the world geometry itself uses its own fixed seed
// inside city.js so the city is the same on every visit.
G.world = makeRng((Date.now() % 2147483647) || 7);

// Schedule fn to run after `delay` seconds of GAME time (pauses count).
export function later(delay, fn) {
  G.timers.push({ at: G.time + delay, fn });
}

// Run due timers; called once per frame by the boot loop while playing.
export function tickTimers() {
  for (let i = G.timers.length - 1; i >= 0; i--) {
    if (G.timers[i].at <= G.time) {
      const job = G.timers[i];
      G.timers.splice(i, 1);
      job.fn();
    }
  }
}

// Is the straight line a->b blocked by any building? Samples the segment
// against the AABB list; cheap and good enough for line-of-sight calls.
export function sightBlocked(ax, az, bx, bz) {
  const steps = 7;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (const c of G.colliders) {
      if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return true;
    }
  }
  return false;
}

// Push a circle at (x, z) out of every building AABB; returns corrected
// [x, z]. Used by the player and, with a bigger radius, by cars.
export function pushOutOfBuildings(x, z, r) {
  for (const c of G.colliders) {
    if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) {
      const dxl = x - (c.x0 - r), dxr = (c.x1 + r) - x;
      const dzl = z - (c.z0 - r), dzr = (c.z1 + r) - z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) x = c.x0 - r;
      else if (m === dxr) x = c.x1 + r;
      else if (m === dzl) z = c.z0 - r;
      else z = c.z1 + r;
    }
  }
  return [x, z];
}
