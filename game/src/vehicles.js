// vehicles.js — every car in Coral Bay: the mesh factory (hatches, coupes,
// vans, pickups, police cruisers), traffic that follows lanes, keeps gaps and
// obeys the lights, the player's driving physics, damage, fire, explosions,
// and the spike-strip tyre state roadblocks inflict.

'use strict';

const CAR_TYPES = {
  hatch:  { name: 'Hatchback', len: 3.9, wid: 1.8, hgt: 1.05, top: 30, acc: 11, col: [0xd94f3d, 0x3d7bd9, 0xe8b93d, 0x59b06b, 0xd9d9d9, 0x7a4fd0] },
  sedan:  { name: 'Sedan', len: 4.6, wid: 1.9, hgt: 0.95, top: 34, acc: 12, col: [0x2b3a4a, 0x8a1f1f, 0xc0c6cc, 0x274e13, 0x5b2a86, 0xd97c2b] },
  coupe:  { name: 'Coupe', len: 4.4, wid: 1.9, hgt: 0.8,  top: 43, acc: 17, col: [0xffcf3f, 0xff5a3c, 0x22242a, 0x37c8d9, 0xf2f2f2] },
  van:    { name: 'Van', len: 5.2, wid: 2.1, hgt: 1.7,  top: 27, acc: 9,  col: [0xe8e8e8, 0x9db3c8, 0xd9a03d] },
  pickup: { name: 'Pickup', len: 5.0, wid: 2.0, hgt: 1.25, top: 31, acc: 12, col: [0x707880, 0x39536b, 0xa03a2a, 0x3f6212] },
  police: { name: 'CBPD Cruiser', len: 4.7, wid: 1.95, hgt: 0.95, top: 40, acc: 16, col: [0x1c2733] },
};
let carSerial = 0;

function carMesh(kind, color) {
  const t = CAR_TYPES[kind], g = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x888888 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(t.wid, t.hgt * 0.62, t.len), paint);
  body.position.y = 0.42 + t.hgt * 0.28; body.castShadow = true; g.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.92, t.hgt * 0.3, t.len * 0.24), paint);
  hood.position.set(0, 0.5 + t.hgt * 0.42, t.len * 0.36); g.add(hood);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.86, t.hgt * 0.5, t.len * 0.42),
    new THREE.MeshPhongMaterial({ color: 0x1a2634, shininess: 140, specular: 0xbbddff }));
  glass.position.set(0, 0.62 + t.hgt * 0.52, -t.len * 0.04); g.add(glass);
  if (kind === 'van') { glass.position.z = t.len * 0.28; glass.scale.z = 0.4; }
  if (kind === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.94, t.hgt * 0.34, t.len * 0.4),
      new THREE.MeshLambertMaterial({ color: 0x33383c }));
    bed.position.set(0, 0.55 + t.hgt * 0.4, -t.len * 0.28); g.add(bed);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xb9c0c7 });
  g.userData.wheels = []; g.userData.frontAxle = new THREE.Group();
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 8), hubMat);
    hub.rotation.z = Math.PI / 2; w.add(hub);
    w.position.set(sx * (t.wid / 2 - 0.05), 0.36, sz * (t.len / 2 - 0.85));
    if (sz > 0) { const pivot = new THREE.Group(); pivot.position.copy(w.position); w.position.set(0, 0, 0); pivot.add(w); g.add(pivot); g.userData.wheels.push(w); if (sz > 0) g.userData['pivotF' + (sx < 0 ? 'L' : 'R')] = pivot; }
    else { g.add(w); g.userData.wheels.push(w); }
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), lampMat);
    lamp.position.set(sx * t.wid * 0.32, 0.78, t.len / 2 + 0.01); g.add(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xd92020 }));
    tail.position.set(sx * t.wid * 0.32, 0.82, -t.len / 2 - 0.01); g.add(tail);
  }
  if (kind === 'police') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(t.wid + 0.03, 0.3, t.len * 0.7),
      new THREE.MeshLambertMaterial({ color: 0xf2f5f7 }));
    stripe.position.y = 0.72; g.add(stripe);
    const bar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.add(base);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.34, 0.14, 0); bar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.34),
      new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.set(0.34, 0.14, 0); bar.add(blue);
    bar.position.set(0, 1.32, -0.2);
    g.add(bar);
    g.userData.lightBar = { red, blue };
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.9, 0.34, 0.18),
      new THREE.MeshLambertMaterial({ color: 0x111417 }));
    bumper.position.set(0, 0.55, t.len / 2 + 0.1); g.add(bumper);
  }
  return g;
}

function makeCar(kind, color, x, z, h) {
  const t = CAR_TYPES[kind];
  const mesh = carMesh(kind, color);
  mesh.position.set(x, 0, z); mesh.rotation.y = h;
  W.scene.add(mesh);
  const car = {
    id: carSerial++, kind, label: t.name, mesh, x, z, h: h || 0, speed: 0, steer: 0,
    len: t.len, wid: t.wid, top: t.top, acc: t.acc,
    hp: 100, dead: false, spiked: false, driver: null, isPlayer: false,
    route: null, routeI: 0, cruise: rand(10.5, 14), waitT: 0, smokeT: 0,
    unit: null, target: null,
  };
  W.cars.push(car);
  return car;
}

// One physics step shared by traffic, police and the player: throttle and
// steer in, position and heading out, with building and car collisions.
function stepCar(car, dt, throttle, steer) {
  if (car.dead) { car.speed = 0; syncCarMesh(car, dt); return; }
  const topSpeed = car.spiked ? 9 : car.top;
  if (throttle > 0) car.speed += car.acc * throttle * dt * (1 - car.speed / (topSpeed * 1.25));
  else if (throttle < 0) car.speed += (car.speed > 0.5 ? -26 : -8) * dt * -throttle * (car.speed > 0.5 ? 1 : (car.speed > -9 ? 1 : 0));
  car.speed -= car.speed * 0.35 * dt;
  if (car.spiked) car.speed = Math.min(car.speed, topSpeed + Math.max(0, car.speed - topSpeed) * 0.9);
  car.speed = clamp(car.speed, -10, car.top);
  const steerTarget = clamp(steer, -1, 1) * 0.55 / (1 + Math.abs(car.speed) * 0.055);
  car.steer = lerp(car.steer, steerTarget, 1 - Math.exp(-dt * 7));
  if (car.spiked && Math.abs(car.speed) > 2) car.steer += Math.sin(W.time * 9 + car.id * 3) * 0.05; // shredded tyres wander
  car.h += car.steer * car.speed * dt * 0.42;
  let nx = car.x + fwdX(car.h) * car.speed * dt;
  let nz = car.z + fwdZ(car.h) * car.speed * dt;
  const [cx, cz] = collideBuildings(nx, nz, 1.7);
  if (cx !== nx || cz !== nz) { car.speed *= 0.55; damageCar(car, Math.abs(car.speed) * 0.7, nx, nz); }
  nx = clamp(cx, -216, 216); nz = clamp(cz, -188, 200);
  if (isWater(nx, nz) && car.speed > 0) { car.speed *= 0.9; }
  car.x = nx; car.z = nz;
  carCarCollisions(car, dt);
  syncCarMesh(car, dt);
}

function syncCarMesh(car, dt) {
  car.mesh.position.set(car.x, car.dead ? -0.12 : 0, car.z);
  car.mesh.rotation.y = car.h;
  car.mesh.rotation.z = car.dead ? 0.06 : clamp(-car.steer * car.speed * 0.006, -0.05, 0.05);
  const spin = car.speed * dt / 0.36;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  for (const key of ['pivotFL', 'pivotFR']) {
    const p = car.mesh.userData[key];
    if (p) p.rotation.y = car.steer * 1.4;
  }
  if (car.mesh.userData.lightBar) {
    const phase = Math.floor(W.time * 2.4 + car.id) % 2 === 0;
    car.mesh.userData.lightBar.red.material.color.setHex(phase ? 0xff2222 : 0x661111);
    car.mesh.userData.lightBar.blue.material.color.setHex(phase ? 0x112266 : 0x3377ff);
  }
  if (car.hp < 50 && !car.dead) {
    car.smokeT -= dt;
    if (car.smokeT <= 0) {
      car.smokeT = car.hp < 22 ? 0.05 : 0.14;
      spawnParticles(car.x, 1.1, car.z, car.hp < 22 ? 'fire' : 'smoke', 1);
    }
  }
  if (car.spiked && Math.abs(car.speed) > 3 && chance(0.5))
    spawnParticles(car.x - fwdX(car.h) * 1.6, 0.3, car.z - fwdZ(car.h) * 1.6, 'spark', 1);
}

function carCarCollisions(car, dt) {
  for (const o of W.cars) {
    if (o === car) continue;
    const d2 = dist2(car.x, car.z, o.x, o.z);
    if (d2 > 36) continue;
    const d = Math.sqrt(d2) || 0.01, min = (car.len + o.len) / 4 + 1.1;
    if (d < min) {
      const push = (min - d) / 2, ux = (car.x - o.x) / d, uz = (car.z - o.z) / d;
      car.x += ux * push; car.z += uz * push;
      if (!o.isPlayer && o.kind !== 'parked') { o.x -= ux * push; o.z -= uz * push; }
      const impact = Math.abs(car.speed - o.speed);
      if (impact > 3) {
        damageCar(car, impact * 1.1, car.x, car.z);
        damageCar(o, impact * 1.1, o.x, o.z);
        spawnParticles((car.x + o.x) / 2, 0.7, (car.z + o.z) / 2, 'spark', 7);
        playCrash(impact);
        if (W.onCarsHit) W.onCarsHit(car, o, impact);
      }
      car.speed *= 0.72; if (!o.dead) o.speed *= 0.8;
    }
  }
}

function damageCar(car, amount, x, z) {
  if (car.dead || amount <= 0) return;
  car.hp -= amount;
  if (car.hp <= 0) explodeCar(car);
}

function explodeCar(car) {
  if (car.dead) return;
  car.dead = true; car.hp = 0; car.speed = 0;
  car.mesh.traverse(o => { if (o.material && o.material.color) o.material = new THREE.MeshLambertMaterial({ color: 0x1b1b1e }); });
  spawnParticles(car.x, 1, car.z, 'boom', 42);
  spawnParticles(car.x, 0.6, car.z, 'smoke', 16);
  playExplosion();
  for (const o of W.cars) {
    if (o !== car && dist2(car.x, car.z, o.x, o.z) < 90) damageCar(o, 26, o.x, o.z);
  }
  if (W.player && W.player.car === car) { if (W.onPlayerCarWrecked) W.onPlayerCarWrecked(); }
  else if (W.player && !W.player.car && dist2(car.x, car.z, W.player.x, W.player.z) < 90) hurtPlayer(20);
  if (W.onCarExploded) W.onCarExploded(car);
}

// --- particles: one pooled Points cloud for sparks, smoke, fire, blasts ---
const PMAX = 900;
let pGeo, pPts, pData;
function initParticles() {
  pData = [];
  const pos = new Float32Array(PMAX * 3), col = new Float32Array(PMAX * 3);
  for (let i = 0; i < PMAX; i++) { pData.push({ life: 0, vx: 0, vy: 0, vz: 0, x: 0, y: -50, z: 0, grow: 0 }); pos[i * 3 + 1] = -50; }
  pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  pPts = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.55, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
    map: canvasTex(64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }),
  }));
  pPts.frustumCulled = false;
  W.scene.add(pPts);
}
const P_COL = { spark: [1, 0.75, 0.25], smoke: [0.22, 0.22, 0.24], fire: [1, 0.45, 0.12], boom: [1, 0.6, 0.2] };
function spawnParticles(x, y, z, kind, n) {
  if (!pData) return;
  const col = pGeo.attributes.color.array, c = P_COL[kind];
  let made = 0;
  for (let i = 0; i < PMAX && made < n; i++) {
    const p = pData[i];
    if (p.life > 0) continue;
    made++;
    p.life = kind === 'smoke' ? rand(0.7, 1.4) : kind === 'boom' ? rand(0.4, 0.9) : rand(0.25, 0.6);
    p.x = x + rand(-0.4, 0.4); p.y = y + rand(-0.2, 0.3); p.z = z + rand(-0.4, 0.4);
    const sp = kind === 'boom' ? 11 : kind === 'spark' ? 6 : 2.2;
    p.vx = rand(-sp, sp); p.vz = rand(-sp, sp);
    p.vy = kind === 'smoke' ? rand(1.5, 3) : rand(1, sp * 0.8);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  pGeo.attributes.color.needsUpdate = true;
}
function updateParticles(dt) {
  if (!pData) return;
  const pos = pGeo.attributes.position.array;
  for (let i = 0; i < PMAX; i++) {
    const p = pData[i];
    if (p.life <= 0) continue;
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vy -= (p.vy > 2 ? 2.5 : -0.6) * dt;
    if (p.life <= 0) p.y = -50;
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
  }
  pGeo.attributes.position.needsUpdate = true;
}

// --- traffic -----------------------------------------------------------------
function trafficRouteFrom(car) {
  const from = nearestNode(W.graph, car.x, car.z);
  let to = randi(0, W.graph.length - 1);
  if (to === from) to = (to + 7) % W.graph.length;
  car.route = findRoute(W.graph, from, to);
  car.routeI = 0;
}

// The point a driver aims for: the next route node, shifted into the
// right-hand lane for the direction of travel along this segment.
function lanePoint(car, nodeIdx) {
  const node = W.graph[nodeIdx];
  const prev = car.routeI > 0 ? W.graph[car.route[car.routeI - 1]] : null;
  if (!prev) return node;
  const h = headingTo(prev.x, prev.z, node.x, node.z);
  return { x: node.x + rightX(h) * 3.1, z: node.z + rightZ(h) * 3.1, h };
}

function carAhead(car, range) {
  let best = null, bd = range;
  for (const o of W.cars) {
    if (o === car) continue;
    const rx = o.x - car.x, rz = o.z - car.z;
    const f = rx * fwdX(car.h) + rz * fwdZ(car.h);
    const lat = Math.abs(rx * rightX(car.h) + rz * rightZ(car.h));
    if (f > 0.5 && f < bd && lat < 2.1) { bd = f; best = o; }
  }
  return best;
}

function updateTrafficCar(car, dt) {
  if (car.driver !== 'traffic') return;
  if (!car.route || car.routeI >= car.route.length) trafficRouteFrom(car);
  const node = W.graph[car.route[car.routeI]];
  const lp = lanePoint(car, car.route[car.routeI]);
  const dNode = dist(car.x, car.z, node.x, node.z);
  if (dNode < 6.5) {
    car.routeI++;
    if (car.routeI >= car.route.length) { trafficRouteFrom(car); return; }
  }
  let want = car.cruise, throttle = 0.7;
  // Stop lines: hold at a red or late-yellow light for our axis.
  const axis = axisOf(car.h);
  const ls = lightState(axis);
  if (dNode < 12 && dNode > 4 && (ls === 'red' || (ls === 'yellow' && dNode > 8))) {
    want = 0; throttle = car.speed > 0.4 ? -0.8 : 0;
    if (car.speed < 0.4) car.speed = 0;
  }
  const ahead = carAhead(car, 9);
  if (ahead) {
    want = Math.min(want, ahead.speed * 0.92);
    if (dist(car.x, car.z, ahead.x, ahead.z) < 5.2) { want = 0; throttle = car.speed > 0.3 ? -0.9 : 0; }
  }
  if (car.speed < want) throttle = Math.max(throttle, 0.55); else if (car.speed > want + 1) throttle = -0.5;
  if (want === 0 && car.speed < 0.4) throttle = 0;
  const steerTo = headingTo(car.x, car.z, lp.x, lp.z);
  const steer = clamp(angDiff(steerTo, car.h) * 1.7, -1, 1);
  stepCar(car, dt, throttle, steer);
}

// --- the player's driving ------------------------------------------------------
function updatePlayerCar(dt) {
  const car = W.player.car;
  if (!car) return;
  let throttle = 0, steer = 0;
  if (W.shotDrive) {
    // Screenshot staging drives the car itself: hold the staged speed and
    // heading so a chase stays a chase for the whole capture.
    throttle = car.speed < 16.5 ? 0.9 : 0;
    if (car.speed > 18) car.speed -= car.speed * 1.4 * dt;
    steer = clamp(angDiff(car.h, W.shotHeading ?? car.h) * 1.6, -0.5, 0.5);
    stepCar(car, dt, throttle, steer);
    return;
  }
  if (W.keys['KeyW'] || W.keys['ArrowUp']) throttle = 1;
  if (W.keys['KeyS'] || W.keys['ArrowDown']) throttle = -1;
  if (W.keys['KeyA'] || W.keys['ArrowLeft']) steer = 1;
  if (W.keys['KeyD'] || W.keys['ArrowRight']) steer = -1;
  if (W.keys['Space']) { car.speed -= car.speed * 2.6 * dt; throttle = 0; }
  stepCar(car, dt, throttle, steer);
  if (W.audioTick) W.audioTick.carSound(Math.abs(car.speed) / car.top, throttle !== 0);
}

function buildVehicles() {
  initParticles();
  const kinds = ['hatch', 'sedan', 'coupe', 'van', 'pickup'];
  for (let i = 0; i < 18; i++) { // live traffic, spread over the graph
    const node = W.graph[randi(0, W.graph.length - 1)];
    const kind = pick(kinds);
    const car = makeCar(kind, pick(CAR_TYPES[kind].col), node.x + rand(-3, 3), node.z + rand(-3, 3), rand(0, 6.28));
    car.driver = 'traffic';
    trafficRouteFrom(car);
  }
  // Parked cars along curbs and at the marina — the player's supply.
  const parkSpots = [];
  for (const x of ROAD_VX) for (const z of [-120, -60, 0, 60]) parkSpots.push([x + 5.6, z + rand(-8, 8), Math.PI]);
  parkSpots.push([160, 146, 0], [168, 146, 0], [188, 146, 0], [60, 121, Math.PI / 2], [-30, 121, Math.PI / 2]);
  for (const [x, z, h] of parkSpots) {
    if (chance(0.45)) continue;
    const kind = pick(kinds);
    const car = makeCar(kind, pick(CAR_TYPES[kind].col), x, z, h + rand(-0.05, 0.05));
    car.driver = null; car.kind = 'parked';
  }
}

function updateVehicles(dt) {
  for (const car of W.cars) {
    if (car.driver === 'traffic') updateTrafficCar(car, dt);
    else if (car.isPlayer) updatePlayerCar(dt);
    else if (car.driver === 'police') { /* police.js steers its own cars */ }
    else syncCarMesh(car, dt);
  }
  updateParticles(dt);
}
