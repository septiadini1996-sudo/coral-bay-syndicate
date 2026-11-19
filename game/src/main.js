"use strict";
function bootGame() {
  const params = new URLSearchParams(location.search);
  const seedParam = parseInt(params.get("seed") || "", 10);
  if (!Number.isNaN(seedParam)) rng = mulberry32(seedParam);
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 6000);
  G.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  G.renderer.setSize(innerWidth, innerHeight);
  G.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  G.renderer.shadowMap.enabled = true;
  G.renderer.shadowMap.type = THREE.PCFShadowMap;
  G.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  G.renderer.toneMappingExposure = 1.12;
  el("app").appendChild(G.renderer.domElement);
  buildWorld();
  buildCast(G.scene);
  buildVehicles(G.scene);
  buildMissionMarker(G.scene);
  hudInit();
  bindInput();
  const sceneName = params.get("scene");
  if (sceneName) setupStage(sceneName);
  else showTitle();
  requestAnimationFrame(frameLoop);
}
let mouseDown = false, mouseMoved = 0, mouseDownAt = 0, lastDragT = -9;
function bindInput() {
  addEventListener("keydown", (e) => {
    G.keys[e.code] = true;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
    if (G.cutscene) {
      if (e.code === "Enter" || e.code === "Escape") skipCutscene();
      sfxInit();
      return;
    }
    if (e.code === "Escape") {
      if (G.mode === "map") toggleBigMap(false);
      else if (G.mode === "missions") toggleMissions(false);
      else if (el("menu-help").style.display === "flex") el("menu-help").style.display = "none";
      else if (G.mode === "play" || G.mode === "pause") togglePause();
    } else if (e.code === "KeyP") {
      if (el("menu-help").style.display === "flex") el("menu-help").style.display = "none";
      else if (G.mode === "play" || G.mode === "pause") togglePause();
    }
    if (e.code === "KeyM" && (G.mode === "play" || G.mode === "map")) toggleBigMap();
    if ((e.code === "Tab" || e.code === "KeyJ") && (G.mode === "play" || G.mode === "missions")) toggleMissions();
    sfxInit();
  });
  addEventListener("keyup", (e) => { G.keys[e.code] = false; });
  addEventListener("blur", () => { G.keys = {}; });
  const dom = G.renderer.domElement;
  dom.addEventListener("mousedown", (e) => {
    if (G.cutscene) { skipCutscene(); return; }
    mouseDown = true; mouseMoved = 0; mouseDownAt = performance.now(); sfxInit();
  });
  addEventListener("mousemove", (e) => {
    if (!mouseDown) return;
    mouseMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
    G.camYaw -= e.movementX * 0.0052;
    G.camPitch = clamp(G.camPitch + e.movementY * 0.004, 0.06, 1.15);
    lastDragT = G.time;
  });
  addEventListener("mouseup", () => {
    if (mouseDown && mouseMoved < 6 && performance.now() - mouseDownAt < 350 && G.mode === "play" && G.onFoot) playerAttack();
    mouseDown = false;
  });
  dom.addEventListener("wheel", (e) => { G.camDist = clamp(G.camDist + Math.sign(e.deltaY) * 1.4, 5.5, 22); }, { passive: true });
  addEventListener("resize", () => {
    G.camera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(innerWidth, innerHeight);
  });
}
const camTargetPos = new THREE.Vector3();
function updateCamera(dt) {
  const cam = G.camera;
  if (G.mode === "title") {
    const a = G.time * 0.05;
    cam.position.set(-260 + Math.cos(a) * 210, 52 + Math.sin(G.time * 0.11) * 8, -60 + Math.sin(a) * 210);
    cam.lookAt(60, 8, -40);
    return;
  }
  const f = focusPoint();
  const heading = !G.onFoot && G.vehicle ? G.vehicle.mesh.rotation.y : G.player.mesh.rotation.y;
  const moving = G.onFoot ? (G.player.speed || 0) > 0.5 : Math.abs(G.vehicle.speed) > 1;
  if (moving && G.time - lastDragT > 2.2) {
    const rate = G.onFoot ? 3.2 : clamp(Math.abs(G.vehicle.speed) * 0.14, 1.2, 4.2);
    G.camYaw = angLerp(G.camYaw, heading, clamp(dt * rate, 0, 1));
  }
  const dist = G.camDist, pitch = G.camPitch;
  const bx = Math.sin(G.camYaw), bz = Math.cos(G.camYaw);
  camTargetPos.set(
    f.x - bx * Math.cos(pitch) * dist,
    (f.y || 0) + 1.7 + Math.sin(pitch) * dist,
    f.z - bz * Math.cos(pitch) * dist
  );
  const fixed = collideCircle(camTargetPos.x, camTargetPos.z, 1.2);
  camTargetPos.x = fixed.x; camTargetPos.z = fixed.z;
  camTargetPos.y = Math.max(camTargetPos.y, 1.1);
  cam.position.lerp(camTargetPos, clamp(dt * 7, 0, 1));
  const lead = !G.onFoot && G.vehicle ? clamp(Math.abs(G.vehicle.speed) * 0.14, 0, 5) : 0;
  cam.lookAt(f.x + bx * lead, (f.y || 0) + 2.1, f.z + bz * lead);
}
let lastNow = performance.now(), fpsAccum = 0, fpsCount = 0, fpsStage = 0, hudAccum = 0;
function frameLoop(now) {
  requestAnimationFrame(frameLoop);
  const rawDt = (now - lastNow) / 1000;
  let dt = Math.min(0.05, rawDt);
  lastNow = now;
  if (dt <= 0) dt = 0.016;
  G.time += dt;
  if (fpsStage < 3 && rawDt < 1) {
    fpsAccum += rawDt; fpsCount++;
    if (fpsAccum > 4) {
      if (fpsAccum / fpsCount > 0.034 && G.sun && G.sun.castShadow) {
        G.sun.castShadow = false;
        G.renderer.setPixelRatio(1);
      }
      fpsAccum = 0; fpsCount = 0; fpsStage++;
    }
  }
  if (G.stage) { stageTick(dt); }
  else if (G.cutscene) {
    updateCutscene(dt);
    updatePeds(dt);
    updateTraffic(dt);
  }
  else if (G.mode === "play") {
    updateMissions(dt);
    if (G.onFoot) updatePlayerOnFoot(dt); else updatePlayerVehicle(dt);
    updateTraffic(dt);
    collideVehicles(dt);
    updatePolice(dt);
    updatePeds(dt);
    updateCombatFx(dt);
    checkHealth(dt);
  } else if (G.mode === "title") {
    updatePeds(dt);
    updateTraffic(dt);
  }
  updateSmoke(dt);
  updateSkyAndWeather(dt);
  if (G.mode !== "stage" && !G.cutscene) updateCamera(dt);
  hudTick(dt);
  if (G.mode === "play" || G.mode === "pause" || G.mode === "map" || G.mode === "missions") {
    hudAccum += dt;
    if (hudAccum > 0.08) { hudAccum = 0; updateHUD(); drawMinimap(); if (G.mode === "map") drawBigMap(); }
  }
  sfxUpdate(dt);
  G.renderer.render(G.scene, G.camera);
  if (G.stage) {
    stageFrames++;
    if (stageFrames === 100) window.__shotReady = true;
  }
}
let stageFrames = 0, stageRig = null;
function setupStage(name) {
  G.stage = name; G.mode = "stage"; G.stageNoHeli = true;
  el("menu-title").style.display = "none";
  el("hud").style.display = "block";
  const cam = G.camera;
  if (name === "chase") {
    G.hour = 17.7; G.weather = "clear";
    const comet = findVehicle("comet");
    comet.mesh.position.set(0, 0, 215); comet.mesh.rotation.set(0, Math.PI, 0);
    enterVehicle(comet); comet.speed = 15;
    setWanted(4);
    const i1 = spawnVehicle("interceptor", -2.85, 217.2, Math.PI, 0x30343a, "police");
    const i2 = spawnVehicle("interceptor", 5, 217.6, Math.PI, 0x30343a, "police");
    i1.speed = 15; i2.speed = 15;
    G.police.push(i1, i2);
    for (const t of G.traffic) {
      if (Math.abs(t.mesh.position.x) < 60 && t.mesh.position.z > -460 && t.mesh.position.z < 300) {
        t.mesh.position.x = 320; t.aiTarget = null;
      }
    }
    stageRig = { cars: [comet, i1, i2], speed: 15 };
    setObjective("Outrun the Interceptors — reach the safehouse", SPOTS.safehouse.x, SPOTS.safehouse.z);
    setMarker(SPOTS.safehouse.x, SPOTS.safehouse.z, 0x2ee6c8);
    cam.position.set(4.8, 1.5, 223.6);
  } else if (name === "drive") {
    G.hour = 17.9; G.weather = "clear";
    const falco = findVehicle("falco");
    falco.mesh.position.set(640, 0, 300); falco.mesh.rotation.set(0, Math.PI, 0);
    enterVehicle(falco); falco.speed = 17;
    stageRig = { cars: [falco], speed: 17 };
    setObjective("Bay Runner — checkpoint run down the coast", 640, -420);
    setMarker(640, -100, 0x2ee6c8);
    cam.position.set(632, 2.5, 312);
  } else if (name === "marina") {
    G.hour = 21.5; G.weather = "rain";
    const moonBoost = new THREE.DirectionalLight(0xbdd2ff, 1.15);
    moonBoost.position.set(-780, 160, 20);
    moonBoost.target.position.set(-920, 0, 78);
    G.scene.add(moonBoost); G.scene.add(moonBoost.target);
    G.scene.add(new THREE.AmbientLight(0x5a6f96, 0.8));
    G.player.mesh.position.set(-876, 0, 86);
    G.player.mesh.rotation.y = 0.35;
    G.camYaw = 0.35;
    setObjective("Meet Celia at the marina", SPOTS.celia.x, SPOTS.celia.z);
    cam.position.set(-868, 2.8, 108);
  } else if (name === "cutscene") {
    G.hour = 17.8; G.weather = "clear";
    G.player.mesh.position.set(-879, 0, 70);
    startCutscene(0, null);
    G.cutscene.line = 2; csShowLine();
    csApplyCamera(G.cutscene, 0);
    setObjective("Meet Celia at the marina", SPOTS.celia.x, SPOTS.celia.z);
  } else if (name === "rico") {
    G.hour = 17.6; G.weather = "clear";
    G.player.mesh.position.set(-352, 0, -300);
    G.player.mesh.rotation.y = -1.02;
    const comet = findVehicle("comet");
    comet.mesh.position.set(-346, 0, -312); comet.mesh.rotation.set(0, -0.5, 0);
    const crusher = findVehicle("crusher");
    crusher.mesh.position.set(-326, 0, -304); crusher.mesh.rotation.set(0, -0.5, 0);
    cam.position.set(-358.5, 1.8, -296);
  }
  updateHUD(); drawMinimap();
}
function stageTick(dt) {
  const cam = G.camera;
  if (stageRig) {
    for (const v of stageRig.cars) {
      v.mesh.position.z -= stageRig.speed * dt;
      const wr = stageRig.speed * dt / 0.42;
      for (const w of v.wheels) w.rotation.x -= wr;
      if (v.mesh.position.z < -430) v.mesh.position.z += 620;
    }
    const lead = stageRig.cars[0];
    if (G.stage === "chase") {
      cam.position.set(lead.mesh.position.x + 4.8, 1.5, lead.mesh.position.z + 8.6);
      cam.lookAt(lead.mesh.position.x - 2.2, 1, lead.mesh.position.z - 10);
      const flash = Math.floor(G.time * 2.4) % 2 === 0;
      for (const c of stageRig.cars.slice(1)) {
        const bar = c.mesh.userData.lightBar;
        if (bar) { bar.children[0].visible = flash; bar.children[1].visible = !flash; }
      }
      if (G.vehicle) seatSyncStage();
    } else if (G.stage === "drive") {
      lead.mesh.rotation.z = -0.34;
      seatPlayerOnBike(lead);
      cam.position.set(lead.mesh.position.x - 7.5, 2.5, lead.mesh.position.z + 12.5);
      cam.lookAt(lead.mesh.position.x + 7, 1, lead.mesh.position.z - 18);
    }
  } else if (G.stage === "cutscene") {
    if (G.cutscene) csApplyCamera(G.cutscene, dt);
    animatePerson(G.player, 0, dt);
  } else if (G.stage === "marina") {
    cam.lookAt(-905, 1.5, 70);
    animatePerson(G.player, 0, dt);
  } else if (G.stage === "rico") {
    cam.lookAt(-352, 1.3, -300);
    animatePerson(G.player, 0, dt);
  }
  updatePeds(dt);
  if (G.stage === "marina" || G.stage === "rico") updateTraffic(dt);
  hudAccum += dt;
  if (hudAccum > 0.12) { hudAccum = 0; updateHUD(); drawMinimap(); }
}
function seatSyncStage() { if (G.vehicle) seatPlayerInVehicle(G.vehicle); }
window.CBS = {
  G,
  warp(x, z) {
    if (!G.onFoot && G.vehicle) { G.vehicle.mesh.position.set(x, 0, z); G.vehicle.speed = 0; }
    else G.player.mesh.position.set(x, 0, z);
  },
  setWanted, setHour(h) { G.hour = h; },
  setWeather(w) { G.weather = w; G.weatherTimer = 9999; },
  startJob(i) { if (!G.job) startJob(i); },
  talk() { const k = G.jobIndex < JOBS.length ? JOBS[G.jobIndex].giver : "celia"; const ct = G.contacts[k]; G.player.mesh.position.set(ct.spot.x + 2, 0, ct.spot.z + 2); },
  enterKind(kind) { const v = findVehicle(kind); if (v) { if (!G.onFoot) exitVehicle(); G.player.mesh.position.set(v.mesh.position.x + 2, 0, v.mesh.position.z); enterVehicle(v); } return !!v; },
  cash(n) { G.cash = n; updateHUD(); },
  state() {
    const f = focusPoint();
    return {
      mode: G.mode, cash: G.cash, wanted: G.wanted, health: Math.round(G.health),
      jobIndex: G.jobIndex, job: G.job ? G.job.i : -1, step: G.job ? G.job.step : -1,
      hustle: G.hustle ? G.hustle.type : null,
      onFoot: G.onFoot, vehicle: G.vehicle ? G.vehicle.kind : null,
      weapon: G.weapon, x: Math.round(f.x), z: Math.round(f.z),
      hour: G.hour, weather: G.weather,
      cutscene: G.cutscene ? G.cutscene.idx + ":" + G.cutscene.line : null,
      playerVisible: G.player.mesh.visible,
      playerPos: [Math.round(G.player.mesh.position.x * 10) / 10, Math.round(G.player.mesh.position.y * 10) / 10, Math.round(G.player.mesh.position.z * 10) / 10],
    };
  },
};
document.addEventListener("DOMContentLoaded", bootGame);
