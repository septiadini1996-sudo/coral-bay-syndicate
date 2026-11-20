// Coral Bay Syndicate - util.js
// Shared helpers and the central game-state hub `G` that every other
// file reads and writes. Nothing in here touches the three.js scene
// graph directly; it is pure data plus small math utilities.

'use strict';

// Deterministic seeded RNG (mulberry32) so the city is the same on
// every load: mission probes and screenshots can rely on the layout.
var _seed = 20261120;
function rnd() {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  var t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rr(a, b) { return a + rnd() * (b - a); }          // random float in [a,b)
function ri(a, b) { return Math.floor(rr(a, b + 1)); }     // random int in [a,b]
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
function angWrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function angLerp(a, b, t) { return a + angWrap(b - a) * t; }
function el(id) { return document.getElementById(id); }
function fmt$ (n) { return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

// Central state. Other files attach their builders to G as well.
var G = {
  t: 0,                 // seconds since boot
  started: false,       // start screen dismissed
  paused: false,
  scene: null, camera: null, renderer: null,
  keys: {},             // keyboard state by e.code
  mouseDown: false, mouseDownT: 0, mouseMoved: 0, lookDX: 0, lookDY: 0,
  camYaw: 2.8, camPitch: 0.34,
  player: null,         // built by people.js
  cars: [],             // every vehicle (police live in cops)
  peds: [],             // pedestrians + story NPCs
  cops: [],             // police vehicles currently spawned
  colliders: [],        // {x,z,r} circles that block movement
  colGrid: {},          // spatial buckets for colliders
  fires: [],            // active explosion fire effects
  pickups: [],          // armor vests
  lights: [],           // traffic lights {x,z,...}
  nodes: [],            // road-graph nodes for GPS / AI routing
  nodeAt: {},           // "i,j" -> node index
  hp: 100, armor: 0,
  cash: 0, earned: 0,   // earned = lifetime, drives Syndicate Rank
  wanted: 0,            // 0..5 stars
  seenT: 99,            // seconds since police last had eyes on the player
  weapon: 0,            // 0 fists, 1 pistol, 2 smg
  ammo: { 1: 60, 2: 240 },
  aimT: 0,              // time the weapon stays raised after use
  inCar: null,          // car the player is driving, or null
  job: 0,               // index into the story chain (missions.js)
  jobStep: 0,
  storyDone: false,
  rankName: 'Nobody',
  targetPos: null,      // current GPS target {x,z,label}
  route: [],            // GPS polyline of {x,z}
  dead: false,
  debug: {},            // hooks used by the screenshot/probe harness
};

var RANKS = [
  [0, 'Nobody'], [500, 'Runner'], [1500, 'Hustler'],
  [3000, 'Fixer'], [4500, 'Captain'], [6000, 'Kingpin'],
];
function rankFor(earned) {
  var name = RANKS[0][1];
  for (var i = 0; i < RANKS.length; i++) if (earned >= RANKS[i][0]) name = RANKS[i][1];
  return name;
}

// Persistence: cash, lifetime earnings, armor and story progress.
var SAVE_KEY = 'coral-bay-syndicate-save-v1';
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash, earned: G.earned, armor: G.armor,
      job: G.job, ammo: G.ammo, weapon: G.weapon,
    }));
  } catch (e) { /* storage unavailable: session-only play */ }
}
function loadGame() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    var s = raw ? JSON.parse(raw) : null;
    if (!s) return;
    G.cash = s.cash | 0; G.earned = s.earned | 0; G.armor = clamp(s.armor | 0, 0, 100);
    G.job = clamp(s.job | 0, 0, 6); G.ammo = s.ammo || G.ammo; G.weapon = s.weapon | 0;
    if (G.job >= 6) G.storyDone = true;
  } catch (e) { /* fresh start */ }
}

// Collision: push a point (with radius r) out of every nearby collider
// circle. Uses the bucket grid built via addCollider so it stays cheap
// with 800+ colliders. Returns the corrected [x, z].
function collideXZ(x, z, r) {
  var cell = 80, gx = Math.floor(x / cell), gz = Math.floor(z / cell);
  for (var a = gx - 1; a <= gx + 1; a++) for (var b = gz - 1; b <= gz + 1; b++) {
    var list = G.colGrid[a + ',' + b]; if (!list) continue;
    for (var i = 0; i < list.length; i++) {
      var c = list[i], dx = x - c.x, dz = z - c.z, rad = r + c.r;
      var d2 = dx * dx + dz * dz;
      if (d2 < rad * rad && d2 > 0.0001) {
        var d = Math.sqrt(d2); x = c.x + dx / d * rad; z = c.z + dz / d * rad;
      }
    }
  }
  return [x, z];
}
function addCollider(x, z, r) {
  var c = { x: x, z: z, r: r };
  G.colliders.push(c);
  var cell = 80, gx = Math.floor(x / cell), gz = Math.floor(z / cell);
  for (var a = gx - 1; a <= gx + 1; a++) for (var b = gz - 1; b <= gz + 1; b++) {
    var k = a + ',' + b;
    (G.colGrid[k] = G.colGrid[k] || []).push(c);
  }
}
