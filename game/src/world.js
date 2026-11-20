// Coral Bay Syndicate - world.js
// Builds the whole city into the three.js scene: the road grid, city
// blocks with named buildings, parks, street lamps, traffic lights,
// the beach and the marina pier, plus the road graph that GPS
// navigation and the AI drivers share. Also owns collision data for
// every solid object and the traffic-light clock.

'use strict';

var ROAD_STEP = 160, ROAD_HALF = 13, CITY = 1280;   // roads at -1280..1280
var MAT = {};                                        // shared materials
var signTex = {};                                    // name -> canvas texture

function lam(color) { return new THREE.MeshLambertMaterial({ color: color }); }

var BUILDING_NAMES = [
  'CORAL BANK', 'HOTEL AZURE', 'BAYVIEW MALL', 'NEON CLUB', 'PIER 9 DINER',
  'MARINA YACHT CLUB', 'CITY HALL', 'PALMS HOTEL', 'OCEANIC TOWER', 'SYNDICATE GARAGE',
  'TIDE POOL SPA', 'THE GILDED CLAM', 'BAY BOOKS', 'CORAL CINEMA', 'SUNSET GYM',
  'HARBOR PHARMACY', 'VISTA CONDOS', 'THE SALTY ANCHOR', 'PALM COURT', 'AZURE ARCADE',
  'BAYVIEW BAKERY', 'CORAL CASINO', 'SEABREEZE CAFE', 'TIDE TOWER', 'MARLIN HOTEL',
  'SHELL MARKET', 'NEON MOTEL', 'BAY LEGAL', 'CORAL DENTAL', 'WAVE RECORDS',
];
var BUILDING_COLORS = [0xf2e3c9, 0xe8b4a0, 0xa8d8ea, 0xf7d774, 0xd3e6c3, 0xf0a6c0,
  0xc9c2e0, 0xffe0bd, 0xb5d6b2, 0xf5f5f5, 0xe6cfa8, 0x9fd8d0];

function makeSignTexture(name) {
  if (signTex[name]) return signTex[name];
  var cv = document.createElement('canvas'); cv.width = 512; cv.height = 112;
  var c = cv.getContext('2d');
  c.fillStyle = '#12283f'; c.fillRect(0, 0, 512, 112);
  c.strokeStyle = '#ffd75e'; c.lineWidth = 6; c.strokeRect(6, 6, 500, 100);
  c.fillStyle = '#ffe9a8'; c.font = 'bold 52px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
  var size = 52; while (c.measureText(name).width > 470 && size > 20) { size -= 4; c.font = 'bold ' + size + 'px Arial'; }
  c.fillText(name, 256, 58);
  var tx = new THREE.CanvasTexture(cv);
  signTex[name] = tx; return tx;
}

function box(w, h, d, mat, x, y, z, parent) {
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); (parent || G.scene).add(m); return m;
}

function buildWorld() {
  var s = G.scene;
  s.background = new THREE.Color(0x8ec9e8);
  s.fog = new THREE.Fog(0x9fd0e8, 500, 2400);
  s.add(new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.95));
  var sun = new THREE.DirectionalLight(0xfff2d0, 1.1);
  sun.position.set(600, 900, 300); s.add(sun);

  MAT.asphalt = lam(0x3c4147); MAT.walk = lam(0xb9b3a4); MAT.sand = lam(0xe8d49a);
  MAT.grass = lam(0x6fbf5e); MAT.trunk = lam(0x7a5230); MAT.leaf = lam(0x3e9e4f);
  MAT.palmLeaf = lam(0x4caf6d); MAT.wood = lam(0x9a6b42); MAT.white = lam(0xf4f4f4);
  MAT.dark = lam(0x2b2f36); MAT.water = new THREE.MeshLambertMaterial({ color: 0x1e7fa8, transparent: true, opacity: 0.86 });
  MAT.roof = lam(0x6b5a4a); MAT.gold = new THREE.MeshBasicMaterial({ color: 0xffd75e });

  // Ground base under everything, then the road planes with dashes.
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200), lam(0x9aa08e));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.08; s.add(ground);
  var dashTex = makeDashTexture();
  for (var k = 0; k <= 16; k++) {
    var p = -CITY + k * ROAD_STEP;
    roadPlane(p, 0, true, dashTex); roadPlane(0, p, false, dashTex);
  }
  buildBlocks(); buildBeachAndMarina(); buildLamps(); buildLights(); buildGraph();
  // Invisible wall around the playable world so nobody leaves the map.
  G.bounds = 1560;
}

function makeDashTexture() {
  var cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
  var c = cv.getContext('2d');
  c.fillStyle = '#3c4147'; c.fillRect(0, 0, 64, 256);
  c.fillStyle = '#e8e4d2'; c.fillRect(28, 20, 8, 90);
  var tx = new THREE.CanvasTexture(cv);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1, 22);
  return tx;
}
function roadPlane(x, z, vertical, tex) {
  var m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, CITY * 2 + 60),
    new THREE.MeshLambertMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2; if (!vertical) m.rotation.z = Math.PI / 2;
  m.position.set(x, 0.0, z); G.scene.add(m);
}

function buildBlocks() {
  var walkGeo = new THREE.BoxGeometry(134, 0.5, 134);
  for (var bx = 0; bx < 16; bx++) for (var bz = 0; bz < 16; bz++) {
    var cx = -CITY + bx * ROAD_STEP + 80, cz = -CITY + bz * ROAD_STEP + 80;
    var isPark = (bx === 4 && bz === 5) || (bx === 11 && bz === 10);
    var base = new THREE.Mesh(walkGeo, isPark ? MAT.grass : MAT.walk);
    base.position.set(cx, 0.05, cz); G.scene.add(base);
    if (isPark) { scatterTrees(cx, cz, 9); continue; }
    var south = bz >= 13;                       // marina district: keep it low
    var style = rnd();
    if (style < 0.42) {                          // one tower per block
      placeBuilding(cx, cz, rr(62, 96), rr(62, 96), south ? rr(14, 30) : rr(35, 115));
    } else if (style < 0.78) {                   // two slabs
      placeBuilding(cx - 34, cz, rr(46, 58), rr(70, 100), south ? rr(10, 22) : rr(18, 60));
      placeBuilding(cx + 34, cz, rr(46, 58), rr(70, 100), south ? rr(10, 22) : rr(18, 60));
    } else {                                     // four corner shops
      placeBuilding(cx - 34, cz - 34, rr(44, 56), rr(44, 56), rr(9, 20));
      placeBuilding(cx + 34, cz - 34, rr(44, 56), rr(44, 56), rr(9, 20));
      placeBuilding(cx - 34, cz + 34, rr(44, 56), rr(44, 56), rr(9, 20));
      placeBuilding(cx + 34, cz + 34, rr(44, 56), rr(44, 56), rr(9, 20));
    }
    if (rnd() < 0.6) scatterTrees(cx + rr(-50, 50), cz + rr(-50, 50), 1);
  }
}

function placeBuilding(x, z, w, d, h) {
  var mat = lam(pick(BUILDING_COLORS));
  var b = box(w, h, d, mat, x, h / 2 + 0.3, z);
  box(w + 3, 1.6, d + 3, MAT.roof, x, h + 0.9, z);                    // parapet cap
  // Window stripes: thin darker bands read as floors from a distance.
  var floors = Math.floor(h / 9);
  for (var f = 1; f <= floors; f++) {
    var band = box(w + 0.3, 1.1, d + 0.3, MAT.dark, x, f * 9, z);
    band.material = lam(0x33404d);
  }
  // Big readable name board on the roof edge facing the street.
  if (rnd() < 0.82) {
    var name = pick(BUILDING_NAMES);
    var sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.94, 46), 9),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(name) }));
    var south = rnd() < 0.5;
    sign.position.set(x, h + 5.4, z + (south ? d / 2 + 1.6 : -d / 2 - 1.6));
    if (!south) sign.rotation.y = Math.PI;
    G.scene.add(sign);
    var back = box(Math.min(w * 0.94, 46) + 1, 10, 0.8, MAT.dark, x, h + 5.2, z + (south ? d / 2 + 1.2 : -d / 2 - 1.2));
    back.castShadow = false;
  }
  addCollider(x, z, Math.max(w, d) * 0.60);
  return b;
}

var trunkGeo, leafGeo, palmGeo;
function scatterTrees(cx, cz, n) {
  if (!trunkGeo) {
    trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 5, 6);
    leafGeo = new THREE.SphereGeometry(3.4, 8, 6);
    palmGeo = new THREE.ConeGeometry(4.4, 2.2, 7);
  }
  for (var i = 0; i < n; i++) {
    var x = cx + rr(-52, 52), z = cz + rr(-52, 52);
    var palm = rnd() < 0.45;
    var tr = new THREE.Mesh(trunkGeo, MAT.trunk);
    tr.position.set(x, 2.5, z); tr.rotation.z = palm ? rr(-0.14, 0.14) : 0; G.scene.add(tr);
    var top = new THREE.Mesh(palm ? palmGeo : leafGeo, palm ? MAT.palmLeaf : MAT.leaf);
    top.position.set(x + (palm ? 0.6 : 0), palm ? 5.6 : 6.4, z); G.scene.add(top);
    addCollider(x, z, 0.9);
  }
}

function buildBeachAndMarina() {
  var s = G.scene;
  var sand = new THREE.Mesh(new THREE.PlaneGeometry(4200, 260), MAT.sand);
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, 1420); s.add(sand);
  var water = new THREE.Mesh(new THREE.PlaneGeometry(4200, 1600), MAT.water);
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.35, 2240); s.add(water);
  G.waterMesh = water;
  // The pier: a wooden deck running south from the promenade at x=0.
  // No colliders on its walking line: Celia waits at the end and the
  // player MUST be able to reach her on foot.
  var deck = box(16, 0.5, 230, MAT.wood, 0, 0.05, 1415);
  deck.material = lam(0x8a6242);
  for (var i = 0; i < 9; i++) {                       // pier lamps, decor only
    box(0.4, 4.4, 0.4, MAT.dark, -7.4, 2.2, 1330 + i * 26);
    box(0.4, 4.4, 0.4, MAT.dark, 7.4, 2.2, 1330 + i * 26);
  }
  for (var bIdx = 0; bIdx < 6; bIdx++) buildBoat(bIdx % 2 ? 26 : -26, 1360 + bIdx * 30);
  // Beach palms in two loose rows, kept off the pier path (|x| < 12).
  for (var px = -1240; px <= 1240; px += 44) {
    if (Math.abs(px) < 16) continue;
    scatterTrees(px + rr(-6, 6), 1338 + rr(-4, 10), 1);
    if (rnd() < 0.5) scatterTrees(px + rr(-8, 8), 1386 + rr(-4, 6), 1);
  }
  // Crates and a small dock office near the pier root.
  box(10, 6, 8, lam(0xd8cfb8), 30, 3.3, 1330);
  addCollider(30, 1330, 6);
  for (var ci = 0; ci < 5; ci++) {
    var cxp = -34 + ci * 4.4, czp = 1346 + (ci % 2) * 4;
    box(3.6, 3.6, 3.6, lam(0xb08954), cxp, 2.1, czp); addCollider(cxp, czp, 2.4);
  }
}

function buildBoat(x, z) {
  var g = new THREE.Group();
  var hull = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 13), lam(pick([0xffffff, 0x3f7fbf, 0xd84f4f, 0x2fbf9f])));
  hull.position.y = 0.4; g.add(hull);
  var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 11, 5), MAT.dark);
  mast.position.y = 6; g.add(mast);
  var sail = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 7), new THREE.MeshLambertMaterial({ color: 0xf8f4e4, side: THREE.DoubleSide }));
  sail.position.set(0, 6, 1.4); g.add(sail);
  g.position.set(x, -0.2, z); g.rotation.y = rr(-0.2, 0.2);
  G.scene.add(g);
}

// ~270 street lamps: instanced poles + heads, real colliders.
function buildLamps() {
  var spots = [];
  for (var i = 0; i <= 16; i++) for (var j = 0; j <= 16; j++) {
    if (rnd() < 0.62) spots.push([-CITY + i * ROAD_STEP + 15, -CITY + j * ROAD_STEP + 15]);
  }
  for (var k = 0; k <= 8; k++) for (var z = -1200; z <= 1200; z += 240) {
    spots.push([-CITY + k * 320 - 15, z]);
  }
  var poleGeo = new THREE.CylinderGeometry(0.22, 0.3, 7.5, 5);
  var headGeo = new THREE.BoxGeometry(1.7, 0.5, 0.7);
  var poles = new THREE.InstancedMesh(poleGeo, MAT.dark, spots.length);
  var heads = new THREE.InstancedMesh(headGeo, lam(0xffe9a8), spots.length);
  var m4 = new THREE.Matrix4();
  for (var n = 0; n < spots.length; n++) {
    m4.makeTranslation(spots[n][0], 3.75, spots[n][1]); poles.setMatrixAt(n, m4);
    m4.makeTranslation(spots[n][0], 7.6, spots[n][1]); heads.setMatrixAt(n, m4);
    addCollider(spots[n][0], spots[n][1], 0.55);
  }
  G.scene.add(poles); G.scene.add(heads);
  G.lampCount = spots.length;
}

// Traffic lights at 10 intersections. One clock drives them all with
// per-light offsets; cars ask lightIsRed(x, z, dx, dz) before entering.
var LIGHT_SPOTS = [[0, 0], [160, 160], [-160, -160], [320, 0], [-320, 0],
  [0, 320], [0, -320], [480, 480], [-480, -480], [160, -320]];
var lightLampMats = {
  red: new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
  yellow: new THREE.MeshBasicMaterial({ color: 0xffcc00 }),
  green: new THREE.MeshBasicMaterial({ color: 0x2fe07a }),
  off: new THREE.MeshBasicMaterial({ color: 0x2c313a }),
};
function buildLights() {
  for (var i = 0; i < LIGHT_SPOTS.length; i++) {
    var x = LIGHT_SPOTS[i][0], z = LIGHT_SPOTS[i][1];
    var L = { x: x, z: z, off: i * 3.7, heads: [] };
    var corners = [[14, 14], [-14, -14], [14, -14], [-14, 14]];
    for (var ci = 0; ci < 4; ci++) {
      var cx = x + corners[ci][0], cz = z + corners[ci][1];
      box(0.35, 5.6, 0.35, MAT.dark, cx, 2.8, cz);
      var headBox = box(1.1, 2.6, 1.1, MAT.dark, cx, 6.4, cz);
      // Each corner head serves the approach facing it: heads on the
      // +x/-x corners show the E-W state, +z/-z corners the N-S state.
      var axis = (ci < 2) ? 'ns' : 'ew';
      var lamps = {};
      var cols = ['red', 'yellow', 'green'];
      for (var li = 0; li < 3; li++) {
        var lampMesh = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), lightLampMats.off);
        lampMesh.position.set(cx + (corners[ci][0] > 0 ? -0.6 : 0.6), 7.3 - li * 0.85, cz + (corners[ci][1] > 0 ? -0.6 : 0.6));
        G.scene.add(lampMesh);
        lamps[cols[li]] = lampMesh;
      }
      L.heads.push({ axis: axis, lamps: lamps });
      addCollider(cx, cz, 0.5);
    }
    G.lights.push(L);
  }
}
// phase: 0..13.7s cycle. NS green 0-5.5, NS yellow 5.5-6.8,
// EW green 6.8-12.3, EW yellow 12.3-13.7.
function lightPhase(L) { return (G.t + L.off) % 13.7; }
function lightState(L, axis) {
  var p = lightPhase(L);
  if (axis === 'ns') return p < 5.5 ? 'green' : (p < 6.8 ? 'yellow' : 'red');
  return p < 6.8 ? 'red' : (p < 12.3 ? 'green' : 'yellow');
}
function lightNear(x, z) {
  for (var i = 0; i < G.lights.length; i++) {
    var L = G.lights[i];
    if (Math.abs(x - L.x) < 4 && Math.abs(z - L.z) < 4) return L;
  }
  return null;
}
function lightIsRed(x, z, dx, dz) {
  var L = lightNear(x, z); if (!L) return false;
  var axis = Math.abs(dz) > Math.abs(dx) ? 'ns' : 'ew';
  var st = lightState(L, axis);
  return st === 'red' || st === 'yellow';
}
function tickLights() {
  for (var i = 0; i < G.lights.length; i++) {
    var L = G.lights[i];
    for (var h = 0; h < L.heads.length; h++) {
      var st = lightState(L, L.heads[h].axis), lamps = L.heads[h].lamps;
      lamps.red.material = st === 'red' ? lightLampMats.red : lightLampMats.off;
      lamps.yellow.material = st === 'yellow' ? lightLampMats.yellow : lightLampMats.off;
      lamps.green.material = st === 'green' ? lightLampMats.green : lightLampMats.off;
    }
  }
  if (G.waterMesh) G.waterMesh.position.y = -0.35 + Math.sin(G.t * 0.7) * 0.06;
}

// Road graph + Dijkstra -------------------------------------------
function buildGraph() {
  for (var i = 0; i <= 16; i++) for (var j = 0; j <= 16; j++) {
    var idx = G.nodes.length;
    G.nodes.push({ i: i, j: j, x: -CITY + i * ROAD_STEP, z: -CITY + j * ROAD_STEP });
    G.nodeAt[i + ',' + j] = idx;
  }
}
function nearestNode(x, z) {
  var i = clamp(Math.round((x + CITY) / ROAD_STEP), 0, 16);
  var j = clamp(Math.round((z + CITY) / ROAD_STEP), 0, 16);
  return G.nodes[G.nodeAt[i + ',' + j]];
}
function routeNodes(fromX, fromZ, toX, toZ) {
  var start = nearestNode(fromX, fromZ), goal = nearestNode(toX, toZ);
  var dist = {}, prev = {}, seen = {}, key = function (n) { return n.i + ',' + n.j; };
  dist[key(start)] = 0;
  var cur = start, guard = 0;
  while (cur && guard++ < 2000) {
    if (cur === goal) break;
    seen[key(cur)] = 1;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var d = 0; d < 4; d++) {
      var ni = cur.i + dirs[d][0], nj = cur.j + dirs[d][1];
      if (ni < 0 || nj < 0 || ni > 16 || nj > 16) continue;
      var nb = G.nodes[G.nodeAt[ni + ',' + nj]], nd = dist[key(cur)] + ROAD_STEP;
      if (dist[key(nb)] === undefined || nd < dist[key(nb)]) { dist[key(nb)] = nd; prev[key(nb)] = cur; }
    }
    var best = null, bd = Infinity;
    for (var k in dist) if (!seen[k] && dist[k] < bd) { bd = dist[k]; best = G.nodes[G.nodeAt[k]]; }
    cur = best;
  }
  var path = [], n = goal;
  while (n) { path.unshift({ x: n.x, z: n.z }); if (n === start) break; n = prev[key(n)]; }
  return path;
}
// Full GPS route: player position -> road nodes -> exact target.
function computeRoute(tx, tz) {
  var px = G.inCar ? G.inCar.x : G.player.x, pz = G.inCar ? G.inCar.z : G.player.z;
  var path = routeNodes(px, pz, tx, tz);
  path.push({ x: tx, z: tz });
  G.route = path;
  return path;
}
// Shore rule: off the pier the waterline stops you; on the pier you
// can walk to its end. Keeps the marina reachable but not swimmable.
function shoreClamp(x, z) {
  if (z > 1300) {
    if (Math.abs(x) <= 9) z = Math.min(z, 1518);
    else z = Math.min(z, 1406);
  }
  return [x, z];
}
