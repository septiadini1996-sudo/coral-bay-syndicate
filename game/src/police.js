
"use strict";

function setWanted(n) {
	n = clamp(M.round(n), 0, 5);
	if (n === G.wanted) { uHud(); return; }
	G.wanted = n; G.wantedCalm = 0;
	if (n > 0) sToa("Wanted level " + n + " — the CBPD is rolling");
	uHud();
}
function addCrime(n) {
	if (G.mode !== "play" && !G.stage) return;
	if (n <= 0) { if (G.wanted === 0) setWanted(1); G.wantedCalm = 0; return; }
	setWanted(M.min(5, G.wanted + n));
	G.wantedCalm = 0;
}

function rmVeh(v) {
	G.scene.remove(v.mesh);
	for (const arr of [G.vehicles, G.traffic, G.police]) {
		const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1);
	}
	if (G.vehicle === v) { G.vehicle = null; G.onFoot = true; G.player.mesh.visible = true; }
}

function spawnInterceptor(nearX, nearZ) {
	const a = rand(0, M.PI * 2), d = rand(105, 150);
	let x = clamp(nearX + M.cos(a) * d, -820, 820), z = clamp(nearZ + M.sin(a) * d, -820, 820);
	x = M.round(x / 160) * 160; 
	const v = spV("interceptor", x, z, rand(0, 6.28), 0x30343a, "police");
	G.police.push(v);
	return v;
}

let rbState = { cars: [], cooldown: 3, active: false };
function updateRoadblocks(dt) {
	rbState.cooldown -= dt;
	if (rbState.active) {
		rbState.t -= dt;
		const pp = fPt();
		const dBlock = dist2d(pp.x, pp.z, rbState.x, rbState.z);
		const past = rbState.cars.length && (dBlock < 14 || dBlock > 280);
		if (rbState.t <= 0 || past) {
			for (const c of rbState.cars) rmVeh(c);
			rbState.cars = []; rbState.active = false; rbState.cooldown = 22;
		}
		return;
	}
	if (G.wanted < 3 || G.onFoot || !G.vehicle || M.abs(G.vehicle.speed) < 11 || rbState.cooldown > 0) return;
	const m = G.vehicle.mesh;
	const fx = M.sin(m.rotation.y), fz = M.cos(m.rotation.y);
	let bx = m.position.x + fx * 100, bz = m.position.z + fz * 100;
	
	if (M.abs(fx) > M.abs(fz)) bz = M.round(bz / 160) * 160; else bx = M.round(bx / 160) * 160;
	bx = clamp(bx, -700, 700); bz = clamp(bz, -700, 700);
	const across = M.atan2(fx, fz) + M.PI / 2;
	for (const off of [-4.5, 4.5]) {
		const c = spV("interceptor", bx + M.sin(across) * off, bz + M.cos(across) * off, across, 0x30343a, "roadblock");
		c.roadblock = true;
		rbState.cars.push(c);
	}
	rbState.x = bx; rbState.z = bz; rbState.t = 30; rbState.active = true;
	sToa("Roadblock ahead!");
}

function fPt() {
	if (!G.onFoot && G.vehicle) return G.vehicle.mesh.position;
	return G.player.mesh.position;
}

let pHeli = null, hLit = null, heliCone = null;
function ensurePoliceHeli() {
	if (pHeli || G.stageNoHeli) return;
	const pp = fPt();
	pHeli = spV("heli", pp.x + 60, pp.z + 60, 0, 0x30343a, "police");
	pHeli.alt = 44; pHeli.mesh.position.y = 44;
	hLit = new T3.SpotLight(0xfff2cc, 900, 190, 0.36, 0.45, 1.4);
	G.scene.add(hLit); G.scene.add(hLit.target);
	const coneGeo = new T3.ConeGeometry(13, 46, 18, 1, true);
	coneGeo.translate(0, -23, 0);
	heliCone = new T3.Mesh(coneGeo, new T3.MeshBasicMaterial({
		color: 0xfff2cc, transparent: true, opacity: 0.14, side: T3.DoubleSide, depthWrite: false,
	}));
	G.scene.add(heliCone);
}
function dropPoliceHeli() {
	if (!pHeli) return;
	rmVeh(pHeli); pHeli = null;
	if (hLit) { G.scene.remove(hLit); G.scene.remove(hLit.target); hLit = null; }
	if (heliCone) { G.scene.remove(heliCone); heliCone = null; }
}
function updatePoliceHeli(dt) {
	if (G.wanted >= 4) ensurePoliceHeli(); else if (pHeli && G.wanted === 0) dropPoliceHeli();
	if (!pHeli) return;
	const pp = fPt();
	const m = pHeli.mesh;
	pHeli.rotorSpin += dt * 30;
	if (m.userData.rotor) m.userData.rotor.rotation.y = pHeli.rotorSpin * 3;
	const tx = pp.x + M.sin(G.time * 0.4) * 16, tz = pp.z + M.cos(G.time * 0.33) * 16;
	m.position.x = lerp(m.position.x, tx, clamp(dt * 1.6, 0, 1));
	m.position.z = lerp(m.position.z, tz, clamp(dt * 1.6, 0, 1));
	m.position.y = lerp(m.position.y, 44, dt);
	m.rotation.y = M.atan2(pp.x - m.position.x, pp.z - m.position.z);
	hLit.position.set(m.position.x, m.position.y - 1, m.position.z);
	hLit.target.position.set(pp.x, 0, pp.z);
	heliCone.position.set(m.position.x, m.position.y - 1, m.position.z);
}

function updatePolice(dt) {
	const pp = fPt();
	
	G.wantedCalm += dt;
	if (G.wanted > 0 && G.wanted <= 2 && G.wantedCalm > 30) setWanted(G.wanted - 1);
	const wantedCount = [0, 1, 2, 3, 4, 5][G.wanted];
	if (G.mode === "play") {
		while (G.police.length < wantedCount) spawnInterceptor(pp.x, pp.z);
		while (G.police.length > wantedCount) rmVeh(G.police[G.police.length - 1]);
	}
	const flash = M.floor(G.time * 2.4) % 2 === 0;
	for (const c of G.police) {
		if (!c.alive) continue;
		const bar = c.mesh.userData.lightBar;
		if (bar) { bar.children[0].visible = flash; bar.children[1].visible = !flash; }
		const m = c.mesh;
		const d = dist2d(m.position.x, m.position.z, pp.x, pp.z);
		if (d > 640) { 
			const a = rand(0, M.PI * 2);
			m.position.set(clamp(pp.x + M.cos(a) * 130, -820, 820), 0, clamp(pp.z + M.sin(a) * 130, -820, 820));
			continue;
		}
		const targetSpeed = G.onFoot ? 15 : 47;
		const dx = pp.x - m.position.x, dz = pp.z - m.position.z;
		const want = M.atan2(dx, dz);
		const diff = angWrap(want - m.rotation.y);
		const input = {
			up: d > 6 && M.abs(diff) < 1.25, down: d < 5 && M.abs(v_angDiff(m, pp)) > 2.4,
			left: diff > 0.05, right: diff < -0.05, brake: d < 7 && G.onFoot,
		};
		if (M.abs(c.speed) > targetSpeed) input.up = false;
		driveVehicle(c, dt, input);
		
		if (G.onFoot && d < 2.4 && M.abs(c.speed) > 5) {
			G.health -= 11; G.player.mesh.position.x += M.sin(m.rotation.y) * 3;
			G.player.mesh.position.z += M.cos(m.rotation.y) * 3;
			showHurt(); sfxCrash(8);
		}
	}
	updateRoadblocks(dt);
	updatePoliceHeli(dt);
	updateBusted(dt);
}
function v_angDiff(m, pp) { return angWrap(M.atan2(pp.x - m.position.x, pp.z - m.position.z) - m.rotation.y); }

function updateBusted(dt) {
	if (G.mode !== "play" || G.wanted === 0) { G.bustMeter = M.max(0, G.bustMeter - dt * 0.5); setBustUI(G.bustMeter); return; }
	const pp = fPt();
	let near = false;
	for (const c of G.police) {
		if (dist2d(c.mesh.position.x, c.mesh.position.z, pp.x, pp.z) < 8.5) { near = true; break; }
	}
	const slow = G.onFoot ? (G.player.speed || 0) < 2.2 : M.abs(G.vehicle.speed) < 1.6;
	if (near && slow) G.bustMeter += dt / 2.8;
	else G.bustMeter = M.max(0, G.bustMeter - dt * 0.35);
	setBustUI(G.bustMeter);
	if (G.bustMeter >= 1) doBusted();
}

function clearPolice() {
	while (G.police.length) rmVeh(G.police[0]);
	for (const c of rbState.cars) rmVeh(c);
	rbState.cars = []; rbState.active = false;
	dropPoliceHeli();
}
function rspH() {
	if (G.vehicle) { G.vehicle.driver = null; G.vehicle = null; }
	G.onFoot = true; poseS(false);
	G.player.mesh.visible = true;
	G.player.mesh.position.set(SPOTS.safehouse.x, 0, SPOTS.safehouse.z);
	G.player.y = 0; G.player.vy = 0;
	G.health = 100; G.bustMeter = 0;
	clearPolice(); setWanted(0);
}
function doBusted() {
	G.bustMeter = 0;
	const fine = M.min(G.cash, M.max(50, M.round(G.cash * 0.12)));
	G.cash -= fine;
	rspH();
	sfxSting("bad");
	showCard("BUSTED", "The CBPD cuffed Rico and relieved him of " + fmtCash(fine) + ". He walks out of the station at dawn, back at the safehouse.", "Keep rolling");
	saveGame(); uHud();
}
function doWasted() {
	const fine = M.min(G.cash, M.max(40, M.round(G.cash * 0.1)));
	G.cash -= fine;
	rspH();
	sfxSting("bad");
	showCard("WASTED", "Rico wakes up outside Coral Bay General, " + fmtCash(fine) + " lighter. The bay keeps turning.", "Keep rolling");
	saveGame(); uHud();
}
function checkHealth(dt) {
	if (G.health <= 0 && G.mode === "play") { G.health = 0; doWasted(); return; }
	if (G.health < 100 && G.mode === "play") { G.health = M.min(100, G.health + dt * 1.1); uHud(); }
}
