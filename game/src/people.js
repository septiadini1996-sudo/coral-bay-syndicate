// people.js — the humans of Coral Bay: low-poly articulated figures, the
// player Jules Cordero with third-person mouse look and an over-the-shoulder
// aim, pedestrians who stroll the sidewalks and flee trouble, the weapon set
// with modelled 3D guns, shooting, health and armour.

'use strict';

const SKIN = [0xf2c49b, 0xc98d64, 0x8a5a3b, 0xffe0bd];
const SHIRT = [0x3fa7d6, 0xee6c4d, 0xf2cc8f, 0x98c1d9, 0x8ac926, 0xff8fab, 0x6a4c93];
const PANTS = [0x2b2d42, 0x4a4e69, 0x606c38, 0x7f5539, 0x3a506b];

function buildPerson(shirt, pants, skin) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const hips = new THREE.Group(); hips.position.y = 0.86; g.add(hips);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), mat(shirt));
  torso.position.y = 0.33; torso.castShadow = true; hips.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), mat(skin));
  head.position.y = 0.86; head.castShadow = true; hips.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.215, 10, 6, 0, Math.PI * 2, 0, 1.4), mat(0x2a1e17));
  hair.position.y = 0.9; hips.add(hair);
  const limb = (x, y, len, w, c) => {
    const p = new THREE.Group(); p.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat(c));
    m.position.y = -len / 2; m.castShadow = true; p.add(m); hips.add(p);
    return p;
  };
  const armL = limb(-0.34, 0.58, 0.62, 0.15, shirt), armR = limb(0.34, 0.58, 0.62, 0.15, shirt);
  const legL = limb(-0.14, 0.02, 0.84, 0.19, pants), legR = limb(0.14, 0.02, 0.84, 0.19, pants);
  g.userData.limbs = { armL, armR, legL, legR, hips };
  return g;
}

function animatePerson(mesh, phase, speed) {
  const L = mesh.userData.limbs, s = Math.sin(phase) * clamp(speed / 6, 0, 1) * 0.75;
  L.legL.rotation.x = s; L.legR.rotation.x = -s;
  if (!mesh.userData.aimArm) { L.armL.rotation.x = -s * 0.8; L.armR.rotation.x = s * 0.8; }
  mesh.position.y = Math.abs(Math.sin(phase)) * 0.05 * clamp(speed / 6, 0, 1);
}

// Modelled guns from boxes and cylinders — never a single plain box.
function buildGun(kind) {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x1d1f24 });
  const steel = new THREE.MeshLambertMaterial({ color: 0x565d66 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  if (kind === 'Pistol') {
    add(new THREE.BoxGeometry(0.07, 0.13, 0.3), dark, 0, 0, 0.05);
    add(new THREE.BoxGeometry(0.05, 0.05, 0.22), steel, 0, 0.07, 0.16);
    add(new THREE.BoxGeometry(0.06, 0.16, 0.09), dark, 0, -0.12, -0.03).rotation.x = 0.25;
  } else if (kind === 'SMG') {
    add(new THREE.BoxGeometry(0.08, 0.14, 0.52), dark, 0, 0, 0.1);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), steel, 0, 0.03, 0.44).rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.05, 0.24, 0.08), steel, 0, -0.17, 0.08);
    add(new THREE.BoxGeometry(0.06, 0.1, 0.2), dark, 0, 0.02, -0.24);
  } else if (kind === 'Rifle') {
    add(new THREE.BoxGeometry(0.08, 0.15, 0.78), dark, 0, 0, 0.14);
    add(new THREE.CylinderGeometry(0.028, 0.028, 0.3, 6), steel, 0, 0.04, 0.62).rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.05, 0.2, 0.07), steel, 0, -0.15, 0.18);
    add(new THREE.BoxGeometry(0.06, 0.09, 0.16), dark, 0, 0.13, 0.05);
    add(new THREE.BoxGeometry(0.07, 0.12, 0.26), new THREE.MeshLambertMaterial({ color: 0x6b4423 }), 0, -0.02, -0.36);
  }
  return g;
}

const WEAPONS = [
  { name: 'Fists', dmg: 12, rate: 0.34, auto: false, range: 2.4, ammo: Infinity, spread: 0 },
  { name: 'Pistol', dmg: 24, rate: 0.27, auto: false, range: 90, ammo: 48, spread: 0.012 },
  { name: 'SMG', dmg: 13, rate: 0.095, auto: true, range: 80, ammo: 120, spread: 0.03 },
  { name: 'Rifle', dmg: 36, rate: 0.17, auto: true, range: 130, ammo: 60, spread: 0.008 },
];

function buildPlayer() {
  const mesh = buildPerson(0xee6c4d, 0x2b2d42, 0xf2c49b);
  mesh.position.set(163, 0, 146);
  W.scene.add(mesh);
  const p = {
    mesh, x: 163, z: 146, h: Math.PI, yaw: Math.PI, pitch: 0.24,
    hp: 100, armor: 50, car: null, speed: 0, phase: 0, cool: 0,
    weapon: 1, weapons: WEAPONS.map(w => ({ ...w, have: w.name === 'Fists' || w.name === 'Pistol' })),
    dead: false,
  };
  W.player = p;
  p.gunSlot = new THREE.Group();
  mesh.userData.limbs.armR.add(p.gunSlot);
  p.gunSlot.position.set(0, -0.6, 0.08);
  setWeaponMesh(p);
  return p;
}

function setWeaponMesh(p) {
  while (p.gunSlot.children.length) p.gunSlot.remove(p.gunSlot.children[0]);
  const w = p.weapons[p.weapon];
  if (w.name !== 'Fists') {
    const gun = buildGun(w.name);
    gun.rotation.x = Math.PI / 2 - 0.12;
    p.gunSlot.add(gun);
  }
  p.mesh.userData.aimArm = w.name !== 'Fists';
}

function hurtPlayer(amount) {
  const p = W.player;
  if (!p || p.dead || W.shot) return;
  let rest = amount;
  if (p.armor > 0) { const soak = Math.min(p.armor, amount * 0.6); p.armor -= soak; rest -= soak; }
  p.hp -= rest;
  flashDamage();
  if (p.hp <= 0 && !p.dead) {
    p.dead = true; p.hp = 0;
    if (W.onPlayerDown) W.onPlayerDown('wasted');
  }
}

// --- pedestrians ---------------------------------------------------------------
function spawnPed(x, z, role) {
  const mesh = buildPerson(pick(SHIRT), pick(PANTS), pick(SKIN));
  mesh.position.set(x, 0, z);
  W.scene.add(mesh);
  const ped = {
    mesh, x, z, h: rand(0, 6.28), speed: 0, phase: rand(0, 6),
    target: null, hp: 30, dead: false, flee: 0, role: role || 'walker',
    name: null, cool: 0,
  };
  pedTarget(ped);
  W.peds.push(ped);
  return ped;
}

function pedTarget(ped) {
  const n = W.graph[nearestNode(W.graph, ped.x, ped.z)];
  const e = pick(n.edges), m = W.graph[e.to];
  ped.target = { x: m.x, z: m.z };
}

function updatePed(ped, dt) {
  if (ped.dead) { ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.25; return; }
  let want = 1.35, tx = ped.target.x, tz = ped.target.z;
  // Sidewalk offset: walk beside the road, not in it.
  if (ped.flee > 0) {
    ped.flee -= dt; want = 4.6;
    tx = ped.x + fwdX(ped.h) * 10; tz = ped.z + fwdZ(ped.h) * 10;
  } else if (dist(ped.x, ped.z, tx, tz) < 2.5) { pedTarget(ped); return; }
  const th = headingTo(ped.x, ped.z, tx, tz);
  ped.h = angTurn(ped.h, th, dt * 4);
  // Keep walkers off the asphalt: nudge away from road centres.
  ped.x += fwdX(ped.h) * want * dt; ped.z += fwdZ(ped.h) * want * dt;
  if (onRoad(ped.x, ped.z) && ped.flee <= 0) {
    ped.x -= fwdX(ped.h) * want * dt * 1.4; ped.z -= fwdZ(ped.h) * want * dt * 1.4;
    pedTarget(ped);
  }
  const [cx, cz] = collideBuildings(ped.x, ped.z, 0.5);
  ped.x = cx; ped.z = clamp(cz, -186, WATER_Z - 1);
  ped.phase += dt * want * 2.6;
  ped.mesh.position.set(ped.x, 0, ped.z);
  ped.mesh.rotation.y = ped.h;
  animatePerson(ped.mesh, ped.phase, want);
  // Cars are dangerous: a fast car close by makes people dive away.
  for (const car of W.cars) {
    if (Math.abs(car.speed) > 6 && dist2(ped.x, ped.z, car.x, car.z) < 30) {
      ped.flee = 1.6; ped.h = headingTo(car.x, car.z, ped.x, ped.z);
    }
  }
}

// --- the player on foot ---------------------------------------------------------
function updatePlayer(dt) {
  const p = W.player;
  if (!p || p.dead) return;
  if (p.car) { p.x = p.car.x; p.z = p.car.z; p.h = p.car.h; return; }
  p.yaw -= W.mouseDX * 0.0026;
  p.pitch = clamp(p.pitch + W.mouseDY * 0.0022, -0.5, 1.05);
  const run = W.keys['ShiftLeft'] || W.keys['ShiftRight'];
  const spd = W.aiming ? 2.4 : run ? 7.4 : 4.6;
  let mx = 0, mz = 0;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  if (W.keys['KeyW']) { mx += sy; mz += cy; }
  if (W.keys['KeyS']) { mx -= sy; mz -= cy; }
  if (W.keys['KeyA']) { mx += cy; mz -= sy; }
  if (W.keys['KeyD']) { mx -= cy; mz += sy; }
  const ml = Math.hypot(mx, mz) || 1;
  const moving = (mx !== 0 || mz !== 0);
  p.speed = moving ? spd : 0;
  if (moving) {
    p.x += (mx / ml) * spd * dt; p.z += (mz / ml) * spd * dt;
    p.h = angTurn(p.h, Math.atan2(mx, mz), dt * 10);
    p.phase += dt * spd * 1.9;
  }
  if (W.aiming || W.firing) p.h = p.yaw;
  const [cx, cz] = collideBuildings(p.x, p.z, 0.55);
  p.x = clamp(cx, -214, 214); p.z = clamp(cz, -186, WATER_Z - 1);
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.h;
  animatePerson(p.mesh, p.phase, p.speed);
  const L = p.mesh.userData.limbs;
  if (p.weapons[p.weapon].name !== 'Fists') {
    L.armR.rotation.x = W.aiming || W.firing ? -Math.PI / 2 + p.pitch * 0.7 : -0.25;
  }
  p.cool -= dt;
  if (W.firing) tryShoot(p);
  updateCamera(dt);
}

function updateCamera(dt) {
  const p = W.player, cam = W.camera;
  const distC = W.aiming ? 3.1 : 6.4;
  const shoulder = W.aiming ? 1.05 : 0.35;
  const tx = p.x, ty = 1.55, tz = p.z;
  const cx = tx - Math.sin(p.yaw) * Math.cos(p.pitch) * distC + Math.cos(p.yaw) * shoulder;
  const cz = tz - Math.cos(p.yaw) * Math.cos(p.pitch) * distC - Math.sin(p.yaw) * shoulder;
  const cy = ty + Math.sin(p.pitch) * distC + 0.5;
  cam.position.set(cx, Math.max(cy, 0.7), cz);
  cam.lookAt(tx + Math.sin(p.yaw) * 4, ty + 0.25 - p.pitch * 1.4, tz + Math.cos(p.yaw) * 4);
  W.camYaw = p.yaw;
}

// Shooting: hitscan from the camera through its centre, so what you aim at
// is what you hit. Cars take body damage; people fall; police answer back.
let tracerMat = null;
function tryShoot(p) {
  const w = p.weapons[p.weapon];
  if (p.cool > 0) return;
  if (w.name === 'Fists') {
    p.cool = w.rate;
    for (const ped of W.peds) if (!ped.dead && dist(p.x, p.z, ped.x, ped.z) < w.range + 0.6) hitPerson(ped, w.dmg, p);
    for (const cop of W.officers || []) if (!cop.dead && dist(p.x, p.z, cop.x, cop.z) < w.range + 0.6) hitOfficer(cop, w.dmg);
    return;
  }
  if (w.ammo <= 0) { p.cool = 0.3; playDryFire(); return; }
  p.cool = w.rate; w.ammo--;
  playGunshot(w.name);
  const dir = new THREE.Vector3(-Math.sin(p.yaw) * Math.cos(p.pitch - 0.12), Math.sin(p.pitch - 0.12) + 0.06, -Math.cos(p.yaw) * Math.cos(p.pitch - 0.12)).normalize();
  // Note: camera looks along (sin yaw, cos yaw) on the ground plane.
  dir.x = Math.sin(p.yaw) * Math.cos(p.pitch) + rand(-1, 1) * w.spread;
  dir.z = Math.cos(p.yaw) * Math.cos(p.pitch) + rand(-1, 1) * w.spread;
  dir.y = -Math.sin(p.pitch) + 0.35 + rand(-1, 1) * w.spread;
  dir.normalize();
  const origin = new THREE.Vector3(p.x, 1.5, p.z);
  let bestT = w.range, hitCar = null, hitPed = null, hitCop = null;
  for (const car of W.cars) {
    const c = new THREE.Vector3(car.x - p.x, 0.9, car.z - p.z);
    const t = c.dot(dir);
    if (t < 0 || t > bestT) continue;
    const perp = c.clone().addScaledVector(dir, -t).length();
    if (perp < 1.9) { bestT = t; hitCar = car; hitPed = null; hitCop = null; }
  }
  for (const ped of W.peds) {
    if (ped.dead) continue;
    const c = new THREE.Vector3(ped.x - p.x, 1.1, ped.z - p.z);
    const t = c.dot(dir);
    if (t < 0 || t > bestT) continue;
    if (c.clone().addScaledVector(dir, -t).length() < 0.62) { bestT = t; hitPed = ped; hitCar = null; hitCop = null; }
  }
  for (const cop of W.officers || []) {
    if (cop.dead) continue;
    const c = new THREE.Vector3(cop.x - p.x, 1.1, cop.z - p.z);
    const t = c.dot(dir);
    if (t < 0 || t > bestT) continue;
    if (c.clone().addScaledVector(dir, -t).length() < 0.62) { bestT = t; hitCop = cop; hitCar = null; hitPed = null; }
  }
  const end = origin.clone().addScaledVector(dir, bestT);
  drawTracer(origin.clone().add(new THREE.Vector3(0.3, 0.1, 0.2)), end);
  spawnParticles(end.x, end.y, end.z, 'spark', 3);
  if (hitCar) { damageCar(hitCar, w.dmg * 0.55, end.x, end.z); if (W.onPlayerShot) W.onPlayerShot(hitCar); }
  else if (hitPed) hitPerson(hitPed, w.dmg, p);
  else if (hitCop) hitOfficer(hitCop, w.dmg);
  else if (W.onPlayerShot) W.onPlayerShot(null);
}

function drawTracer(a, b) {
  if (!tracerMat) tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85 });
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, tracerMat);
  W.scene.add(line);
  W.bullets.push({ line, life: 0.05 });
}

function hitPerson(ped, dmg, byPlayer) {
  ped.hp -= dmg;
  ped.flee = 2;
  if (ped.hp <= 0 && !ped.dead) {
    ped.dead = true;
    if (W.onPedDown) W.onPedDown(ped);
  }
}

function hitOfficer(cop, dmg) {
  cop.hp -= dmg;
  if (cop.hp <= 0 && !cop.dead) {
    cop.dead = true;
    cop.mesh.rotation.x = -Math.PI / 2; cop.mesh.position.y = 0.25;
    if (W.onOfficerDown) W.onOfficerDown(cop);
  }
}

function updateBullets(dt) {
  for (let i = W.bullets.length - 1; i >= 0; i--) {
    const b = W.bullets[i];
    b.life -= dt;
    if (b.life <= 0) { W.scene.remove(b.line); b.line.geometry.dispose(); W.bullets.splice(i, 1); }
  }
}

// Entering and leaving cars. Only a car that is stopped (or parked) can be
// taken — the HUD prompt in hud.js uses this same test, so what is offered
// is always what E will do.
function carEnterable(car) {
  return car && !car.dead && Math.abs(car.speed) < 1.6 && dist(W.player.x, W.player.z, car.x, car.z) < 3.6;
}
function nearestEnterableCar() {
  let best = null, bd = 13;
  for (const car of W.cars) {
    const d = dist2(W.player.x, W.player.z, car.x, car.z);
    if (d < bd && carEnterable(car)) { bd = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  const p = W.player;
  const wasTraffic = car.driver === 'traffic';
  if (car.driver === 'police') { /* stealing a cruiser: police.js notices */ }
  p.car = car; car.isPlayer = true; car.driver = 'player'; car.spiked = car.spiked;
  p.mesh.visible = false;
  if (W.onEnterCar) W.onEnterCar(car, wasTraffic);
  startEngineSound();
}

function exitCar() {
  const p = W.player, car = p.car;
  if (!car) return;
  p.car = null; car.isPlayer = false;
  car.driver = null; car.speed = 0;
  p.x = car.x + rightX(car.h) * -2.4; p.z = car.z + rightZ(car.h) * -2.4;
  const [cx, cz] = collideBuildings(p.x, p.z, 0.55);
  p.x = cx; p.z = cz;
  p.mesh.visible = true;
  p.mesh.position.set(p.x, 0, p.z);
  if (W.onExitCar) W.onExitCar(car);
  stopEngineSound();
}

function buildPeople() {
  buildPlayer();
  const spots = [[-30, 100], [30, 40], [-70, -20], [90, 100], [140, 100], [-140, -60], [20, -120], [170, 120], [-100, 118], [100, -60]];
  for (const [x, z] of spots) { spawnPed(x + rand(-4, 4), z + rand(-4, 4)); spawnPed(x + rand(-6, 6), z + rand(-6, 6)); }
}

function updatePeople(dt) {
  for (const ped of W.peds) if (ped.role === 'walker') updatePed(ped, dt);
  updatePlayer(dt);
  updateBullets(dt);
}
