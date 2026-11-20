"use strict";
const SKIN_TONES = [0xf2c09a, 0xd99e63, 0xa96f3f, 0x7a4a28, 0xffd9b3];
const SHIRT_COLORS = [0xf26d5b, 0x3fbfae, 0xf2b13d, 0x7a5fd0, 0xe8e4da, 0x2e4053, 0xff8fab, 0x58a05c];
const PANTS_COLORS = [0x2e4053, 0xe8e4da, 0x5a4632, 0x30343a, 0x7a2e35];
function shTx(base, print) {
	const cv = CE("canvas"); cv.width = 32; cv.height = 32;
	const c = cv.getContext("2d");
	c.fillStyle = base; c.fillRect(0, 0, 32, 32);
	if (print) {
	c.fillStyle = "rgba(255,255,255,0.5)";
	for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(rng() * 32, rng() * 32, 2.2, 0, 7); c.fill(); }
	c.fillStyle = "rgba(20,120,60,0.55)";
	for (let i = 0; i < 6; i++) c.fillRect(rng() * 30, rng() * 30, 4, 2);
	}
	const t = new CT(cv);
	t.colorSpace = SC;
	return t;
}
const SHIRT_TEX = [
	shTx("#f26d5b", true), shTx("#3fbfae", true), shTx("#f2b13d", true),
	shTx("#e8e4da", false), shTx("#2e4053", false), shTx("#ff8fab", true),
];
function lam(color) { return new ML({ color }); }
const P_GEO = {
	leg: new CY(0.19, 0.14, 0.92, 8), arm: new CY(0.15, 0.11, 0.8, 8),
	torso: new CY(0.37, 0.29, 0.74, 10), head: new SG(0.28, 12, 10),
	joint: new SG(0.155, 8, 6), hair: new SG(0.295, 10, 8),
};
P_GEO.leg.translate(0, -0.46, 0); P_GEO.arm.translate(0, -0.4, 0);
function mPer(style) {
	style = style || {};
	const g = new GR();
	const inner = new GR(); g.add(inner);
	const skin = lam(style.skin !== undefined ? style.skin : pick(SKIN_TONES));
	const shirt = style.shirtTex !== undefined
	? new ML({ map: SHIRT_TEX[style.shirtTex % SHIRT_TEX.length] })
	: lam(style.shirt !== undefined ? style.shirt : pick(SHIRT_COLORS));
	const pants = lam(style.pants !== undefined ? style.pants : pick(PANTS_COLORS));
	function limb(geo, mat, x, y, z) {
	const m = new MS(geo, mat); m.position.set(x, y, z); m.castShadow = true;
	inner.add(m); return m;
	}
	function joint(mat, x, y, z) {
	const m = new MS(P_GEO.joint, mat); m.position.set(x, y, z); inner.add(m);
	}
	const ll = limb(P_GEO.leg, pants, -0.15, 0.95, 0);
	const rl = limb(P_GEO.leg, pants, 0.15, 0.95, 0);
	joint(pants, -0.15, 0.95, 0); joint(pants, 0.15, 0.95, 0);
	const torso = new MS(P_GEO.torso, shirt);
	torso.position.y = 1.33; torso.castShadow = true; inner.add(torso);
	if (style.skirt) {
	const skirt = new MS(new CN(0.55, 0.6, 8), lam(style.skirt));
	skirt.position.y = 0.98; inner.add(skirt);
	}
	const la = limb(P_GEO.arm, shirt, -0.54, 1.66, 0);
	const ra = limb(P_GEO.arm, shirt, 0.54, 1.66, 0);
	joint(shirt, -0.54, 1.66, 0); joint(shirt, 0.54, 1.66, 0);
	const head = new MS(P_GEO.head, skin);
	head.position.y = 2.02; head.scale.y = 1.12; head.castShadow = true; inner.add(head);
	const hair = new MS(P_GEO.hair, lam(style.hair || 0x2a1c10));
	hair.position.y = 2.14; hair.scale.set(1, 0.62, 1); inner.add(hair);
	if (style.hat) {
	const hatMat = lam(style.hat === "panama" ? 0xf2e3c2 : 0x3a2e22);
	const brim = new MS(new CY(style.hat === "panama" ? 0.56 : 0.48, style.hat === "panama" ? 0.56 : 0.48, 0.07, 10), hatMat);
	brim.position.y = 2.3; inner.add(brim);
	const crown = new MS(new CY(0.3, 0.34, 0.3, 10), hatMat);
	crown.position.y = 2.46; inner.add(crown);
	}
	if (style.shades) {
	const sh = new MS(new BG(0.52, 0.13, 0.08), BM(0x101418));
	sh.position.set(0, 2.04, 0.26); inner.add(sh);
	}
	if (style.chain) {
	const chain = new MS(new T3.TorusGeometry(0.17, 0.04, 6, 12),
	BM(0xffd94d));
	chain.position.set(0, 1.6, 0.3); chain.rotation.x = 0.5; inner.add(chain);
	}
	g.scale.setScalar(0.84);
	return { mesh: g, inner, la, ra, ll, rl, head, phase: rand(0, 6), hp: 3, dead: 0, downT: 0, fleeT: 0, target: null, speed: 0 };
}
function aPrs(p, speed, dt) {
	p.phase += dt * (3 + speed * 2.1);
	const sw = M.sin(p.phase) * zm(speed / 3.4, 0, 1) * 0.62;
	p.la.rotation.x = sw; p.ra.rotation.x = -sw;
	p.ll.rotation.x = -sw; p.rl.rotation.x = sw;
	p.inner.position.y = M.abs(M.sin(p.phase)) * 0.05 * zm(speed / 3, 0, 1);
	if (p.attackT > 0) { p.attackT -= dt; p.ra.rotation.x = -2 + (0.18 - p.attackT) * 6; }
}
function tSpr(text, color) {
	const cv = CE("canvas"); cv.width = 256; cv.height = 56;
	const c = cv.getContext("2d");
	c.font = "bold 34px Trebuchet MS, sans-serif"; c.textAlign = "center";
	c.lineWidth = 7; c.strokeStyle = "rgba(10,20,30,0.85)";
	c.strokeText(text, 128, 40); c.fillStyle = color || "#ffd94d"; c.fillText(text, 128, 40);
	const t = new CT(cv); t.colorSpace = SC;
	const s = new T3.Sprite(new T3.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
	s.scale.set(7.5, 1.65, 1);
	return s;
}
function bCst(scene) {
	const rico = mPer({ skin: 0xd99e63, shirtTex: 0, pants: 0xe8e4da, hat: "fedora", shades: true, chain: true, hair: 0x1c1410 });
	rico.mesh.position.set(SP.sH.x, 0, SP.sH.z);
	scene.add(rico.mesh);
	G.pl = rico; rico.heading = M.PI; rico.vy = 0; rico.y = 0; rico.attackT = 0;
	const gunDark = lam(0x1c1f24), gunGrip = lam(0x4a3423);
	function mGun(parts) {
	const g = new GR();
	for (const p of parts) {
	const m = new MS(p[0], p[5] ? gunGrip : gunDark);
	m.position.set(p[1], p[2], p[3]);
	if (p[4]) m.rotation.x = p[4];
	m.castShadow = true;
	g.add(m);
	}
	return g;
	}
	const gP = mGun([
	[new BG(0.07, 0.09, 0.44), 0, 0.05, 0.17],
	[new BG(0.06, 0.08, 0.24), 0, -0.03, 0.08],
	[new BG(0.028, 0.07, 0.13), 0, -0.07, 0.15],
	[new BG(0.065, 0.21, 0.1), 0, -0.15, -0.03, 0.28, 1],
	[new BG(0.05, 0.035, 0.05), 0, 0.11, -0.05],
	[new BG(0.03, 0.03, 0.03), 0, 0.105, 0.36],
	]);
	const gS = mGun([
	[new BG(0.085, 0.12, 0.55), 0, 0.03, 0.16],
	[new CY(0.032, 0.032, 0.34, 8), 0, 0.06, 0.58, M.PI / 2],
	[new BG(0.05, 0.07, 0.14), 0, 0, 0.44],
	[new BG(0.06, 0.25, 0.09), 0, -0.17, 0.12, 0.12, 1],
	[new BG(0.065, 0.2, 0.09), 0, -0.14, -0.1, 0.3, 1],
	[new BG(0.06, 0.09, 0.27), 0, 0.03, -0.3],
	[new BG(0.04, 0.05, 0.18), 0, 0.115, 0.18],
	]);
	const gunMesh = new GR();
	gunMesh.add(gP); gunMesh.add(gS);
	gunMesh.position.set(0, -0.82, 0.05); gunMesh.visible = false; rico.ra.add(gunMesh); G.gU = gunMesh;
	const plate = tSpr("Rico Solano", "#ffe9a3");
	plate.position.set(0, 3.35, 0); plate.scale.set(6.4, 1.4, 1);
	rico.mesh.add(plate); rico.nP = plate;
	function contact(key, style, spot, name) {
	const p = mPer(style); p.story = 1;
	p.mesh.position.set(spot.x, 0, spot.z);
	p.mesh.rotation.y = rand(0, 6.28);
	scene.add(p.mesh);
	const label = tSpr(name, "#ffffff");
	label.position.set(spot.x, 3.1, spot.z); scene.add(label);
	const beacon = beam(1.1, 34, 0xffd94d, 0.3);
	beacon.position.set(spot.x, 17, spot.z); scene.add(beacon);
	const ring = ringM(1.5, 2, 0xffd94d, 0.8);
	ring.position.set(spot.x, 0.15, spot.z); scene.add(ring);
	G.ct = G.ct || {};
	G.ct[key] = { person: p, beacon, ring, spot, name, label };
	return p;
	}
	contact("celia", { skin: 0xf2c09a, shirtTex: 5, skirt: 0xc93a2e, hair: 0x4a2a12 }, SP.ce, "Celia");
	contact("marco", { skin: 0xa96f3f, shirt: 0x2e4053, pants: 0x30343a, hat: "fedora", shades: true, chain: true }, SP.ma, "Marco");
	contact("don", { skin: 0xffd9b3, shirtTex: 3, pants: 0xe8e4da, hat: "panama", shades: true, chain: true }, SP.dn, "Don Falso");
	for (let i = 0; i < 32; i++) {
	const p = mPer({
	hat: rng() > 0.55 ? pick(["fedora", "panama"]) : null,
	shades: rng() > 0.6, chain: rng() > 0.8,
	skirt: rng() > 0.72 ? pick(SHIRT_COLORS) : null,
	});
	p.mesh.scale.setScalar(0.84 * (0.9 + (i % 9) * 0.0275));
	const s = sPt();
	p.mesh.position.set(s.x, 0, s.z);
	p.target = sPt();
	p.walkSpeed = rand(1.8, 3.1);
	scene.add(p.mesh); G.pd.push(p);
	}
	bDog(scene); bGul(scene); bPk(scene);
}
function sPt() {
	const r = rng();
	if (r < 0.16) return { x: rand(688, 812), z: rand(-800, 800) };
	if (r < 0.32) return { x: rand(-836, -596), z: rand(-344, 344) };
	const road = pick(RL), side = rng() > 0.5 ? 20.5 : -20.5, along = rand(-800, 800);
	return rng() > 0.5 ? { x: road + side, z: along } : { x: along, z: road + side };
}
function pnc(x, z, r) {
	for (const p of G.pd) {
	if (p.dead > 0) continue;
	if (d3(p.mesh.position.x, p.mesh.position.z, x, z) < r) {
	p.fleeT = M.max(p.fleeT, rand(1.6, 3)); p.fleeX = x; p.fleeZ = z;
	}
	}
	for (const k in G.ct) {
	const ct = G.ct[k];
	if (d3(ct.person.mesh.position.x, ct.person.mesh.position.z, x, z) < r) ct.duckT = 2.6;
	}
}
function bDog(scene) {
	G.dg = [];
	const spots = [{ x: 700, z: -300 }, { x: -700, z: 100 }, { x: 700, z: 420 }, { x: -620, z: -420 }];
	for (const s of spots) {
	const d = new GR();
	const mat = lam(pick([0xb08954, 0x6e4f30, 0xd8d3c3, 0x404040]));
	const body = new MS(new BG(0.95, 0.48, 0.42), mat); body.position.y = 0.52; d.add(body);
	const head = new MS(new BG(0.4, 0.36, 0.36), mat); head.position.set(0.62, 0.72, 0); d.add(head);
	const tail = new MS(new BG(0.4, 0.1, 0.1), mat); tail.position.set(-0.6, 0.78, 0); tail.rotation.z = 0.7; d.add(tail);
	d.position.set(s.x, 0, s.z);
	scene.add(d);
	G.dg.push({ mesh: d, target: { x: s.x + rand(-60, 60), z: s.z + rand(-60, 60) }, pauseT: rand(0, 3), phase: rand(0, 6) });
	}
}
function bGul(scene) {
	G.gu = [];
	for (let i = 0; i < 9; i++) {
	const g = new GR();
	const mat = lam(0xf4f6f8);
	const body = new MS(new BG(0.9, 0.28, 0.34), mat); g.add(body);
	const wlGeo = new BG(0.5, 0.06, 1.5); wlGeo.translate(0, 0, -0.78);
	const wrGeo = new BG(0.5, 0.06, 1.5); wrGeo.translate(0, 0, 0.78);
	const wl = new MS(wlGeo, mat); g.add(wl);
	const wr = new MS(wrGeo, mat); g.add(wr);
	g.userData = { wl, wr };
	scene.add(g);
	G.gu.push({ mesh: g, cx: -880 + rand(-50, 50), cz: rand(-260, 260), r: rand(35, 95), h: rand(22, 44), a: rand(0, 6.28), sp: rand(0.25, 0.5) * (rng() > 0.5 ? 1 : -1) });
	}
}
function bPk(scene) {
	const defs = [
	{ kind: "bat", x: -148, z: 52, color: 0xb08954 },
	{ kind: "pipe", x: 300, z: 296, color: 0x9aa0a3 },
	{ kind: "pistol", x: 88, z: 330, color: 0x30343a },
	{ kind: "smg", x: 424, z: 452, color: 0x23272e },
	{ kind: "pistol", x: -448, z: -330, color: 0x30343a },
	];
	for (const d of defs) {
	const grp = new GR();
	const item = new MS(new BG(d.kind === "pistol" ? 0.7 : d.kind === "smg" ? 0.95 : 1.1, 0.22, 0.22), lam(d.color));
	item.position.y = 1.1; grp.add(item);
	const glow = gDsc(0x2ee6c8, 0.9);
	glow.position.y = 0.1; grp.add(glow);
	grp.position.set(d.x, 0, d.z);
	scene.add(grp);
	G.pk.push({ kind: d.kind, grp, x: d.x, z: d.z, taken: false, respawnT: 0 });
	}
}
function uPds(dt) {
	const pp = G.pl.mesh.position;
	for (const p of G.pd) {
	if (p.dead > 0) {
	p.dead -= dt;
	const op = zm(p.dead / 2, 0, 1);
	p.mesh.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = op; } });
	if (p.dead <= 0) {
	const s = sPt(); p.mesh.position.set(s.x, 0, s.z); p.mesh.rotation.x = 0; p.hp = 3; p.downT = 0;
	p.mesh.traverse((o) => { if (o.material) o.material.opacity = 1; });
	}
	continue;
	}
	if (p.downT > 0) {
	p.downT -= dt;
	if (p.downT <= 0) { p.mesh.rotation.x = 0; p.mesh.position.y = 0; }
	continue;
	}
	let tx = p.target.x, tz = p.target.z, sp = p.walkSpeed;
	if (!G.oF && G.vh && M.abs(G.vh.speed) > 6) {
	const vp = G.vh.mesh.position;
	if (d3(p.mesh.position.x, p.mesh.position.z, vp.x, vp.z) < 11) {
	p.fleeT = M.max(p.fleeT, 0.7); p.fleeX = vp.x; p.fleeZ = vp.z;
	}
	}
	if (p.fleeT > 0) {
	p.fleeT -= dt; sp = 6.4;
	const sx = p.fleeX !== undefined ? p.fleeX : pp.x, sz = p.fleeZ !== undefined ? p.fleeZ : pp.z;
	tx = p.mesh.position.x + (p.mesh.position.x - sx);
	tz = p.mesh.position.z + (p.mesh.position.z - sz);
	} else if (d3(p.mesh.position.x, p.mesh.position.z, tx, tz) < 2.5) {
	p.target = sPt(); continue;
	}
	mvP(p, tx, tz, sp, dt);
	}
	for (const key of ["celia", "marco", "don"]) {
	const ct = G.ct[key], cp = ct.person, mp = cp.mesh.position;
	cp.phase += dt * 1.4;
	if (ct.duckT > 0) {
	ct.duckT -= dt;
	mvP(cp, mp.x + (mp.x - pp.x) * 2, mp.z + (mp.z - pp.z) * 2, 2.6, dt);
	cp.inner.position.y = -0.5;
	} else if (d3(mp.x, mp.z, ct.spot.x, ct.spot.z) > 0.6) {
	mvP(cp, ct.spot.x, ct.spot.z, 2.4, dt);
	} else cp.inner.position.y = M.sin(cp.phase) * 0.02;
	ct.ring.rotation.z += dt * 0.8;
	const vis = cHJ(key) && !G.cs;
	ct.beacon.visible = vis; ct.ring.visible = vis;
	ct.label.visible = !G.cs && d3(pp.x, pp.z, ct.spot.x, ct.spot.z) < 25;
	}
	for (const d of G.dg) {
	if (d.pauseT > 0) { d.pauseT -= dt; continue; }
	const m = d.mesh, dx = d.target.x - m.position.x, dz = d.target.z - m.position.z;
	const dd = M.sqrt(dx * dx + dz * dz);
	if (dd < 3) { d.target = { x: zm(m.position.x + rand(-90, 90), -840, 840), z: zm(m.position.z + rand(-90, 90), -840, 840) }; d.pauseT = rand(1, 4); continue; }
	const a = M.atan2(dx, dz);
	m.rotation.y = aLp(m.rotation.y, a, dt * 6);
	m.position.x += M.sin(m.rotation.y) * 4.2 * dt;
	m.position.z += M.cos(m.rotation.y) * 4.2 * dt;
	d.phase += dt * 9; m.position.y = M.abs(M.sin(d.phase)) * 0.09;
	}
	for (const g of G.gu) {
	g.a += g.sp * dt;
	const x = g.cx + M.cos(g.a) * g.r, z = g.cz + M.sin(g.a) * g.r;
	g.mesh.position.set(x, g.h + M.sin(G.tm * 0.8 + g.r) * 2, z);
	g.mesh.rotation.y = -g.a - (g.sp > 0 ? 0 : M.PI);
	const flap = M.sin(G.tm * 7 + g.r) * 0.55;
	g.mesh.userData.wl.rotation.x = flap; g.mesh.userData.wr.rotation.x = -flap;
	}
	for (const pk of G.pk) {
	if (pk.taken) {
	pk.respawnT -= dt;
	if (pk.respawnT <= 0) { pk.taken = false; pk.grp.visible = true; }
	continue;
	}
	pk.grp.rotation.y += dt * 1.6;
	if (G.oF && d3(pp.x, pp.z, pk.x, pk.z) < 2.1) {
	pk.taken = true; pk.grp.visible = false; pk.respawnT = 30;
	if (isGun(pk.kind)) {
	const ak = pk.kind === "pistol" ? "ammoP" : "ammoS", amt = pk.kind === "pistol" ? 24 : 60;
	G[ak] += amt;
	if (!G.gn[pk.kind]) {
	G.gn[pk.kind] = true; G.wp = pk.kind;
	sToa(pk.kind === "pistol" ? "Picked up a PISTOL (" + amt + " rounds) — click to fire, Q holsters" : "Picked up an SMG (" + amt + " rounds) — hold click to fire, Q holsters");
	} else sToa((pk.kind === "pistol" ? "Pistol" : "SMG") + " ammo +" + amt + " (" + G[ak] + ")");
	} else {
	G.wp = pk.kind;
	sToa("Picked up a " + pk.kind + " — F or click to swing");
	}
	sfxPickup(); sV(); uHud();
	}
	}
}
function mvP(p, tx, tz, sp, dt) {
	const m = p.mesh, dx = tx - m.position.x, dz = tz - m.position.z;
	const dd = M.sqrt(dx * dx + dz * dz);
	if (dd < 0.1) { aPrs(p, 0, dt); return; }
	const a = M.atan2(dx, dz);
	m.rotation.y = aLp(m.rotation.y, a, dt * 8);
	let nx = m.position.x + M.sin(m.rotation.y) * sp * dt;
	let nz = m.position.z + M.cos(m.rotation.y) * sp * dt;
	const fixed = colC(nx, nz, 0.55);
	nx = fixed.x; nz = fixed.z;
	if (!isLand(nx, nz)) { nx = m.position.x; nz = m.position.z; }
	m.position.x = nx; m.position.z = nz;
	p.speed = sp; aPrs(p, sp, dt);
}
function uPF(dt) {
	const p = G.pl, m = p.mesh;
	const camA = G.yW;
	let ix = 0, iz = 0;
	if (key("KeyW") || key("ArrowUp")) iz -= 1;
	if (key("KeyS") || key("ArrowDown")) iz += 1;
	if (key("KeyA") || key("ArrowLeft")) ix -= 1;
	if (key("KeyD") || key("ArrowRight")) ix += 1;
	const moving = (ix !== 0 || iz !== 0);
	const run = key("ShiftLeft") || key("ShiftRight");
	const sp = run ? 10.6 : 6.2;
	if (moving) {
	const a = M.atan2(ix, iz) + camA + M.PI;
	m.rotation.y = aLp(m.rotation.y, a, dt * 11);
	let nx = m.position.x + M.sin(m.rotation.y) * sp * dt;
	let nz = m.position.z + M.cos(m.rotation.y) * sp * dt;
	const fixed = colC(nx, nz, 0.55);
	nx = fixed.x; nz = fixed.z;
	if (isLand(nx, nz) || isLand(m.position.x, m.position.z) === false) { m.position.x = nx; m.position.z = nz; }
	aPrs(p, sp, dt);
	p.speed = sp;
	} else { p.speed = 0; aPrs(p, 0, dt); if (isGun(G.wp)) m.rotation.y = aLp(m.rotation.y, camA, dt * 11); }
	if (key("Space") && p.y <= 0) { p.vy = 7.4; }
	if (p.y > 0 || p.vy > 0) {
	p.vy -= 22 * dt; p.y += p.vy * dt;
	if (p.y <= 0) { p.y = 0; p.vy = 0; }
	}
	m.position.y = p.y;
	const near = nVeh(m.position.x, m.position.z, 4.2);
	if (near && near.alive) {
	sInt("E — Take the " + near.name);
	if (key("KeyE")) { G.ky["KeyE"] = false; eVeh(near); }
	} else if (G.gP) sInt(G.gP);
	else sInt(null);
	if (key("Digit1")) { G.ky["Digit1"] = false; if (G.gn.pistol && G.wp !== "pistol") { G.wp = "pistol"; sfxClick(); uHud(); } }
	if (key("Digit2")) { G.ky["Digit2"] = false; if (G.gn.smg && G.wp !== "smg") { G.wp = "smg"; sfxClick(); uHud(); } }
	if (key("Digit0") || key("KeyQ")) { G.ky["Digit0"] = false; G.ky["KeyQ"] = false; if (isGun(G.wp)) { G.wp = "fists"; sfxClick(); uHud(); } }
	if (key("KeyF")) { G.ky["KeyF"] = false; pAtk(); }
}
function isGun(w) { return w === "pistol" || w === "smg"; }
let gunCd = 0, lastCrimeT = -9, flashMesh = null, flashT = 0;
function sFl(x, z, fx, fz) {
	if (!flashMesh) { flashMesh = new MS(new SG(0.16, 6, 5), BM(0xffd94d)); G.sc.add(flashMesh); }
	flashMesh.position.set(x + fx * 0.8, 1.55, z + fz * 0.8);
	flashMesh.visible = true; flashT = 0.045;
}
function fGun() {
	const p = G.pl, m = p.mesh;
	if (gunCd > 0 || G.cs) return;
	const smg = G.wp === "smg", ak = smg ? "ammoS" : "ammoP";
	if (G[ak] <= 0) { gunCd = 0.3; sToa("Out of ammo — grab a glowing ammo pickup"); return; }
	G[ak]--; gunCd = smg ? 0.11 : 0.26; p.attackT = 0.18;
	sfxShot(smg ? "smg" : "pistol");
	const fx = M.sin(m.rotation.y), fz = M.cos(m.rotation.y), range = smg ? 42 : 34, cone = smg ? 0.9 : 0.93;
	let best = null, bestD = range;
	for (const q of G.pd) {
	if (q.dead > 0) continue;
	const dx = q.mesh.position.x - m.position.x, dz = q.mesh.position.z - m.position.z;
	const d = M.sqrt(dx * dx + dz * dz);
	if (d < bestD && (dx * fx + dz * fz) / M.max(1, d) > cone) { best = q; bestD = d; }
	}
	let sHit = null;
	for (const k in G.ct) {
	const cp = G.ct[k].person, dx = cp.mesh.position.x - m.position.x, dz = cp.mesh.position.z - m.position.z;
	const d = M.sqrt(dx * dx + dz * dz);
	if (d < bestD && (dx * fx + dz * fz) / M.max(1, d) > cone) { sHit = G.ct[k]; bestD = d; }
	}
	if (sHit) best = null;
	let hitD = (best || sHit) ? bestD : range, copHit = false, witness = false;
	for (const c of G.po) {
	const dx = c.mesh.position.x - m.position.x, dz = c.mesh.position.z - m.position.z;
	const d = M.sqrt(dx * dx + dz * dz);
	if (d < 100) witness = true;
	if (d < range + 2 && (dx * fx + dz * fz) / M.max(1, d) > 0.9) { copHit = true; if (d < hitD) hitD = d; }
	}
	sTrc(m.position.x, m.position.z, fx, fz, hitD);
	sFl(m.position.x, m.position.z, fx, fz);
	pnc(m.position.x, m.position.z, 26);
	if (best) hPed(best, smg ? 1 : 2, true);
	if (sHit) sHit.duckT = 2.6;
	if ((best || sHit || copHit || witness) && G.tm - lastCrimeT > 1.1) { lastCrimeT = G.tm; sW(M.min(5, G.wn + 1)); G.wC = 0; }
	uHud();
}
function pAtk() {
	const p = G.pl;
	if (G.md !== "play" || !G.oF || G.cs) return;
	if (isGun(G.wp)) { fGun(); return; }
	p.attackT = 0.18;
	const m = p.mesh, fx = M.sin(m.rotation.y), fz = M.cos(m.rotation.y);
	sfxPunch();
	for (const q of G.pd) {
	if (q.dead > 0) continue;
	const dx = q.mesh.position.x - m.position.x, dz = q.mesh.position.z - m.position.z;
	if (dx * dx + dz * dz < 5.3 && dx * fx + dz * fz > 0) { hPed(q, G.wp === "fists" ? 1 : 2); break; }
	}
}
function hPed(q, dmg, gun) {
	if (q.story) { q.fleeT = 3; q.fleeX = G.pl.mesh.position.x; q.fleeZ = G.pl.mesh.position.z; return; }
	q.hp -= dmg; q.fleeT = 3; q.fleeX = G.pl.mesh.position.x; q.fleeZ = G.pl.mesh.position.z;
	pnc(q.mesh.position.x, q.mesh.position.z, 12);
	if (q.hp <= 0 && q.dead <= 0) {
	q.dead = 5; q.mesh.rotation.x = -M.PI / 2; q.mesh.position.y = 0.3;
	if (!gun) addCrime(1);
	sToa("You flattened a pedestrian!");
	}
}
function knockPed(q, dmg, byPlayer) {
	if (q.story || q.dead > 0) return;
	q.hp -= dmg;
	pnc(q.mesh.position.x, q.mesh.position.z, 10);
	q.mesh.rotation.x = -M.PI / 2; q.mesh.position.y = 0.3;
	if (q.hp <= 0) {
	q.dead = 5;
	if (byPlayer) { addCrime(1); sToa("You flattened a pedestrian!"); }
	} else {
	q.downT = 2.4; q.fleeT = 3; q.fleeX = G.pl.mesh.position.x; q.fleeZ = G.pl.mesh.position.z;
	}
}
let trcM = null, tracerT = 0;
function sTrc(x, z, fx, fz, len) {
	if (!trcM) {
	trcM = new MS(new BG(0.06, 0.06, 1), BM(0xffe9a3));
	G.sc.add(trcM);
	}
	trcM.position.set(x + fx * len / 2, 1.6, z + fz * len / 2);
	trcM.scale.z = len;
	trcM.rotation.y = M.atan2(fx, fz);
	trcM.visible = true; tracerT = 0.06;
}
function uCFx(dt) {
	if (tracerT > 0) { tracerT -= dt; if (tracerT <= 0 && trcM) trcM.visible = false; }
	if (flashT > 0) { flashT -= dt; if (flashT <= 0 && flashMesh) flashMesh.visible = false; }
	if (gunCd > 0) gunCd -= dt;
	if (mouseDown && mouseMoved < 6 && G.wp === "smg" && G.md === "play" && G.oF && !G.cs) fGun();
}
