// story.js — Vera Lark's six-job story chain for the Coral Bay Syndicate
// (exactly $6,150 across the chain), repeatable courier side jobs, the gold
// objective beacons, dialogue, ranks, saving to localStorage and respawns.
// Jobs are step lists: reach a place, pick something up, steal a marked car,
// deliver against the clock, or run from the law to the drop.
(function () {
  'use strict';

  const CBS = (window.CBS = window.CBS || {});
  const U = CBS.util;
  const THREE = window.THREE;

  const SAVE_KEY = 'coral-bay-syndicate-v1';
  const VERA = { x: 259, z: 106 };

  const JOBS = [
    {
      name: 'First Errand', pay: 600,
      intro: [
        'Vera: You look like someone who can keep a secret and drive at the same time.',
        'Vera: Take this quietly — a package waits at the end of my pier. Café Solano gets it before the ice melts.',
      ],
      steps: [
        { kind: 'pickup', x: 344, z: 120, label: 'Pick up the package at the end of the pier' },
        { kind: 'deliver', x: -96, z: 60, label: 'Drop the package at Café Solano' },
      ],
    },
    {
      name: 'Dockside Run', pay: 800,
      intro: [
        'Vera: Three crates, three corners of my marina. The tide does not wait, and neither do I.',
      ],
      steps: [
        { kind: 'pickup', x: 318, z: 94, label: 'Collect the crate by the moored boats' },
        { kind: 'pickup', x: 262, z: 146, label: 'Collect the crate behind the harbormaster hut' },
        { kind: 'pickup', x: 330, z: 120, label: 'Collect the crate midway down the pier' },
        { kind: 'deliver', x: VERA.x, z: VERA.z, label: 'Bring the crates back to Vera' },
      ],
    },
    {
      name: 'Glass Eels', pay: 1050,
      intro: [
        'Vera: Listen close. The Glass Eels move their product through my marina at dusk, in a grey van with no plates.',
        'Vera: Tonight that van sleeps by the coldstore on Anchor Road. Take it. My buyer waits in the south-west and pays for silence.',
      ],
      steps: [
        { kind: 'steal', x: 233, z: -150, label: 'Steal the Glass Eels van by the coldstore' },
        { kind: 'deliver', x: -150, z: 156, label: 'Deliver the van to the buyer in the south-west', needCar: true },
      ],
    },
    {
      name: 'Cold Storage', pay: 1100,
      intro: [
        'Vera: A cooler leaves the coldstore tonight. It stays cold, it stays shut, and it reaches Palmetto Row fast.',
      ],
      steps: [
        { kind: 'pickup', x: 222, z: -150, label: 'Load the cooler at the coldstore' },
        { kind: 'deliver', x: -216, z: 120, label: 'Race the cooler to the beach house on Palmetto Row', timed: 175 },
      ],
    },
    {
      name: 'Harbour Lights', pay: 1200,
      intro: [
        'Vera: My lookouts have gone quiet. Three corners of this bay — north point, the station steps, the south beach. Show me they still breathe.',
      ],
      steps: [
        { kind: 'goto', x: 240, z: -186, label: 'Check the lookout at the north point' },
        { kind: 'goto', x: -180, z: -120, label: 'Check the lookout at the station steps' },
        { kind: 'goto', x: 246, z: 186, label: 'Check the lookout at the south beach' },
        { kind: 'deliver', x: VERA.x, z: VERA.z, label: 'Report back to Vera' },
      ],
    },
    {
      name: 'The Long Goodbye', pay: 1400,
      intro: [
        'Vera: One last thing, and then this bay is yours. My ledger sits in an office on Meridian Avenue.',
        'Vera: The moment you lift it, every badge in Coral Bay will smell it. Lose them, and bring it home to me.',
      ],
      steps: [
        { kind: 'pickup', x: 66, z: -54, label: 'Lift the ledger from the Meridian Avenue office' },
        { kind: 'escape', x: VERA.x, z: VERA.z, label: 'Lose the law and bring the ledger to Vera' },
      ],
    },
  ];

  const RANKS = [
    [0, 'Harbour Runner'], [800, 'Courier'], [1850, 'Fixer'],
    [2950, 'Operator'], [4150, 'Lieutenant'], [6150, 'Kingpin of Coral Bay'],
  ];

  const state = {
    money: 250, jobIndex: 0, totalEarned: 0,
    active: null, // { job, step, stepT, markedCar }
    side: null, // { phase: 'pickup'|'drop', x, z, pay, t }
    sideOffer: null,
  };

  let scene = null;
  let city = null;
  let beacon = null;
  let sideBeacon = null;

  function makeBeacon(color) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 26, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.24,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    m.position.y = 13;
    m.visible = false;
    scene.add(m);
    return m;
  }

  function init(sceneRef, cityRef) {
    scene = sceneRef;
    city = cityRef;
    beacon = makeBeacon(0xffc93c);
    sideBeacon = makeBeacon(0xb9c8d8);
    load();
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: state.money, jobIndex: state.jobIndex, totalEarned: state.totalEarned,
      }));
    } catch (e) { /* storage unavailable: play on unsaved */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.money === 'number') state.money = s.money;
      if (typeof s.jobIndex === 'number') state.jobIndex = Math.min(s.jobIndex, JOBS.length);
      if (typeof s.totalEarned === 'number') state.totalEarned = s.totalEarned;
    } catch (e) { /* fresh start */ }
  }

  function rank() {
    let name = RANKS[0][1];
    let next = null;
    for (let i = 0; i < RANKS.length; i++) {
      if (state.totalEarned >= RANKS[i][0]) name = RANKS[i][1];
      else { next = RANKS[i]; break; }
    }
    const prevThreshold = RANKS.filter((r) => state.totalEarned >= r[0]).pop()[0];
    const progress = next ? (state.totalEarned - prevThreshold) / (next[0] - prevThreshold) : 1;
    return { name, progress, nextAt: next ? next[0] : null };
  }

  // Talking to Vera: start the next job, or complete a return-to-Vera step.
  function talkToVera(player) {
    if (state.active) {
      const step = state.active.job.steps[state.active.step];
      if (step && step.kind === 'deliver' && U.dist2D(step.x, step.z, VERA.x, VERA.z) < 2) {
        advance(player);
        return true;
      }
      CBS.hud.subtitle('Vera: Finish what I gave you first. The bay is watching.');
      return false;
    }
    if (state.jobIndex >= JOBS.length) {
      CBS.hud.subtitle('Vera: The bay is yours now, partner. The courier board still pays, if you want pocket money.');
      offerSideJob();
      return true;
    }
    const job = JOBS[state.jobIndex];
    state.active = { job, step: 0, stepT: 0, markedCar: null };
    if (job.name === 'Glass Eels') {
      // The grey van sleeps by the coldstore, waiting to be stolen.
      const van = CBS.vehicles.spawnCar(scene, 'van', 0x8f979e, 233, -150, -Math.PI / 2, 'parked');
      van.parked = true;
      van.isMissionVan = true;
      state.active.markedCar = van;
    }
    for (const line of job.intro) CBS.hud.subtitle(line);
    if (CBS.audio) CBS.audio.blip(660);
    return true;
  }

  function currentStep() {
    if (!state.active) return null;
    return state.active.job.steps[state.active.step] || null;
  }

  function advance(player) {
    const a = state.active;
    a.step++;
    a.stepT = 0;
    const step = a.job.steps[a.step];
    if (CBS.audio) CBS.audio.blip(880);
    if (!step) {
      // Job complete: pay up, save, offer the next chapter of a life of crime.
      state.money += a.job.pay;
      state.totalEarned += a.job.pay;
      state.jobIndex++;
      CBS.hud.subtitle('Vera: Beautifully done. ' + U.fmtMoney(a.job.pay) + ' — spend it somewhere loud.');
      CBS.hud.flashMoney(a.job.pay);
      state.active = null;
      save();
      offerSideJob();
      if (CBS.hooks && CBS.hooks.onJobComplete) CBS.hooks.onJobComplete(a.job);
      return;
    }
    if (step.kind === 'escape') CBS.police.setHeat(3);
    if (step.kind === 'pickup' && a.job.name === 'The Long Goodbye') CBS.police.setHeat(3);
  }

  function offerSideJob() {
    if (state.sideOffer || state.side) return;
    const g = city.graph.nodes;
    const a = g[Math.floor(U.rng() * g.length)];
    const b = g[Math.floor(U.rng() * g.length)];
    const d = U.dist2D(a.x, a.z, b.x, b.z);
    if (d < 120) return;
    state.sideOffer = { x: a.x + 5, z: a.z + 5, dropX: b.x - 5, dropZ: b.z - 5, pay: Math.round(60 + d * 0.9) };
  }

  function update(dt, player) {
    const t = performance.now() * 0.001;
    // Story beacon follows the current step.
    const step = currentStep();
    if (step) {
      beacon.visible = true;
      beacon.position.x = step.x;
      beacon.position.z = step.z;
      beacon.material.opacity = 0.24 + Math.sin(t * 3.2) * 0.08;
      const d = U.dist2D(player.x, player.z, step.x, step.z);
      state.active.stepT += dt;
      if (step.timed && state.active.stepT > step.timed) {
        CBS.hud.subtitle('The cooler has gone warm. Vera sends you back to the coldstore.');
        state.active.step = 0;
        state.active.stepT = 0;
      } else if (d < (step.kind === 'pickup' ? 5.5 : 7)) {
        if (step.kind === 'steal') {
          // Completes when the player actually takes the van (checked in main).
        } else if (!step.needCar || player.inCar) {
          if (step.kind === 'deliver' && U.dist2D(step.x, step.z, VERA.x, VERA.z) < 2) {
            // Return-to-Vera steps finish by talking to her.
          } else {
            advance(player);
          }
        }
      }
    } else {
      beacon.visible = false;
    }
    // Vera's own slim gold beacon when she has work for you.
    if (!state.active && state.jobIndex < JOBS.length) {
      beacon.visible = true;
      beacon.position.x = VERA.x;
      beacon.position.z = VERA.z;
      beacon.material.opacity = 0.16 + Math.sin(t * 3.2) * 0.05;
    }
    // Side job beacons and legs.
    if (state.sideOffer && !state.side) {
      sideBeacon.visible = true;
      sideBeacon.position.x = state.sideOffer.x;
      sideBeacon.position.z = state.sideOffer.z;
      if (U.dist2D(player.x, player.z, state.sideOffer.x, state.sideOffer.z) < 6) {
        state.side = { phase: 'drop', x: state.sideOffer.dropX, z: state.sideOffer.dropZ, pay: state.sideOffer.pay };
        state.sideOffer = null;
        CBS.hud.subtitle('Courier run: take the parcel across the bay. ' + U.fmtMoney(state.side.pay) + ' on delivery.');
        if (CBS.audio) CBS.audio.blip(740);
      }
    } else if (state.side) {
      sideBeacon.visible = true;
      sideBeacon.position.x = state.side.x;
      sideBeacon.position.z = state.side.z;
      if (U.dist2D(player.x, player.z, state.side.x, state.side.z) < 7) {
        state.money += state.side.pay;
        state.totalEarned += state.side.pay;
        CBS.hud.flashMoney(state.side.pay);
        CBS.hud.subtitle('Delivered. ' + U.fmtMoney(state.side.pay) + ' — the board will have more work soon.');
        state.side = null;
        save();
        setTimeout(() => offerSideJob(), 4000);
      }
    } else {
      sideBeacon.visible = false;
    }
  }

  // Called by main when the player enters a car: the Glass Eels van completes its step.
  function onPlayerEnterCar(car, player) {
    const step = currentStep();
    if (step && step.kind === 'steal' && state.active.markedCar === car) {
      CBS.police.addHeat(1.5);
      CBS.hud.subtitle('That is the van. The Eels will notice it missing — drive like you mean it.');
      advance(player);
    }
  }

  function panelData(player) {
    if (state.active) {
      const a = state.active;
      const step = a.job.steps[a.step];
      return {
        title: a.job.name + ' — ' + U.fmtMoney(a.job.pay),
        stepLabel: step ? step.label : '',
        stepDist: step ? Math.round(U.dist2D(player.x, player.z, step.x, step.z)) : 0,
        timed: step && step.timed ? Math.max(0, Math.ceil(step.timed - a.stepT)) : null,
        target: step ? { x: step.x, z: step.z } : null,
      };
    }
    if (state.side) {
      return {
        title: 'Courier Run — ' + U.fmtMoney(state.side.pay),
        stepLabel: 'Deliver the parcel across the bay',
        stepDist: Math.round(U.dist2D(player.x, player.z, state.side.x, state.side.z)),
        timed: null,
        target: { x: state.side.x, z: state.side.z },
      };
    }
    if (state.jobIndex < JOBS.length) {
      return {
        title: 'The Syndicate',
        stepLabel: 'Talk to Vera Lark at the marina',
        stepDist: Math.round(U.dist2D(player.x, player.z, VERA.x, VERA.z)),
        timed: null,
        target: { x: VERA.x, z: VERA.z },
      };
    }
    return { title: 'The Syndicate', stepLabel: 'The bay is yours. Courier work pays at silver beacons.', stepDist: 0, timed: null, target: null };
  }

  CBS.story = {
    init, update, talkToVera, onPlayerEnterCar, panelData, rank, save,
    JOBS, VERA,
    get state() { return state; },
    get currentStep() { return currentStep(); },
  };
})();
