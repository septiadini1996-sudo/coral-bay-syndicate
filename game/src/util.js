// util.js — shared helpers for Coral Bay Syndicate: seeded randomness, maths,
// vectors on the ground plane, and the road-graph search the GPS runs on.
// Everything hangs off one global state object, W, created here and filled in
// by the other files as the world boots.

'use strict';

// mulberry32: a small deterministic generator. The world is built from one
// seed so a staged screenshot is the same scene every time it is taken.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = makeRng(20261122);
function reseed(seed) { rng = makeRng(seed); }
function rand(a, b) { return a + rng() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(list) { return list[Math.floor(rng() * list.length) % list.length]; }
function chance(p) { return rng() < p; }

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

// Headings are angles where 0 faces +z (south, toward the water) and the
// forward vector is (sin h, cos h) on the ground plane.
const fwdX = h => Math.sin(h), fwdZ = h => Math.cos(h);
// Right of a forward vector: driving east, your right hand points south.
const rightX = h => Math.cos(h), rightZ = h => -Math.sin(h);

function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function angTurn(cur, want, maxStep) {
  const d = angDiff(want, cur);
  return cur + clamp(d, -maxStep, maxStep);
}
const headingTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

// Dijkstra over the road graph: nodes are {x, z, edges: [{to, len}]}.
// Returns the list of node indices from start to goal, or null.
function findRoute(graph, start, goal) {
  const n = graph.length;
  const d = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  d[start] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < best) { best = d[i]; u = i; }
    if (u < 0) break;
    done[u] = true;
    if (u === goal) break;
    for (const e of graph[u].edges) {
      const nd = d[u] + e.len;
      if (nd < d[e.to]) { d[e.to] = nd; prev[e.to] = u; }
    }
  }
  if (d[goal] === Infinity) return null;
  const path = [];
  for (let u = goal; u !== -1; u = prev[u]) path.push(u);
  return path.reverse();
}

function nearestNode(graph, x, z) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < graph.length; i++) {
    const dd = dist2(x, z, graph[i].x, graph[i].z);
    if (dd < bd) { bd = dd; bi = i; }
  }
  return bi;
}

// The one shared world state. Files add their systems to it as they load.
const W = {
  time: 0,            // game seconds since boot (frozen while paused)
  clockMin: 17 * 60 + 20, // the HUD clock starts in the golden hour
  paused: false,
  started: false,
  over: false,
  scene: null, camera: null, renderer: null,
  graph: [], buildings: [], lights: [],
  cars: [], peds: [], cops: [], bullets: [],
  player: null, heli: null, roadblocks: [],
  wanted: 0, heatSeen: 0, bust: 0,
  money: 250, earned: 0,
  missionIndex: 0, mission: null, sideJob: null,
  save: null,
  keys: {}, mouseDX: 0, mouseDY: 0, firing: false, aiming: false,
  shot: null,
};
