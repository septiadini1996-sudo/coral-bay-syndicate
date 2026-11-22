// main.js — boot, input, the game loop, pause, saving, going down and
// getting back up, the driving camera, and the deterministic screenshot
// staging the entry's four screenshots are rendered with.

'use strict';

const SAVE_KEY = 'coral-bay-syndicate-v1';
let lastTs = 0, camPos = null;

function boot() {
  const params = new URLSearchParams(location.search);
  const seed = parseInt(params.get('seed') || '1', 10) || 1;
  if (params.get('shot')) { W.shot = params.get('shot'); reseed(seed * 7919 + 11); }

  W.scene = new THREE.Scene();
  W.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 2600);
  W.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!W.shot });
  W.renderer.setSize(innerWidth, innerHeight);
  W.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  W.renderer.shadowMap.enabled = true;
  W.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  W.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  W.renderer.toneMappingExposure = 1.12;
  W.renderer.domElement.className = 'webgl';
  document.body.appendChild(W.renderer.domElement);

  buildWorld();
  buildVehicles();
  buildPeople();
  buildMissions();
  prerenderMap();
  loadSave();

  if (W.shot) {
    document.getElementById('startScreen').classList.add('hidden');
    W.started = true;
    stageShot(W.shot, seed);
    return;
  }
  wireInput();
  refreshStartButtons();
  requestAnimationFrame(loop);
}

function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - lastTs) / 1000 || 0.016, 0.05);
  lastTs = ts;
  if (W.started && !W.paused && !W.over) stepGame(dt);
  W.renderer.render(W.scene, W.camera);
}

// One tick of the whole simulation, shared by the live loop and the staged
// screenshot steps so a shot is the game itself, frozen mid-motion.
function stepGame(dt) {
  W.time += dt;
  updateWorld(dt);
  updateVehicles(dt);
  updatePeople(dt);
  updatePolice(dt);
  updateMissions(dt);
  updateAudio();
  if (W.player && W.player.car) updateCarCamera(dt);
  updateHUD(dt);
}

// --- driving camera: settles in behind the car, mouse nudges the orbit -------
let driveYawOff = 0;
function updateCarCamera(dt) {
  const car = W.player.car, cam = W.camera;
  driveYawOff = clamp(driveYawOff - W.mouseDX * 0.003, -1.2, 1.2);
  driveYawOff *= Math.exp(-dt * 1.6);
  W.mouseDX = 0;
  const yaw = car.h + Math.PI + driveYawOff;
  const back = 9.8 + Math.abs(car.speed) * 0.06;
  const tx = car.x + Math.sin(yaw) * back, tz = car.z + Math.cos(yaw) * back;
  if (!camPos) camPos = new THREE.Vector3(tx, 3.6, tz);
  camPos.x = lerp(camPos.x, tx, 1 - Math.exp(-dt * 6));
  camPos.z = lerp(camPos.z, tz, 1 - Math.exp(-dt * 6));
  camPos.y = lerp(camPos.y, 3.4 + Math.abs(car.speed) * 0.012, 1 - Math.exp(-dt * 6));
  cam.position.copy(camPos);
  cam.lookAt(car.x - Math.sin(yaw) * 6, 1.3, car.z - Math.cos(yaw) * 6);
  W.player.yaw = car.h;
}

// --- input -----------------------------------------------------------------------
function wireInput() {
  addEventListener('keydown', e => {
    W.keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (!W.started || W.over) return;
    if (e.code === 'KeyP') { togglePause(); return; }
    if (W.paused) return;
    if (e.code === 'KeyE') {
      if (W.player.car) exitCar();
      else if (!(W.interact && W.interact())) {
        const car = nearestEnterableCar();
        if (car) enterCar(car);
      }
    }
    if (e.code === 'KeyR' && W.player.car) nextStation();
    if (e.code === 'KeyM') toggleRadio();
    if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
      const i = Number(e.code.slice(-1)) - 1, p = W.player;
      if (p.weapons[i] && p.weapons[i].have && !p.car) { p.weapon = i; setWeaponMesh(p); lastHudSig = ''; }
    }
    if (e.code === 'KeyR' && W.player && !W.player.car) { /* R reloads on foot */
      const w = W.player.weapons[W.player.weapon];
      if (w.name !== 'Fists') { /* ammo is carried whole; nothing to reload */ }
    }
  });
  addEventListener('keyup', e => { W.keys[e.code] = false; });
  addEventListener('mousemove', e => {
    if (document.pointerLockElement) { W.mouseDX += e.movementX; W.mouseDY += e.movementY; }
  });
  addEventListener('mousedown', e => {
    if (!W.started || W.paused || W.over || !document.pointerLockElement) return;
    if (e.button === 0) W.firing = true;
    if (e.button === 2) W.aiming = true;
  });
  addEventListener('mouseup', e => {
    if (e.button === 0) W.firing = false;
    if (e.button === 2) W.aiming = false;
  });
  addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && W.started && !W.paused && !W.over && !W.shot) setPaused(true);
  });
  addEventListener('resize', () => {
    W.camera.aspect = innerWidth / innerHeight;
    W.camera.updateProjectionMatrix();
    W.renderer.setSize(innerWidth, innerHeight);
  });
  el('btnPlay').addEventListener('click', () => startGame(false));
  el('btnContinue').addEventListener('click', () => startGame(true));
  el('btnResume').addEventListener('click', () => togglePause());
  el('btnRestart').addEventListener('click', () => { localStorage.removeItem(SAVE_KEY); location.reload(); });
  el('btnRespawn').addEventListener('click', respawn);
}

function lockPointer() {
  const c = W.renderer.domElement;
  if (!c.requestPointerLock) return;
  try {
    const r = c.requestPointerLock();
    if (r && r.catch) r.catch(() => { /* a re-click will lock it */ });
  } catch (e) { /* headless or blocked: mouse still works unlocked */ }
}

function startGame(keepSave) {
  if (!keepSave) { localStorage.removeItem(SAVE_KEY); resetProgress(); }
  startAudio();
  el('startScreen').classList.add('hidden');
  W.started = true;
  lockPointer();
  if (W.missionIndex === 0 && !W.mission) W.notify('See Vera Lark at the marina — gold marker');
}

function refreshStartButtons() {
  el('btnContinue').classList.toggle('hidden', !localStorage.getItem(SAVE_KEY));
}

function setPaused(on) {
  W.paused = on;
  el('pauseScreen').classList.toggle('hidden', !on);
  if (on) {
    document.exitPointerLock && document.exitPointerLock();
    el('pauseStats').textContent = 'Money $' + Math.floor(W.money).toLocaleString() +
      ' · Earned $' + Math.floor(W.earned).toLocaleString() +
      ' · Jobs done ' + W.missionIndex + ' of ' + STORY.length +
      ' · Rank: ' + rankFor(W.earned).name;
  }
}
function togglePause() {
  if (!W.started || W.over) return;
  setPaused(!W.paused);
  if (!W.paused) lockPointer();
}

// --- saving -------------------------------------------------------------------------
W.saveGame = function () {
  if (W.shot) return;
  const p = W.player;
  const data = {
    money: W.money, earned: W.earned, missionIndex: W.missionIndex,
    weapons: p.weapons.map(w => ({ have: w.have, ammo: w.ammo === Infinity ? -1 : w.ammo })),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
};

function loadSave() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { /* none */ }
  if (!data) return;
  W.money = data.money; W.earned = data.earned; W.missionIndex = data.missionIndex || 0;
  const p = W.player;
  (data.weapons || []).forEach((s, i) => {
    if (p.weapons[i]) { p.weapons[i].have = s.have; p.weapons[i].ammo = s.ammo < 0 ? Infinity : s.ammo; }
  });
}

function resetProgress() {
  W.money = 250; W.earned = 0; W.missionIndex = 0;
  const p = W.player;
  p.weapons.forEach(w => { w.have = w.name === 'Fists' || w.name === 'Pistol'; });
  p.weapon = 1; setWeaponMesh(p);
  p.hp = 100; p.armor = 50;
}

// --- going down ----------------------------------------------------------------------
W.onPlayerDown = function (kind) {
  if (W.over || W.shot) return;
  W.over = true;
  W.firing = false; W.aiming = false;
  document.exitPointerLock && document.exitPointerLock();
  el('downTitle').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  el('downText').textContent = kind === 'busted'
    ? 'The Coral Bay PD walk you to a cell. The fine stings, the story spreads, and by dusk you are back on the marina with lighter pockets.'
    : 'You wake on a gurney at Coral Bay General smelling of salt and antiseptic. The bill is the least of it — Vera has already heard.';
  el('downScreen').classList.remove('hidden');
};

function respawn() {
  const p = W.player, kind = el('downTitle').textContent === 'BUSTED' ? 'busted' : 'wasted';
  const fine = kind === 'busted' ? Math.min(W.money, Math.max(40, Math.round(W.money * 0.12))) : Math.min(W.money, 100);
  W.money -= fine;
  if (p.car) { p.car.isPlayer = false; p.car.driver = null; p.car = null; }
  p.mesh.visible = true;
  p.x = 163; p.z = 146; p.h = Math.PI; p.yaw = Math.PI;
  p.mesh.position.set(p.x, 0, p.z);
  p.hp = 100; p.armor = 25; p.dead = false;
  W.heat = 0; W.bust = 0; W.seenT = 99;
  for (let i = W.cops.length - 1; i >= 0; i--) {
    const car = W.cops[i];
    if (!car.isPlayer) { W.scene.remove(car.mesh); W.cars.splice(W.cars.indexOf(car), 1); }
  }
  W.cops.length = 0;
  for (const cop of W.officers) W.scene.remove(cop.mesh);
  W.officers.length = 0;
  for (let i = W.roadblocks.length - 1; i >= 0; i--) clearRoadblock(W.roadblocks[i]);
  if (W.heli) { W.heli.active = false; W.heli.mesh.visible = false; }
  failMission();
  W.sideJob = null;
  W.over = false;
  el('downScreen').classList.add('hidden');
  W.notify(kind === 'busted' ? 'Fined $' + fine + ' — the bay keeps turning' : 'Hospital bill $' + fine);
  W.saveGame();
  lockPointer();
}

// --- screenshot staging -------------------------------------------------------------
// Each shot seeds the world the same way, places the cast, runs fixed steps
// of the real simulation, then parks the camera. Real renders, no edits.
function stageShot(name, seed) {
  reseed(seed * 104729 + 7);
  const p = W.player;
  const steps = (n) => { for (let i = 0; i < n; i++) stepGame(1 / 30); };
  const cam = (x, y, z, lx, ly, lz) => { W.camera.position.set(x, y, z); W.camera.lookAt(lx, ly, lz); };
  if (name === 'cover') {
    const car = makeCar('coupe', 0xff5a3c, 120, COAST_Z, -Math.PI / 2);
    enterCar(car);
    car.speed = 16.5;
    W.shotDrive = true; W.shotHeading = -Math.PI / 2;
    startMission(1);
    W.dialogue.length = 0;
    addHeat(4);
    for (const back of [18, 27, 36]) {
      const cop = spawnCopCar();
      cop.x = car.x + back; cop.z = COAST_Z + (back % 2 ? -2.5 : 2.5); cop.h = -Math.PI / 2; cop.speed = 16.5;
    }
    if (!W.heli) W.heli = buildHelicopter();
    W.heli.active = true; W.heli.mesh.visible = true;
    W.heli.x = car.x - 22; W.heli.z = car.z - 6;
    steps(60);
    const c = p.car;
    // Park the helicopter up-frame for the final render: far enough ahead
    // that its altitude fits inside the camera's field of view.
    W.heli.x = c.x + 24; W.heli.z = c.z + 22;
    W.heli.mesh.position.set(W.heli.x, 22.8, W.heli.z);
    W.heli.mesh.rotation.y = 0.6;
    W.heli.mesh.userData.cone.visible = false; // the beam reads as a white pillar in daylight stills
    cam(c.x - 13.5, 2.7, c.z - 9.5, c.x + 7, 1.5, c.z + 1.5);
  } else if (name === 'marina') {
    p.x = 158; p.z = 146; p.yaw = 2.8; p.h = 2.8;
    p.mesh.position.set(p.x, 0, p.z);
    spawnPed(146, 148); spawnPed(168, 144); spawnPed(158, 158);
    const car = makeCar('sedan', 0x274e13, 128, COAST_Z - 3, Math.PI / 2);
    car.driver = 'traffic'; trafficRouteFrom(car);
    steps(70);
    cam(170, 2.6, 131, 151, 1.2, 156);
  } else if (name === 'mission') {
    p.x = 161.5; p.z = 147.5; p.yaw = -1.17; p.h = -1.17;
    p.mesh.position.set(p.x, 0, p.z);
    startMission(2);
    steps(55);
    cam(166, 2.2, 143, 157, 1.3, 149.5);
  } else if (name === 'roadblock') {
    const car = makeCar('sedan', 0x8a1f1f, 58, COAST_Z, -Math.PI / 2);
    enterCar(car);
    car.speed = 14;
    W.shotDrive = true; W.shotHeading = -Math.PI / 2;
    addHeat(3.2);
    placeRoadblock();
    steps(75);
    const c = p.car;
    cam(c.x + 10.5, 3.6, c.z + 7.5, c.x - 18, 1.0, c.z);
  }
  updateHUD(0.016);
  W.renderer.render(W.scene, W.camera);
  document.title = 'SHOT-READY';
}

addEventListener('DOMContentLoaded', boot);
