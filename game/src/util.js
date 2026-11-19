"use strict";
const T3 = THREE;
function mulberry32(seed) {
	let a = seed >>> 0;
	return function () {
		a |= 0; a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
let rng = mulberry32(20261119);
function rand(a, b) { return a + rng() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2d(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
function angWrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function angLerp(a, b, t) { return a + angWrap(b - a) * clamp(t, 0, 1); }
function el(id) { return document.getElementById(id); }
function key(c) { return !!G.keys[c]; }
function BM(c, o) { return new T3.MeshBasicMaterial(Object.assign({ color: c }, o || {})); }
function glowDisc(color, r, op) {
	return new T3.Mesh(new T3.CylinderGeometry(r, r, 0.14, 14),
		BM(color, { transparent: true, opacity: op === undefined ? 0.55 : op }));
}
function beam(r, h, color, op) {
	const m = new T3.Mesh(new T3.CylinderGeometry(r, r, h, 12, 1, true),
		BM(color, { transparent: true, opacity: op, side: T3.DoubleSide, depthWrite: false }));
	m.position.y = h / 2;
	return m;
}
function ringM(r0, r1, color, op) {
	const m = new T3.Mesh(new T3.RingGeometry(r0, r1, 24),
		BM(color, { transparent: true, opacity: op, side: T3.DoubleSide }));
	m.rotation.x = -Math.PI / 2;
	return m;
}
function fmtCash(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
const G = {
	mode: "boot",
	scene: null, camera: null, renderer: null, three: null,
	keys: {}, mouseDX: 0, mouseDY: 0,
	time: 0,
	hour: 16.6,
	weather: "clear",
	weatherTimer: 40,
	cash: 250, health: 100, wanted: 0, wantedCalm: 0,
	weapon: "fists", guns: { pistol: false, smg: false }, ammoP: 0, ammoS: 0,
	player: null,
	onFoot: true, vehicle: null,
	vehicles: [], peds: [], dogs: [], gulls: [], police: [], traffic: [],
	colliders: [],
	pickups: [],
	jobsDone: 0, jobIndex: 0, job: null,
	bustMeter: 0, dead: false,
	camYaw: 0, camPitch: 0.32, camDist: 9,
	radioOn: false, radioStation: 0, muted: false,
	stage: null, stageNoHeli: false,
	groundCanvas: null, citySize: 1700,
	save: null,
	objectiveMarker: null, objectivePos: null,
	track: null,
	raceBest: 0,
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
function saveGame() {
	try {
		localStorage.setItem(SAVE_KEY, JSON.stringify({
			cash: G.cash, jobIndex: G.jobIndex, jobsDone: G.jobsDone,
			raceBest: G.raceBest, radioStation: G.radioStation,
			guns: G.guns, ammoP: G.ammoP, ammoS: G.ammoS,
		}));
	} catch (e) {  }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
function colC(x, z, r) {
	const half = G.citySize / 2 - 6;
	if (!isLand(x, z)) { x = clamp(x, -half, half); z = clamp(z, -half, half); }
	for (let i = 0; i < G.colliders.length; i++) {
		const c = G.colliders[i];
		if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) {
			const dxl = x - (c.minX - r), dxr = (c.maxX + r) - x;
			const dzl = z - (c.minZ - r), dzr = (c.maxZ + r) - z;
			const m = Math.min(dxl, dxr, dzl, dzr);
			if (m === dxl) x = c.minX - r; else if (m === dxr) x = c.maxX + r;
			else if (m === dzl) z = c.minZ - r; else z = c.maxZ + r;
		}
	}
	return { x, z };
}
