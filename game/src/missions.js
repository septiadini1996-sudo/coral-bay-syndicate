// missions.js — the job engine: Vera's story chain state machines, the gold
// beacon and GPS target, dialogue playback, the repeatable courier and
// chop-shop side work, payouts, weapon grants and rank progress.

'use strict';

const LOC = {
  vera: { x: 158, z: 149 }, dock: { x: 173, z: 170 }, crate: { x: 166, z: 153 },
  chop: { x: -131, z: -83 }, hideout: { x: 197, z: -143 }, lookout: { x: -197, z: 132 },
  packages: [{ x: 118, z: 146 }, { x: 38, z: 144 }, { x: -82, z: 147 }],
  coupeSpot: { x: 66, z: -22 }, courierDesk: { x: 30, z: 97 },
};
let beacon = null, veraNpc = null, tomasNpc = null;
W.dialogue = [];
W.gps = null;
W.prompt = '';

function showDialogue(lines) {
  for (const [who, text] of lines) W.dialogue.push({ who, text, t: 3.6 });
}
W.showDialogue = showDialogue;

function buildBeacon() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 9, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf5a623, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 4.5; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.3, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc93f, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; g.add(ring);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffc93f }));
  tip.rotation.x = Math.PI; tip.position.y = 3.4; g.add(tip);
  g.userData.tip = tip;
  g.visible = false;
  W.scene.add(g);
  return g;
}

function setTarget(x, z, label) {
  W.gps = { x, z };
  if (beacon) { beacon.visible = true; beacon.position.set(x, 0, z); }
  W.missionStepLabel = label || '';
}
function clearTarget() {
  W.gps = null;
  if (beacon) beacon.visible = false;
  W.missionStepLabel = '';
}

function pay(amount, why) {
  W.money += amount; W.earned += amount;
  if (W.notify) W.notify('+$' + amount.toLocaleString() + ' — ' + why);
  if (W.saveGame) W.saveGame();
}

// --- story missions --------------------------------------------------------------
function startMission(idx) {
  const s = STORY[idx];
  W.mission = { idx, step: 0, data: {}, holdT: 0 };
  showDialogue(s.intro);
  if (W.notify) W.notify('New job: ' + s.title);
  if (idx === 1) grantWeapon('SMG');
  advanceMission(); // sets the first step's target
}

function grantWeapon(name) {
  const p = W.player, w = p.weapons.find(w => w.name === name);
  if (w && !w.have) {
    w.have = true;
    if (W.notify) W.notify('New weapon: ' + name + ' — keys 1-4 switch');
  }
}

function missionTarget() {
  const m = W.mission; if (!m) return;
  const s = STORY[m.idx], label = s.steps[m.step];
  switch (m.idx) {
    case 0: setTarget(...(m.step === 0 ? [LOC.crate.x, LOC.crate.z] : [LOC.dock.x, LOC.dock.z]), label); break;
    case 1:
      if (m.step < 3) { const pk = LOC.packages[m.step]; setTarget(pk.x, pk.z, label); }
      else setTarget(LOC.vera.x, LOC.vera.z, label);
      break;
    case 2:
      if (m.step === 0 && m.data.prey) setTarget(m.data.prey.x, m.data.prey.z, label);
      else setTarget(LOC.vera.x, LOC.vera.z, label);
      break;
    case 3:
      if (m.step === 0 && m.data.coupe) setTarget(m.data.coupe.x, m.data.coupe.z, label);
      else setTarget(LOC.chop.x, LOC.chop.z, label);
      break;
    case 4:
      if (m.step === 0) setTarget(LOC.dock.x, LOC.dock.z, label);
      else if (m.step === 1) setTarget(LOC.hideout.x, LOC.hideout.z, label);
      else { clearTarget(); W.missionStepLabel = label; }
      break;
    case 5:
      if (m.step === 0) setTarget(LOC.vera.x, LOC.vera.z, label);
      else setTarget(LOC.lookout.x, LOC.lookout.z, label);
      break;
  }
}

function advanceMission() {
  const m = W.mission; if (!m) return;
  const s = STORY[m.idx];
  if (m.step >= s.steps.length) { completeMission(); return; }
  // Step entry effects.
  if (m.idx === 2 && m.step === 0 && !m.data.prey) {
    const prey = makeCar('coupe', 0x37c8d9, 60, COAST_Z, -Math.PI / 2);
    prey.driver = 'flee'; prey.cruise = 16.5; prey.hp = 120;
    trafficRouteFrom(prey);
    m.data.prey = prey;
  }
  if (m.idx === 3 && m.step === 0 && !m.data.coupe) {
    const coupe = makeCar('coupe', 0xffcf3f, LOC.coupeSpot.x, LOC.coupeSpot.z, Math.PI);
    coupe.driver = null; coupe.kind = 'parked';
    m.data.coupe = coupe;
  }
  if (m.idx === 4 && m.step === 1) addHeat(3);
  if (m.idx === 5 && m.step === 1) { veraNpc.mesh.visible = false; addHeat(3.6); }
  missionTarget();
}

function completeMission() {
  const s = STORY[W.mission.idx];
  pay(s.pay, s.title);
  showDialogue([[s.giver, s.done]]);
  if (W.mission.idx === 3) grantWeapon('Rifle');
  W.mission = null;
  W.missionIndex++;
  clearTarget();
  if (W.missionIndex >= STORY.length && W.notify)
    W.notify('Story complete — Coral Bay is yours. Side work still pays.');
  if (W.saveGame) W.saveGame();
}

function failMission() {
  if (!W.mission) return;
  const m = W.mission;
  if (m.data.prey) { W.scene.remove(m.data.prey.mesh); W.cars.splice(W.cars.indexOf(m.data.prey), 1); }
  if (m.data.coupe && !W.player.car) { /* the coupe stays where it lies */ }
  if (W.mission.idx === 5 && veraNpc) veraNpc.mesh.visible = true;
  W.mission = null;
  clearTarget();
  if (W.notify) W.notify('Job failed — see Vera at the marina to try again.');
}

function reach(x, z, r) {
  const p = W.player;
  const px = p.car ? p.car.x : p.x, pz = p.car ? p.car.z : p.z;
  return dist(px, pz, x, z) < r;
}

function updateMission(dt) {
  const m = W.mission;
  if (!m) {
    // Offer the next story job at Vera's marker, and side work at its desks.
    if (W.missionIndex < STORY.length) setTarget(LOC.vera.x, LOC.vera.z, STORY[W.missionIndex].title + ' — new job');
    else clearTarget();
    W.prompt = (!W.player.car && reach(LOC.vera.x, LOC.vera.z, 4) && W.missionIndex < STORY.length)
      ? 'Press E — talk to Vera Lark' : '';
    updateSideJobs(dt);
    return;
  }
  W.prompt = '';
  const p = W.player;
  switch (m.idx) {
    case 0:
      if (m.step === 0 && reach(LOC.crate.x, LOC.crate.z, 4.5)) { m.step++; advanceMission(); }
      else if (m.step === 1 && reach(LOC.dock.x, LOC.dock.z, 6)) { m.step++; advanceMission(); }
      break;
    case 1: {
      if (m.step < 3) { const pk = LOC.packages[m.step]; if (reach(pk.x, pk.z, 4.5)) { m.step++; advanceMission(); } }
      else if (reach(LOC.vera.x, LOC.vera.z, 5)) { m.step++; advanceMission(); }
      break;
    }
    case 2: {
      const prey = m.data.prey;
      if (m.step === 0 && prey) {
        updateFleeCar(prey, dt);
        missionTarget();
        if (prey.dead || prey.hp <= 25) {
          if (W.notify) W.notify('Courier stopped. Vera is waiting.');
          m.step++; advanceMission();
        }
      } else if (m.step === 1 && reach(LOC.vera.x, LOC.vera.z, 5)) { m.step++; advanceMission(); }
      break;
    }
    case 3: {
      const coupe = m.data.coupe;
      if (m.step === 0 && coupe) {
        if (coupe.dead) { m.data.coupe = null; m.step = 0; advanceMission(); break; }
        if (p.car === coupe) { addHeat(1); m.step++; advanceMission(); }
      } else if (m.step === 1 && p.car === coupe && reach(LOC.chop.x, LOC.chop.z, 8)) {
        // Hand the car over: it stays with the shop.
        exitCar(); p.x = LOC.chop.x + 6; p.z = LOC.chop.z + 4;
        coupe.driver = null;
        m.step++; advanceMission();
      }
      break;
    }
    case 4:
      if (m.step === 0 && reach(LOC.dock.x, LOC.dock.z, 5)) { m.step++; advanceMission(); }
      else if (m.step === 1 && reach(LOC.hideout.x, LOC.hideout.z, 8)) { m.step++; advanceMission(); }
      else if (m.step === 2 && W.heat <= 0) { m.step++; advanceMission(); }
      break;
    case 5:
      if (m.step === 0 && reach(LOC.vera.x, LOC.vera.z, 5)) { m.step++; advanceMission(); }
      else if (m.step === 1) {
        if (!p.car) W.missionStepLabel = 'Get a car — Vera rides with you';
        else if (reach(LOC.lookout.x, LOC.lookout.z, 9)) { m.step++; advanceMission(); }
      } else if (m.step === 2) {
        if (reach(LOC.lookout.x, LOC.lookout.z, 15)) {
          m.holdT += dt;
          W.missionStepLabel = 'Hold the point — ' + Math.ceil(20 - m.holdT) + 's';
          if (m.holdT >= 20) {
            veraNpc.mesh.visible = true;
            veraNpc.x = LOC.lookout.x + 3; veraNpc.z = LOC.lookout.z + 2;
            veraNpc.mesh.position.set(veraNpc.x, 0, veraNpc.z);
            m.step++; advanceMission();
          }
        } else { m.holdT = Math.max(0, m.holdT - dt * 2); W.missionStepLabel = STORY[5].steps[2]; }
      }
      break;
  }
}

// The Glass Eels courier: fast, road-legal until hit, and it runs.
function updateFleeCar(car, dt) {
  if (car.dead) return;
  if (!car.route || car.routeI >= car.route.length) {
    // Pick a far corner away from the player and run for it.
    let best = null, bd = -1;
    for (let i = 0; i < 10; i++) {
      const n = W.graph[randi(0, W.graph.length - 1)];
      const d = dist2(W.player.x, W.player.z, n.x, n.z);
      if (d > bd) { bd = d; best = n; }
    }
    car.route = findRoute(W.graph, nearestNode(W.graph, car.x, car.z), W.graph.indexOf(best));
    car.routeI = 0;
  }
  const lp = lanePoint(car, car.route[car.routeI]);
  const node = W.graph[car.route[car.routeI]];
  if (dist(car.x, car.z, node.x, node.z) < 7) car.routeI++;
  let want = car.cruise;
  const ahead = carAhead(car, 8);
  if (ahead && ahead !== W.player.car) want = Math.min(want, ahead.speed);
  const throttle = car.speed < want ? 0.9 : -0.4;
  const steer = clamp(angDiff(headingTo(car.x, car.z, lp.x, lp.z), car.h) * 1.8, -1, 1);
  stepCar(car, dt, throttle, steer);
}

// --- side work ---------------------------------------------------------------------
let chopCooldown = 0;
function updateSideJobs(dt) {
  chopCooldown -= dt;
  const p = W.player;
  // Chop shop: any car you drive in is bought on the spot.
  if (p.car && chopCooldown <= 0 && reach(LOC.chop.x, LOC.chop.z, 8) && p.car.kind !== 'police') {
    const car = p.car, value = { hatch: 150, sedan: 200, coupe: 300, van: 220, pickup: 240 }[car.kind] || 150;
    const paid = Math.round(value * (0.5 + car.hp / 200));
    exitCar();
    W.scene.remove(car.mesh);
    W.cars.splice(W.cars.indexOf(car), 1);
    if (W.cops.includes(car)) W.cops.splice(W.cops.indexOf(car), 1);
    pay(paid, SIDE_TEXT.chop.title);
    addHeat(0.7);
    chopCooldown = 25;
    return;
  }
  // Courier: pick up at the desk, run it to the beacon, beat the clock.
  const sj = W.sideJob;
  if (!sj) {
    if (reach(LOC.courierDesk.x, LOC.courierDesk.z, 5)) {
      const dests = [LOC.dock, LOC.hideout, LOC.lookout, { x: -160, z: -140 }, { x: 40, z: -160 }];
      const d = pick(dests);
      W.sideJob = { x: d.x, z: d.z, t: 170 };
      if (W.notify) W.notify(SIDE_TEXT.courier.title + ' — follow the blue route');
    }
  } else {
    sj.t -= dt;
    setTarget(sj.x, sj.z, SIDE_TEXT.courier.title + ' — ' + Math.max(0, Math.ceil(sj.t)) + 's');
    if (reach(sj.x, sj.z, 7)) {
      pay(120 + Math.max(0, Math.round(sj.t / 2)), SIDE_TEXT.courier.title);
      W.sideJob = null;
    } else if (sj.t <= 0) {
      W.sideJob = null;
      if (W.notify) W.notify('Courier run expired.');
    }
  }
}

// E near Vera starts the next story job (main.js routes the key here first).
W.interact = function () {
  if (W.mission) return false;
  if (!W.player.car && reach(LOC.vera.x, LOC.vera.z, 4) && W.missionIndex < STORY.length) {
    startMission(W.missionIndex);
    return true;
  }
  return false;
};

function buildMissions() {
  beacon = buildBeacon();
  veraNpc = spawnPed(LOC.vera.x, LOC.vera.z, 'npc');
  veraNpc.name = FIXER;
  veraNpc.mesh.children[0].children[0].material = new THREE.MeshLambertMaterial({ color: 0x5e2a84 });
  tomasNpc = spawnPed(LOC.dock.x - 3, LOC.dock.z - 2, 'npc');
  tomasNpc.name = DOCKHAND;
}

function updateMissions(dt) {
  if (beacon) {
    beacon.userData.tip.position.y = 3.4 + Math.sin(W.time * 3) * 0.35;
    beacon.rotation.y += dt * 0.8;
  }
  if (W.dialogue.length) {
    W.dialogue[0].t -= dt;
    if (W.dialogue[0].t <= 0) W.dialogue.shift();
  }
  updateMission(dt);
}
