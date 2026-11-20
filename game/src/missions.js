"use strict";
let jMrk = null;
function buildMissionMarker(scene) {
	jMrk = new GR();
	const pillar = beam(1.6, 42, 0xffd94d, 0.32); jMrk.add(pillar);
	const ring = ringM(2.6, 3.4, 0xffd94d, 0.85);
	ring.position.y = 0.18; jMrk.add(ring);
	jMrk.visible = false;
	scene.add(jMrk);
}
function sMrk(x, z, color) {
	if (!jMrk) return;
	jMrk.visible = true;
	jMrk.position.set(x, 0, z);
	if (color) jMrk.children.forEach((ch) => ch.material.color.setHex(color));
	G.oP = { x, z };
}
function hMrk() { if (jMrk) jMrk.visible = false; G.oP = null; }
function fVeh(kind) { return G.vs.find((v) => v.kind === kind); }
function revV(v, x, z, heading) {
	if (!v) return;
	v.alive = true; v.health = 100; v.speed = 0; v.driver = null;
	v.mesh.position.set(x, 0, z); v.mesh.rotation.set(0, heading || 0, 0);
	v.mesh.traverse((o) => { if (o.material && o.material.color && o.userData.c) o.material.color.copy(o.userData.c); });
}
function fDst(x, z) { const f = fPt(); return d3(f.x, f.z, x, z); }
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
	if (G.job || G.hu) return false;
	if (G.ji < JOBS.length) return JOBS[G.ji].giver === key;
	return key === "celia";
}
function gNam(key) { return { celia: "Celia", marco: "Marco", don: "Don Falso" }[key]; }
function startJob(i) {
	const def = JOBS[i];
	G.job = { i, step: 0, t: 0, data: {} };
	showBanner(def.title, def.brief + "  Payout: " + fmtCash(def.payout), 6);
	sfxSting("start");
	if (i === 0) { const c = fVeh("comet"); if (c && !c.alive) revV(c, -664, 96, M.PI / 2); }
	if (i === 2) { const c = fVeh("crusher"); if (c && !c.alive) revV(c, SP.cY.x, SP.cY.z, 0.4); }
	if (i === 3) { const f = fVeh("falco"); if (f && !f.alive) revV(f, SP.bF.x, SP.bF.z, M.PI); }
	if (i === 4) { const h = fVeh("heli"); if (h && !h.alive) revV(h, SP.aH.x, SP.aH.z, 0); }
}
function cJob() {
	const def = JOBS[G.job.i];
	const doneIdx = G.job.i;
	G.ca += def.payout;
	G.ji++; G.jD = G.ji;
	const wasFinale = doneIdx === JOBS.length - 1;
	G.job = null; hMrk(); sObj(null);
	sfxCash(); sfxSting("good");
	sV(); uHud();
	if (wasFinale) {
		const don = G.ct.don.person;
		don.mesh.position.set(G.pl.mesh.position.x + 3, 0, G.pl.mesh.position.z + 1);
		startCutscene(6, () => {
			don.mesh.position.set(SP.dn.x, 0, SP.dn.z);
			showCard("CORAL BAY IS YOURS",
				"Every crew pays, every cop knows the name. Rico Solano runs Coral Bay now. Final payout: " + fmtCash(def.payout) +
				". The city stays open — deliveries and the Bay Runner rematch keep paying.", "Long live the Syndicate");
		});
	} else {
		showBanner("CHAPTER " + (doneIdx + 1) + " COMPLETE · +" + fmtCash(def.payout),
			"Next: Chapter " + (G.ji + 1) + " — " + JOBS[G.ji].title + ", from " + gNam(JOBS[G.ji].giver) + ".", 5.5);
	}
}
function failJob(reason) {
	if (!G.job) return;
	const def = JOBS[G.job.i];
	if (G.job.i === 0 && G.job.step === 1) {
		const celia = G.ct.celia.person;
		celia.mesh.visible = true; celia.mesh.position.set(SP.ce.x, 0, SP.ce.z);
	}
	G.job = null; hMrk(); sObj(null);
	sfxSting("bad");
	showCard("JOB FAILED — " + def.title, reason + " Talk to " + gNam(def.giver) + " to run it again.", "Try again");
}
function onPlayerEnterVehicle(v) {
	if (G.job && G.job.i === 4 && v.kind === "heli" && G.job.step === 0) {  }
}
function onVehicleWrecked(v) {
	if (!G.job) return;
	if (G.job.i === 0 && v.kind === "comet") failJob("The Comet GT is wrecked.");
	else if (G.job.i === 2 && v.kind === "crusher") failJob("The Dune Crusher is wrecked — Marco needed it whole.");
	else if (G.job.i === 3 && v.kind === "falco") failJob("The Falco RR is wrecked.");
	else if (G.job.i === 4 && v.kind === "heli") failJob("The helicopter is down. The Don is not pleased.");
}
function jobUpdate(dt) {
	const job = G.job; if (!job) return;
	const d = job.data;
	job.t += dt;
	if (job.i === 0) {
		const comet = fVeh("comet");
		if (job.step === 0) {
			sObj("Get into Celia's Comet GT at the marina", comet.mesh.position.x, comet.mesh.position.z);
			sMrk(comet.mesh.position.x, comet.mesh.position.z, 0xffd94d);
			if (G.vh === comet) {
				job.step = 1; d.timer = 150;
				G.ct.celia.person.mesh.visible = false;
				sToa("Celia's in. The Starfish Club, downtown — go!");
			}
		} else {
			d.timer -= dt;
			sObj("Drive Celia to the Starfish Club", SP.cb.x, SP.cb.z, d.timer);
			sMrk(SP.cb.x, SP.cb.z, 0xffd94d);
			if (G.vh === comet && fDst(SP.cb.x, SP.cb.z) < 10) {
				const celia = G.ct.celia.person;
				celia.mesh.visible = true; celia.mesh.position.set(-24, 0, -24);
				cJob(); return;
			}
			if (d.timer <= 0) { failJob("The club doors closed without Celia."); return; }
		}
	} else if (job.i === 1) {
		if (job.step === 0) {
			d.cases = CASE_SPOTS.map((s) => spawnCasePickup(s.x, s.z));
			job.step = 1; d.got = 0;
		}
		if (job.step === 1) {
			const next = d.cases.find((cs) => !cs.taken);
			if (next) {
				sObj("Collect the ledger cases (" + d.got + "/3) in the downtown alleys", next.x, next.z);
				sMrk(next.x, next.z, 0x2ee6c8);
				if (fDst(next.x, next.z) < 3.4) {
					next.taken = true; next.grp.visible = false; d.got++;
					sfxPickup();
					if (d.got === 3) { sW(M.max(G.wn, 1)); sToa("Last case taken — someone called it in. Back to Marco!"); job.step = 2; }
					else sToa("Case " + d.got + " of 3 secured");
				}
			}
		} else if (job.step === 2) {
			sObj("Return the ledgers to Marco", SP.ma.x, SP.ma.z);
			sMrk(SP.ma.x, SP.ma.z, 0xffd94d);
			if (fDst(SP.ma.x, SP.ma.z) < 4.5) { cJob(); return; }
		}
	} else if (job.i === 2) {
		const crusher = fVeh("crusher");
		if (job.step === 0) {
			sObj("Steal the Dune Crusher from the industrial yard", SP.cY.x, SP.cY.z);
			sMrk(SP.cY.x, SP.cY.z, 0xffd94d);
			if (G.vh === crusher) { job.step = 1; sW(M.max(G.wn, 2)); sToa("That's the one — the yard crew called the cops!"); }
		} else {
			sObj("Deliver the Dune Crusher to Marco's lockup", SP.lk.x, SP.lk.z);
			sMrk(SP.lk.x, SP.lk.z, 0xffd94d);
			if (G.vh === crusher && fDst(SP.lk.x, SP.lk.z) < 9) { cJob(); return; }
		}
	} else if (job.i === 3) {
		const falco = fVeh("falco");
		if (job.step === 0) {
			sObj("Get on Celia's Falco RR at the beachfront", SP.bF.x, SP.bF.z);
			sMrk(SP.bF.x, SP.bF.z, 0xffd94d);
			if (G.vh === falco) { job.step = 1; d.cp = 0; d.timer = 95; sToa("Six checkpoints down the coast. GO!"); }
		} else {
			d.timer -= dt;
			const cp = RCP[d.cp];
			sObj("Checkpoint " + (d.cp + 1) + " of 6 — beat the clock", cp.x, cp.z, d.timer);
			sMrk(cp.x, cp.z, 0x2ee6c8);
			if (G.vh === falco && fDst(cp.x, cp.z) < 12) {
				d.cp++; sfxPickup();
				if (d.cp >= RCP.length) {
					const used = 95 - M.max(0, d.timer);
					if (!G.rB || used < G.rB) G.rB = used;
					cJob(); return;
				}
			}
			if (d.timer <= 0) { failJob("The clock beat you. The coast road keeps its crown."); return; }
		}
	} else if (job.i === 4) {
		const heli = fVeh("heli");
		if (job.step === 0) {
			sObj("Steal the helicopter at the airport", SP.aH.x, SP.aH.z);
			sMrk(SP.aH.x, SP.aH.z, 0xffd94d);
			if (G.vh === heli) { job.step = 1; sW(M.max(G.wn, 3)); sToa("Up, up — set her down on the marina helipad."); }
		} else {
			sObj("Land the helicopter on the marina helipad (H)", SP.hP.x, SP.hP.z);
			sMrk(SP.hP.x, SP.hP.z, 0xffd94d);
			if (G.vh === heli && heli.alt < 1.4 && M.abs(heli.vy) < 2.5 && fDst(SP.hP.x, SP.hP.z) < 15) {
				sW(M.max(0, G.wn - 1));
				cJob(); return;
			}
		}
	} else if (job.i === 5) {
		if (job.step === 0) {
			d.spots = TRIBUTE_SPOTS.map((s) => ({ x: s.x, z: s.z, taken: false }));
			job.step = 1; d.got = 0;
		}
		if (job.step === 1) {
			const next = d.spots.find((s) => !s.taken);
			if (next) {
				sObj("Collect the tribute (" + d.got + "/3)", next.x, next.z);
				sMrk(next.x, next.z, 0xffd94d);
				if (fDst(next.x, next.z) < 4) {
					next.taken = true; d.got++; sfxCash();
					if (d.got === 3) { job.step = 2; sW(4); sToa("Tribute's in — and the whole CBPD knows. SAFEHOUSE. NOW."); }
					else sToa("Tribute " + d.got + " of 3 collected");
				}
			}
		} else if (job.step === 2) {
			sObj("Reach the safehouse — wanted level 4", SP.sH.x, SP.sH.z);
			sMrk(SP.sH.x, SP.sH.z, 0x2ee6c8);
			if (fDst(SP.sH.x, SP.sH.z) < 8) { cJob(); return; }
		}
	}
}
const casePickups = [];
function spawnCasePickup(x, z) {
	const grp = new GR();
	const boxMesh = new MS(new BG(0.9, 0.6, 0.35),
		new ML({ color: 0x8a5a34 }));
	boxMesh.position.y = 1; grp.add(boxMesh);
	const glow = glowDisc(0x2ee6c8, 1, 0.6);
	glow.position.y = 0.1; grp.add(glow);
	grp.position.set(x, 0, z);
	G.sc.add(grp);
	const rec = { x, z, grp, taken: false };
	casePickups.push(rec);
	return rec;
}
const DROPOFFS = [
	{ x: 640, z: -320, name: "the beachfront kiosk" }, { x: -160, z: 480, name: "the south depot" },
	{ x: 330, z: -160, name: "the downtown garage" }, { x: -480, z: -480, name: "the Palmera gate" },
	{ x: 160, z: 160, name: "the midtown corner" },
];
function startDelivery() {
	const drop = pick(DROPOFFS);
	G.hu = { type: "delivery", x: drop.x, z: drop.z, name: drop.name, timer: 150 };
	showBanner("Side Hustle — Special Delivery", "Celia's package goes to " + drop.name + ". Quick and quiet. Pays $150.", 5);
	sfxSting("start");
}
function startRaceRematch() {
	G.hu = { type: "race", cp: 0, timer: 95 };
	showBanner("Bay Runner — Rematch", "Six checkpoints, 95 seconds. Beat it for $400.", 4);
	sfxSting("start");
}
function hustleUpdate(dt) {
	const h = G.hu; if (!h) return;
	if (h.type === "delivery") {
		h.timer -= dt;
		sObj("Deliver Celia's package to " + h.name, h.x, h.z, h.timer);
		sMrk(h.x, h.z, 0x2ee6c8);
		if (fDst(h.x, h.z) < 8) {
			G.ca += 150; G.hu = null; hMrk(); sObj(null);
			sfxCash(); showCard("DELIVERED", "Package dropped, no questions asked. Paid $150. Celia always has another.", "Nice");
			sV(); uHud(); return;
		}
		if (h.timer <= 0) { G.hu = null; hMrk(); sObj(null); sToa("Delivery window missed"); }
	} else if (h.type === "race") {
		h.timer -= dt;
		const cp = RCP[h.cp];
		sObj("Rematch checkpoint " + (h.cp + 1) + " of 6", cp.x, cp.z, h.timer);
		sMrk(cp.x, cp.z, 0x2ee6c8);
		if (G.vh && G.vh.kind === "falco" && fDst(cp.x, cp.z) < 12) {
			h.cp++; sfxPickup();
			if (h.cp >= RCP.length) {
				G.ca += 400; G.hu = null; hMrk(); sObj(null);
				sfxCash(); showCard("COAST KING", "The bay road bows again. Paid $400.", "Nice");
				sV(); uHud(); return;
			}
		}
		if (h.timer <= 0) { G.hu = null; hMrk(); sObj(null); sToa("The clock wins this one"); }
	}
}
function updateMissions(dt) {
	G.gP = null;
	if (!G.job && !G.hu && G.md === "play") {
		for (const gk of ["celia", "marco", "don"]) {
			if (!contactHasJob(gk)) continue;
			const ct = G.ct[gk];
			if (d3(G.pl.mesh.position.x, G.pl.mesh.position.z, ct.spot.x, ct.spot.z) < 4.2 && G.oF) {
				if (G.ji < JOBS.length) G.gP = "E — Talk to " + gNam(gk) + ": " + JOBS[G.ji].title;
				else G.gP = "E — Ask Celia for a delivery run";
				if (key("KeyE")) {
					G.ky["KeyE"] = false; sfxInit(); sfxClick();
					if (G.ji < JOBS.length) { const i = G.ji; startCutscene(i, () => startJob(i)); }
					else startDelivery();
				}
				break;
			}
		}
		if (!G.gP && G.ji > 3 && G.oF &&
				d3(G.pl.mesh.position.x, G.pl.mesh.position.z, SP.rT.x, SP.rT.z) < 4.5) {
			G.gP = "E — Bay Runner rematch ($400)";
			if (key("KeyE")) { G.ky["KeyE"] = false; startRaceRematch(); }
		}
	}
	if (jMrk && jMrk.visible) jMrk.children[1].rotation.z += dt * 1.4;
	for (const cs of casePickups) if (!cs.taken) cs.grp.rotation.y += dt * 2;
	jobUpdate(dt);
	hustleUpdate(dt);
}
