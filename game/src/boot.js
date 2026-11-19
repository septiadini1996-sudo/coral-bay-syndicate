// boot.js — the glue. Builds the renderer and the world, wires input
// (keyboard, mouse, real pointer lock), runs the fixed-order frame
// update (jobs, actor, traffic, police, physics, crowd, effects), and
// owns the top-level mode machine: menu, play, pause, over — plus the
// deterministic ?shot= mode used to take the entry's screenshots.

import { clamp, makeRng } from './base.js';
import { G, tickTimers, START_SPOT } from './state.js';
import { buildCity } from './city.js';
import { initFx } from './puffs.js';
import { snd } from './tone.js';
import { spawnTraffic, spawnParked, updateTraffic } from './flow.js';
import { spawnCrowd, updateCrowd, carMeetPed } from './crowd.js';
import { updateLaw, reportCrime } from './law.js';
import { buildHero, updateActor, applyLook } from './actor.js';
import { stepCar, resolveCarPairs } from './autos.js';
import { loadSave, storeSave, startJobs, updateJobs, placeMarkedCar } from './jobs.js';
import { initDash, showScreen, updateDash } from './dash.js';
import { stage } from './scenes.js';

const THREE = window.THREE; // vendored three.min.js, loaded before this module
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
if (params.get('seed')) G.world = makeRng(parseInt(params.get('seed'), 10) || 1);

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(90, 55, 150);
camera.lookAt(0, 0, 0);
G.three = { renderer, scene, camera, canvas };
G.snd = snd;

buildCity(THREE, scene);
initFx(THREE, scene);
initDash(THREE, scene);
buildHero(THREE, scene);
spawnTraffic(THREE, scene, 18);
spawnParked(THREE, scene);
placeMarkedCar(THREE, scene);
spawnCrowd(THREE, scene, 34);
loadSave();

// ---------------- input ------------------------------------------------
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  G.keys[e.code] = true;
});
addEventListener('keyup', (e) => { G.keys[e.code] = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && G.mode === 'play') {
    G.mouseDX += e.movementX; G.mouseDY += e.movementY;
  }
});
addEventListener('mousedown', (e) => { if (e.button === 0) G.mouseDown = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) G.mouseDown = false; });
canvas.addEventListener('click', () => {
  if (G.mode === 'play' && document.pointerLockElement !== canvas) lockPointer();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && G.mode === 'play' && !shotName) {
    G.mode = 'pause';
    showScreen('pause');
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function lockPointer() {
  try {
    const r = canvas.requestPointerLock();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch { /* headless or iframe: play continues without lock */ }
}

// ---------------- mode flow ---------------------------------------------
function resetWorld() {
  const hero = G.hero;
  // clear the force
  for (let i = G.cops.length - 1; i >= 0; i--) {
    const car = G.cops[i].car;
    scene.remove(car.g);
    const ci = G.cars.indexOf(car);
    if (ci >= 0) G.cars.splice(ci, 1);
  }
  G.cops.length = 0;
  if (G.driveCar) { G.driveCar.role = 'parked'; G.driveCar = null; }
  if (G.markedCar && G.markedCar.role !== 'player') {
    G.markedCar.role = 'parked';
    G.markedCar.g.position.set(-115.1, 0, 40);
    G.markedCar.head = Math.PI; G.markedCar.g.rotation.y = Math.PI;
    G.markedCar.speed = 0; G.markedCar.dmg = 0; G.markedCar.dead = false;
  }
  hero.g.visible = true;
  hero.g.position.set(START_SPOT.x, 0, START_SPOT.z);
  hero.yaw = Math.PI / 2; hero.hp = 100; hero.lastHurtAt = -99;
  G.wanted.heat = 0; G.wanted.stars = 0; G.wanted.lastSeenAt = -99;
  G.bust = 0; G.timers.length = 0;
  G.events.shot = null; G.events.crash = null;
  G.objective = null;
}

function startPlay(fresh) {
  snd.unlock();
  if (fresh) {
    G.save.money = 350; G.save.story = 0; G.save.jobsDone = 0;
    storeSave();
  }
  resetWorld();
  G.mode = 'play';
  showScreen(null);
  startJobs();
  lockPointer();
}

function respawn() {
  G.save.money = Math.max(0, G.save.money - 150);
  storeSave();
  resetWorld();
  G.mode = 'play';
  showScreen(null);
  startJobs();
  lockPointer();
}

document.getElementById('btn-new').addEventListener('click', () => startPlay(true));
document.getElementById('btn-continue').addEventListener('click', () => startPlay(false));
document.getElementById('btn-resume').addEventListener('click', () => {
  G.mode = 'play';
  showScreen(null);
  lockPointer();
});
document.getElementById('btn-respawn').addEventListener('click', respawn);
if (G.save.jobsDone === 0 && G.save.story === 0) {
  document.getElementById('btn-continue').style.display = 'none';
}

// ---------------- shot mode ----------------------------------------------
if (shotName) {
  G.mode = 'play';
  showScreen(null);
  stage(THREE, scene, shotName);
  setTimeout(() => { window.__shotReady = true; }, 1600);
} else {
  G.mode = 'menu';
  showScreen('menu');
}
window.__game = G;
window.__start = startPlay;

// ---------------- frame ---------------------------------------------------
const clock = new THREE.Clock();
let menuAngle = 0.6;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.wall += dt;
  if (G.mode === 'play') {
    G.time += dt;
    tickTimers();
    applyLook();
    updateJobs(dt);
    updateActor(THREE, scene, dt);
    if (G.shotDrive && G.driveCar) {
      const c = G.driveCar;
      c.ctl.thr = clamp((G.shotDrive.speed - c.speed) * 0.3, -0.6, 1);
      c.ctl.steer = 0;
    }
    updateTraffic(dt);
    updateLaw(THREE, scene, dt);
    for (const car of G.cars) {
      stepCar(car, car.ctl || { thr: 0, steer: 0, brake: car.role === 'parked' }, dt);
      car.ctl = null;
    }
    resolveCarPairs();
    for (const car of G.cars) {
      if (Math.abs(car.speed) > 3 && carMeetPed(car)) {
        if (car.role === 'player') reportCrime(38, car.g.position.x, car.g.position.z);
      }
      // damaged cars smoke
      if (car.dmg > 0.45 && !car.dead && G.time > car.smokeAt) {
        car.smokeAt = G.time + 0.14;
        const fx = Math.sin(car.head), fz = Math.cos(car.head);
        G.fx.smokePuff(car.g.position.x + fx * 1.6, 0.95, car.g.position.z + fz * 1.6, 1 - car.dmg * 0.5);
      }
      if (car.dead && G.time > car.smokeAt) {
        car.smokeAt = G.time + 0.3;
        G.fx.smokePuff(car.g.position.x, 1, car.g.position.z, 0.5);
      }
    }
    updateCrowd(dt);
    G.fx.update(dt);
    if (G.hero.hp <= 0 && G.mode === 'play') {
      G.mode = 'over';
      G.overWhy = 'wasted';
    }
    if (G.mode === 'over') {
      if (document.exitPointerLock) document.exitPointerLock();
      showScreen('over');
    }
    updateDash();
    document.getElementById('ui-cross').style.display = G.driveCar ? 'none' : 'block';
  } else if (G.mode === 'menu') {
    menuAngle += dt * 0.03;
    camera.position.set(Math.sin(menuAngle) * 150, 58, Math.cos(menuAngle) * 150);
    camera.lookAt(10, 0, 0);
    G.city.update(dt);
  } else {
    G.city.update(dt * 0.25);
  }
  if (G.mode === 'play') G.city.update(dt);
  snd.update(dt);
  renderer.render(scene, camera);
}
frame();
