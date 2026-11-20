"use strict";
const T3 = THREE;
const M = Math;
const DC = document;
const BG=T3.BoxGeometry,CY=T3.CylinderGeometry,ML=T3.MeshLambertMaterial,MS=T3.Mesh,CT=T3.CanvasTexture,BF=T3.BufferGeometry,CN=T3.ConeGeometry,SG=T3.SphereGeometry,PG=T3.PlaneGeometry,BA=T3.BufferAttribute,SC=T3.SRGBColorSpace,PM=T3.PointsMaterial,GR=T3.Group,PS=T3.Points,DS=T3.DoubleSide,MB=T3.MeshBasicMaterial;
function m3(seed) {
	let a = seed >>> 0;
	return function () {
		a |= 0; a = (a + 0x6D2B79F5) | 0;
		let t = M.imul(a ^ (a >>> 15), 1 | a);
		t = (t + M.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
let rng = m3(20261119);
function rand(a, b) { return a + rng() * (b - a); }
function randi(a, b) { return M.floor(rand(a, b + 1)); }
function pick(arr) { return arr[M.floor(rng() * arr.length) % arr.length]; }
function zm(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function d3(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return M.sqrt(dx * dx + dz * dz); }
function angWrap(a) { while (a > M.PI) a -= M.PI * 2; while (a < -M.PI) a += M.PI * 2; return a; }
function angLerp(a, b, t) { return a + angWrap(b - a) * zm(t, 0, 1); }
function el(id) { return DC.getElementById(id); }
function CE(t) { return DC.createElement(t); }
function key(c) { return !!G.ky[c]; }
function BM(c, o) { return new MB(Object.assign({ color: c }, o || {})); }
function glowDisc(color, r, op) {
	return new MS(new CY(r, r, 0.14, 14),
		BM(color, { transparent: true, opacity: op === undefined ? 0.55 : op }));
}
function beam(r, h, color, op) {
	const m = new MS(new CY(r, r, h, 12, 1, true),
		BM(color, { transparent: true, opacity: op, side: DS, depthWrite: false }));
	m.position.y = h / 2;
	return m;
}
function ringM(r0, r1, color, op) {
	const m = new MS(new T3.RingGeometry(r0, r1, 24),
		BM(color, { transparent: true, opacity: op, side: DS }));
	m.rotation.x = -M.PI / 2;
	return m;
}
function fmtCash(n) { return "$" + M.round(n).toLocaleString("en-US"); }
const G = {
	md: "boot",
	sc: null, cm: null, rd: null,
	ky: {},
	tm: 0,
	hr: 16.6,
	we: "clear",
	wT: 40,
	ca: 250, hp: 100, wn: 0, wC: 0,
	wp: "fists", gn: { pistol: false, smg: false }, ammoP: 0, ammoS: 0,
	pl: null,
	oF: true, vh: null,
	vs: [], pd: [], dg: [], gu: [], po: [], tf: [],
	co: [],
	pk: [],
	jD: 0, ji: 0, job: null,
	bM: 0, dead: false,
	yW: 0, cP: 0.32, cD: 9,
	rO: false, rS: 0, mu: false,
	sg: null, sN: false,
	gC: null, cS: 1700,
	objectiveMarker: null, oP: null,
	tk: null,
	rB: 0,
};
const SAVE_KEY = "coral-bay-syndicate-save-v1";
function loadSave() {
	try {
		const raw = localStorage.getItem(SAVE_KEY);
		if (!raw) return null;
		const s = JSON.parse(raw);
		if (typeof s.cash !== "number" || typeof s.jobIndex !== "number") return null;
		return s;
	} catch (e) { return null; }
}
function sV() {
	try {
		localStorage.setItem(SAVE_KEY, JSON.stringify({
			cash: G.ca, jobIndex: G.ji, jobsDone: G.jD,
			raceBest: G.rB, radioStation: G.rS,
			guns: G.gn, ammoP: G.ammoP, ammoS: G.ammoS,
		}));
	} catch (e) {  }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
function colC(x, z, r) {
	const half = G.cS / 2 - 6;
	if (!isLand(x, z)) { x = zm(x, -half, half); z = zm(z, -half, half); }
	for (let i = 0; i < G.co.length; i++) {
		const c = G.co[i];
		if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) {
			const dxl = x - (c.minX - r), dxr = (c.maxX + r) - x;
			const dzl = z - (c.minZ - r), dzr = (c.maxZ + r) - z;
			const m = M.min(dxl, dxr, dzl, dzr);
			if (m === dxl) x = c.minX - r; else if (m === dxr) x = c.maxX + r;
			else if (m === dzl) z = c.minZ - r; else z = c.maxZ + r;
		}
	}
	return { x, z };
}
