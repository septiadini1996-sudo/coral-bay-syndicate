// defs.js — shared state, small math helpers, a seeded RNG, and the city
// layout data. The 3D world (city.js) and the minimap (hud.js) are both drawn
// from the single layout built here, so the map always matches the streets.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export function wrapAng(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
export function angToward(a, b, maxStep) {
  const d = wrapAng(b - a);
  return a + clamp(d, -maxStep, maxStep);
}
export const d2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Deterministic RNG (mulberry32) so the city is the same on every load.
export function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- City geometry ---------------------------------------------------------
// Blocks of 42 m separated by 14 m roads on a 56 m pitch, 6 x 6 blocks.
// Land is a peninsula: beach along the south edge, the marina basin to the
// west, the airport across the two north-west blocks.
export const PITCH = 56;
export const BLOCK = 42;
export const NB = 6;
export const HALF = (NB * PITCH) / 2; // 168: block grid spans -168..168
export const LAND_X = 190;            // land half-width (grass slab edge)
export const LAND_N = -190;           // north edge of the land slab
export const SAND_Z = 150;            // sand starts here, water at SEA_Z
export const SEA_Z = 186;
export const DOCK_X = -238;           // marina docks reach this far west
export const ROAD_LINES = [-168, -112, -56, 0, 56, 112, 168];

export function districtAt(bx, bz) {
  const i = Math.round((bx + HALF - PITCH / 2) / PITCH);
  const j = Math.round((bz + HALF - PITCH / 2) / PITCH);
  if (j === 0 && i <= 1) return 'airport';
  if (i >= 4 && j <= 1) return 'industrial';
  if (j === 5) return 'beach';
  if (i >= 4) return 'suburb';
  if (i === 0) return 'boardwalk';
  if (i >= 2 && i <= 3 && j >= 2 && j <= 3) return 'downtown';
  return 'midtown';
}
const PARK_BLOCKS = new Set(['4,3', '1,4']);
export function blockCenter(i, j) {
  return { x: -HALF + PITCH / 2 + i * PITCH, z: -HALF + PITCH / 2 + j * PITCH };
}

// Building colour palettes per district (walls), roofs are derived.
export const PALETTES = {
  downtown: [0x3d5a73, 0x51748c, 0x2f4858, 0x86a8bb, 0xc2b49a, 0x708090],
  midtown: [0xe0b48f, 0xd98e73, 0xa8c3b8, 0xf0d9b5, 0x9fb4c7, 0xe8a2a2],
  boardwalk: [0xffd9a0, 0xa8d8d8, 0xf4a9b8, 0xb8e0b0, 0xffe8c8],
  beach: [0xf7ead7, 0xf2c99a, 0xaad4e0, 0xf9f3e3, 0xe8b4b8],
  suburb: [0xf5efe0, 0xe8d3b0, 0xd9e6d0, 0xf0dcd8, 0xe6ddc8],
  industrial: [0x9a8f7d, 0x7d8a99, 0xb0a696, 0x8c9a8a],
  airport: [0xb8bcc0, 0x9aa4ac],
};

// Build the whole layout once: buildings, trees, lamps, parks, the runway.
function buildLayout() {
  const rnd = mulberry(20261119);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const blocks = [];
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const rr = (a, b) => a + rnd() * (b - a);
  for (let j = 0; j < NB; j++) {
    for (let i = 0; i < NB; i++) {
      const { x: cx, z: cz } = blockCenter(i, j);
      const district = districtAt(cx, cz);
      const park = PARK_BLOCKS.has(`${i},${j}`);
      blocks.push({ i, j, x: cx, z: cz, district, park });
      if (park) {
        for (let t = 0; t < 14; t++) trees.push({ x: cx + rr(-18, 18), z: cz + rr(-18, 18), kind: 'canopy', s: rr(0.9, 1.5) });
        continue;
      }
      if (district === 'airport') {
        if (i === 0) buildings.push({ x: cx + 4, z: cz + 6, w: 30, d: 16, h: 7.5, district, tone: pick(PALETTES.airport), roof: 'hangar' });
        continue;
      }
      const put = (w, d, h, roof) => {
        // place inside the block with a small margin, jittered in a sub-grid
        const gx = cx + rr(-1, 1) * (BLOCK / 2 - w / 2 - 2.5);
        const gz = cz + rr(-1, 1) * (BLOCK / 2 - d / 2 - 2.5);
        buildings.push({ x: gx, z: gz, w, d, h, district, tone: pick(PALETTES[district]), roof });
      };
      if (district === 'downtown') {
        const n = 2 + Math.floor(rnd() * 2);
        for (let k = 0; k < n; k++) put(rr(11, 17), rr(11, 17), rr(26, 64), 'flat');
      } else if (district === 'midtown') {
        const n = 3 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) put(rr(9, 14), rr(9, 14), rr(10, 24), 'flat');
      } else if (district === 'industrial') {
        const n = 1 + Math.floor(rnd() * 2);
        for (let k = 0; k < n; k++) put(rr(22, 32), rr(16, 24), rr(8, 12), 'flat');
      } else if (district === 'suburb') {
        const n = 5 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          put(rr(7, 10), rr(7, 10), rr(3.6, 5.4), 'pitch');
          if (rnd() < 0.8) trees.push({ x: cx + rr(-19, 19), z: cz + rr(-19, 19), kind: 'canopy', s: rr(0.8, 1.3) });
        }
      } else if (district === 'beach') {
        const n = 2 + Math.floor(rnd() * 2);
        for (let k = 0; k < n; k++) put(rr(12, 18), rr(10, 14), rr(8, 16), 'flat');
      } else {
        // boardwalk shops
        const n = 3 + Math.floor(rnd() * 2);
        for (let k = 0; k < n; k++) put(rr(9, 13), rr(8, 12), rr(5, 9), 'flat');
      }
      // Palms hug the beach and boardwalk blocks; a few stray elsewhere.
      if (district === 'beach' || district === 'boardwalk') {
        for (let t = 0; t < 5; t++) trees.push({ x: cx + rr(-20, 20), z: cz + rr(-20, 20), kind: 'palm', s: rr(0.9, 1.4) });
      }
    }
  }
  // Beach-front palm row and boardwalk planters.
  for (let x = -180; x <= 180; x += 15) trees.push({ x: x + rr(-3, 3), z: 158 + rr(0, 6), kind: 'palm', s: rr(1, 1.5) });
  for (let x = -180; x <= 180; x += 28) trees.push({ x, z: SAND_Z - 4, kind: 'palm', s: rr(0.9, 1.2) });
  // Street lamps at intersections.
  for (const lx of ROAD_LINES) for (const lz of ROAD_LINES) lamps.push({ x: lx + 8.4, z: lz + 8.4 });
  return { buildings, trees, lamps, blocks };
}
export const CITY = buildLayout();

// AABB collision of a circle against every building footprint (and the
// world rim). Returns a corrected [x, z]. Buildings are unrotated boxes.
export function collide(x, z, r) {
  const bs = CITY.buildings;
  for (let n = 0; n < bs.length; n++) {
    const b = bs[n];
    const hw = b.w / 2 + r, hd = b.d / 2 + r;
    const dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const px = hw - Math.abs(dx), pz = hd - Math.abs(dz);
      if (px < pz) x = b.x + (dx >= 0 ? hw : -hw);
      else z = b.z + (dz >= 0 ? hd : -hd);
    }
  }
  x = clamp(x, DOCK_X + 2, LAND_X + 26);
  z = clamp(z, LAND_N - 8, SEA_Z + 4);
  return [x, z];
}
// True when a circle overlaps any building (for spawn checks).
export function hitsBuilding(x, z, r) {
  const bs = CITY.buildings;
  for (let n = 0; n < bs.length; n++) {
    const b = bs[n];
    if (Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r) return true;
  }
  return false;
}

// --- Shared game state ------------------------------------------------------
export const G = {
  mode: 'menu',        // menu | play | pause | busted | over
  time: 0,             // game-clock seconds; every timer runs off this
  dt: 0,
  cash: 250,
  wanted: 0,
  heat: 0,             // fractional wanted pressure, decays out of sight
  armed: false,
  story: 0,            // story missions completed (0..3)
  dayT: 0.30,          // day-cycle position 0..1; golden hour lives ~0.25-0.6
  weather: 'clear',    // clear | cloudy | rain
  wet: 0,              // 0 dry .. 1 soaked (road gloss, rain sound)
  weatherT: 50,        // seconds until the weather machine moves on
  forceWeather: null,  // staging override
  forceDay: null,
  camYaw: 2.6, camPitch: 0.30,
  player: null,
  vehicles: [],
  peds: [],
  cops: [],
  heli: null,
  objective: null,     // {x, z, label} current world objective
  dialog: null,
  hooks: {},           // cross-module callbacks, wired in boot.js
  seen: { menu: false },
  stats: { stolen: 0, punches: 0, shots: 0, busted: 0, earned: 0 },
};
export const keys = Object.create(null);
export const SAVE_KEY = 'coral-bay-syndicate-save-v1';
