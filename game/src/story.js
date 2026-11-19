// story.js — the Coral Bay storyline and its economy: three chained story
// missions for Celia Marrow, repeatable delivery and checkpoint-race jobs,
// the objective marker, dialogs, the safehouse save, and the busted penalty.
// Every timer runs off the game clock (G.time), never wall time.
import { G, clamp, d2, SAVE_KEY } from './defs.js';
import { makePerson, playerPos } from './folks.js';
import { spawnVehicle } from './rides.js';
import { crime } from './cops.js';
import { sfx } from './sound.js';

const CELIA_AT = { x: -186, z: 8 };
const SAFE_AT = { x: -162, z: 52 };
const ODETTE_AT = { x: 114, z: -30 };
let marker, markerRing, npcs = [], step = 'm1_talk', job = null, saveT = 0;
let targetCar = null, racePts = [], raceIdx = 0, deadline = 0;

const D = {
  m1a: [
    { who: 'Celia Marrow', text: 'Rico Solano. You drive, you keep your mouth shut, you don\'t ask what\'s in the trunk. That\'s the whole job.' },
    { who: 'Rico', text: 'And the pay?' },
    { who: 'Celia Marrow', text: 'Four hundred, if my sedan reaches the Meridian Hotel downtown without a scratch party. She\'s parked by the marina. Go.' },
  ],
  m1b: [
    { who: 'Celia Marrow', text: 'Clean work. Coral Bay notices clean work. Take this — the bay isn\'t as friendly as it looks.' },
    { who: 'Rico', text: 'A pistol? I just drive, Celia.' },
    { who: 'Celia Marrow', text: 'Everyone just drives, until they don\'t. A client in the suburbs wants to meet you. Don\'t keep her waiting.' },
  ],
  m2a: [
    { who: 'Odette Vane', text: 'You\'re Celia\'s wheelman. Good. My ex is selling my Heritage Roadster at the Palms Hotel like it\'s his to sell.' },
    { who: 'Odette Vane', text: 'Take it back. Bring it to the garage in the industrial quarter — and arrive without an audience, yes?' },
  ],
  m2b: [
    { who: 'Odette Vane', text: 'My car, my name on the papers again. You\'re worth every cent Celia said you\'d cost me.' },
    { who: 'Rico', text: 'Tell her the bay has a new driver, then.' },
  ],
  m3a: [
    { who: 'Celia Marrow', text: 'Last run, Rico. The Coral Run — every crew in the bay will be watching the checkpoints. Beat the clock and the route is yours.' },
    { who: 'Celia Marrow', text: 'Eight markers, one hundred fifty seconds. Don\'t admire the view.' },
  ],
  m3b: [
    { who: 'Celia Marrow', text: 'Fastest wheel on the bay. The Coral Run is yours, Rico — and so is my trust. Don\'t spend either all at once.' },
    { who: 'Rico', text: 'No promises, boss.' },
  ],
};

export function initStory(scene) {
  // Objective marker: a gold light pillar with a floating ring.
  marker = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.position.y = 13;
  marker.add(beam);
  markerRing = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffc93c }));
  markerRing.rotation.x = Math.PI / 2; markerRing.position.y = 0.4;
  marker.add(markerRing);
  scene.add(marker);
  // Story NPCs.
  const celia = makePerson({ jacket: 0x0e7c86, hat: 'panama', shades: true, skin: 0x8d5a3b });
  celia.g.position.set(CELIA_AT.x, 0, CELIA_AT.z); celia.g.rotation.y = 2.2;
  scene.add(celia.g); npcs.push({ body: celia, at: CELIA_AT, idle: 0 });
  const odette = makePerson({ jacket: 0xf4f1de, hat: 'fedora', skin: 0xf2c49b });
  odette.g.position.set(ODETTE_AT.x, 0, ODETTE_AT.z); odette.g.rotation.y = -0.6;
  scene.add(odette.g); npcs.push({ body: odette, at: ODETTE_AT, idle: 2 });
  loadSave();
  setObjectiveForStep();
}

function setObjective(label, x, z) { G.objective = label ? { label, x, z } : null; }
function setObjectiveForStep() {
  const P = G.player;
  switch (step) {
    case 'm1_talk': setObjective('Meet Celia at the marina', CELIA_AT.x, CELIA_AT.z); break;
    case 'm1_car': setObjective('Take Celia\'s sedan', targetCar?.group.position.x ?? -182, targetCar?.group.position.z ?? 26); break;
    case 'm1_drop': setObjective('Drive to the Meridian Hotel', 52, 62); break;
    case 'm2_talk': setObjective('Meet Odette in the suburbs', ODETTE_AT.x, ODETTE_AT.z); break;
    case 'm2_steal': setObjective('Steal the Heritage Roadster', targetCar?.group.position.x ?? 30, targetCar?.group.position.z ?? 114); break;
    case 'm2_drop': setObjective(G.wanted > 0 ? 'Lose the police first' : 'Deliver the Roadster to the garage', 138, -118); break;
    case 'm3_talk': setObjective('See Celia about the Coral Run', CELIA_AT.x, CELIA_AT.z); break;
    case 'm3_race': setObjective(`Checkpoint ${raceIdx + 1} of ${racePts.length} — ${Math.max(0, Math.ceil(deadline - G.time))}s`, racePts[raceIdx]?.x ?? 0, racePts[raceIdx]?.z ?? 0); break;
    default: setObjective(null);
  }
  if (job) {
    if (job.kind === 'delivery' && !job.picked) setObjective(`Pick up the package — ${Math.max(0, Math.ceil(deadline - G.time))}s`, job.x, job.z);
    else if (job.kind === 'delivery') setObjective(`Deliver the package — ${Math.max(0, Math.ceil(deadline - G.time))}s`, job.x2, job.z2);
    else if (job.kind === 'race') setObjective(`Race checkpoint ${raceIdx + 1} of ${racePts.length} — ${Math.max(0, Math.ceil(deadline - G.time))}s`, racePts[raceIdx]?.x ?? 0, racePts[raceIdx]?.z ?? 0);
  }
  void P;
}

function startDialog(lines, after) {
  G.dialog = { lines, idx: 0, after };
  G.mode = 'dialog';
}
export function advanceDialog() {
  if (!G.dialog) return;
  G.dialog.idx++;
  sfx.unlock();
  if (G.dialog.idx >= G.dialog.lines.length) {
    const after = G.dialog.after;
    G.dialog = null;
    G.mode = 'play';
    if (after) after();
  }
}
function pay(n, why) {
  G.cash += n; G.stats.earned += n;
  sfx.ding();
  if (G.hooks.toast) G.hooks.toast(`+$${n} — ${why}`);
  saveGame();
}

// --- interactions (single source for both the prompt and the E key) ---------
export function currentInteract() {
  if (G.dialog) return { label: 'Continue', act: advanceDialog };
  const pp = playerPos();
  const onFoot = !G.player.vehicle;
  if (step === 'm1_talk' && onFoot && d2(pp.x, pp.z, CELIA_AT.x, CELIA_AT.z) < 3.4)
    return { label: 'Talk to Celia', act: () => startDialog(D.m1a, () => {
      targetCar = spawnVehicle('sedan', -174, 20, 0, { parked: true, color: 0x0e7c86 });
      step = 'm1_car'; setObjectiveForStep();
    }) };
  if (step === 'm2_talk' && onFoot && d2(pp.x, pp.z, ODETTE_AT.x, ODETTE_AT.z) < 3.4)
    return { label: 'Talk to Odette', act: () => startDialog(D.m2a, () => {
      targetCar = spawnVehicle('vintage', 30, 114, Math.PI / 2, { parked: true, color: 0x7a1f2b });
      step = 'm2_steal'; setObjectiveForStep();
    }) };
  if (step === 'm3_talk' && onFoot && d2(pp.x, pp.z, CELIA_AT.x, CELIA_AT.z) < 3.4)
    return { label: 'Start the Coral Run', act: () => startDialog(D.m3a, () => {
      racePts = [
        { x: -56, z: -56 }, { x: -150, z: -168 }, { x: 60, z: -160 }, { x: 150, z: -60 },
        { x: 168, z: 84 }, { x: 84, z: 150 }, { x: -84, z: 150 }, { x: -196, z: 8 },
      ];
      raceIdx = 0; deadline = G.time + 150; step = 'm3_race'; setObjectiveForStep();
    }) };
  if (!job && (step === 'free' || step.endsWith('_talk')) ) {
    if (onFoot && d2(pp.x, pp.z, -136, 88) < 3.2) return { label: 'Accept a delivery', act: startDelivery };
    if (G.player.vehicle && d2(pp.x, pp.z, 60, -60) < 9) return { label: 'Start a checkpoint race', act: startRace };
  }
  if (onFoot && d2(pp.x, pp.z, SAFE_AT.x, SAFE_AT.z) < 3.2)
    return { label: 'Save at the safehouse', act: () => { saveGame(); if (G.hooks.toast) G.hooks.toast('Game saved'); sfx.unlock(); } };
  return null;
}
const SPOTS = [
  { x: 56, z: -112 }, { x: -56, z: 56 }, { x: 112, z: 112 }, { x: -112, z: -56 },
  { x: 168, z: -140 }, { x: -168, z: 112 }, { x: 56, z: 140 }, { x: 140, z: 60 }, { x: -30, z: -166 },
];
function startDelivery() {
  const a = SPOTS[Math.floor(Math.random() * SPOTS.length)];
  let b = SPOTS[Math.floor(Math.random() * SPOTS.length)];
  if (b === a) b = SPOTS[(SPOTS.indexOf(a) + 3) % SPOTS.length];
  job = { kind: 'delivery', x: a.x, z: a.z, x2: b.x, z2: b.z, picked: false };
  deadline = G.time + 40 + d2(a.x, a.z, b.x, b.z) / 8;
  if (G.hooks.toast) G.hooks.toast('Delivery accepted — grab the package');
  setObjectiveForStep();
}
function startRace() {
  racePts = [];
  const pool = [...SPOTS].sort(() => Math.random() - 0.5).slice(0, 5);
  racePts = pool; raceIdx = 0;
  let total = 0, px = 60, pz = -60;
  for (const p of pool) { total += d2(px, pz, p.x, p.z); px = p.x; pz = p.z; }
  deadline = G.time + total / 11 + 18;
  job = { kind: 'race' };
  if (G.hooks.toast) G.hooks.toast('Race on — hit every checkpoint');
  setObjectiveForStep();
}

// --- save / load ---------------------------------------------------------------
export function saveGame() {
  try {
    const p = G.player.g.position;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, cash: G.cash, story: G.story, armed: G.armed, x: p.x, z: p.z, stats: G.stats }));
  } catch { /* private mode etc. */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.v !== 1) return;
    G.cash = s.cash ?? G.cash;
    G.story = s.story ?? 0;
    G.armed = !!s.armed;
    if (s.stats) G.stats = s.stats;
    if (typeof s.x === 'number') G.player.g.position.set(s.x, 0, s.z);
    step = G.story >= 3 ? 'free' : G.story === 2 ? 'm3_talk' : G.story === 1 ? 'm2_talk' : 'm1_talk';
    G.hasSave = true;
  } catch { /* corrupted save: start fresh */ }
}
export function newGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch { }
  G.cash = 250; G.story = 0; G.armed = false; G.heat = 0; G.wanted = 0;
  step = 'm1_talk'; job = null; targetCar = null;
  G.player.g.position.set(-166, 0, 30);
  setObjectiveForStep();
}

// --- busted ----------------------------------------------------------------------
export function onBusted() {
  const fine = Math.min(G.cash, 200);
  G.cash -= fine;
  G.stats.busted++;
  sfx.busted();
  const P = G.player;
  if (P.vehicle) { P.vehicle.driver = null; P.vehicle = null; P.g.visible = true; P.torso.rotation.x = 0; }
  P.g.position.set(SAFE_AT.x, 0, SAFE_AT.z);
  P.heading = Math.PI / 2; P.speed = 0;
  G.mode = 'busted';
  G.bustedFine = fine;
  saveGame();
}

// --- per-frame -------------------------------------------------------------------
export function updateStory(dt) {
  // Marker follows the objective.
  if (G.objective) {
    marker.visible = true;
    marker.position.set(G.objective.x, 0, G.objective.z);
    markerRing.rotation.z = G.time * 1.4;
    markerRing.position.y = 0.4 + Math.sin(G.time * 2.2) * 0.15;
  } else marker.visible = false;
  for (const n of npcs) { // idle sway; Celia turns to face Rico when he is near
    n.body.g.rotation.y += Math.sin(G.time * 0.6 + n.idle) * 0.0006;
    if (d2(n.at.x, n.at.z, G.player.g.position.x, G.player.g.position.z) < 5)
      n.body.g.rotation.y = Math.atan2(G.player.g.position.x - n.at.x, G.player.g.position.z - n.at.z);
  }
  const P = G.player, pp = playerPos();
  // Mission progression checks.
  if (step === 'm1_car' && targetCar && P.vehicle === targetCar) { step = 'm1_drop'; setObjectiveForStep(); }
  else if (step === 'm1_drop' && P.vehicle === targetCar && d2(pp.x, pp.z, 52, 62) < 9) {
    step = 'm2_talk'; G.story = 1;
    startDialog(D.m1b, () => { G.armed = true; if (G.hooks.toast) G.hooks.toast('Pistol acquired — F or click to fire'); });
    pay(400, 'First Run complete');
    setObjectiveForStep();
  } else if (step === 'm2_steal' && targetCar && P.vehicle === targetCar) {
    crime.mission();
    step = 'm2_drop';
    if (G.hooks.toast) G.hooks.toast('That\'s the car — now lose the heat');
    setObjectiveForStep();
  } else if (step === 'm2_drop' && P.vehicle === targetCar && d2(pp.x, pp.z, 138, -118) < 10 && G.wanted === 0) {
    step = 'm3_talk'; G.story = 2;
    startDialog(D.m2b, null);
    pay(900, 'Hot Metal complete');
    setObjectiveForStep();
  } else if (step === 'm3_race') {
    const cp = racePts[raceIdx];
    if (cp && d2(pp.x, pp.z, cp.x, cp.z) < 11) {
      raceIdx++; sfx.ding();
      if (raceIdx >= racePts.length) {
        step = 'free'; G.story = 3;
        startDialog(D.m3b, null);
        pay(1500, 'The Coral Run complete');
      }
      setObjectiveForStep();
    } else if (G.time > deadline) {
      step = 'm3_talk';
      if (G.hooks.toast) G.hooks.toast('Out of time — Celia will let you try again');
      setObjectiveForStep();
    } else if ((updateStory._t = (updateStory._t ?? 0) - dt) <= 0) { updateStory._t = 0.5; setObjectiveForStep(); }
  }
  // Jobs.
  if (job && job.kind === 'delivery') {
    if (!job.picked && d2(pp.x, pp.z, job.x, job.z) < 6) {
      job.picked = true; sfx.ding();
      deadline = G.time + 30 + d2(job.x, job.z, job.x2, job.z2) / 8.5;
      if (G.hooks.toast) G.hooks.toast('Package on board — move!');
      setObjectiveForStep();
    } else if (job.picked && d2(pp.x, pp.z, job.x2, job.z2) < 7) {
      const dist = d2(job.x, job.z, job.x2, job.z2);
      pay(Math.round(90 + dist * 0.9), 'Delivery done');
      job = null; setObjectiveForStep();
    } else if (G.time > deadline) {
      job = null;
      if (G.hooks.toast) G.hooks.toast('Too slow — the delivery fell through');
      setObjectiveForStep();
    } else if ((updateStory._j = (updateStory._j ?? 0) - dt) <= 0) { updateStory._j = 0.5; setObjectiveForStep(); }
  } else if (job && job.kind === 'race') {
    const cp = racePts[raceIdx];
    if (cp && d2(pp.x, pp.z, cp.x, cp.z) < 11) {
      raceIdx++; sfx.ding();
      if (raceIdx >= racePts.length) {
        const bonus = Math.max(0, Math.round((deadline - G.time) * 2));
        pay(200 + bonus, 'Checkpoint race won');
        job = null;
      }
      setObjectiveForStep();
    } else if (G.time > deadline) {
      job = null;
      if (G.hooks.toast) G.hooks.toast('Race lost — the checkpoints reset');
      setObjectiveForStep();
    } else if ((updateStory._j = (updateStory._j ?? 0) - dt) <= 0) { updateStory._j = 0.5; setObjectiveForStep(); }
  }
  // Autosave.
  saveT -= dt;
  if (saveT <= 0) { saveT = 25; saveGame(); }
}
export function storyStep() { return step; }
