// Coral Bay Syndicate - main.js
// Boot, input, the third-person and over-shoulder cameras, shooting,
// entering cars, armor pickups and the frame loop that ticks every
// system. Loaded last; everything else registers into G before this
// file starts the world.

'use strict';

var VEST_SPOTS = [[196, 316], [-486, -470], [64, 1372]];
var vestMeshes = [];

function buildPickups() {
  for (var i = 0; i < VEST_SPOTS.length; i++) {
    var g = new THREE.Group();
    part(new THREE.BoxGeometry(0.8, 0.9, 0.4), lam(0x3d5a73), 0, 0, 0, g);
    part(new THREE.BoxGeometry(0.84, 0.2, 0.44), lam(0x9fc6e8), 0, 0.2, 0, g);
    g.position.set(VEST_SPOTS[i][0], 1.1, VEST_SPOTS[i][1]);
    G.scene.add(g);
    vestMeshes.push({ mesh: g, x: VEST_SPOTS[i][0], z: VEST_SPOTS[i][1], t: 0, taken: false });
  }
}
function tickPickups(dt) {
  for (var i = 0; i < vestMeshes.length; i++) {
    var v = vestMeshes[i];
    if (v.taken) {
      v.t -= dt;
      if (v.t <= 0) { v.taken = false; v.mesh.visible = true; }
      continue;
    }
    v.mesh.rotation.y = G.t * 1.6;
    v.mesh.position.y = 1.1 + Math.sin(G.t * 2 + i) * 0.15;
    if (!G.inCar && G.armor < 100 && dist2(G.player.x, G.player.z, v.x, v.z) < 2.2) {
      G.armor = Math.min(100, G.armor + 50);
      v.taken = true; v.t = 90; v.mesh.visible = false;
      sfx('pickup');
      showToast('Body armor +50 (now ' + G.armor + ')');
      saveGame();
    }
  }
}

// Input ------------------------------------------------------------
function bindInput() {
  window.addEventListener('keydown', function (e) {
    G.keys[e.code] = true;
    if (e.code === 'Tab') { e.preventDefault(); toggleMenu(); }
    if (e.code === 'KeyM') toggleMap();
    if (e.code === 'KeyE') toggleCar();
    if (e.code === 'Digit1') setWeapon(0);
    if (e.code === 'Digit2') setWeapon(1);
    if (e.code === 'Digit3') setWeapon(2);
    if (e.code === 'Comma') changeStation(-1);
    if (e.code === 'Period') changeStation(1);
    if (e.code === 'Enter' && G.finale) G.finale = false;
  });
  window.addEventListener('keyup', function (e) { G.keys[e.code] = false; });
  var cv = G.renderer.domElement;
  cv.addEventListener('mousedown', function (e) {
    if (!G.started) return;
    if (cutsceneActive()) { advanceCutscene(); return; }
    if (document.pointerLockElement !== cv) { cv.requestPointerLock(); return; }
    if (e.button === 0) {
      G.mouseDown = true; G.mouseDownT = performance.now(); G.mouseMoved = 0;
      if (G.weapon === 2 && !G.inCar) G.smgHeld = true;
    }
  });
  window.addEventListener('mouseup', function (e) {
    if (e.button !== 0) return;
    var wasDown = G.mouseDown;
    G.mouseDown = false; G.smgHeld = false;
    if (!wasDown || !G.started || cutsceneActive() || G.inCar) return;
    // A clean click fires the pistol; a drag only rotates the aim.
    var dt = performance.now() - G.mouseDownT;
    if (G.weapon === 1 && dt < 400 && G.mouseMoved < 10) fireWeapon();
  });
  window.addEventListener('mousemove', function (e) {
    if (document.pointerLockElement !== G.renderer.domElement) return;
    G.camYaw -= e.movementX * 0.0026;
    G.camPitch = clamp(G.camPitch - e.movementY * 0.0022, -0.18, 1.05);
    if (G.mouseDown) G.mouseMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
  });
  el('start-btn').addEventListener('click', startGame);
  el('finale-close').addEventListener('click', function () { G.finale = false; });
  window.addEventListener('resize', onResize);
}
function onResize() {
  G.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera.updateProjectionMatrix();
  G.renderer.setSize(window.innerWidth, window.innerHeight);
}
var menuOpen = false, mapOpen = false;
function toggleMenu() {
  menuOpen = !menuOpen;
  el('menu').style.display = menuOpen ? 'flex' : 'none';
  if (menuOpen) renderMenu();
}
function toggleMap() {
  mapOpen = !mapOpen;
  el('mapwrap').style.display = mapOpen ? 'flex' : 'none';
  if (mapOpen) drawBigMap();
}
function changeStation(d) {
  var st = radioStation(d);
  setText('radio-name', st.name);
  setText('radio-tag', st.tag);
  showToast('RADIO: ' + st.name + ' - ' + st.tag);
}
function setWeapon(w) {
  if (w > 0 && G.ammo[w] <= 0 && G.weapon !== w) { /* still selectable; firing will warn */ }
  G.weapon = w;
  if (w > 0) G.aimT = Math.max(G.aimT, 1.2);
  saveGame();
}
function toggleCar() {
  if (cutsceneActive() || G.dead) return;
  if (G.inCar) { exitCar(); return; }
  var best = null, bd = 4.4;
  for (var i = 0; i < G.cars.length; i++) {
    var c = G.cars[i];
    if (c.dead) continue;
    var d = dist2(G.player.x, G.player.z, c.x, c.z);
    if (d < bd && Math.abs(c.speed) < 7) { bd = d; best = c; }
  }
  if (best) {
    if (best.driver === 'ai') addCrime(1, best.x, best.z);   // yanking a driver out is a crime
    enterCar(best);
  }
}

// Shooting ----------------------------------------------------------
var smgT = 0, crimeT = 0;
function aimDirection() {
  var cp = Math.cos(G.camPitch);
  return { x: Math.sin(G.camYaw) * cp, y: Math.sin(G.camPitch), z: Math.cos(G.camYaw) * cp };
}
function findAimTarget(maxAngle) {
  var dir = aimDirection();
  var ox = G.player.x, oy = 1.55, oz = G.player.z;
  var best = null, bestA = maxAngle;
  function test(x, y, z, obj, kind) {
    var dx = x - ox, dy = y - oy, dz = z - oz;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > 110 || d < 0.5) return;
    var dot = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
    var ang = Math.acos(clamp(dot, -1, 1));
    if (ang < bestA) { bestA = ang; best = { obj: obj, kind: kind, dist: d }; }
  }
  for (var i = 0; i < G.peds.length; i++) { var p = G.peds[i]; if (!p.dead) test(p.x, 1.1, p.z, p, 'ped'); }
  for (var j = 0; j < G.cars.length; j++) { var c = G.cars[j]; if (!c.dead) test(c.x, 0.9, c.z, c, 'car'); }
  for (var k = 0; k < G.cops.length; k++) { var cp2 = G.cops[k]; if (!cp2.dead) test(cp2.x, 0.9, cp2.z, cp2, 'car'); }
  return best;
}
function fireWeapon() {
  if (G.weapon === 0 || G.inCar || G.dead) return;
  if (G.ammo[G.weapon] <= 0) { showToast('Out of ammo for this weapon'); return; }
  G.ammo[G.weapon]--;
  G.aimT = 2.6;
  sfx(G.weapon === 1 ? 'shot' : 'smg');
  G.camPitch += 0.006;
  var hit = findAimTarget(0.05);
  // Public gunfire draws the law, throttled to one star per 2 s.
  if (crimeT <= 0) { addCrime(1, G.player.x, G.player.z); crimeT = 2; }
  if (!hit) return;
  if (hit.kind === 'ped') {
    var wasAlive = !hit.obj.dead && !hit.obj.story;
    hurtPed(hit.obj, G.weapon === 1 ? 40 : 18, G.player.x, G.player.z);
    if (wasAlive && hit.obj.dead) addCrime(1, hit.obj.x, hit.obj.z);
  } else {
    damageCar(hit.obj, G.weapon === 1 ? 12 : 7, 'shot');
    if (hit.obj.police) addCrime(1, hit.obj.x, hit.obj.z);
  }
}
function tickShooting(dt) {
  crimeT -= dt;
  G.aimT = Math.max(0, G.aimT - dt);
  var cone = findAimTarget(0.10);
  G.aimHot = !!cone && G.weapon > 0 && !G.inCar;
  if (G.smgHeld && G.weapon === 2 && !G.inCar && !cutsceneActive()) {
    smgT -= dt;
    if (smgT <= 0) { smgT = 0.095; fireWeapon(); }
  }
}

// Camera -------------------------------------------------------------
var muzzle = null;
function updateCamera(dt) {
  var target, dist, height;
  if (G.inCar) {
    target = { x: G.inCar.x, z: G.inCar.z };
    G.camYaw = angLerp(G.camYaw, G.inCar.angle, clamp(dt * 3.2, 0, 1));
    G.camPitch = lerp(G.camPitch, 0.17, clamp(dt * 3, 0, 1));
    dist = 9.6; height = 2.7;
  } else {
    target = { x: G.player.x, z: G.player.z };
    var aiming = G.weapon > 0 && G.aimT > 0;
    dist = aiming ? 3.4 : 6.9;
    height = 1.7;
  }
  var dir = aimDirection();
  var cx = target.x - dir.x * dist;
  var cz = target.z - dir.z * dist;
  var cy = height + Math.sin(G.camPitch) * dist + 0.6;
  if (!G.inCar && G.weapon > 0 && G.aimT > 0) {
    // Over the shoulder: the camera shifts so Rico sits left of
    // centre, his head at roughly 40% of the screen width, clear of
    // the crosshair. (With this game's yaw convention, screen-right
    // is world -X, so the offset subtracts the perpendicular.)
    var rx = dir.z, rz = -dir.x;
    cx -= rx * 1.15; cz -= rz * 1.15;
  }
  G.camera.position.set(cx, Math.max(cy, 0.7), cz);
  G.camera.lookAt(target.x + dir.x * 8, 1.5 + Math.sin(G.camPitch) * 4, target.z + dir.z * 8);
}

// Boot + loop ---------------------------------------------------------
function startGame() {
  if (G.started) return;
  G.started = true;
  el('start-screen').style.display = 'none';
  radioPlay();
  G.renderer.domElement.requestPointerLock();
}
function init() {
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 4000);
  G.renderer = new THREE.WebGLRenderer({ antialias: true });
  G.renderer.setSize(window.innerWidth, window.innerHeight);
  G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  el('game').appendChild(G.renderer.domElement);
  loadGame();
  buildWorld();
  buildPeople();
  spawnTraffic();
  buildMarker();
  buildPickups();
  hudInit();
  if (G.storyDone) { G.targetPos = null; G.route = []; }
  else startJob(G.job);
  bindInput();
  G.rankName = rankFor(G.earned);
  requestAnimationFrame(frame);
}
var lastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
  lastT = now;
  G.t += dt;
  var frozen = cutsceneActive();
  if (G.started && !G.dead) {
    if (!frozen) tickPlayer(dt);
    tickCars(dt);
    tickPolice(dt);
    tickPeds(dt);
    tickMissions(dt);
    tickPickups(dt);
    tickShooting(dt);
  }
  if (frozen) tickCutscene(dt);
  tickLights();
  updateCamera(dt);
  hudTick(dt);
  if (mapOpen) drawBigMap();
  G.renderer.render(G.scene, G.camera);
}

// Hooks for the screenshot / playability harness: real game state
// only, the same functions a player's input would reach.
G.debug = {
  start: function () { if (!G.started) { G.started = true; el('start-screen').style.display = 'none'; } },
  teleport: function (x, z) {
    if (G.inCar) { G.inCar.x = x; G.inCar.z = z; }
    G.player.x = x; G.player.z = z;
    G.player.mesh.position.set(x, 0, z);
  },
  face: function (yaw, pitch) { G.camYaw = yaw; if (pitch !== undefined) G.camPitch = pitch; },
  wanted: function (n) { G.wanted = n; G.seenT = 0; },
  weapon: function (w) { setWeapon(w); G.aimT = 3; },
  enterNearest: function () { toggleCar(); },
  job: function () { return { job: G.job, step: G.jobStep, label: stepLabel() }; },
  state: function () {
    return {
      hp: G.hp, armor: G.armor, cash: G.cash, wanted: G.wanted,
      peds: G.peds.length, cars: G.cars.length, cops: G.cops.length,
      colliders: G.colliders.length, lamps: G.lampCount,
      player: { x: Math.round(G.player.x), z: Math.round(G.player.z) },
      inCar: !!G.inCar, policeState: G.policeState,
    };
  },
};

window.addEventListener('load', init);
