"use strict";
function bootGame() {
	const params = new URLSearchParams(location.search);
	const seedParam = parseInt(params.get("seed") || "", 10);
	if (!Number.isNaN(seedParam)) rng = m3(seedParam);
	G.sc = new T3.Scene();
	G.cm = new T3.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 6000);
	G.rd = new T3.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
	G.rd.setSize(innerWidth, innerHeight);
	G.rd.setPixelRatio(M.min(devicePixelRatio || 1, 2));
	G.rd.shadowMap.enabled = true;
	G.rd.shadowMap.type = T3.PCFShadowMap;
	G.rd.toneMapping = T3.ACESFilmicToneMapping;
	G.rd.toneMappingExposure = 1.12;
	el("app").appendChild(G.rd.domElement);
	buildWorld();
	buildCast(G.sc);
	buildVehicles(G.sc);
	buildMissionMarker(G.sc);
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
		G.ky[e.code] = true;
		if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
		if (G.cs) {
			if (e.code === "Enter" || e.code === "Escape") skipCutscene();
			sfxInit();
			return;
		}
		if (e.code === "Escape") {
			if (G.md === "map") tMap(false);
			else if (G.md === "missions") tMis(false);
			else if (el("menu-help").style.display === "flex") el("menu-help").style.display = "none";
			else if (G.md === "play" || G.md === "pause") tPau();
		} else if (e.code === "KeyP") {
			if (el("menu-help").style.display === "flex") el("menu-help").style.display = "none";
			else if (G.md === "play" || G.md === "pause") tPau();
		}
		if (e.code === "KeyM" && (G.md === "play" || G.md === "map")) tMap();
		if ((e.code === "Tab" || e.code === "KeyJ") && (G.md === "play" || G.md === "missions")) tMis();
		sfxInit();
	});
	addEventListener("keyup", (e) => { G.ky[e.code] = false; });
	addEventListener("blur", () => { G.ky = {}; });
	const dom = G.rd.domElement;
	dom.addEventListener("mousedown", (e) => {
		if (G.cs) { skipCutscene(); return; }
		mouseDown = true; mouseMoved = 0; mouseDownAt = performance.now(); sfxInit();
		if (G.md === "play" && G.oF && isGun(G.wp)) playerAttack();
	});
	addEventListener("mousemove", (e) => {
		if (!mouseDown) return;
		mouseMoved += M.abs(e.movementX) + M.abs(e.movementY);
		G.yW -= e.movementX * 0.0052;
		G.cP = zm(G.cP + e.movementY * 0.004, 0.06, 1.15);
		lastDragT = G.tm;
	});
	addEventListener("mouseup", () => {
		if (mouseDown && mouseMoved < 6 && performance.now() - mouseDownAt < 350 && G.md === "play" && G.oF && !isGun(G.wp)) playerAttack();
		mouseDown = false;
	});
	dom.addEventListener("wheel", (e) => { G.cD = zm(G.cD + M.sign(e.deltaY) * 1.4, 5.5, 22); }, { passive: true });
	addEventListener("resize", () => {
		G.cm.aspect = innerWidth / innerHeight;
		G.cm.updateProjectionMatrix();
		G.rd.setSize(innerWidth, innerHeight);
	});
}
const cTgP = new T3.Vector3();
function updateCamera(dt) {
	const cam = G.cm;
	if (G.md === "title") {
		const a = G.tm * 0.05;
		cam.position.set(-260 + M.cos(a) * 210, 52 + M.sin(G.tm * 0.11) * 8, -60 + M.sin(a) * 210);
		cam.lookAt(60, 8, -40);
		return;
	}
	const f = fPt();
	const heading = !G.oF && G.vh ? G.vh.mesh.rotation.y : G.pl.mesh.rotation.y;
	const moving = G.oF ? (G.pl.speed || 0) > 0.5 : M.abs(G.vh.speed) > 1;
	if (moving && G.tm - lastDragT > 2.2) {
		const rate = G.oF ? 3.2 : zm(M.abs(G.vh.speed) * 0.14, 1.2, 4.2);
		G.yW = angLerp(G.yW, heading, zm(dt * rate, 0, 1));
	}
	const dist = G.cD, pitch = G.cP;
	const bx = M.sin(G.yW), bz = M.cos(G.yW);
	cTgP.set(
		f.x - bx * M.cos(pitch) * dist,
		(f.y || 0) + 1.7 + M.sin(pitch) * dist,
		f.z - bz * M.cos(pitch) * dist
	);
	const fixed = colC(cTgP.x, cTgP.z, 1.2);
	cTgP.x = fixed.x; cTgP.z = fixed.z;
	cTgP.y = M.max(cTgP.y, 1.1);
	cam.position.lerp(cTgP, zm(dt * 7, 0, 1));
	const lead = !G.oF && G.vh ? zm(M.abs(G.vh.speed) * 0.14, 0, 5) : 0;
	cam.lookAt(f.x + bx * lead, (f.y || 0) + 2.1, f.z + bz * lead);
}
let lastNow = performance.now(), fpsAccum = 0, fpsCount = 0, fpsStage = 0, hudAccum = 0;
function frameLoop(now) {
	requestAnimationFrame(frameLoop);
	const rawDt = (now - lastNow) / 1000;
	let dt = M.min(0.05, rawDt);
	lastNow = now;
	if (dt <= 0) dt = 0.016;
	G.tm += dt;
	if (fpsStage < 3 && rawDt < 1) {
		fpsAccum += rawDt; fpsCount++;
		if (fpsAccum > 4) {
			if (fpsAccum / fpsCount > 0.034 && G.sun && G.sun.castShadow) {
				G.sun.castShadow = false;
				G.rd.setPixelRatio(1);
			}
			fpsAccum = 0; fpsCount = 0; fpsStage++;
		}
	}
	if (G.sg) { stageTick(dt); }
	else if (G.cs) {
		updateCutscene(dt);
		updatePeds(dt);
		uTraf(dt);
	}
	else if (G.md === "play") {
		updateMissions(dt);
		if (G.oF) updatePlayerOnFoot(dt); else updatePlayerVehicle(dt);
		uTraf(dt);
		collideVehicles(dt);
		updatePolice(dt);
		updatePeds(dt);
		updateCombatFx(dt);
		checkHealth(dt);
	} else if (G.md === "title") {
		updatePeds(dt);
		uTraf(dt);
	}
	updateSmoke(dt);
	updateSkyAndWeather(dt);
	if (G.md !== "stage" && !G.cs) updateCamera(dt);
	hudTick(dt);
	if (G.md === "play" || G.md === "pause" || G.md === "map" || G.md === "missions") {
		hudAccum += dt;
		if (hudAccum > 0.08) { hudAccum = 0; uHud(); drawMinimap(); if (G.md === "map") drawBigMap(); }
	}
	sfxUpdate(dt);
	G.rd.render(G.sc, G.cm);
	if (G.sg) {
		stageFrames++;
		if (stageFrames === 100) window.__shotReady = true;
	}
}
let stageFrames = 0, stageRig = null;
function setupStage(name) {
	G.sg = name; G.md = "stage"; G.sN = true;
	el("menu-title").style.display = "none";
	el("hud").style.display = "block";
	const cam = G.cm;
	if (name === "chase") {
		G.hr = 17.7; G.we = "clear";
		const comet = fVeh("comet");
		comet.mesh.position.set(0, 0, 215); comet.mesh.rotation.set(0, M.PI, 0);
		enterVehicle(comet); comet.speed = 15;
		sW(4);
		const i1 = spV("interceptor", -2.85, 217.2, M.PI, 0x30343a, "police");
		const i2 = spV("interceptor", 5, 217.6, M.PI, 0x30343a, "police");
		i1.speed = 15; i2.speed = 15;
		G.po.push(i1, i2);
		for (const t of G.tf) {
			if (M.abs(t.mesh.position.x) < 60 && t.mesh.position.z > -460 && t.mesh.position.z < 300) {
				t.mesh.position.x = 320; t.aiTarget = null;
			}
		}
		stageRig = { cars: [comet, i1, i2], speed: 15 };
		sObj("Outrun the Interceptors — reach the safehouse", SP.sH.x, SP.sH.z);
		sMrk(SP.sH.x, SP.sH.z, 0x2ee6c8);
		cam.position.set(4.8, 1.5, 223.6);
	} else if (name === "drive") {
		G.hr = 17.9; G.we = "clear";
		const falco = fVeh("falco");
		falco.mesh.position.set(640, 0, 300); falco.mesh.rotation.set(0, M.PI, 0);
		enterVehicle(falco); falco.speed = 17;
		stageRig = { cars: [falco], speed: 17 };
		sObj("Bay Runner — checkpoint run down the coast", 640, -420);
		sMrk(640, -100, 0x2ee6c8);
		cam.position.set(632, 2.5, 312);
	} else if (name === "marina") {
		G.hr = 21.5; G.we = "rain";
		const moonBoost = new T3.DirectionalLight(0xbdd2ff, 1.15);
		moonBoost.position.set(-780, 160, 20);
		moonBoost.target.position.set(-920, 0, 78);
		G.sc.add(moonBoost); G.sc.add(moonBoost.target);
		G.sc.add(new T3.AmbientLight(0x5a6f96, 0.8));
		G.pl.mesh.position.set(-876, 0, 86);
		G.pl.mesh.rotation.y = 0.35;
		G.yW = 0.35;
		sObj("Meet Celia at the marina", SP.ce.x, SP.ce.z);
		cam.position.set(-868, 2.8, 108);
	} else if (name === "cutscene") {
		G.hr = 17.8; G.we = "clear";
		G.pl.mesh.position.set(-879, 0, 70);
		startCutscene(0, null);
		G.cs.line = 2; csShowLine();
		csApplyCamera(G.cs, 0);
		sObj("Meet Celia at the marina", SP.ce.x, SP.ce.z);
	} else if (name === "rico") {
		G.hr = 17.6; G.we = "clear";
		G.pl.mesh.position.set(-352, 0, -300);
		G.pl.mesh.rotation.y = -1.02;
		const comet = fVeh("comet");
		comet.mesh.position.set(-346, 0, -312); comet.mesh.rotation.set(0, -0.5, 0);
		const crusher = fVeh("crusher");
		crusher.mesh.position.set(-326, 0, -304); crusher.mesh.rotation.set(0, -0.5, 0);
		cam.position.set(-358.5, 1.8, -296);
	}
	uHud(); drawMinimap();
}
function stageTick(dt) {
	const cam = G.cm;
	if (stageRig) {
		for (const v of stageRig.cars) {
			v.mesh.position.z -= stageRig.speed * dt;
			const wr = stageRig.speed * dt / 0.42;
			for (const w of v.wheels) w.rotation.x -= wr;
			if (v.mesh.position.z < -430) v.mesh.position.z += 620;
		}
		const lead = stageRig.cars[0];
		if (G.sg === "chase") {
			cam.position.set(lead.mesh.position.x + 4.8, 1.5, lead.mesh.position.z + 8.6);
			cam.lookAt(lead.mesh.position.x - 2.2, 1, lead.mesh.position.z - 10);
			const flash = M.floor(G.tm * 2.4) % 2 === 0;
			for (const c of stageRig.cars.slice(1)) {
				const bar = c.mesh.userData.lightBar;
				if (bar) { bar.children[0].visible = flash; bar.children[1].visible = !flash; }
			}
			if (G.vh) seatSyncStage();
		} else if (G.sg === "drive") {
			lead.mesh.rotation.z = -0.34;
			seatB(lead);
			cam.position.set(lead.mesh.position.x - 7.5, 2.5, lead.mesh.position.z + 12.5);
			cam.lookAt(lead.mesh.position.x + 7, 1, lead.mesh.position.z - 18);
		}
	} else if (G.sg === "cutscene") {
		if (G.cs) csApplyCamera(G.cs, dt);
		aPrs(G.pl, 0, dt);
	} else if (G.sg === "marina") {
		cam.lookAt(-905, 1.5, 70);
		aPrs(G.pl, 0, dt);
	} else if (G.sg === "rico") {
		cam.lookAt(-352, 1.3, -300);
		aPrs(G.pl, 0, dt);
	}
	updatePeds(dt);
	if (G.sg === "marina" || G.sg === "rico") uTraf(dt);
	hudAccum += dt;
	if (hudAccum > 0.12) { hudAccum = 0; uHud(); drawMinimap(); }
}
function seatSyncStage() { if (G.vh) seatV(G.vh); }
window.CBS = {
	G,
	warp(x, z) {
		if (!G.oF && G.vh) { G.vh.mesh.position.set(x, 0, z); G.vh.speed = 0; }
		else G.pl.mesh.position.set(x, 0, z);
	},
	sW, setHour(h) { G.hr = h; },
	setWeather(w) { G.we = w; G.wT = 9999; },
	startJob(i) { if (!G.job) startJob(i); },
	talk() { const k = G.ji < JOBS.length ? JOBS[G.ji].giver : "celia"; const ct = G.ct[k]; G.pl.mesh.position.set(ct.spot.x + 2, 0, ct.spot.z + 2); },
	enterKind(kind) { const v = fVeh(kind); if (v) { if (!G.oF) exitVehicle(); G.pl.mesh.position.set(v.mesh.position.x + 2, 0, v.mesh.position.z); enterVehicle(v); } return !!v; },
	cash(n) { G.ca = n; uHud(); },
	state() {
		const f = fPt();
		return {
			mode: G.md, cash: G.ca, wanted: G.wn, health: M.round(G.hp),
			jobIndex: G.ji, job: G.job ? G.job.i : -1, step: G.job ? G.job.step : -1,
			hustle: G.hu ? G.hu.type : null,
			onFoot: G.oF, vehicle: G.vh ? G.vh.kind : null,
			weapon: G.wp, x: M.round(f.x), z: M.round(f.z),
			hour: G.hr, weather: G.we,
			cutscene: G.cs ? G.cs.idx + ":" + G.cs.line : null,
			playerVisible: G.pl.mesh.visible,
			playerPos: [M.round(G.pl.mesh.position.x * 10) / 10, M.round(G.pl.mesh.position.y * 10) / 10, M.round(G.pl.mesh.position.z * 10) / 10],
		};
	},
};
DC.addEventListener("DOMContentLoaded", bootGame);
