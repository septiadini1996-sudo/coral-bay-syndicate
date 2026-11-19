// Coral Bay Syndicate — bootstrap and game loop. Builds the city and every
// system (traffic, pedestrians, police, missions, HUD, audio, effects), owns
// the menu / play / pause / busted / wasted state machine, the crime table
// that turns actions into wanted heat, saving, and the deterministic
// screenshot mode (?shot=<scene>&seed=1) used to take the entry's pictures.
const THREE = window.THREE;
import { mulberry32 } from './util.js';
import { buildCity, LANDMARKS } from './city.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { createFX } from './fx.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { applyShotScene } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = shotName ? parseInt(params.get('seed') || '1', 10) || 1 : (Date.now() % 90000) + 7;

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, shotName ? 1 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1200);
camera.position.set(-120, 26, 226);
camera.lookAt(0, 0, 60);

const G = {
  scene, camera, renderer,
  time: 0, state: shotName ? 'shot' : 'menu',
  keys: {}, mouseDown: false, money: 0,
  shotMode: !!shotName, shotCam: null, lastGunshot: null, lastCrash: null, lastCrimeShot: -9,
  rand: mulberry32(seed * 31 + 5),
};
window.__game = G;

G.city = buildCity(scene, mulberry32(seed * 7919 + 13));
G.traffic = createTraffic(scene, mulberry32(seed * 104729 + 3), 18, { onHonk: () => { if (G.audio) G.audio.honk(); } });
G.peds = createPedestrians(scene, mulberry32(seed * 31337 + 9), 34);
G.player = createPlayer(scene);
G.police = createPolice(scene, G.city, mulberry32(seed * 5557 + 1));
G.hud = createHUD();
G.audio = createAudio();
G.fx = createFX(scene);
G.missions = createMissions(G);

/* ---------------- crime & money ---------------- */
const CRIME_HEAT = { shotsFired: 0.5, shootPed: 1.5, runOver: 1.5, assault: 0.7, shootCar: 0.4, shootCop: 1.2, stealCar: 0.9, hitCop: 0.8, hitCar: 0.3 };
let lastImpactCrime = -9;
G.crime = (kind) => {
  if (G.state !== 'play') return;
  G.police.addHeat(CRIME_HEAT[kind] ?? 0.3);
  if (kind === 'stealCar') G.hud.toast('Vehicle stolen — the CBPD has your description');
  if (kind === 'runOver') G.hud.toast('You ran someone down!');
};
G.addMoney = (n) => { G.money += n; };
G.onCarImpact = (impact, playerCar) => {
  playerCar.health -= impact * 0.75;
  if (playerCar.health <= 0) playerCar.disabled = true;
  // The world reacts: dust at the hit, a crash the crowd and traffic notice.
  G.lastCrash = { x: G.player.x, z: G.player.z, t: G.time };
  G.fx.dust(G.player.x, 0.7, G.player.z);
  if (impact > 13) G.fx.smoke(G.player.x, 1.1, G.player.z);
  if (G.time - lastImpactCrime < 1.2) return;
  let nearest = null, nd = 6;
  for (const v of G.traffic.cars) {
    if (v === playerCar) continue;
    const d = Math.hypot(v.group.position.x - G.player.x, v.group.position.z - G.player.z);
    if (d < nd) { nd = d; nearest = v; }
  }
  for (const u of G.police.units) {
    const d = Math.hypot(u.vehicle.x - G.player.x, u.vehicle.z - G.player.z);
    if (d < nd) { nd = d; nearest = u.vehicle; }
  }
  if (!nearest) return;
  lastImpactCrime = G.time;
  nearest.health -= impact * 1.1;
  if (nearest.health <= 0) nearest.disabled = true;
  G.crime(nearest.kind === 'police' ? 'hitCop' : 'hitCar');
};

/* ---------------- life, death, arrest ---------------- */
function resetPlayerAt(x, z) {
  const P = G.player;
  if (P.car) { P.car.driver = 'parked'; P.car.parked = true; P.car = null; }
  P.mode = 'foot'; P.group.visible = true;
  P.group.position.set(x, 0.05, z);
  P.health = 100; P.dead = false;
  G.police.reset();
}
G.onWasted = () => {
  if (G.state !== 'play') return;
  G.state = 'wasted';
  document.exitPointerLock?.();
  const fine = Math.min(G.money, 200);
  document.getElementById('deathtext').textContent =
    `The medics at St. Alba Hospital patched you up — and billed you $${fine}.`;
  G.pendingFine = fine;
  document.getElementById('deathscreen').classList.remove('hidden');
};
G.onBusted = () => {
  if (G.state !== 'play') return;
  G.state = 'busted';
  document.exitPointerLock?.();
  const fine = Math.min(G.money, 250);
  document.getElementById('bustedtext').textContent =
    `Coral Bay PD walked you out in cuffs. The crew paid your $${fine} fine.`;
  G.pendingFine = fine;
  document.getElementById('bustedscreen').classList.remove('hidden');
};
G.saveGame = () => {
  if (G.shotMode) return;
  writeSave({ money: G.money, missions: G.missions.snapshot() });
};

/* ---------------- flow ---------------- */
const $ = (id) => document.getElementById(id);
function lockPointer() {
  try {
    const r = canvas.requestPointerLock();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch { /* pointer lock unavailable (headless, iframe): play continues */ }
}
function startPlay(fresh) {
  G.audio.unlock(); G.audio.startMusic();
  if (fresh) { G.money = 0; G.missions.restore({ storyIndex: 0, storyComplete: false }); }
  $('menu').classList.add('hidden');
  G.hud.show();
  G.state = 'play';
  G.missions.begin();
  lockPointer();
}
$('btn-new').addEventListener('click', (e) => { e.target.blur(); clearSave(); resetPlayerAt(-132, 186); startPlay(true); });
$('btn-continue').addEventListener('click', (e) => {
  e.target.blur();
  const save = loadSave();
  if (save) { G.money = save.money; G.missions.restore(save.missions); }
  startPlay(false);
});
$('btn-resume').addEventListener('click', (e) => { e.target.blur(); $('pause').classList.add('hidden'); G.state = 'play'; lockPointer(); });
$('btn-quit').addEventListener('click', (e) => {
  e.target.blur();
  $('pause').classList.add('hidden'); G.hud.hide(); G.state = 'menu';
  $('menu').classList.remove('hidden');
  $('btn-continue').disabled = !loadSave();
});
$('btn-respawn').addEventListener('click', (e) => {
  e.target.blur();
  G.money -= G.pendingFine ?? 0;
  $('deathscreen').classList.add('hidden');
  resetPlayerAt(LANDMARKS.hospital.x, LANDMARKS.hospital.z);
  G.state = 'play'; G.saveGame();
  lockPointer();
});
$('btn-bail').addEventListener('click', (e) => {
  e.target.blur();
  G.money -= G.pendingFine ?? 0;
  $('bustedscreen').classList.add('hidden');
  resetPlayerAt(LANDMARKS.police.x, LANDMARKS.police.z);
  G.state = 'play'; G.saveGame();
  lockPointer();
});
if (!loadSave()) $('btn-continue').disabled = true;

/* ---------------- input ---------------- */
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  G.keys[e.code] = true;
  if (e.code === 'KeyM') G.audio.setMuted(!G.audio.muted);
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (G.state === 'play') { G.state = 'pause'; $('pause').classList.remove('hidden'); document.exitPointerLock?.(); }
    else if (G.state === 'pause') { $('pause').classList.add('hidden'); G.state = 'play'; lockPointer(); }
  }
  if (e.code === 'KeyE' && G.state === 'play' && !e.repeat) {
    const P = G.player;
    if (P.mode === 'car') P.exitCar(G);
    else {
      let best = null, bd = 4.1;
      for (const v of G.traffic.cars) {
        if (v.driver === 'player') continue;
        const d = Math.hypot(v.group.position.x - P.x, v.group.position.z - P.z);
        if (d < bd && Math.abs(v.speed ?? 0) < 7) { bd = d; best = v; }
      }
      if (best) {
        P.enterCar(best, G);
        if (!best.everStolen) { best.everStolen = true; G.crime('stealCar'); }
        G.audio.unlock();
      }
    }
  }
  if (e.code === 'KeyF' && G.state === 'play' && G.player.mode === 'foot' && !e.repeat) G.player.melee(G);
});
addEventListener('keyup', (e) => { G.keys[e.code] = false; });
canvas.addEventListener('click', () => {
  if (G.state === 'play' && document.pointerLockElement !== canvas) lockPointer();
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || G.state !== 'play') return;
  const P = G.player;
  P.camYaw -= e.movementX * 0.0024;
  P.camPitch = Math.max(-0.1, Math.min(0.62, P.camPitch + e.movementY * 0.0021));
});
addEventListener('mousedown', (e) => { if (e.button === 0 && document.pointerLockElement === canvas) G.mouseDown = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) G.mouseDown = false; });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && G.state === 'play' && !G.shotMode) {
    G.state = 'pause'; $('pause').classList.remove('hidden');
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------------- screenshot mode ---------------- */
if (G.shotMode) {
  G.money = 340;
  $('menu').classList.add('hidden');
  G.hud.show();
  applyShotScene(shotName, G);
  if (shotName === 'chase') G.player.health = 76;
  if (shotName === 'combat') { G.player.health = 64; G.money = 520; }
  if (shotName === 'drive') G.money = 520;
  if (shotName === 'marina') G.money = 125;
}

/* ---------------- the loop ---------------- */
const clock = new THREE.Clock();
let saveCd = 10;
let smokeCd = 0;
let shotFrames = 0;
function frame() {
  // Screenshot mode renders a bounded run of frames, then holds the last one:
  // the staged scene is already complete, and an idle page lets headless
  // capture finish quickly instead of rendering forever.
  if (G.shotMode && shotFrames >= 110) return;
  shotFrames++;
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  const P = G.player;

  if (G.state === 'play') {
    P.update(dt, G);
    G.traffic.update(dt, P, false, trafficCtx());
    G.peds.update(dt, pedCtx());
    G.police.update(dt, G);
    G.missions.update(dt);
    updatePrompt();
    saveCd -= dt;
    if (saveCd <= 0) { saveCd = 15; G.saveGame(); }
    smokeCd -= dt;
    if (smokeCd <= 0) { smokeCd = 0.14; emitWreckSmoke(); }
  } else if (G.shotMode) {
    // The staged scene: world systems idle and breathe, the camera is placed.
    G.traffic.update(dt, P, true, null);
    G.peds.update(dt, pedCtx());
    G.police.update(dt, G);
    if (G.shotCam) {
      camera.position.copy(G.shotCam.pos);
      camera.lookAt(G.shotCam.look);
    }
    if (shotName === 'marina') { P.group.rotation.y = P.heading; P.armPivot.rotation.x = 0; }
  } else {
    // Menu / pause: a slow establishing orbit over the bay.
    const t = G.time * 0.05;
    camera.position.set(Math.sin(t) * 150, 42 + Math.sin(G.time * 0.13) * 6, Math.cos(t) * 150 + 40);
    camera.lookAt(0, 4, 30);
    G.traffic.update(dt, { x: 9999, z: 9999 }, false, null);
    G.peds.update(dt, pedCtx());
  }

  G.city.update(dt, G.time);
  G.fx.update(dt);
  if (G.state === 'play' || G.shotMode) {
    G.hud.setMoney(G.money);
    G.hud.setHealth(P.health);
    G.hud.setWanted(G.police.stars);
    G.hud.update(dt);
    G.hud.drawMinimap(G);
    G.audio.setEngine(G.state === 'play' && P.mode === 'car', P.mode === 'car' ? Math.abs(P.car.speed) / P.car.maxSpeed : 0);
    G.audio.setSiren(G.police.stars > 0 && G.police.nearestDist < 95, G.police.nearestDist);
  }
  renderer.render(scene, camera);
}

// Damaged and wrecked cars breathe a thin thread of smoke.
function emitWreckSmoke() {
  const P = G.player;
  if (P.car && (P.car.disabled || P.car.health < 30)) G.fx.smoke(P.x, 1.1, P.z);
  let used = 0;
  for (const u of G.police.units) {
    if (used >= 2) break;
    if (u.vehicle.disabled) { G.fx.smoke(u.vehicle.x, 1.1, u.vehicle.z); used++; }
  }
  for (const v of G.traffic.cars) {
    if (used >= 2) break;
    if (v.disabled && Math.hypot(v.group.position.x - P.x, v.group.position.z - P.z) < 70) {
      G.fx.smoke(v.group.position.x, 1.1, v.group.position.z); used++;
    }
  }
}

function trafficCtx() {
  return {
    playerCar: G.player.mode === 'car' ? G.player.car : null,
    crashAt: G.lastCrash && G.time - G.lastCrash.t < 2.5 ? G.lastCrash : null,
    time: G.time,
  };
}

function pedCtx() {
  const recentShot = G.lastGunshot && G.time - G.lastGunshot.t < 2.5 ? G.lastGunshot : null;
  const recentCrash = G.lastCrash && G.time - G.lastCrash.t < 2.5 ? G.lastCrash : null;
  let policeAt = null;
  if (G.police.stars > 0) {
    let bd = 46;
    for (const u of G.police.units) {
      const d = Math.hypot(u.vehicle.x - G.player.x, u.vehicle.z - G.player.z);
      if (d < bd) { bd = d; policeAt = { x: u.vehicle.x, z: u.vehicle.z }; }
    }
  }
  return {
    gunshotAt: recentShot,
    crashAt: recentCrash,
    policeAt,
    wanted: G.police.stars,
    playerCar: G.player.mode === 'car' ? G.player.car : null,
    playerCarPos: G.player.mode === 'car' ? G.player : null,
    playerCarSpeed: G.player.mode === 'car' ? Math.abs(G.player.car.speed) : 0,
  };
}

function updatePrompt() {
  const P = G.player;
  if (P.mode === 'car') { G.hud.prompt('E', 'Exit vehicle'); return; }
  let best = null, bd = 4.1;
  for (const v of G.traffic.cars) {
    if (v.driver === 'player') continue;
    const d = Math.hypot(v.group.position.x - P.x, v.group.position.z - P.z);
    // Offer only cars the E handler would actually accept (near and slow).
    if (d < bd && Math.abs(v.speed ?? 0) < 7) { bd = d; best = v; }
  }
  if (best) { G.hud.prompt('E', `Enter the ${best.group.userData.name}`); return; }
  const nearRing = [LANDMARKS.marina, LANDMARKS.race].some((s) => Math.hypot(P.x - s.x, P.z - s.z) < 4.4);
  if (!nearRing) G.hud.prompt(null);
}

frame();
