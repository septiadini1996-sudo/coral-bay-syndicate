// missions.js — the Syndicate story: a chained campaign of six jobs with
// givers, briefings, objectives, timers and payouts, plus repeatable side
// hustles once the chain is done. Progress is saved between visits.
"use strict";

let jobMarker = null;
function buildMissionMarker(scene) {
  jobMarker = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 42, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  pillar.position.y = 21; jobMarker.add(pillar);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.18; jobMarker.add(ring);
  jobMarker.visible = false;
  scene.add(jobMarker);
}
function setMarker(x, z, color) {
  if (!jobMarker) return;
  jobMarker.visible = true;
  jobMarker.position.set(x, 0, z);
  if (color) jobMarker.children.forEach((ch) => ch.material.color.setHex(color));
  G.objectivePos = { x, z };
}
function hideMarker() { if (jobMarker) jobMarker.visible = false; G.objectivePos = null; }

function findVehicle(kind) { return G.vehicles.find((v) => v.kind === kind); }
function reviveVehicle(v, x, z, heading) {
  if (!v) return;
  v.alive = true; v.health = 100; v.speed = 0; v.driver = null;
  v.mesh.position.set(x, 0, z); v.mesh.rotation.set(0, heading || 0, 0);
  v.mesh.traverse((o) => { if (o.material && o.material.color && o.userData.c) o.material.color.copy(o.userData.c); });
}
function focusDist(x, z) { const f = focusPoint(); return dist2d(f.x, f.z, x, z); }

const JOBS = [
  { title: "Opening Night", giver: "celia", payout: 300,
    brief: "Celia needs a driver. Take her Comet GT and get her to the Starfish Club downtown before the doors open." },
  { title: "Paper Trail", giver: "marco", payout: 450,
    brief: "Marco's ledgers are scattered in three downtown alleys. Pick up every case and bring them back to him." },
  { title: "Hot Metal", giver: "marco", payout: 650,
    brief: "A Dune Crusher sits unguarded in the industrial yard. Steal it and deliver it to Marco's lockup. Expect company." },
  { title: "Bay Runner", giver: "celia", payout: 800,
    brief: "Celia's Falco RR against the coast road: six checkpoints, one clock. Show the bay what fast looks like." },
  { title: "Sky High", giver: "don", payout: 1200,
    brief: "Don Falso wants the airport helicopter delivered to the marina helipad. The CBPD will object. Fly anyway." },
  { title: "The Syndicate", giver: "don", payout: 2500,
    brief: "Collect the tribute at three spots across Coral Bay, then reach the safehouse while the whole force hunts you. Finish it, Rico." },
];
const CASE_SPOTS = [{ x: -139, z: -139 }, { x: 92, z: -252 }, { x: 139, z: 139 }];
const TRIBUTE_SPOTS = [{ x: -34, z: -18 }, { x: -820, z: 160 }, { x: 436, z: 330 }];

function contactHasJob(key) {
  if (G.job || G.hustle) return false;
  if (G.jobIndex < JOBS.length) return JOBS[G.jobIndex].giver === key;
  return key === "celia"; // deliveries stay on offer after the story
}
function giverName(key) { return { celia: "Celia", marco: "Marco", don: "Don Falso" }[key]; }

function startJob(i) {
  const def = JOBS[i];
  G.job = { i, step: 0, t: 0, data: {} };
  showBanner(def.title, def.brief + "  Payout: " + fmtCash(def.payout), 6);
  sfxSting("start");
  if (i === 0) { const c = findVehicle("comet"); if (c && !c.alive) reviveVehicle(c, -664, 96, Math.PI / 2); }
  if (i === 2) { const c = findVehicle("crusher"); if (c && !c.alive) reviveVehicle(c, SPOTS.crusherYard.x, SPOTS.crusherYard.z, 0.4); }
  if (i === 3) { const f = findVehicle("falco"); if (f && !f.alive) reviveVehicle(f, SPOTS.beachFalco.x, SPOTS.beachFalco.z, Math.PI); }
  if (i === 4) { const h = findVehicle("heli"); if (h && !h.alive) reviveVehicle(h, SPOTS.airportHeli.x, SPOTS.airportHeli.z, 0); }
}
function completeJob() {
  const def = JOBS[G.job.i];
  G.cash += def.payout;
  G.jobIndex++; G.jobsDone = G.jobIndex;
  const wasFinale = G.job.i === JOBS.length - 1;
  G.job = null; hideMarker(); setObjective(null);
  sfxCash(); sfxSting("good");
  saveGame(); updateHUD();
  if (wasFinale) {
    showCard("CORAL BAY IS YOURS",
      "Every crew pays, every cop knows the name. Rico Solano runs Coral Bay now. Final payout: " + fmtCash(def.payout) +
      ". The city stays open — deliveries and the Bay Runner rematch keep paying.", "Long live the Syndicate");
  } else {
    showCard("JOB COMPLETE — " + def.title,
      "Paid " + fmtCash(def.payout) + ". Next: " + JOBS[G.jobIndex].title + " — see " + giverName(JOBS[G.jobIndex].giver) + ".", "Back to the streets");
  }
}
function failJob(reason) {
  if (!G.job) return;
  const def = JOBS[G.job.i];
  if (G.job.i === 0 && G.job.step === 1) { // Celia climbs back out at the marina
    const celia = G.contacts.celia.person;
    celia.mesh.visible = true; celia.mesh.position.set(SPOTS.celia.x, 0, SPOTS.celia.z);
  }
  G.job = null; hideMarker(); setObjective(null);
  sfxSting("bad");
  showCard("JOB FAILED — " + def.title, reason + " Talk to " + giverName(def.giver) + " to run it again.", "Try again");
}
function onPlayerEnterVehicle(v) {
  if (G.job && G.job.i === 4 && v.kind === "heli" && G.job.step === 0) { /* handled in the job update */ }
}
function onVehicleWrecked(v) {
  if (!G.job) return;
  if (G.job.i === 0 && v.kind === "comet") failJob("The Comet GT is wrecked.");
  else if (G.job.i === 2 && v.kind === "crusher") failJob("The Dune Crusher is wrecked — Marco needed it whole.");
  else if (G.job.i === 3 && v.kind === "falco") failJob("The Falco RR is wrecked.");
  else if (G.job.i === 4 && v.kind === "heli") failJob("The helicopter is down. The Don is not pleased.");
}

// --- individual jobs ----------------------------------------------------------
function jobUpdate(dt) {
  const job = G.job; if (!job) return;
  const d = job.data;
  job.t += dt;
  if (job.i === 0) { // Opening Night
    const comet = findVehicle("comet");
    if (job.step === 0) {
      setObjective("Get into Celia's Comet GT at the marina", comet.mesh.position.x, comet.mesh.position.z);
      setMarker(comet.mesh.position.x, comet.mesh.position.z, 0xffd94d);
      if (G.vehicle === comet) {
        job.step = 1; d.timer = 150;
        G.contacts.celia.person.mesh.visible = false;
        showToast("Celia's in. The Starfish Club, downtown — go!");
      }
    } else {
      d.timer -= dt;
      setObjective("Drive Celia to the Starfish Club", SPOTS.club.x, SPOTS.club.z, d.timer);
      setMarker(SPOTS.club.x, SPOTS.club.z, 0xffd94d);
      if (G.vehicle === comet && focusDist(SPOTS.club.x, SPOTS.club.z) < 10) {
        const celia = G.contacts.celia.person;
        celia.mesh.visible = true; celia.mesh.position.set(-24, 0, -24);
        completeJob(); return;
      }
      if (d.timer <= 0) { failJob("The club doors closed without Celia."); return; }
    }
  } else if (job.i === 1) { // Paper Trail
    if (job.step === 0) {
      d.cases = CASE_SPOTS.map((s) => spawnCasePickup(s.x, s.z));
      job.step = 1; d.got = 0;
    }
    if (job.step === 1) {
      const next = d.cases.find((cs) => !cs.taken);
      if (next) {
        setObjective("Collect the ledger cases (" + d.got + "/3) in the downtown alleys", next.x, next.z);
        setMarker(next.x, next.z, 0x2ee6c8);
        if (focusDist(next.x, next.z) < 3.4) {
          next.taken = true; next.grp.visible = false; d.got++;
          sfxPickup();
          if (d.got === 3) { setWanted(Math.max(G.wanted, 1)); showToast("Last case taken — someone called it in. Back to Marco!"); job.step = 2; }
          else showToast("Case " + d.got + " of 3 secured");
        }
      }
    } else if (job.step === 2) {
      setObjective("Return the ledgers to Marco", SPOTS.marco.x, SPOTS.marco.z);
      setMarker(SPOTS.marco.x, SPOTS.marco.z, 0xffd94d);
      if (focusDist(SPOTS.marco.x, SPOTS.marco.z) < 4.5) { completeJob(); return; }
    }
  } else if (job.i === 2) { // Hot Metal
    const crusher = findVehicle("crusher");
    if (job.step === 0) {
      setObjective("Steal the Dune Crusher from the industrial yard", SPOTS.crusherYard.x, SPOTS.crusherYard.z);
      setMarker(SPOTS.crusherYard.x, SPOTS.crusherYard.z, 0xffd94d);
      if (G.vehicle === crusher) { job.step = 1; setWanted(Math.max(G.wanted, 2)); showToast("That's the one — the yard crew called the cops!"); }
    } else {
      setObjective("Deliver the Dune Crusher to Marco's lockup", SPOTS.lockup.x, SPOTS.lockup.z);
      setMarker(SPOTS.lockup.x, SPOTS.lockup.z, 0xffd94d);
      if (G.vehicle === crusher && focusDist(SPOTS.lockup.x, SPOTS.lockup.z) < 9) { completeJob(); return; }
    }
  } else if (job.i === 3) { // Bay Runner
    const falco = findVehicle("falco");
    if (job.step === 0) {
      setObjective("Get on Celia's Falco RR at the beachfront", SPOTS.beachFalco.x, SPOTS.beachFalco.z);
      setMarker(SPOTS.beachFalco.x, SPOTS.beachFalco.z, 0xffd94d);
      if (G.vehicle === falco) { job.step = 1; d.cp = 0; d.timer = 95; showToast("Six checkpoints down the coast. GO!"); }
    } else {
      d.timer -= dt;
      const cp = RACE_CHECKPOINTS[d.cp];
      setObjective("Checkpoint " + (d.cp + 1) + " of 6 — beat the clock", cp.x, cp.z, d.timer);
      setMarker(cp.x, cp.z, 0x2ee6c8);
      if (G.vehicle === falco && focusDist(cp.x, cp.z) < 12) {
        d.cp++; sfxPickup();
        if (d.cp >= RACE_CHECKPOINTS.length) {
          const used = 95 - Math.max(0, d.timer);
          if (!G.raceBest || used < G.raceBest) G.raceBest = used;
          completeJob(); return;
        }
      }
      if (d.timer <= 0) { failJob("The clock beat you. The coast road keeps its crown."); return; }
    }
  } else if (job.i === 4) { // Sky High
    const heli = findVehicle("heli");
    if (job.step === 0) {
      setObjective("Steal the helicopter at the airport", SPOTS.airportHeli.x, SPOTS.airportHeli.z);
      setMarker(SPOTS.airportHeli.x, SPOTS.airportHeli.z, 0xffd94d);
      if (G.vehicle === heli) { job.step = 1; setWanted(Math.max(G.wanted, 3)); showToast("Up, up — set her down on the marina helipad."); }
    } else {
      setObjective("Land the helicopter on the marina helipad (H)", SPOTS.helipad.x, SPOTS.helipad.z);
      setMarker(SPOTS.helipad.x, SPOTS.helipad.z, 0xffd94d);
      if (G.vehicle === heli && heli.alt < 1.4 && Math.abs(heli.vy) < 2.5 && focusDist(SPOTS.helipad.x, SPOTS.helipad.z) < 15) {
        setWanted(Math.max(0, G.wanted - 1));
        completeJob(); return;
      }
    }
  } else if (job.i === 5) { // The Syndicate
    if (job.step === 0) {
      d.spots = TRIBUTE_SPOTS.map((s) => ({ x: s.x, z: s.z, taken: false }));
      job.step = 1; d.got = 0;
    }
    if (job.step === 1) {
      const next = d.spots.find((s) => !s.taken);
      if (next) {
        setObjective("Collect the tribute (" + d.got + "/3)", next.x, next.z);
        setMarker(next.x, next.z, 0xffd94d);
        if (focusDist(next.x, next.z) < 4) {
          next.taken = true; d.got++; sfxCash();
          if (d.got === 3) { job.step = 2; setWanted(4); showToast("Tribute's in — and the whole CBPD knows. SAFEHOUSE. NOW."); }
          else showToast("Tribute " + d.got + " of 3 collected");
        }
      }
    } else if (job.step === 2) {
      setObjective("Reach the safehouse — wanted level 4", SPOTS.safehouse.x, SPOTS.safehouse.z);
      setMarker(SPOTS.safehouse.x, SPOTS.safehouse.z, 0x2ee6c8);
      if (focusDist(SPOTS.safehouse.x, SPOTS.safehouse.z) < 8) { completeJob(); return; }
    }
  }
}

const casePickups = [];
function spawnCasePickup(x, z) {
  const grp = new THREE.Group();
  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.35),
    new THREE.MeshLambertMaterial({ color: 0x8a5a34 }));
  boxMesh.position.y = 1; grp.add(boxMesh);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.14, 12),
    new THREE.MeshBasicMaterial({ color: 0x2ee6c8, transparent: true, opacity: 0.6 }));
  glow.position.y = 0.1; grp.add(glow);
  grp.position.set(x, 0, z);
  G.scene.add(grp);
  const rec = { x, z, grp, taken: false };
  casePickups.push(rec);
  return rec;
}

// --- side hustles ---------------------------------------------------------------
const DROPOFFS = [
  { x: 640, z: -320, name: "the beachfront kiosk" }, { x: -160, z: 480, name: "the south depot" },
  { x: 330, z: -160, name: "the downtown garage" }, { x: -480, z: -480, name: "the Palmera gate" },
  { x: 160, z: 160, name: "the midtown corner" },
];
function startDelivery() {
  const drop = pick(DROPOFFS);
  G.hustle = { type: "delivery", x: drop.x, z: drop.z, name: drop.name, timer: 150 };
  showBanner("Side Hustle — Special Delivery", "Celia's package goes to " + drop.name + ". Quick and quiet. Pays $150.", 5);
  sfxSting("start");
}
function startRaceRematch() {
  G.hustle = { type: "race", cp: 0, timer: 95 };
  showBanner("Bay Runner — Rematch", "Six checkpoints, 95 seconds. Beat it for $400.", 4);
  sfxSting("start");
}
function hustleUpdate(dt) {
  const h = G.hustle; if (!h) return;
  if (h.type === "delivery") {
    h.timer -= dt;
    setObjective("Deliver Celia's package to " + h.name, h.x, h.z, h.timer);
    setMarker(h.x, h.z, 0x2ee6c8);
    if (focusDist(h.x, h.z) < 8) {
      G.cash += 150; G.hustle = null; hideMarker(); setObjective(null);
      sfxCash(); showCard("DELIVERED", "Package dropped, no questions asked. Paid $150. Celia always has another.", "Nice");
      saveGame(); updateHUD(); return;
    }
    if (h.timer <= 0) { G.hustle = null; hideMarker(); setObjective(null); showToast("Delivery window missed"); }
  } else if (h.type === "race") {
    h.timer -= dt;
    const cp = RACE_CHECKPOINTS[h.cp];
    setObjective("Rematch checkpoint " + (h.cp + 1) + " of 6", cp.x, cp.z, h.timer);
    setMarker(cp.x, cp.z, 0x2ee6c8);
    if (G.vehicle && G.vehicle.kind === "falco" && focusDist(cp.x, cp.z) < 12) {
      h.cp++; sfxPickup();
      if (h.cp >= RACE_CHECKPOINTS.length) {
        G.cash += 400; G.hustle = null; hideMarker(); setObjective(null);
        sfxCash(); showCard("COAST KING", "The bay road bows again. Paid $400.", "Nice");
        saveGame(); updateHUD(); return;
      }
    }
    if (h.timer <= 0) { G.hustle = null; hideMarker(); setObjective(null); showToast("The clock wins this one"); }
  }
}

// --- talking to givers ----------------------------------------------------------
function updateMissions(dt) {
  G.giverPrompt = null;
  if (!G.job && !G.hustle && G.mode === "play") {
    for (const key of ["celia", "marco", "don"]) {
      if (!contactHasJob(key)) continue;
      const ct = G.contacts[key];
      if (dist2d(G.player.mesh.position.x, G.player.mesh.position.z, ct.spot.x, ct.spot.z) < 4.2 && G.onFoot) {
        if (G.jobIndex < JOBS.length) G.giverPrompt = "E — Talk to " + giverName(key) + ": " + JOBS[G.jobIndex].title;
        else G.giverPrompt = "E — Ask Celia for a delivery run";
        if (G.keys["KeyE"]) {
          G.keys["KeyE"] = false; sfxInit(); sfxClick();
          if (G.jobIndex < JOBS.length) startJob(G.jobIndex); else startDelivery();
        }
        break;
      }
    }
    // the race rematch board at the beachfront start line
    if (!G.giverPrompt && G.jobIndex > 3 && G.onFoot &&
        dist2d(G.player.mesh.position.x, G.player.mesh.position.z, SPOTS.raceStart.x, SPOTS.raceStart.z) < 4.5) {
      G.giverPrompt = "E — Bay Runner rematch ($400)";
      if (G.keys["KeyE"]) { G.keys["KeyE"] = false; startRaceRematch(); }
    }
  }
  if (jobMarker && jobMarker.visible) jobMarker.children[1].rotation.z += dt * 1.4;
  for (const cs of casePickups) if (!cs.taken) cs.grp.rotation.y += dt * 2;
  jobUpdate(dt);
  hustleUpdate(dt);
}
