// util.js — shared mathematics for Coral Bay Syndicate: clamping, interpolation,
// a seeded random generator (so staged screenshot scenes are deterministic),
// angle helpers and Dijkstra shortest paths over the city's road graph.
(function () {
  'use strict';

  const CBS = (window.CBS = window.CBS || {});

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;

  // Wrap an angle to [-PI, PI) so steering always turns the short way.
  function wrapAngle(a) {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
  }

  function angleLerp(a, b, t) {
    return a + wrapAngle(b - a) * clamp(t, 0, 1);
  }

  // Seeded linear congruential generator; reset() makes scenes reproducible.
  let seed = 1877;
  function rng() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function rngReset(s) {
    seed = s >>> 0 || 1;
  }
  const rand = (lo, hi) => lo + rng() * (hi - lo);
  const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];

  const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  // Dijkstra over { nodes: [{x, z, edges: [nodeIndex...] }] }.
  // Returns an array of node indices from start to goal (inclusive), or null.
  function shortestPath(graph, start, goal) {
    if (start === goal) return [start];
    const n = graph.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    dist[start] = 0;
    for (let iter = 0; iter < n; iter++) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        if (!done[i] && dist[i] < best) {
          best = dist[i];
          u = i;
        }
      }
      if (u === -1 || u === goal) break;
      done[u] = 1;
      const un = graph.nodes[u];
      for (const v of un.edges) {
        const vn = graph.nodes[v];
        const w = dist[u] + Math.hypot(un.x - vn.x, un.z - vn.z);
        if (w < dist[v]) {
          dist[v] = w;
          prev[v] = u;
        }
      }
    }
    if (!isFinite(dist[goal])) return null;
    const path = [];
    for (let cur = goal; cur !== -1; cur = prev[cur]) path.push(cur);
    path.reverse();
    return path;
  }

  // $1,250 style money formatting for the HUD.
  function fmtMoney(v) {
    return '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // 17:22 style clock formatting from minutes since midnight.
  function fmtClock(minutes) {
    const m = Math.floor(minutes);
    const hh = String(Math.floor(m / 60) % 24).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return hh + ':' + mm;
  }

  CBS.util = {
    clamp, lerp, wrapAngle, angleLerp, rng, rngReset, rand, randInt, pick,
    dist2D, shortestPath, fmtMoney, fmtClock, TAU,
  };
})();
