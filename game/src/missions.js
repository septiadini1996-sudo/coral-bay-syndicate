// Coral Bay Syndicate - missions.js
// The six-job story chain. Each job is a list of steps (talk, go to,
// drive to, hold position, steal a marked car, destroy a target car,
// lose the police). The engine watches the current step, drives the
// GPS target and the gold marker, pays out at the end of each job and
// rolls the next one. Finishing job 6 pays out $6,150 in total across
// the chain and shows the finale card.

'use strict';

var JOBS = [
  { title: 'Meet Celia', pay: 400, giver: 'Celia', steps: [
    { k: 'talk', x: 0, z: 1490, label: 'Meet Celia at the end of the marina pier', scene: 'celia' },
    { k: 'goto', x: -30, z: 1346, label: 'Pick up the ledger by the dock crates' },
    { k: 'goto', x: 172, z: -148, label: 'Deliver the ledger to Marco at the Syndicate Garage', scene: 'marco' },
  ] },
  { title: 'First Run', pay: 750, giver: 'Marco', steps: [
    { k: 'drive', x: -648, z: 472, label: 'Drive the package to the west warehouse', scene: 'warehouse' },
  ] },
  { title: 'Dockside Pickup', pay: 900, giver: 'Celia', intro: 'docks', steps: [
    { k: 'goto', x: 56, z: 1352, label: 'Meet the dock crew by the pier office' },
    { k: 'hold', x: 56, z: 1352, secs: 3, label: 'Stay in the marker while they load the cargo' },
    { k: 'drive', x: 168, z: -160, label: 'Deliver the cargo to the Syndicate Garage' },
  ] },
  { title: 'Hot Wheels', pay: 1200, giver: 'Vera', intro: 'hotwheels', steps: [
    { k: 'goto', x: 472, z: -472, label: 'Scope out the east lookout' },
    { k: 'steal', x: 488, z: -448, label: 'Steal the marked prize coupe' },
    { k: 'drive', x: -800, z: 168, label: 'Deliver the coupe to the chop shop', inMarked: true },
  ] },
  { title: 'Convoy Ambush', pay: 1400, giver: 'Marco', intro: 'ambush', steps: [
    { k: 'goto', x: 160, z: 632, label: 'Get to the ambush point on the north road' },
    { k: 'destroy', x: 168, z: 800, label: 'Destroy the rival crew car' },
    { k: 'escape', label: 'Lose the police' },
  ] },
  { title: 'The Big Score', pay: 1500, giver: 'Celia', intro: 'bigscore', steps: [
    { k: 'goto', x: 168, z: 88, label: 'Go to the Coral Bank corner' },
    { k: 'hold', x: 168, z: 88, secs: 4, label: 'Rob the bank: stay in the marker', crime: 4 },
    { k: 'drive', x: 0, z: 1440, label: 'Escape to Celia and the marina hideout', scene: 'finale' },
  ] },
];

var markerMesh = null, markerRing = null;
function buildMarker() {
  var geo = new THREE.CylinderGeometry(1.6, 1.6, 34, 12, 1, true);
  var mat = new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  markerMesh = new THREE.Mesh(geo, mat);
  markerMesh.position.y = 17;
  var ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.22, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd75e }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.4;
  markerRing = ring;
  G.scene.add(markerMesh); G.scene.add(markerRing);
}

function currentStep() {
  if (G.job >= JOBS.length) return null;
  return JOBS[G.job].steps[G.jobStep] || null;
}
function stepLabel() {
  var st = currentStep();
  if (!st) return G.storyDone ? 'The Bay is yours. Free roam.' : '';
  return st.label;
}

function startJob(i) {
  G.job = i; G.jobStep = 0; G.markedCar = null;
  var job = JOBS[i];
  if (!job) { finishStory(); return; }
  showToast('JOB ' + (i + 1) + ': ' + job.title + ' - ' + fmt$(job.pay));
  applyStep();
  if (job.intro) playCutscene(job.intro, null);
  saveGame();
}

function applyStep() {
  var st = currentStep();
  G.targetCar = null;
  if (!st) { G.targetPos = null; G.route = []; return; }
  if (st.k === 'escape') { G.targetPos = null; G.route = []; return; }
  G.targetPos = { x: st.x, z: st.z, label: st.label };
  computeRoute(st.x, st.z);
  if (st.k === 'steal') {
    var car = createCar(st.x, st.z, Math.PI / 4, 'Sedan', 0xb02020);
    car.driver = 'parked'; car.name = 'Prize Coupe'; car.marked = true;
    G.markedCar = car;
  }
  if (st.k === 'destroy') {
    var tc = createCar(st.x, st.z, 0, 'Sedan', 0x37474f);
    tc.hp = 55; tc.name = 'Rival Crew Car';
    planRoute(tc, null);
    G.targetCar = tc;
  }
  if (st.crime) { /* crime applies when the hold completes */ }
}

function completeJob() {
  var job = JOBS[G.job];
  G.cash += job.pay; G.earned += job.pay;
  G.rankName = rankFor(G.earned);
  sfx('cash');
  showToast('JOB COMPLETE: ' + job.title + '  +' + fmt$(job.pay));
  G.jobStep = 0;
  startJob(G.job + 1);
}

function finishStory() {
  G.storyDone = true; G.job = JOBS.length;
  G.targetPos = null; G.route = [];
  G.finale = true;
  saveGame();
}

var holdT = 0;
function tickMissions(dt) {
  var st = currentStep();
  // Keep the marker on the current target.
  var show = !!st && !!G.targetPos && !cutsceneActive();
  if (markerMesh) {
    markerMesh.visible = markerRing.visible = show;
    if (show) {
      markerMesh.position.x = markerRing.position.x = G.targetPos.x;
      markerMesh.position.z = markerRing.position.z = G.targetPos.z;
      markerRing.rotation.z = G.t * 1.4;
    }
  }
  if (!st || cutsceneActive() || G.dead) return;
  var px = G.inCar ? G.inCar.x : G.player.x, pz = G.inCar ? G.inCar.z : G.player.z;
  var d = G.targetPos ? dist2(px, pz, st.x, st.z) : 9999;
  var advance = false;

  if (st.k === 'talk') {
    if (!G.inCar && d < 4.5) {
      var scene = st.scene;
      G.jobStep++;
      var lastStep = G.jobStep >= JOBS[G.job].steps.length;
      playCutscene(scene, function () { if (lastStep) completeJob(); else applyStep(); });
      return;
    }
  } else if (st.k === 'goto') {
    if (d < 7) advance = true;
  } else if (st.k === 'drive') {
    if (G.inCar && d < 9) advance = true;
    if (advance && st.inMarked && G.markedCar && G.inCar !== G.markedCar) advance = false;
  } else if (st.k === 'hold') {
    if (d < 7) {
      holdT += dt;
      G.holdFrac = holdT / st.secs;
      if (holdT >= st.secs) {
        holdT = 0; G.holdFrac = 0;
        if (st.crime) addCrime(st.crime, st.x, st.z);
        advance = true;
      }
    } else { holdT = Math.max(0, holdT - dt); G.holdFrac = holdT / st.secs; }
  } else if (st.k === 'steal') {
    if (G.markedCar && G.inCar === G.markedCar) {
      addCrime(2, st.x, st.z);
      showToast('Car stolen! The owner called it in.');
      advance = true;
    }
  } else if (st.k === 'destroy') {
    if (G.targetCar && G.targetCar.dead) advance = true;
  } else if (st.k === 'escape') {
    if (G.wanted === 0) advance = true;
  }

  if (advance) {
    var sceneId = st.scene;
    G.jobStep++;
    if (G.jobStep >= JOBS[G.job].steps.length) {
      if (sceneId) playCutscene(sceneId, function () { completeJob(); });
      else completeJob();
    } else {
      applyStep();
      if (sceneId) playCutscene(sceneId, null);
    }
  }
  // Refresh the GPS line every few seconds while travelling.
  G.routeT = (G.routeT || 0) - dt;
  if (G.targetPos && G.routeT <= 0) { G.routeT = 2.5; computeRoute(G.targetPos.x, G.targetPos.z); }
}
