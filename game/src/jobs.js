// jobs.js — Celia Marrow's work: the three story missions, then an
// endless rotation of paid deliveries and checkpoint races. A mission
// is a list of steps (go somewhere / get in a named car / drive
// somewhere) with an optional game-time limit; timers run on the game
// clock through state.later(), so pausing the game pauses the job.
// Progress and money persist in localStorage.

import { rand, pick } from './base.js';
import { G, later } from './state.js';
import { CAR_NAMES } from './autos.js';
import { makeCar } from './autos.js';

const SAVE_KEY = 'coral-bay-syndicate-save-v1';
export const POIS = {
  celia: { x: -31.5, z: 112.5, name: "Celia's corner" },
  palms: { x: 74, z: -48, name: 'Palms Hotel' },
  garage: { x: 90, z: 117, name: 'Docks Garage' },
  marina: { x: 146, z: 88, name: 'Coral Bay Marina' },
  tower: { x: -14, z: 24, name: 'Coral Tower' },
  beachN: { x: 132, z: -96, name: 'North Beach' },
  oldtown: { x: -96, z: 30, name: 'Old Town' },
  suburb: { x: 24, z: -84, name: 'Palm Heights' },
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) Object.assign(G.save, JSON.parse(raw));
  } catch { /* private mode: play unsaved */ }
}
export function storeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch { /* ignore */ }
}

let active = null;   // { title, steps, step, deadline, pay, story }

function heroAt() {
  const c = G.driveCar;
  return c ? c.g.position : G.hero.g.position;
}

function banner(text, sub) {
  G.notice = sub ? `${text}\n${sub}` : text;
  G.noticeT = G.time + 3.4;
}

function startMission(def) {
  active = { ...def, step: 0, deadline: def.timeLimit ? G.time + def.timeLimit : 0 };
  banner(def.title, def.intro);
  refreshObjective();
}

function refreshObjective() {
  if (!active) { G.objective = null; return; }
  const s = active.steps[active.step];
  G.objective = {
    title: active.title, text: s.text,
    x: s.x, z: s.z, timer: active.deadline ? Math.max(0, active.deadline - G.time) : null,
  };
}

function finishMission(success) {
  const done = active;
  active = null;
  G.objective = null;
  if (success) {
    G.save.money += done.pay;
    G.save.jobsDone++;
    if (done.story) G.save.story = Math.max(G.save.story, done.story);
    storeSave();
    banner('JOB DONE', `+$${done.pay} — Celia is pleased`);
    if (G.snd) G.snd.fanfare();
    if (done.story === 3) {
      later(3.2, () => banner('SYNDICATE MADE', 'The bay is yours now, Rico. Keep earning.'));
    }
  } else {
    banner('JOB FAILED', 'Celia shrugs. "Again, then."');
    if (G.snd) G.snd.denied();
  }
  later(3.4, offerNext);
}

function offerNext() {
  if (active || G.mode !== 'play') return;
  const story = G.save.story;
  if (story === 0) startMission({
    title: 'FIRST RUN', story: 1, pay: 250, intro: 'Celia: "A package. The Palms. Move."',
    steps: [
      { text: 'Pick up the package for Celia', x: POIS.celia.x, z: POIS.celia.z, r: 6 },
      { text: 'Deliver it to the Palms Hotel', x: POIS.palms.x, z: POIS.palms.z, r: 9 },
    ],
    timeLimit: 240,
  });
  else if (story === 1) startMission({
    title: 'HOT METAL', story: 2, pay: 400, intro: 'Celia: "A Comet GT in Old Town has my name on it."',
    steps: [
      { text: 'Find the marked Comet GT', x: -115.1, z: 40, r: 8 },
      { text: 'Steal the Comet GT', x: -115.1, z: 40, r: 99, needCar: 'marked' },
      { text: 'Drop it at the Docks Garage', x: POIS.garage.x, z: POIS.garage.z, r: 9 },
    ],
    timeLimit: 300,
  });
  else if (story === 2) startMission({
    title: 'THE CORAL RUN', story: 3, pay: 600, intro: 'Celia: "Every checkpoint. Against the clock."',
    steps: [
      { text: 'Checkpoint — North Beach', x: 120, z: -110, r: 10 },
      { text: 'Checkpoint — Marina', x: 132, z: 88, r: 10 },
      { text: 'Checkpoint — Docks', x: 24, z: 110, r: 10 },
      { text: 'Checkpoint — Old Town', x: -110, z: 72, r: 10 },
      { text: 'Final — Celia\'s corner', x: POIS.celia.x, z: POIS.celia.z, r: 9 },
    ],
    timeLimit: 300,
  });
  else {
    // free-roam rotation: a delivery or a checkpoint dash
    const rng = G.world;
    const dests = Object.values(POIS);
    const dest = pick(rng, dests);
    if (rng() < 0.5) {
      const hp = heroAt();
      const dist = Math.hypot(dest.x - hp.x, dest.z - hp.z);
      startMission({
        title: 'DELIVERY', story: 0, pay: Math.round(120 + dist * 0.35),
        intro: `Celia: "Take this to ${dest.name}. Clock's running."`,
        steps: [{ text: `Deliver to ${dest.name}`, x: dest.x, z: dest.z, r: 9 }],
        timeLimit: Math.round(dist / 10 + 35),
      });
    } else {
      const cps = [];
      const pool = [...dests];
      for (let i = 0; i < 3; i++) {
        const d = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        cps.push({ text: `Checkpoint — ${d.name}`, x: d.x + rand(rng, -14, 14), z: d.z + rand(rng, -14, 14), r: 10 });
      }
      cps.push({ text: 'Final — back to Celia', x: POIS.celia.x, z: POIS.celia.z, r: 9 });
      startMission({
        title: 'CHECKPOINT DASH', story: 0, pay: 320,
        intro: 'Celia: "Hit every marker. Fast."',
        steps: cps, timeLimit: 240,
      });
    }
  }
}

// The marked Comet for HOT METAL, parked in Old Town.
export function placeMarkedCar(THREE, scene) {
  const car = makeCar(THREE, 'sport', 0xff2244);
  car.role = 'parked';
  car.marked = true;
  car.g.position.set(-115.1, 0, 40);
  car.head = Math.PI;
  car.g.rotation.y = Math.PI;
  scene.add(car.g);
  G.cars.push(car);
  G.markedCar = car;
  return car;
}

export function startJobs() {
  later(1.2, offerNext);
}

// Force a mission/step for staged screenshots.
export function stageMission(storyStep) {
  G.save.story = storyStep;
  offerNext();
}

export function updateJobs(dt) {
  if (!active) return;
  const s = active.steps[active.step];
  const hp = heroAt();
  const d = Math.hypot(s.x - hp.x, s.z - hp.z);
  if (G.objective) {
    G.objective.dist = d;
    G.objective.timer = active.deadline ? Math.max(0, active.deadline - G.time) : null;
  }
  if (active.deadline && G.time > active.deadline) { finishMission(false); return; }
  let reached = false;
  if (s.needCar === 'marked') {
    reached = !!(G.driveCar && G.driveCar.marked);
  } else {
    reached = d < (s.r || 8);
  }
  if (reached) {
    if (G.snd) G.snd.pickup();
    active.step++;
    if (active.step >= active.steps.length) { finishMission(true); return; }
    refreshObjective();
  }
  void dt;
}

export function missionNameOf(car) {
  return car && car.marked ? 'the marked Comet GT' : CAR_NAMES[car ? car.kind : 'sedan'];
}
