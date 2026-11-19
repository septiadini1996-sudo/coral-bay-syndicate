// boot.js — entry point: renderer and scene, input (keyboard, mouse,
// pointer lock with a drag fallback), the third-person camera, the main
// loop, cross-module wiring, menu flow, and the screenshot staging rig
// driven by URL parameters (?scene=chase etc., see shots.json).
import { G, keys, clamp, lerp, wrapAng, angToward } from './defs.js';
import { buildWorld, updateSky } from './city.js';
import { initRides, populateStreets, updateTraffic, collideVehicles, spawnVehicle } from './rides.js';
import { buildPlayer, buildPeds, updateFolks, playerPos, enterVehicle } from './folks.js';
import { initCops, updateCops, shoot, punch, crime } from './cops.js';
import { initStory, updateStory, onBusted, newGame, saveGame } from './story.js';
import { initHud, updateHud, showScreen, resolveInteract } from './hud.js';
import { initAudio, updateAudio, sfx } from './sound.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = params.get('q') !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf7c98b);
scene.fog = new THREE.Fog(0xf7c98b, 130, 640);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1600);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- build the world ---------------------------------------------------------
initRides(scene);
buildWorld(scene);
buildPlayer(scene);
buildPeds(scene);
populateStreets();
initCops(scene);
initStory(scene);
initHud();

G.hooks.onCrash = (v, mag) => {
  crime.crash(v, mag);
  if (mag > 9) { G.lastDangerAt = G.time; G.lastDangerX = v.group.position.x; G.lastDangerZ = v.group.position.z; }
};
G.hooks.onPedHit = (ped, v) => crime.pedHit(v);
G.hooks.onBusted = () => { onBusted(); showScreen('busted'); };
G.hooks.onEnterVehicle = (v) => {
  if (!G.seen.driveHint) {
    G.seen.driveHint = true;
    G.hooks.toast(`Driving the ${v.stats.label} — WASD to drive, Space handbrake, E to exit`);
  }
};

// --- input ---------------------------------------------------------------------
let mouseDownAt = 0;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  initAudio();
  if (e.code === 'Escape') {
    if (G.mode === 'play') { G.mode = 'pause'; showScreen('pause'); }
    else if (G.mode === 'pause') { G.mode = 'play'; showScreen(null); }
    return;
  }
  if (e.code === 'KeyE' && (G.mode === 'play' || G.mode === 'dialog')) {
    const it = resolveInteract();
    if (it) it.act();
  }
  if (e.code === 'KeyF' && G.mode === 'play' && !G.player.vehicle) doAttack();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('click', () => {
  initAudio();
  if (G.mode === 'play' && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
});
addEventListener('mousemove', (e) => {
  if (G.mode !== 'play' && G.mode !== 'dialog') return;
  if (document.pointerLockElement === canvas) {
    G.camYaw -= e.movementX * 0.0026;
    G.camPitch = clamp(G.camPitch + e.movementY * 0.0021, 0.04, 1.25);
  } else if (e.buttons & 1) {
    G.camYaw -= e.movementX * 0.005;
    G.camPitch = clamp(G.camPitch + e.movementY * 0.004, 0.04, 1.25);
  }
});
canvas.addEventListener('mousedown', (e) => {
  mouseDownAt = performance.now();
  if (G.mode === 'play' && G.armed && !G.player.vehicle && document.pointerLockElement === canvas && e.button === 0) doAttack();
});
function doAttack() {
  const P = G.player;
  if (P.punchCd > 0) return;
  P.punchCd = 0.34; P.punchT = 0.24;
  if (!punch(P) && G.armed) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const o = camera.position;
    shoot(o.x + dir.x * 1.4, o.y + dir.y * 1.4, o.z + dir.z * 1.4, dir.x, dir.y, dir.z);
    G.camPitch = clamp(G.camPitch - 0.014, 0.04, 1.25); // recoil kick
  }
}

// --- menu flow -------------------------------------------------------------------
function startPlay(fresh) {
  initAudio();
  if (fresh) newGame();
  G.mode = 'play';
  showScreen(null);
  document.getElementById('hud').style.display = 'block';
  if (fresh) G.hooks.toast('Find Celia at the marina — west side of the bay');
}
document.getElementById('startBtn').addEventListener('click', () => startPlay(true));
document.getElementById('continueBtn').addEventListener('click', () => startPlay(false));
document.getElementById('resumeBtn').addEventListener('click', () => { G.mode = 'play'; showScreen(null); });
document.getElementById('saveBtn').addEventListener('click', () => { saveGame(); G.hooks.toast('Game saved'); });
document.getElementById('bustedBtn').addEventListener('click', () => { G.mode = 'play'; showScreen(null); });

// --- staging for screenshots -------------------------------------------------------
let shotCam = null, frames = 0;
function stageScene(name) {
  G.mode = 'play';
  document.getElementById('hud').style.display = 'block';
  showScreen(null);
  const P = G.player;
  if (params.get('weather')) G.forceWeather = params.get('weather');
  if (params.get('day')) { G.forceDay = true; G.dayT = parseFloat(params.get('day')); }
  const put = (v, x, z, h, speed = 0) => { v.group.position.set(x, 0, z); v.heading = h; v.group.rotation.y = h; v.speed = speed; return v; };
  if (name === 'chase') {
    G.dayT = 0.36;
    const car = put(spawnVehicle('sport', 0, -40, 0, { color: 0xd92662 }), 0, -40, 0, 10);
    enterVehicle(car); car.everStolen = true;
    const c1 = put(spawnVehicle('police', -2.5, -56, 0, { driver: 'cop' }), -2.5, -56, 0, 9.5);
    const c2 = put(spawnVehicle('police', 3, -66, 0, { driver: 'cop' }), 3, -66, 0, 9.5);
    G.cops.push(c1, c2);
    G.heat = 4.4;
    G.autoDrive = true;
    G.autoWps = [[0, 150]]; // one long straight run up the downtown canyon
    G.heliLow = true;
    shotCam = (t) => {
      const p = car.group.position;
      camera.position.set(p.x + Math.sin(car.heading + 0.62) * 11.5, 2.4, p.z + Math.cos(car.heading + 0.62) * 11.5);
      camera.lookAt(p.x - Math.sin(car.heading) * 2, 1.8, p.z - Math.cos(car.heading) * 2);
    };
  } else if (name === 'drive') {
    G.dayT = 0.3;
    const bike = put(spawnVehicle('sportbike', 60, 115, Math.PI / 2, { color: 0x118ab2 }), 60, 115, Math.PI / 2, 20);
    enterVehicle(bike); bike.everStolen = true;
    shotCam = () => {
      const p = bike.group.position;
      camera.position.set(p.x - 5.8, 1.7, p.z + 5.0);
      camera.lookAt(p.x + 5, 1.0, p.z + 0.5);
    };
  } else if (name === 'marina') {
    G.forceWeather = 'rain'; G.forceDay = true; G.dayT = 0.8; G.wet = 0.9;
    P.g.position.set(-214, 0.36, -40);
    P.heading = -Math.PI / 2;
    put(spawnVehicle('vintage', -186, -18, 0.3, { parked: true, color: 0x7a1f2b }), -186, -18, 0.3);
    shotCam = () => {
      camera.position.set(-199, 3.2, -55);
      camera.lookAt(-219, 2.0, -34);
    };
  } else if (name === 'rico') {
    G.dayT = 0.38;
    P.g.position.set(30, 0, 40);
    P.heading = 2.5;
    put(spawnVehicle('sport', 34.5, 43.5, 2.2, { parked: true, color: 0xd92662 }), 34.5, 43.5, 2.2);
    put(spawnVehicle('monster', 37.5, 35.0, 2.9, { parked: true, color: 0x7fb069 }), 37.5, 35.0, 2.9);
    shotCam = () => {
      camera.position.set(25.2, 1.6, 36.2);
      camera.lookAt(31, 1.2, 41);
    };
  }
}
if (params.get('scene')) stageScene(params.get('scene'));
else showScreen('menu');

// --- camera ---------------------------------------------------------------------------
const _focus = new THREE.Vector3(), _want = new THREE.Vector3();
function updateCamera(dt) {
  if (shotCam) { shotCam(G.time); return; }
  const pp = playerPos();
  const inCar = !!G.player.vehicle;
  _focus.set(pp.x, pp.y + (inCar ? 1.7 : 1.55), pp.z);
  if (G.mode === 'menu') {
    const a = G.time * 0.05;
    camera.position.set(Math.cos(a) * 120, 42, Math.sin(a) * 120);
    camera.lookAt(0, 6, 0);
    return;
  }
  if (inCar && Math.abs(G.player.vehicle.speed) > 2.5)
    G.camYaw = angToward(G.camYaw, G.player.vehicle.heading, 1.5 * dt);
  const dist = inCar ? 8.6 : 6.0;
  const cp = Math.cos(G.camPitch), sp = Math.sin(G.camPitch);
  _want.set(
    _focus.x - Math.sin(G.camYaw) * cp * dist,
    _focus.y + sp * dist,
    _focus.z - Math.cos(G.camYaw) * cp * dist
  );
  _want.y = Math.max(_want.y, 0.65);
  const k = 1 - Math.exp(-9 * dt);
  camera.position.lerp(_want, shotCam ? 1 : k);
  const ahead = inCar ? clamp(G.player.vehicle.speed * 0.32, 0, 7) : 0;
  camera.lookAt(_focus.x + Math.sin(G.camYaw) * ahead, _focus.y - sp * 1.2, _focus.z + Math.cos(G.camYaw) * ahead);
}

// --- main loop ---------------------------------------------------------------------------
const skyGolden = new THREE.Color(0xf7c98b), skyDusk = new THREE.Color(0x2c3a58), _sky = new THREE.Color();
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dtRaw = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  frames++;
  const active = G.mode === 'play' || G.mode === 'dialog';
  if (active || G.mode === 'menu') {
    G.dt = dtRaw;
    G.time += dtRaw;
    const focus = playerPos();
    const darkness = updateSky(dtRaw, focus);
    _sky.copy(skyGolden).lerp(skyDusk, darkness);
    scene.background.copy(_sky);
    scene.fog.color.copy(_sky);
    if (active) {
      updateFolks(dtRaw);
      updateTraffic(dtRaw);
      collideVehicles();
      updateCops(dtRaw);
      updateStory(dtRaw);
      const pv = G.player.vehicle;
      updateAudio(pv ? Math.abs(pv.speed) / pv.stats.top : 0, !!pv, G.siren01 ?? 0, G.wet, G.time);
    }
  }
  updateCamera(dtRaw);
  if (G.mode !== 'menu') updateHud();
  renderer.render(scene, camera);
  if (frames === 110 && params.get('scene')) window.__shotReady = true;
}
requestAnimationFrame(loop);

// Debug/playtest handle (also used by the screenshot tooling).
window.CBS = { G, crime, shoot, punch, resolveInteract, spawnVehicle, startPlay };
