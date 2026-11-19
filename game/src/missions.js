// Missions and story for Coral Bay Syndicate. Rico Solano runs three jobs for
// Celia Marrow's harbour crew — a first delivery, a stolen showpiece, and a
// checkpoint run under a rising wanted level — then works the bay freely:
// timed package deliveries from the marina and checkpoint races downtown.
// One glowing beacon at a time marks the objective on the map and the minimap.
const THREE = window.THREE;
import { clamp, randRange } from './util.js';
import { LANDMARKS } from './city.js';

const DROPOFFS = [
  { x: 84, z: -120, name: 'a Coral Heights doorman' }, { x: -84, z: 120, name: 'a beach bar' },
  { x: 140, z: 60, name: 'a surf shop' }, { x: -140, z: -40, name: 'a fish market stall' },
  { x: 28, z: -60, name: 'a Coral Heights lobby' }, { x: -56, z: -168, name: 'a clinic courier' },
  { x: 168, z: 120, name: 'a lifeguard tower' }, { x: -168, z: -140, name: 'a boatyard office' },
];
const RACE_POINTS = [
  [56, 56], [-56, 56], [56, -56], [-56, -56], [112, 0], [-112, 0], [0, 112], [0, -112],
  [112, 112], [-112, -112], [168, -56], [-168, 56], [56, 168], [-56, -168],
];

export function createMissions(G) {
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 24, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.y = 12; beacon.visible = false;
  G.scene.add(beacon);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x3ec6dd, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  const rings = [];
  for (const spot of [LANDMARKS.marina, LANDMARKS.race]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.1, 36), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(spot.x, 0.16, spot.z);
    G.scene.add(ring); rings.push(ring);
  }

  const M = {
    storyIndex: 0, storyComplete: false, objective: null, side: null,
    targetCar: null, jobCd: 0, stats: { deliveries: 0, races: 0 },
  };

  // Story beats run on a game-clock scheduler, not wall-clock timers:
  // M.update only ticks while the game is playing, so pausing the game
  // pauses the story with it (a setTimeout would fire through the pause).
  const pending = [];
  function after(seconds, fn) { pending.push({ at: G.time + seconds, fn }); }
  function runPending() {
    for (let i = pending.length - 1; i >= 0; i--) {
      if (G.time >= pending[i].at) { const due = pending.splice(i, 1)[0]; due.fn(); }
    }
  }

  function setObjective(o) {
    M.objective = o;
    if (o) {
      beacon.visible = true;
      beacon.position.x = o.x; beacon.position.z = o.z;
      beacon.material.color.setHex(o.color ?? 0xffd23e);
    } else beacon.visible = false;
  }
  function clearSide() { M.side = null; G.hud.setTimer(null); }

  /* ---------------- story ---------------- */
  function startStoryMission(i) {
    const garage = LANDMARKS.garage, hotel = LANDMARKS.hotel, chop = LANDMARKS.chopShop;
    if (i === 0) {
      G.hud.banner('FIRST RUN', 'Celia Marrow has work for you');
      setObjective({ kind: 'goto', x: garage.x, z: garage.z, title: 'FIRST RUN', text: 'Pick up the package at the Docks Garage', radius: 6,
        done: () => {
          G.hud.toast('Package on board. Celia: "Hotel. Fast, quiet."');
          G.police.addHeat(1);
          setObjective({ kind: 'goto', x: hotel.x, z: hotel.z, title: 'FIRST RUN', text: 'Deliver the package to the Palms Hotel', radius: 7,
            done: () => finishStoryMission(250, 'Clean run. Celia is pleased.') });
        } });
    } else if (i === 1) {
      G.hud.banner('HOT METAL', 'Lift the Flamingo GT for the Marrow crew');
      const car = G.traffic.spawnParked(90, -49.5, -Math.PI / 2, 0xff2e88);
      car.group.userData.name = 'Flamingo GT — SHOWPIECE';
      M.targetCar = car;
      setObjective({ kind: 'steal', x: 90, z: -49.5, title: 'HOT METAL', text: 'Steal the pink Flamingo GT in Coral Heights', radius: 6,
        done: () => {
          G.police.addHeat(1.4);
          G.hud.toast('That\'s the one! Take it to Marrow Auto Works');
          setObjective({ kind: 'deliverCar', x: chop.x, z: chop.z, title: 'HOT METAL', text: 'Deliver the Flamingo GT to Marrow Auto Works', radius: 8,
            done: () => finishStoryMission(600, 'The GT vanishes into the chop shop.') });
        } });
    } else if (i === 2) {
      G.hud.banner('THE CORAL RUN', 'Every checkpoint. One rising heat.');
      G.police.addHeat(2);
      const points = [[62, 62], [-28, -160], [168, -28], [-140, 196], [28, 160], [9, 9]];
      startCheckpoints(points, 175, 'THE CORAL RUN', () => finishStoryMission(1200, 'You own these streets now.'), () => {
        G.hud.toast('Out of time — Celia sends you back out');
        startStoryMission(2);
      });
    }
  }
  function finishStoryMission(reward, line) {
    G.addMoney(reward, 'job');
    G.audio.chime();
    G.hud.banner('JOB DONE', `${line}  +$${reward}`);
    M.storyIndex += 1;
    setObjective(null);
    if (M.storyIndex >= 3) {
      M.storyComplete = true;
      after(2.6, () => G.hud.banner('SYNDICATE MADE', 'Story complete — the bay is yours. Rings pay cash.'));
    } else {
      M.awaitingNext = true;
      after(2.6, () => { M.awaitingNext = false; if (!M.side && !M.objective) startStoryMission(M.storyIndex); });
    }
    G.saveGame();
  }

  function startCheckpoints(points, seconds, title, onDone, onFail) {
    const job = { kind: 'race', points, idx: 0, timer: seconds, title, onDone, onFail };
    M.side = job;
    const [x, z] = points[0];
    setObjective({ kind: 'checkpoint', x, z, title, text: `Checkpoint 1 of ${points.length}`, radius: 7, color: 0x3ec6dd, done: () => {} });
  }
  function advanceCheckpoint() {
    const job = M.side; if (!job || job.kind !== 'race') return;
    job.idx += 1;
    G.audio.pickup();
    if (job.idx >= job.points.length) {
      const reward = job.title === 'STREET RACE' ? Math.round(150 + job.timer * 4) : 0;
      const done = job.onDone; clearSide(); setObjective(null);
      if (reward) { G.addMoney(reward, 'race'); M.stats.races += 1; G.hud.banner('RACE WON', `+$${reward}`); G.audio.chime(); }
      if (done) done();
      return;
    }
    const [x, z] = job.points[job.idx];
    setObjective({ kind: 'checkpoint', x, z, title: job.title, text: `Checkpoint ${job.idx + 1} of ${job.points.length}`, radius: 7, color: 0x3ec6dd, done: () => {} });
    G.hud.toast(`Checkpoint ${job.idx} cleared`);
  }

  /* ---------------- side work ---------------- */
  function startDelivery() {
    const drop = DROPOFFS[Math.floor(G.rand() * DROPOFFS.length)];
    const dist = Math.hypot(drop.x - LANDMARKS.marina.x, drop.z - LANDMARKS.marina.z);
    const job = { kind: 'delivery', timer: dist / 10.5 + 30, reward: Math.round(60 + dist * 0.55) };
    M.side = job;
    G.hud.toast('Package aboard — the clock is running');
    setObjective({ kind: 'goto', x: drop.x, z: drop.z, title: 'DELIVERY', text: `Rush the package to ${drop.name}`, radius: 7, color: 0x3ec6dd,
      done: () => {
        G.addMoney(job.reward, 'delivery'); M.stats.deliveries += 1;
        G.hud.banner('DELIVERED', `+$${job.reward}`); G.audio.chime();
        clearSide(); setObjective(null); G.saveGame();
      } });
  }
  function startRace() {
    const pts = [];
    const pool = [...RACE_POINTS];
    for (let i = 0; i < 5; i++) pts.push(pool.splice(Math.floor(G.rand() * pool.length), 1)[0]);
    let dist = 0, px = LANDMARKS.race.x, pz = LANDMARKS.race.z;
    for (const [x, z] of pts) { dist += Math.hypot(x - px, z - pz); px = x; pz = z; }
    startCheckpoints(pts, dist / 12.5 + 35, 'STREET RACE', null, () => {
      G.hud.toast('Out of time — the race pays nothing');
      if (!M.storyComplete && M.storyIndex < 3 && !M.objective) startStoryMission(M.storyIndex);
    });
    G.hud.toast('Race on! Hit every checkpoint');
  }

  /* ---------------- per-frame ---------------- */
  M.update = (dt) => {
    runPending();
    beacon.material.opacity = 0.2 + Math.sin(G.time * 3.2) * 0.05;
    const pulse = 1 + Math.sin(G.time * 2.4) * 0.05;
    for (const r of rings) r.scale.set(pulse, pulse, 1);
    M.jobCd -= dt;

    // Timers for races and deliveries.
    if (M.side && M.side.timer !== undefined) {
      M.side.timer -= dt;
      G.hud.setTimer(Math.max(0, M.side.timer));
      if (M.side.timer <= 0) {
        const fail = M.side.onFail;
        if (M.objective && M.side.kind === 'delivery') setObjective(null);
        clearSide();
        if (M.objective && M.objective.kind === 'checkpoint') setObjective(null);
        G.hud.toast('Out of time');
        if (fail) fail();
        else if (!M.storyComplete && M.storyIndex < 3 && !M.objective) startStoryMission(M.storyIndex);
        return;
      }
    }

    const o = M.objective;
    if (o) {
      const d = Math.hypot(G.player.x - o.x, G.player.z - o.z);
      G.hud.setObjective(o.title, o.text, d);
      let arrived = d < (o.radius ?? 6);
      if (o.kind === 'steal') arrived = G.player.mode === 'car' && G.player.car === M.targetCar;
      if (o.kind === 'deliverCar') arrived = arrived && G.player.mode === 'car' && G.player.car === M.targetCar;
      if (arrived) {
        if (o.kind === 'checkpoint') advanceCheckpoint();
        else { const done = o.done; if (!M.side) setObjective(null); if (done) done(); }
      }
    } else if (M.storyComplete) {
      G.hud.setObjective('FREE ROAM', 'Work the glowing rings: marina deliveries, downtown races', null);
    } else if (!M.side && M.storyIndex < 3 && !M.awaitingNext) {
      startStoryMission(M.storyIndex);
    }

    // Side-job rings: press E inside one to take the work.
    if (!M.side && M.jobCd <= 0 && G.player.mode === 'foot') {
      for (const [spot, start] of [[LANDMARKS.marina, startDelivery], [LANDMARKS.race, startRace]]) {
        if (Math.hypot(G.player.x - spot.x, G.player.z - spot.z) < 4.4) {
          G.hud.prompt('E', spot === LANDMARKS.marina ? 'Take a delivery job' : 'Start a checkpoint race');
          if (G.keys['KeyE']) { M.jobCd = 1.2; start(); G.hud.prompt(null); }
          return;
        }
      }
    }
  };

  M.beacon = beacon;
  M.begin = () => { if (!M.storyComplete) startStoryMission(M.storyIndex); };
  M.snapshot = () => ({ storyIndex: M.storyIndex, storyComplete: M.storyComplete, stats: M.stats });
  M.restore = (s) => {
    if (!s) return;
    M.storyIndex = s.storyIndex ?? 0;
    M.storyComplete = !!s.storyComplete;
    M.stats = s.stats ?? M.stats;
  };
  return M;
}
