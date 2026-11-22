// police.js — Coral Bay PD: the wanted heat system, cruiser spawns and
// pursuit steering with target lead, officers who shoot from two stars,
// roadblocks with spike strips from three stars, the AIR-1 helicopter from
// four, and the bust meter when the player is boxed in.

'use strict';

const CALLSIGNS = ['Viper', 'Heron', 'Cobra', 'Marlin', 'Osprey', 'Tern', 'Barracuda', 'Ibis', 'Egret', 'Frigate'];
W.officers = [];
W.heat = 0;          // 0..5 wanted heat; the HUD stars are ceil(heat)
W.seenT = 99;        // seconds since a unit last had eyes on the player
let copSerial = 0, blockTimer = 8, heliOut = false;

function addHeat(n) {
  W.heat = clamp(W.heat + n, 0, 5);
  if (n > 0) W.seenT = 0;
}
W.addHeat = addHeat;

// Crime hooks the rest of the game calls into.
W.onPlayerShot = target => { if (W.seenT < 4 || (target && target.kind === 'police')) addHeat(target && target.kind === 'police' ? 1 : 0.6); };
W.onCarsHit = (a, b, impact) => {
  const p = W.player; if (!p || !p.car) return;
  if ((a === p.car && b.kind === 'police') || (b === p.car && a.kind === 'police')) addHeat(0.55);
  else if (a === p.car || b === p.car) addHeat(0.22);
};
W.onPedDown = () => addHeat(1);
W.onOfficerDown = () => addHeat(1.2);
W.onCarExploded = () => { if (W.seenT < 5) addHeat(0.6); };
W.onEnterCar = (car, wasTraffic) => {
  if (car.kind === 'police') addHeat(1.5);
  else if (wasTraffic) addHeat(0.8);
};

function stars() { return W.heat <= 0 ? 0 : Math.ceil(W.heat); }

function spawnCopCar() {
  const p = W.player;
  const px = p.car ? p.car.x : p.x, pz = p.car ? p.car.z : p.z;
  // Spawn on a road node a good way off: close enough to matter, never on top.
  let node = null;
  for (let tries = 0; tries < 24 && !node; tries++) {
    const cand = W.graph[randi(0, W.graph.length - 1)];
    const d = dist(px, pz, cand.x, cand.z);
    if (d > 55 && d < 130) node = cand;
  }
  if (!node) node = W.graph[nearestNode(W.graph, px + 90, pz)];
  const car = makeCar('police', 0x1c2733, node.x, node.z, headingTo(node.x, node.z, px, pz));
  car.driver = 'police';
  car.unit = 'Unit ' + (10 + (copSerial * 7) % 80) + ' "' + CALLSIGNS[copSerial % CALLSIGNS.length] + '"';
  copSerial++;
  car.stuckT = 0; car.revT = 0; car.shootT = rand(0.5, 1.4);
  W.cops.push(car);
  return car;
}

function despawnCop(car) {
  W.scene.remove(car.mesh);
  W.cars.splice(W.cars.indexOf(car), 1);
  W.cops.splice(W.cops.indexOf(car), 1);
}

function updateCopCar(car, dt) {
  const p = W.player;
  const tx = p.car ? p.car.x + fwdX(p.car.h) * p.car.speed * 0.45 : p.x;
  const tz = p.car ? p.car.z + fwdZ(p.car.h) * p.car.speed * 0.45 : p.z;
  const d = dist(car.x, car.z, tx, tz);
  let throttle = 1, want = headingTo(car.x, car.z, tx, tz);
  // When close, aim at the player's rear quarter to pin, not pass.
  if (d < 9) want = headingTo(car.x, car.z, p.car ? p.car.x : p.x, p.car ? p.car.z : p.z);
  if (car.revT > 0) { car.revT -= dt; stepCar(car, dt, -1, -clamp(angDiff(want, car.h) * 2, -1, 1)); return; }
  if (Math.abs(car.speed) < 0.8 && d > 12) {
    car.stuckT += dt;
    if (car.stuckT > 1.1) { car.revT = 0.75; car.stuckT = 0; }
  } else car.stuckT = 0;
  const steer = clamp(angDiff(want, car.h) * 1.9, -1, 1);
  if (d < 5.5 && p.car) throttle = 0.25;               // sit on the bumper
  if (d > 60) throttle = 1;                             // full chase
  const ahead = carAhead(car, 7);
  if (ahead && ahead !== p.car && d > 14) throttle = Math.min(throttle, 0.3);
  stepCar(car, dt, throttle, steer);
  // Officers fire from two stars once they are in range.
  car.shootT -= dt;
  if (stars() >= 2 && car.shootT <= 0) {
    car.shootT = rand(1.0, 1.7);
    if (d < 34 && chance(0.42)) {
      hurtPlayer(rand(3, 6.5));
      drawTracer(new THREE.Vector3(car.x, 1.2, car.z), new THREE.Vector3(p.x, 1.3, p.z));
      playGunshot('Pistol');
    }
  }
  // A cruiser that falls too far behind gives up and peels off.
  if (d > 190) despawnCop(car);
}

// --- officers on foot ---------------------------------------------------------
function spawnOfficer(x, z) {
  const mesh = buildPerson(0x27324a, 0x1d2432, pick(SKIN));
  mesh.position.set(x, 0, z);
  W.scene.add(mesh);
  const cop = { mesh, x, z, h: rand(0, 6.28), hp: 40, dead: false, cool: rand(0.4, 1.2), phase: rand(0, 6), name: 'Officer ' + pick(['Reyes', 'Okafor', 'Lindqvist', 'Marsh', 'Delacroix', 'Petrov']) };
  W.officers.push(cop);
  return cop;
}

function updateOfficer(cop, dt) {
  if (cop.dead) return;
  const p = W.player;
  const tx = p.car ? p.car.x : p.x, tz = p.car ? p.car.z : p.z;
  const d = dist(cop.x, cop.z, tx, tz);
  if (d > 15 || p.car) { // close in, but never stand in the road of a car
    cop.h = angTurn(cop.h, headingTo(cop.x, cop.z, tx, tz), dt * 5);
    const sp = p.car ? 5.6 : 4.4;
    cop.x += fwdX(cop.h) * sp * dt; cop.z += fwdZ(cop.h) * sp * dt;
    cop.phase += dt * sp * 2;
    animatePerson(cop.mesh, cop.phase, sp);
  } else {
    cop.h = angTurn(cop.h, headingTo(cop.x, cop.z, tx, tz), dt * 6);
  }
  const [cx, cz] = collideBuildings(cop.x, cop.z, 0.5);
  cop.x = cx; cop.z = cz;
  cop.mesh.position.set(cop.x, 0, cop.z);
  cop.mesh.rotation.y = cop.h;
  cop.cool -= dt;
  if (stars() >= 2 && cop.cool <= 0 && d < 38) {
    cop.cool = rand(0.9, 1.5);
    if (chance(0.46)) {
      hurtPlayer(rand(3, 6));
      drawTracer(new THREE.Vector3(cop.x, 1.4, cop.z), new THREE.Vector3(tx, 1.2, tz));
      playGunshot('Pistol');
    }
  }
  if (d > 200 || (W.heat <= 0 && d > 40)) {
    W.scene.remove(cop.mesh);
    W.officers.splice(W.officers.indexOf(cop), 1);
  }
}

// --- roadblocks ------------------------------------------------------------------
function buildSpikeStrip(x, z, h) {
  const g = new THREE.Group();
  const mat = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.07, 0.9),
    new THREE.MeshLambertMaterial({ color: 0x24262a }));
  g.add(mat);
  const toothGeo = new THREE.ConeGeometry(0.09, 0.22, 5);
  const toothMat = new THREE.MeshLambertMaterial({ color: 0xc8ccd2 });
  for (let i = 0; i < 12; i++) {
    const t = new THREE.Mesh(toothGeo, toothMat);
    t.position.set(-3.4 + i * 0.62, 0.12, 0);
    g.add(t);
  }
  g.position.set(x, 0.05, z); g.rotation.y = h;
  W.scene.add(g);
  return { mesh: g, x, z, h };
}

function placeRoadblock() {
  const p = W.player;
  if (!p.car) return false;
  // A node ahead of the player's line of travel, on the road they are on;
  // if the snap lands too close, project further and snap again.
  let node = null;
  for (const reach of [55, 95]) {
    const ni = nearestNode(W.graph, p.car.x + fwdX(p.car.h) * reach, p.car.z + fwdZ(p.car.h) * reach);
    node = W.graph[ni];
    if (dist(p.car.x, p.car.z, node.x, node.z) >= 30) break;
    node = null;
  }
  if (!node) return false;
  const h = p.car.h;
  const block = { x: node.x, z: node.z, h, cars: [], strip: null, officers: [] };
  const gapSide = chance(0.5) ? 1 : -1;
  for (const off of [-3.4, 3.4]) {
    if (Math.sign(off) === gapSide && chance(0.4)) continue; // sometimes a gap
    const cx = node.x + rightX(h) * off, cz = node.z + rightZ(h) * off;
    const car = makeCar('police', 0x1c2733, cx, cz, h + Math.PI / 2 + rand(-0.12, 0.12));
    car.driver = 'roadblock'; car.unit = 'Block ' + (block.cars.length + 1);
    block.cars.push(car); W.cops.push(car);
  }
  block.strip = buildSpikeStrip(node.x - rightX(h) * gapSide * 3.2, node.z - rightZ(h) * gapSide * 3.2, h);
  for (let i = 0; i < 2; i++) {
    const cop = spawnOfficer(node.x + rand(-6, 6), node.z + rand(-6, 6));
    block.officers.push(cop);
  }
  W.roadblocks.push(block);
  return true;
}

function clearRoadblock(block) {
  for (const car of block.cars) {
    if (!car.isPlayer) { W.scene.remove(car.mesh); W.cars.splice(W.cars.indexOf(car), 1); }
    W.cops.splice(W.cops.indexOf(car), 1);
  }
  if (block.strip) W.scene.remove(block.strip.mesh);
  W.roadblocks.splice(W.roadblocks.indexOf(block), 1);
}

function updateRoadblocks(dt) {
  const p = W.player;
  blockTimer -= dt;
  if (stars() >= 3 && p.car && blockTimer <= 0 && W.roadblocks.length < 2) {
    blockTimer = placeRoadblock() ? rand(11, 17) : 2.5;
  }
  for (let i = W.roadblocks.length - 1; i >= 0; i--) {
    const b = W.roadblocks[i];
    const d = dist(p.x, p.z, b.x, b.z);
    if (d > 150 || W.heat < 2.4) { clearRoadblock(b); continue; }
    if (p.car && b.strip && !p.car.spiked) {
      const s = b.strip;
      if (dist(p.car.x, p.car.z, s.x, s.z) < 3.6 && Math.abs(p.car.speed) > 4) {
        p.car.spiked = true;
        spawnParticles(p.car.x, 0.4, p.car.z, 'spark', 22);
        playSpikePop();
        if (W.notify) W.notify('Tyres shredded! Ditch this car and take another.');
      }
    }
    for (const car of b.cars) syncCarMesh(car, dt);
  }
}

// --- the helicopter ------------------------------------------------------------------
function buildHelicopter() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color: 0x22303e, shininess: 70 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), bodyMat);
  body.scale.set(1, 0.85, 1.9); body.castShadow = true; g.add(body);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8),
    new THREE.MeshPhongMaterial({ color: 0x9fd4e8, shininess: 160 }));
  glass.position.set(0, 0.15, 1.3); glass.scale.set(0.9, 0.7, 0.8); g.add(glass);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 5.6, 8), bodyMat);
  tail.rotation.x = Math.PI / 2; tail.position.set(0, 0.25, -3.9); g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.7), bodyMat);
  fin.position.set(0, 0.7, -6.6); g.add(fin);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.06, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x14161a }));
  rotor.position.y = 1.55; g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.24),
    new THREE.MeshLambertMaterial({ color: 0x14161a }));
  tailRotor.position.set(0.2, 0.7, -6.6); g.add(tailRotor);
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 5),
      new THREE.MeshLambertMaterial({ color: 0x333333 }));
    skid.rotation.x = Math.PI / 2; skid.position.set(sx * 1.05, -1.25, 0); g.add(skid);
  }
  const cone = new THREE.Mesh(new THREE.ConeGeometry(5, 26, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide }));
  cone.position.y = -14; cone.rotation.x = Math.PI;
  g.add(cone);
  const spot = new THREE.SpotLight(0xffe2a8, 2.4, 90, 0.32, 0.5, 0.6);
  spot.position.set(0, -1, 0);
  g.add(spot); g.add(spot.target);
  g.userData = { rotor, tailRotor, cone, spot };
  g.visible = false;
  W.scene.add(g);
  return { mesh: g, x: 0, z: 0, h: 0, active: false, unit: 'AIR-1 "Kestrel"' };
}

function updateHelicopter(dt) {
  if (!W.heli) W.heli = buildHelicopter();
  const heli = W.heli, p = W.player;
  const want = stars() >= 4;
  if (want && !heli.active) { heli.active = true; heli.mesh.visible = true; heli.x = p.x - 60; heli.z = p.z - 60; }
  if (!want && heli.active && stars() < 3) { heli.active = false; heli.mesh.visible = false; }
  if (!heli.active) return;
  const tx = (p.car ? p.car.x : p.x) + Math.sin(W.time * 0.24) * 16;
  const tz = (p.car ? p.car.z : p.z) + Math.cos(W.time * 0.19) * 16;
  heli.x = lerp(heli.x, tx, 1 - Math.exp(-dt * 0.9));
  heli.z = lerp(heli.z, tz, 1 - Math.exp(-dt * 0.9));
  heli.h = angTurn(heli.h, headingTo(heli.x, heli.z, p.x, p.z), dt * 1.4);
  heli.mesh.position.set(heli.x, 22 + Math.sin(W.time * 0.8) * 1.2, heli.z);
  heli.mesh.rotation.y = heli.h;
  heli.mesh.userData.rotor.rotation.y += dt * 28;
  heli.mesh.userData.tailRotor.rotation.x += dt * 34;
  const spot = heli.mesh.userData.spot;
  spot.target.position.set(p.x - heli.x, -34, p.z - heli.z);
  W.seenT = 0; // the helicopter always has eyes on you
}

// --- the system tick -------------------------------------------------------------------
function updatePolice(dt) {
  const p = W.player;
  if (!p) return;
  // Eyes on the player?
  const px = p.car ? p.car.x : p.x, pz = p.car ? p.car.z : p.z;
  let seen = W.heli && W.heli.active;
  if (!seen) for (const car of W.cops) if (dist2(car.x, car.z, px, pz) < 4900) { seen = true; break; }
  if (!seen) for (const cop of W.officers) if (dist2(cop.x, cop.z, px, pz) < 3600) { seen = true; break; }
  W.seenT = seen ? 0 : W.seenT + dt;
  if (W.seenT > 7 && W.heat > 0) W.heat = Math.max(0, W.heat - dt * 0.055); // heat cools unseen
  const wantCars = [0, 1, 2, 3, 4, 6][stars()] || 0;
  const activeCops = W.cops.filter(c => c.driver === 'police');
  if (activeCops.length < wantCars && W.heat > 0) spawnCopCar();
  if (W.heat <= 0) { // stand down: units peel away
    for (const car of activeCops) if (chance(dt * 0.5)) despawnCop(car);
  }
  for (let i = W.cops.length - 1; i >= 0; i--) {
    const car = W.cops[i];
    if (car.driver === 'police' && !car.isPlayer) updateCopCar(car, dt);
  }
  // Foot officers spill out of nearby cruisers when the player is on foot.
  if (!p.car && stars() >= 2 && W.officers.length < 4) {
    for (const car of activeCops) {
      if (dist2(car.x, car.z, px, pz) < 900 && chance(dt * 0.7)) {
        spawnOfficer(car.x + rand(-2, 2), car.z + rand(-2, 2));
        break;
      }
    }
  }
  for (let i = W.officers.length - 1; i >= 0; i--) updateOfficer(W.officers[i], dt);
  updateRoadblocks(dt);
  updateHelicopter(dt);
  // Bust meter: boxed in and slow with a unit right there.
  const pSpeed = p.car ? Math.abs(p.car.speed) : (p.speed || 0);
  let nearUnit = false;
  if (pSpeed < 1.3 && W.heat > 0) {
    for (const car of W.cops) if (dist2(car.x, car.z, px, pz) < 64) { nearUnit = true; break; }
    if (!nearUnit) for (const cop of W.officers) if (dist2(cop.x, cop.z, px, pz) < 49) { nearUnit = true; break; }
  }
  if (nearUnit) {
    if (!W.shot) W.bust += dt / 2.4;
    if (W.bust >= 1 && W.onPlayerDown) { W.bust = 0; W.onPlayerDown('busted'); }
  } else W.bust = Math.max(0, W.bust - dt * 0.7);
}
