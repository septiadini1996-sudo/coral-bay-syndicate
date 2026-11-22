// world.js — Coral Bay itself: the road graph, the ground painted as one big
// canvas (roads, blocks, beach), buildings, palms, the marina, traffic
// lights, and the golden-hour lighting rig that is the game's signature.

'use strict';

const ROAD_VX = [-180, -120, -60, 0, 60, 120, 180];   // north-south avenues
const ROAD_HZ = [-150, -90, -30, 30, 90];             // east-west streets
const COAST_Z = 132;                                   // the coast road
const WATER_Z = 156;                                   // where the sea begins
const ROAD_W = 13;

// --- the road graph: nodes at every crossing, edges along every road ------
function buildGraph() {
  const nodes = [], index = new Map();
  const add = (x, z) => {
    const k = x + ',' + z;
    if (index.has(k)) return index.get(k);
    index.set(k, nodes.length);
    nodes.push({ x, z, edges: [] });
    return nodes.length - 1;
  };
  const link = (a, b) => {
    const A = nodes[a], B = nodes[b];
    const len = dist(A.x, A.z, B.x, B.z);
    A.edges.push({ to: b, len }); B.edges.push({ to: a, len });
  };
  for (const x of ROAD_VX) for (const z of ROAD_HZ) add(x, z);
  for (const x of ROAD_VX) add(x, COAST_Z);
  for (const z of ROAD_HZ) { add(-204, z); add(204, z); }
  for (const x of ROAD_VX) add(x, -176);
  add(-204, COAST_Z); add(204, COAST_Z);
  add(150, COAST_Z); add(196, COAST_Z); add(173, WATER_Z); add(173, 178);
  for (const x of ROAD_VX) { // avenues run from the north edge to the coast
    const col = [-176, ...ROAD_HZ, COAST_Z].map(z => index.get(x + ',' + z));
    for (let i = 0; i + 1 < col.length; i++) link(col[i], col[i + 1]);
  }
  for (const z of ROAD_HZ) { // streets run the full width
    const row = [-204, ...ROAD_VX, 204].map(x => index.get(x + ',' + z));
    for (let i = 0; i + 1 < row.length; i++) link(row[i], row[i + 1]);
  }
  const coast = [-204, ...ROAD_VX, 150, 196, 204].map(x => index.get(x + ',' + COAST_Z));
  for (let i = 0; i + 1 < coast.length; i++) link(coast[i], coast[i + 1]);
  link(index.get('150,' + COAST_Z), index.get('173,' + WATER_Z));
  link(index.get('196,' + COAST_Z), index.get('173,' + WATER_Z));
  link(index.get('173,' + WATER_Z), index.get('173,178'));
  return nodes;
}

// Which axis a heading mostly follows: 'ns' travels along z, 'ew' along x.
const axisOf = h => Math.abs(Math.cos(h)) >= Math.abs(Math.sin(h)) ? 'ns' : 'ew';

// One global light cycle for the whole city, driven by game time only, so
// pausing the game freezes every light with it.
function lightState(axis) {
  const t = W.time % 19;
  if (axis === 'ns') return t < 8 ? 'green' : t < 9.5 ? 'yellow' : 'red';
  return t < 9.5 ? 'red' : t < 17.5 ? 'green' : 'yellow';
}

// Is this point on a road, the pier, or dry land the player may use?
function isWater(x, z) { return z > WATER_Z - 2 && !(x > 146 && x < 200 && z < 182); }
function onRoad(x, z) {
  if (z > WATER_Z) return x > 146 && x < 200;
  for (const rx of ROAD_VX) if (Math.abs(x - rx) < ROAD_W / 2 + 1) return true;
  for (const rz of ROAD_HZ) if (Math.abs(z - rz) < ROAD_W / 2 + 1) return true;
  if (Math.abs(z - COAST_Z) < ROAD_W / 2 + 1) return true;
  return false;
}

// --- canvas textures --------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

// The ground: one 2048px painting of the whole peninsula — sand, blocks,
// asphalt with dashed centre lines, crosswalks at every crossing.
function groundTexture() {
  const S = 2048, WORLD = 580, k = S / WORLD, ox = S / 2, oz = S / 2;
  const X = x => ox + x * k, Z = z => oz + z * k;
  return canvasTex(S, S, (g) => {
    g.fillStyle = '#77875a'; g.fillRect(0, 0, S, S);                    // scrub grass
    g.fillStyle = '#9aa07c';
    for (let i = 0; i < 900; i++) g.fillRect(rng() * S, rng() * S, 22, 10);
    g.fillStyle = '#c9b189'; g.fillRect(0, Z(136), S, Z(158) - Z(136)); // beach sand
    g.fillStyle = '#dcc49c'; g.fillRect(0, Z(140), S, 26);
    g.fillStyle = '#8f9296';                                            // city slab
    g.fillRect(X(-212), Z(-184), X(212) - X(-212), Z(140) - Z(-184));
    const road = (x0, z0, x1, z1) => {
      g.fillStyle = '#3c3f45'; g.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
      g.fillStyle = '#c8cdd4';
      g.fillRect(X(x0) - 1, Z(z0) - 1, 2, Z(z1) - Z(z0) + 2);
    };
    for (const x of ROAD_VX) road(x - ROAD_W / 2, -178, x + ROAD_W / 2, COAST_Z);
    for (const z of ROAD_HZ) road(-206, z - ROAD_W / 2, 206, z + ROAD_W / 2);
    road(-206, COAST_Z - ROAD_W / 2, 206, COAST_Z + ROAD_W / 2);
    g.strokeStyle = '#e8c85a'; g.lineWidth = 3; g.setLineDash([16, 14]);
    for (const x of ROAD_VX) { g.beginPath(); g.moveTo(X(x), Z(-178)); g.lineTo(X(x), Z(COAST_Z)); g.stroke(); }
    for (const z of [...ROAD_HZ, COAST_Z]) { g.beginPath(); g.moveTo(X(-206), Z(z)); g.lineTo(X(206), Z(z)); g.stroke(); }
    g.setLineDash([]);
    g.fillStyle = '#dfe3e8';                                            // crosswalks
    for (const x of ROAD_VX) for (const z of [...ROAD_HZ, COAST_Z])
      for (let i = -2; i <= 2; i++) {
        g.fillRect(X(x) + i * 9 - 3, Z(z) - ROAD_W / 2 - 4, 6, 3);
        g.fillRect(X(x) - ROAD_W / 2 - 4, Z(z) + i * 9 - 3, 3, 6);
      }
    g.fillStyle = '#7a5c38'; g.fillRect(X(146), Z(138), X(200) - X(146), Z(180) - Z(138)); // marina deck
    g.fillStyle = '#8a6a42';
    for (let x = 148; x < 200; x += 6) g.fillRect(X(x), Z(138), 2, Z(180) - Z(138));
  });
}

function windowTexture() {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#5a5148'; g.fillRect(0, 0, 128, 256);
    for (let y = 8; y < 244; y += 16) for (let x = 8; x < 118; x += 14) {
      const lit = rng() < 0.42;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffd489' : '#bfe3ff') : '#2c3138';
      g.fillRect(x, y, 9, 10);
    }
  });
}

function leafTexture() {
  return canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = '#3f7a34'; g.lineWidth = 5; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI - 0.4;
      g.beginPath(); g.moveTo(10, 118);
      g.quadraticCurveTo(10 + Math.cos(a) * 60, 118 - Math.sin(a) * 70, 10 + Math.cos(a) * 112, 118 - Math.sin(a) * 96);
      g.stroke();
    }
  });
}

// --- the build ---------------------------------------------------------------
function buildWorld() {
  const scene = W.scene;
  W.graph = buildGraph();

  // Golden hour: low warm sun in the west, peach sky, warm haze.
  scene.fog = new THREE.Fog(0xf0a56e, 160, 820);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 12),
    new THREE.MeshBasicMaterial({
      side: THREE.BackSide, fog: false,
      map: canvasTex(64, 512, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#2e4a7a'); gr.addColorStop(0.42, '#7fa6c9');
        gr.addColorStop(0.62, '#f7b267'); gr.addColorStop(0.72, '#ffcf8f');
        gr.addColorStop(1, '#8a5a44');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }),
    }));
  scene.add(sky);
  const sunDir = new THREE.Vector3(-0.62, 0.30, 0.42).normalize();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTex(256, 256, (g) => {
      const gr = g.createRadialGradient(128, 128, 8, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,236,190,1)'); gr.addColorStop(0.25, 'rgba(255,190,110,0.55)');
      gr.addColorStop(1, 'rgba(255,160,80,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    }),
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  glow.position.copy(sunDir).multiplyScalar(1350); glow.scale.setScalar(620);
  scene.add(glow);

  const sun = new THREE.DirectionalLight(0xffb066, 3.1);
  sun.position.copy(sunDir).multiplyScalar(320);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -300; sun.shadow.camera.right = 300;
  sun.shadow.camera.top = 300; sun.shadow.camera.bottom = -300;
  sun.shadow.camera.far = 900; sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  W.sun = sun;
  scene.add(new THREE.HemisphereLight(0xffd9a8, 0x3d4a5a, 0.95));
  scene.add(new THREE.AmbientLight(0xff9a5c, 0.35));

  // Ground and sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(580, 580),
    new THREE.MeshLambertMaterial({ map: groundTexture() }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const seaTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#2d6a8a'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(255,190,120,0.20)';
    for (let i = 0; i < 260; i++) g.fillRect(rng() * 256, rng() * 256, rand(6, 26), 2);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 200; i++) g.fillRect(rng() * 256, rng() * 256, rand(4, 14), 1);
  });
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping; seaTex.repeat.set(10, 6);
  W.seaTex = seaTex;
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 420),
    new THREE.MeshPhongMaterial({ map: seaTex, shininess: 160, specular: 0xffc890 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.4, WATER_Z + 205);
  scene.add(sea);
  // A bright sun-streak on the water, aimed back at the low sun.
  const streak = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 380),
    new THREE.MeshBasicMaterial({ color: 0xffbe78, transparent: true, opacity: 0.20, blending: THREE.AdditiveBlending, depthWrite: false }));
  streak.rotation.x = -Math.PI / 2; streak.position.set(-120, -0.2, WATER_Z + 180);
  scene.add(streak);

  buildBlocks();
  buildPalmsAndBeach();
  buildMarina();
  buildLights();
}

// Buildings fill each block, tallest downtown around (0,-30). Every block
// leaves a sidewalk rim; footprints go into W.buildings as AABBs for hits.
function buildBlocks() {
  const scene = W.scene, winTex = windowTexture();
  const palette = [0xd9c6a5, 0xb8c4c9, 0xe0b48f, 0x9fb4bd, 0xcbb7d9, 0xe8dcc3, 0xa8bfb0, 0xd98f6a];
  const xs = [-212, ...ROAD_VX, 212], zs = [-184, ...ROAD_HZ, 140];
  const geoCache = new Map();
  const box = (w, h, d) => {
    const k = w + 'x' + h + 'x' + d;
    if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
    return geoCache.get(k);
  };
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    const x0 = xs[i] + ROAD_W / 2 + 3, x1 = xs[i + 1] - ROAD_W / 2 - 3;
    const z0 = zs[j] + ROAD_W / 2 + 3, z1 = zs[j + 1] - ROAD_W / 2 - 3;
    if (x1 - x0 < 16 || z1 - z0 < 16) continue;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const downtown = Math.max(0, 1 - dist(cx, cz, 0, -30) / 190);
    const plots = downtown > 0.45 ? 2 : randi(2, 3);
    for (let p = 0; p < plots; p++) {
      const w = rand(12, Math.max(14, (x1 - x0) / plots - 4));
      const d = rand(12, Math.max(14, (z1 - z0) - 8));
      const h = downtown > 0.45 ? rand(24, 52 + downtown * 26) : rand(8, 24);
      const bx = clamp(cx + rand(-1, 1) * (x1 - x0) / 4 + (p - (plots - 1) / 2) * ((x1 - x0) / plots), x0 + w / 2, x1 - w / 2);
      const bz = clamp(cz + rand(-3, 3), z0 + d / 2, z1 - d / 2);
      const mat = new THREE.MeshLambertMaterial({ map: winTex, color: pick(palette) });
      const m = new THREE.Mesh(box(Math.round(w), Math.round(h), Math.round(d)), mat);
      m.position.set(bx, h / 2, bz);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      const roof = new THREE.Mesh(box(Math.round(w) + 1, 1, Math.round(d) + 1),
        new THREE.MeshLambertMaterial({ color: 0x4c4640 }));
      roof.position.set(bx, h + 0.5, bz); scene.add(roof);
      W.buildings.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2, h });
    }
  }
}

function buildPalmsAndBeach() {
  const scene = W.scene;
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const leafMat = new THREE.MeshLambertMaterial({ map: leafTexture(), transparent: true, side: THREE.DoubleSide, alphaTest: 0.35 });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6);
  const leafGeo = new THREE.PlaneGeometry(4.6, 4.6);
  const palm = (x, z, s) => {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.2; trunk.rotation.z = rand(-0.09, 0.09); trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = 6.4; leaf.rotation.set(-0.7, (i / 6) * Math.PI * 2, 0, 'YXZ');
      leaf.translateY(1.6);
      g.add(leaf);
    }
    g.position.set(x, 0, z); g.scale.setScalar(s || rand(0.85, 1.25));
    scene.add(g);
  };
  for (let x = -200; x <= 200; x += 15) { palm(x + rand(-2, 2), 121.5); palm(x + rand(-2, 2), 143.5); }
  for (const x of ROAD_VX) for (const z of ROAD_HZ) if (chance(0.5)) palm(x + 10.5, z + 10.5);
  for (let i = 0; i < 26; i++) palm(rand(-205, 205), rand(143, 152)); // beach palms
  // Beach umbrellas and towels: small cones of bright colour on the sand.
  const umbGeo = new THREE.ConeGeometry(2.2, 0.9, 8);
  for (let i = 0; i < 14; i++) {
    const u = new THREE.Mesh(umbGeo, new THREE.MeshLambertMaterial({ color: pick([0xff6b6b, 0xffd93d, 0x6bcbff, 0xff9ff3]) }));
    u.position.set(rand(-195, 195), 1.7, rand(143, 151)); u.castShadow = true;
    W.scene.add(u);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 5), trunkMat);
    pole.position.set(u.position.x, 0.9, u.position.z); W.scene.add(pole);
  }
}

// The marina: deck, moored boats that bob, and a harbormaster hut — the
// story's home turf on the south-east water.
function buildMarina() {
  const scene = W.scene;
  const hullCols = [0xf2f2f2, 0x3f7fbf, 0xd95f4b, 0x39a06b, 0xf2c14e];
  W.boats = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 8.5),
      new THREE.MeshPhongMaterial({ color: pick(hullCols), shininess: 60 }));
    hull.position.y = 0.4; b.add(hull);
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.1, 3, 1),
      hull.material);
    bow.rotation.y = Math.PI; bow.position.set(0, 0.4, 4.9); bow.scale.set(1, 1, 0.9); b.add(bow);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 3),
      new THREE.MeshLambertMaterial({ color: 0xf5f0e6 }));
    cabin.position.set(0, 1.4, -0.6); b.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7, 5),
      new THREE.MeshLambertMaterial({ color: 0xcccccc }));
    mast.position.set(0, 4.4, 1.2); b.add(mast);
    b.position.set(i % 2 ? 156 : 190, 0, 150 + Math.floor(i / 2) * 11 + (i % 2) * 4);
    if (i % 2) b.rotation.y = Math.PI;
    b.userData.phase = rand(0, 6);
    scene.add(b); W.boats.push(b);
  }
  const hut = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 7),
    new THREE.MeshLambertMaterial({ color: 0xffe1a8 }));
  hut.position.set(152, 2, 141); hut.castShadow = true; scene.add(hut);
  const hutRoof = new THREE.Mesh(new THREE.ConeGeometry(7.4, 2.4, 4),
    new THREE.MeshLambertMaterial({ color: 0xc2543a }));
  hutRoof.position.set(152, 5.2, 141); hutRoof.rotation.y = Math.PI / 4; scene.add(hutRoof);
  W.buildings.push({ x0: 147.5, x1: 156.5, z0: 137.5, z1: 144.5, h: 4 });
}

// One signal head per intersection approach; the lamp materials are shared
// per state so a whole city changes colour in three material writes.
function buildLights() {
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3236 });
  W.lampMats = {
    red: new THREE.MeshBasicMaterial({ color: 0x3a1512 }),
    yellow: new THREE.MeshBasicMaterial({ color: 0x3a2f10 }),
    green: new THREE.MeshBasicMaterial({ color: 0x10351a }),
  };
  W.lampOn = {
    red: new THREE.MeshBasicMaterial({ color: 0xff2d20 }),
    yellow: new THREE.MeshBasicMaterial({ color: 0xffcc00 }),
    green: new THREE.MeshBasicMaterial({ color: 0x2eff6a }),
  };
  const headGeo = new THREE.BoxGeometry(0.5, 1.3, 0.4);
  const lampGeo = new THREE.SphereGeometry(0.16, 8, 6);
  for (const x of ROAD_VX) for (const z of [...ROAD_HZ, COAST_Z]) {
    for (const axis of ['ns', 'ew']) {
      const g = new THREE.Group();
      const dx = axis === 'ns' ? 8.6 : 0, dz = axis === 'ns' ? 0 : 8.6;
      g.position.set(x + dx, 0, z + dz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5.4, 6), poleMat);
      pole.position.y = 2.7; g.add(pole);
      const head = new THREE.Mesh(headGeo, poleMat);
      head.position.y = 5.6; g.add(head);
      const lamps = {};
      ['red', 'yellow', 'green'].forEach((c, i) => {
        const lamp = new THREE.Mesh(lampGeo, W.lampMats[c]);
        lamp.position.set(0, 6.05 - i * 0.42, 0.24);
        g.add(lamp); lamps[c] = lamp;
      });
      g.userData = { axis, lamps };
      W.scene.add(g);
      W.lights.push(g);
    }
  }
}

// Per-frame world upkeep: light faces, bobbing boats, drifting sea sparkle,
// and the shadow frustum trailing the player so shadows stay crisp.
function updateWorld(dt) {
  const ns = lightState('ns'), ew = lightState('ew');
  for (const g of W.lights) {
    const on = g.userData.axis === 'ns' ? ns : ew, lamps = g.userData.lamps;
    for (const c of ['red', 'yellow', 'green'])
      lamps[c].material = c === on ? W.lampOn[c] : W.lampMats[c];
  }
  for (const b of W.boats) {
    b.position.y = Math.sin(W.time * 0.9 + b.userData.phase) * 0.16 - 0.1;
    b.rotation.z = Math.sin(W.time * 0.7 + b.userData.phase) * 0.03;
  }
  W.seaTex.offset.y = (W.time * 0.008) % 1;
  W.seaTex.offset.x = Math.sin(W.time * 0.05) * 0.02;
  const p = W.player;
  if (p && W.sun) {
    const px = p.car ? p.car.x : p.x, pz = p.car ? p.car.z : p.z;
    W.sun.position.set(px - 200, 96, pz + 135);
    W.sun.target.position.set(px, 0, pz);
  }
}

// Solid-building push-out for a point with radius r; returns corrected x,z.
function collideBuildings(x, z, r) {
  for (const b of W.buildings) {
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) {
      const pl = x - (b.x0 - r), pr = (b.x1 + r) - x, pt = z - (b.z0 - r), pb = (b.z1 + r) - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = b.x0 - r; else if (m === pr) x = b.x1 + r;
      else if (m === pt) z = b.z0 - r; else z = b.z1 + r;
    }
  }
  return [x, z];
}
