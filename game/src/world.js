"use strict";
const RL = [-640, -480, -320, -160, 0, 160, 320, 480, 640];
const BC = [-560, -400, -240, -80, 80, 240, 400, 560];
const PIERS = [-240, -80, 80, 240];
const SP = {
	sH: { x: 60, z: 306 }, cb: { x: -34, z: -34 },
	ce: { x: -884, z: 74 }, ma: { x: 178, z: -178 },
	dn: { x: -408, z: -350 }, lk: { x: 430, z: 462 },
	cY: { x: 452, z: 300 }, aH: { x: -300, z: 612 },
	hP: { x: -700, z: 262 }, rT: { x: 640, z: 556 },
	bF: { x: 622, z: 470 }, ro: { x: -392, z: -352 },
	bi: { x: 668, z: 120 },
};
const RCP = [
	{ x: 640, z: 380 }, { x: 640, z: 220 }, { x: 640, z: 60 },
	{ x: 640, z: -100 }, { x: 640, z: -260 }, { x: 640, z: -420 },
];
function dAt(x, z) {
	if (z > 540) return "Coral Bay Airport";
	if (x > 600) return "Beachfront";
	if (x < -580) return "The Marina";
	if (x < -180 && z < -140) return "Palmera Heights";
	if (x > 190 && z > 230) return "Industrial Yards";
	if (M.abs(x) < 370 && z > -370 && z < 230) return "Downtown";
	return "Coral Bay";
}
function isAirport(x, z) { return z > 540 && M.abs(x) < 580; }
function isLand(x, z) {
	if (M.abs(x) <= 852 && M.abs(z) <= 852) return true;
	for (const pz of PIERS) if (x < -852 && x > -1000 && M.abs(z - pz) < 11) return true;
	return false;
}
const UNIT_BOX = () => new BG(1, 1, 1);
class Bucket {
	constructor() { this.items = []; }
	add(geo, x, y, z, o) {
		o = o || {};
		const m = new T3.Matrix4();
		const q = new T3.Quaternion().setFromEuler(new T3.Euler(o.rx || 0, o.ry || 0, o.rz || 0));
		m.compose(new T3.Vector3(x, y, z), q, new T3.Vector3(o.sx || 1, o.sy || 1, o.sz || 1));
		const c = new T3.Color(o.color === undefined ? 0xffffff : o.color);
		this.items.push({ geo, m, c });
	}
	box(x, y, z, sx, sy, sz, color, ry) { this.add(UNIT_BOX(), x, y, z, { sx, sy, sz, color, ry: ry || 0 }); }
	build(material) {
		let total = 0;
		const parts = this.items.map((it) => {
			const g = (it.geo.index ? it.geo.toNonIndexed() : it.geo).clone().applyMatrix4(it.m);
			total += g.attributes.position.count;
			return { g, c: it.c };
		});
		const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
		let off = 0;
		for (const p of parts) {
			const n = p.g.attributes.position.count;
			pos.set(p.g.attributes.position.array, off * 3);
			nor.set(p.g.attributes.normal.array, off * 3);
			for (let i = 0; i < n; i++) { col[(off + i) * 3] = p.c.r; col[(off + i) * 3 + 1] = p.c.g; col[(off + i) * 3 + 2] = p.c.b; }
			off += n;
		}
		const geo = new BF();
		geo.setAttribute("position", new BA(pos, 3));
		geo.setAttribute("normal", new BA(nor, 3));
		geo.setAttribute("color", new BA(col, 3));
		const mesh = new MS(geo, material);
		mesh.matrixAutoUpdate = false;
		return mesh;
	}
}
function vertexMat(opts) { return new ML(Object.assign({ vertexColors: true }, opts || {})); }
function buildGroundCanvas() {
	const S = 2048, W = G.cS, sc = S / W;
	const cv = CE("canvas"); cv.width = S; cv.height = S;
	const c = cv.getContext("2d");
	const X = (x) => (x + W / 2) * sc, Y = (z) => (z + W / 2) * sc, U = (u) => u * sc;
	const FR = (x, z, w, d) => c.fillRect(X(x), Y(z), U(w), U(d));
	c.fillStyle = "#1b6a8c"; c.fillRect(0, 0, S, S);
	c.fillStyle = "#e9d29b"; FR(-852, -852, 1704, 1704);
	c.fillStyle = "#6fae52"; FR(-826, -826, 1652, 1652);
	c.fillStyle = "#e9d29b"; FR(688, -852, 164, 1704);
	c.fillStyle = "#8f979e"; FR(-370, -370, 740, 600);
	c.fillStyle = "#b9bec2"; FR(-852, -360, 272, 720);
	c.fillStyle = "#93a05e"; FR(-580, -660, 400, 330);
	c.fillStyle = "#8d8578"; FR(190, 230, 410, 310);
	c.fillStyle = "#7e868c"; FR(-580, 540, 1160, 312);
	c.fillStyle = "#1b6a8c"; FR(-852, 417, 552, 26);
	c.fillStyle = "#c2b28a"; FR(-852, 412, 552, 5); FR(-852, 443, 552, 5);
	c.fillStyle = "#c9ccce";
	for (const bx of BC) for (const bz of BC) {
		if (isAirport(bx, bz) || bx > 600) continue;
		FR(bx - 68, bz - 68, 136, 136);
	}
	c.fillStyle = "#5da248"; FR(12, -308, 136, 136);
	c.fillStyle = "#3f7fbf"; c.beginPath(); c.arc(X(80), Y(-240), U(22), 0, 7); c.fill();
	c.fillStyle = "#3c4147";
	for (const r of RL) {
		FR(r - 15, -852, 30, 1704);
		FR(-852, r - 15, 1704, 30);
	}
	c.fillStyle = "#f5f2e4";
	for (const r of RL) for (let t = -840; t < 850; t += 36) {
		FR(r - 1, t, 2, 16);
		FR(t, r - 1, 16, 2);
	}
	c.fillStyle = "#a9805a"; FR(694, -852, 10, 1704);
	c.fillStyle = "#7a6248";
	for (const pz of PIERS) FR(-998, pz - 10, 146, 20);
	for (const p of [SP.hP, SP.aH]) {
		c.fillStyle = "#5c6468"; c.beginPath(); c.arc(X(p.x), Y(p.z), U(26), 0, 7); c.fill();
		c.strokeStyle = "#ffd94d"; c.lineWidth = U(3); c.beginPath(); c.arc(X(p.x), Y(p.z), U(21), 0, 7); c.stroke();
		c.fillStyle = "#ffd94d"; c.font = `bold ${U(26)}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
		c.fillText("H", X(p.x), Y(p.z));
	}
	c.fillStyle = "#33373c"; FR(-520, 688, 1040, 48);
	c.fillStyle = "#f5f2e4";
	for (let t = -500; t < 510; t += 44) FR(t, 710, 22, 4);
	FR(-520, 688, 8, 48); FR(512, 688, 8, 48);
	c.fillStyle = "#6e6a5e"; FR(392, 424, 76, 76);
	G.gC = cv;
	return cv;
}
const WT = [0xdfe8ee, 0xf3e3c2, 0xcfe0ea, 0xf6d9d0, 0xe8dcc8, 0xc4d4c0];
function bTex(w, h, base) {
	const cv = CE("canvas"); cv.width = 64; cv.height = 128;
	const c = cv.getContext("2d");
	c.fillStyle = base; c.fillRect(0, 0, 64, 128);
	c.fillStyle = "rgba(0,0,0,0.13)";
	for (let i = 1; i < 4; i++) c.fillRect(i * 16, 0, 1, 128);
	for (let j = 4; j < 128; j += 16) c.fillRect(0, j, 64, 2);
	c.fillStyle = "rgba(0,0,0,0.3)"; c.fillRect(0, 108, 64, 20);
	c.fillStyle = "rgba(255,255,255,0.35)"; c.fillRect(0, 106, 64, 2);
	const ec = CE("canvas"); ec.width = 64; ec.height = 128;
	const g2 = ec.getContext("2d");
	g2.fillStyle = "#000"; g2.fillRect(0, 0, 64, 128);
	const cols = M.max(2, M.round(w / 9)), rows = M.max(3, M.round(h / 7));
	for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
		const lit = rng() > 0.45;
		c.fillStyle = lit ? "#ffd98c" : "#2c3e50";
		const wx = 4 + i * (56 / cols), wy = 5 + j * (118 / rows), ww = 56 / cols - 5, wh = 118 / rows - 6;
		c.fillRect(wx, wy, ww, wh);
		if (lit) { g2.fillStyle = "#ffc37a"; g2.fillRect(wx, wy, ww, wh); }
	}
	const t = new CT(cv);
	t.colorSpace = SC;
	const et = new CT(ec);
	et.colorSpace = SC;
	t.userData.e = et;
	return t;
}
function buildWorld() {
	const scene = G.sc;
	const groundCv = buildGroundCanvas();
	const gtex = new CT(groundCv);
	gtex.colorSpace = SC;
	gtex.anisotropy = 4;
	G.gM = new T3.MeshPhongMaterial({ map: gtex, shininess: 0, specular: 0x222222 });
	const ground = new MS(new PG(G.cS, G.cS), G.gM);
	ground.rotation.x = -M.PI / 2;
	ground.receiveShadow = true;
	scene.add(ground);
	const waterMat = new T3.MeshPhongMaterial({ color: 0x1b6a8c, shininess: 140, specular: 0x99ccdd });
	const water = new MS(new PG(6000, 6000), waterMat);
	water.rotation.x = -M.PI / 2; water.position.y = -0.5;
	scene.add(water);
	G.waterMat = waterMat;
	buildDistricts(scene);
	buildVegetation(scene);
	buildMarina(scene);
	buildAirport(scene);
	buildSigns(scene);
	buildSky(scene);
	buildRain(scene);
}
function aBld(scene, x, z, w, d, h, tex, tint, y0) {
	const mat = new ML({ map: tex, color: tint });
	if (tex.userData.e) { mat.emissive = new T3.Color(0xffc37a); mat.emissiveMap = tex.userData.e; mat.emissiveIntensity = 0; }
	const m = new MS(new BG(w, h, d), mat);
	m.position.set(x, (y0 || 0) + h / 2, z);
	m.castShadow = true; m.receiveShadow = true;
	scene.add(m);
	if (!y0) G.co.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
	G.bD.push(mat);
	return m;
}
function buildDistricts(scene) {
	G.bD = [];
	const towerTex = [bTex(70, 100, "#b8c4cc"), bTex(60, 80, "#d8c9ae"), bTex(80, 115, "#aebfd0"), bTex(66, 92, "#c9b8a6"), bTex(58, 84, "#9fb4a8")];
	const midTex = [bTex(40, 30, "#e3d7c3"), bTex(36, 24, "#d5dee2"), bTex(38, 27, "#d9c6b0")];
	const houseTex = bTex(20, 12, "#f0e6d2");
	const roofs = new Bucket();
	for (const bx of BC) for (const bz of BC) {
		if (isAirport(bx, bz) || bx > 600 || (bx === 80 && bz === -240)) continue;
		const d = dAt(bx, bz);
		if (d === "Downtown") {
			const n = rng() > 0.4 ? 1 : 2;
			for (let i = 0; i < n; i++) {
				const w = rand(44, 66), dep = rand(44, 66), h = rand(34, 126) * (i === 1 ? rand(0.5, 0.8) : 1);
				const ox = n === 2 ? (i === 0 ? -32 : 32) : rand(-8, 8), oz = rand(-10, 10);
				const tx = pick(towerTex), tn = pick(WT);
				aBld(scene, bx + ox, bz + oz, w, dep, h, tx, tn);
				const r2 = rng();
				if (r2 < 0.4) aBld(scene, bx + ox, bz + oz, w * 0.62, dep * 0.62, rand(5, 11), tx, tn, h);
				else if (r2 < 0.55) roofs.box(bx + ox, h + 0.5, bz + oz, w + 1.6, 1, dep + 1.6, 0x3a4046);
				else if (r2 < 0.65) roofs.add(new CN(1, 1, 4), bx + ox, h + 3, bz + oz, { sx: w * 0.55, sy: 6, sz: dep * 0.55, color: 0x596066, ry: M.PI / 4 });
				if (h > 45) {
					roofs.box(bx + ox + rand(-w / 4, w / 4), h + 1, bz + oz + rand(-dep / 4, dep / 4), rand(4, 7), 2, rand(4, 6), 0x9aa0a3);
					if (rng() > 0.5) {
						roofs.add(new CY(2, 2, 4.5, 8), bx + ox - w / 4, h + 2.2, bz + oz, { color: 0xb5502e });
						roofs.add(new CN(2.6, 1.6, 8), bx + ox - w / 4, h + 5.2, bz + oz, { color: 0x8a4a2a });
					}
					if (rng() > 0.55) roofs.box(bx + ox, h + rand(4, 8), bz + oz, 0.4, rand(8, 15), 0.4, 0xd8d3c3);
				}
				if (bx === 240 && bz === 80 && i === 0) pSgn("COMET GT", "DEALER", bx + ox, h * 0.72, bz + oz + dep / 2 + 0.4, 30, 5.5, "#ffffff", "#8c1f28", 0);
			}
		} else if (d === "Palmera Heights") {
			aBld(scene, bx, bz, rand(52, 66), rand(40, 52), rand(10, 15), houseTex, pick(WT));
			roofs.box(bx + 40, 0.8, bz + 30, 26, 1.6, 18, 0x3f7fbf);
		} else if (d === "Industrial Yards") {
			aBld(scene, bx, bz, rand(78, 100), rand(52, 68), rand(14, 20), pick(midTex), 0xcfc4ae);
			for (let i = 0; i < 5; i++)
				roofs.box(bx + rand(-52, 52), 1.5, bz + rand(-40, 40), 6, 3, 6, pick([0xc96f2e, 0x2e7fc9, 0x9aa0a3, 0x58a05c]));
		} else if (d === "The Marina") {
			aBld(scene, bx + rand(-14, 14), bz, rand(50, 70), rand(38, 50), rand(9, 16), pick(midTex), pick(WT));
		} else {
			for (let i = 0; i < 3; i++) {
				const ox = (i - 1) * 40 + rand(-5, 5), oz = rand(-30, 30);
				const hw = rand(24, 32), hd = rand(20, 28), hh = rand(8, 13);
				aBld(scene, bx + ox, bz + oz, hw, hd, hh, houseTex, pick(WT));
				roofs.add(new CN(1, 1, 4), bx + ox, hh + 3.4, bz + oz,
					{ sx: hw * 0.78, sy: 7, sz: hd * 0.78, color: pick([0xb5502e, 0x8a5a34, 0x707880]), ry: M.PI / 4 });
			}
		}
	}
	const club = aBld(scene, -80, -80, 56, 48, 17, midTex[0], 0xf6d9d0);
	club.position.y = 8.5;
	const sign = new MS(new BG(30, 4, 1.5), BM(0xff4fa3));
	sign.position.set(-52, 15, -55); scene.add(sign);
	G.cN = sign.material;
	pSgn("STARFISH CLUB", null, -52, 15, -54.1, 28, 3.6, "#ff8fd0", "#1c0b26", 0);
	aBld(scene, 60, 348, 44, 30, 12, houseTex, 0xd8f2ee);
	const doorGlow = new MS(new BG(5, 8, 1), BM(0x2ee6c8));
	doorGlow.position.set(60, 4, 332); scene.add(doorGlow);
	const poles = new Bucket(), heads = new Bucket(), lps = [];
	for (const r of RL) for (let t = -800; t <= 800; t += 107) {
		if (M.abs(t - r) < 20) continue;
		poles.box(r + 17, 3.4, t, 0.5, 6.8, 0.5, 0x3a4046);
		heads.box(r + 17, 7, t, 1.6, 0.5, 1.6, 0xffe6a3);
		poles.box(t, 3.4, r - 17, 0.5, 6.8, 0.5, 0x3a4046);
		heads.box(t, 7, r - 17, 1.6, 0.5, 1.6, 0xffe6a3);
		lps.push(r + 17, t, t, r - 17);
	}
	const lgc = CE("canvas"); lgc.width = lgc.height = 64;
	const lg = lgc.getContext("2d");
	const grd = lg.createRadialGradient(32, 32, 2, 32, 32, 32);
	grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.4, "rgba(255,255,255,0.45)"); grd.addColorStop(1, "rgba(255,255,255,0)");
	lg.fillStyle = grd; lg.fillRect(0, 0, 64, 64);
	G.gT = new CT(lgc);
	const nL = lps.length / 2, lpA = new Float32Array(nL * 3), lpB = new Float32Array(nL * 3);
	for (let i = 0; i < nL; i++) {
		lpA[i * 3] = lps[i * 2]; lpA[i * 3 + 1] = 7; lpA[i * 3 + 2] = lps[i * 2 + 1];
		lpB[i * 3] = lps[i * 2]; lpB[i * 3 + 1] = 0.3; lpB[i * 3 + 2] = lps[i * 2 + 1];
	}
	const mkPts = (arr, size, col) => {
		const g2 = new BF();
		g2.setAttribute("position", new BA(arr, 3));
		const mt = new PM({ map: G.gT, color: col, size, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: T3.AdditiveBlending });
		const p2 = new PS(g2, mt); p2.frustumCulled = false; scene.add(p2);
		return mt;
	};
	G.lG = mkPts(lpA, 11, 0xffd9a0);
	G.poolMat = mkPts(lpB, 21, 0xffb765);
	const poleMesh = poles.build(vertexMat()); scene.add(poleMesh);
	G.lM = BM(0x8a7f5c);
	const headMesh = heads.build(G.lM); scene.add(headMesh);
	const crates = roofs.build(vertexMat()); crates.castShadow = true; scene.add(crates);
	const rails = new Bucket();
	for (const bx of [-640, -480]) {
		rails.box(bx - 16, 0.7, 417, 1.2, 1.4, 26, 0xd8d3c3);
		rails.box(bx + 16, 0.7, 417 + 26, 1.2, 1.4, 26, 0xd8d3c3);
		G.co.push({ minX: bx - 17, maxX: bx - 15, minZ: 404, maxZ: 456 });
		G.co.push({ minX: bx + 15, maxX: bx + 17, minZ: 404, maxZ: 456 });
	}
	for (const side of [414, 446]) {
		const segs = [[-852, -658], [-622, -498], [-462, -300]];
		for (const s of segs) G.co.push({ minX: s[0], maxX: s[1], minZ: side - 2, maxZ: side + 2 });
	}
	scene.add(rails.build(vertexMat()));
}
function buildVegetation(scene) {
	const trunks = new Bucket(), leaves = new Bucket();
	const frond = new CN(0.6, 7, 5), canopy = new SG(1, 7, 6);
	function palm(x, z, s) {
		const lean = rand(-0.7, 0.7);
		trunks.add(new CY(0.32, 0.45, 8, 6), x + lean, 4, z, { color: 0x8a6a44, rz: lean * 0.09 });
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * M.PI * 2;
			leaves.add(frond, x + lean * 2 + M.cos(a) * 2.6, 8.6, z + M.sin(a) * 2.6,
				{ sx: s, sy: s, sz: s, color: 0x3f9e4d, rx: M.sin(a) * 1.15, rz: -M.cos(a) * 1.15 });
		}
	}
	function tree(x, z, s) {
		trunks.add(new CY(0.4, 0.55, 3.6, 6), x, 1.8, z, { color: 0x6e4f30 });
		leaves.add(canopy, x, 5.6, z, { sx: 4.6 * s, sy: 3.8 * s, sz: 4.6 * s, color: pick([0x4da653, 0x5cb85e, 0x3f9e4d]) });
		leaves.add(canopy, x + 1.8, 4.6, z + 1, { sx: 3 * s, sy: 2.6 * s, sz: 3 * s, color: 0x55a84f });
	}
	for (let z = -820; z < 830; z += rand(46, 70)) palm(676 + rand(-6, 6), z, rand(0.8, 1.15));
	for (let i = 0; i < 26; i++) palm(rand(-830, -600), rand(-340, 340), rand(0.8, 1.1));
	for (let i = 0; i < 22; i++) palm(rand(-560, -200), rand(-640, -350), rand(0.85, 1.2));
	for (let i = 0; i < 14; i++) tree(80 + rand(-55, 55), -240 + rand(-55, 55), rand(0.9, 1.3));
	for (let i = 0; i < 30; i++) { const x = rand(-560, 560), z = rand(-560, 520); if (M.abs(x % 160) > 30 && M.abs(z % 160) > 30) tree(x, z, rand(0.8, 1.2)); }
	const tuft = new CN(0.5, 1.1, 4);
	for (let i = 0; i < 380; i++) {
		const x = rand(-840, 840), z = rand(-840, 840);
		if (M.abs(x % 160) < 22 || M.abs(z % 160) < 22 || isAirport(x, z)) continue;
		leaves.add(tuft, x, 0.5, z, { sx: rand(0.8, 1.8), sy: rand(0.8, 1.6), sz: rand(0.8, 1.8), color: pick([0x5da248, 0x74bd5a, 0x4da653]) });
	}
	const tm = trunks.build(vertexMat()); tm.castShadow = true; scene.add(tm);
	const lm = leaves.build(vertexMat()); lm.castShadow = true; scene.add(lm);
}
function buildMarina(scene) {
	const decks = new Bucket();
	for (const pz of PIERS) decks.box(-925, -0.16, pz, 150, 0.34, 20, 0x7a6248);
	const deckMesh = decks.build(vertexMat());
	deckMesh.receiveShadow = true;
	scene.add(deckMesh);
	const cafeTex = bTex(40, 14, "#e8dcc4");
	const cafeSigns = { "-300": ["CAFÉ OLE", "#ffd94d", "#40260e"], "-140": ["GELATO BAY", "#a3ffd9", "#0e2a3a"], "180": ["MARINA YACHT CLUB", "#a3e8ff", "#0a2436"], "330": ["TACO MAR", "#ffb37a", "#3a1408"] };
	for (const mz of [-300, -140, 20, 180, 330]) {
		if (mz === 20) continue;
		const bx2 = -668 + rand(-16, 16), bw = rand(52, 74), bd = rand(36, 48), bh = rand(9, 15);
		aBld(scene, bx2, mz, bw, bd, bh, cafeTex, pick(WT));
		const cs = cafeSigns[String(mz)];
		if (cs) pSgn(cs[0], null, bx2 + bw / 2 + 0.3, bh * 0.66, mz, bd * 0.8, 4.2, cs[1], cs[2], M.PI / 2);
	}
	G.bt = [];
	const hullCols = [0xe8e4da, 0x2e7fc9, 0xc93a2e, 0xf2b13d, 0x39b5a6];
	for (const pz of PIERS) {
		for (let i = 0; i < 3; i++) {
			const bx = -884 - i * 38, bz = pz + (i % 2 === 0 ? -17 : 17);
			const boat = new GR();
			const hull = new MS(new BG(13, 2.2, 4.6), lam(pick(hullCols)));
			hull.position.y = 0.4; boat.add(hull);
			const cabin = new MS(new BG(4.5, 2, 3.4), lam(0xf4f1e8));
			cabin.position.set(-0.5, 2.4, 0); boat.add(cabin);
			const mast = new MS(new CY(0.16, 0.16, 11, 5), lam(0x8a8f94));
			mast.position.set(2.4, 6.4, 0); boat.add(mast);
			const sail = new MS(new PG(4.6, 7.6),
				new ML({ color: 0xffffff, side: DS }));
			sail.position.set(0.6, 6, 0); sail.rotation.y = M.PI / 2; boat.add(sail);
			boat.position.set(bx, 0, bz);
			boat.rotation.y = M.PI / 2 + rand(-0.06, 0.06);
			boat.userData.phase = rand(0, 6);
			scene.add(boat); G.bt.push(boat);
		}
	}
	const lh = new GR();
	const base = new MS(new CY(4.4, 5.6, 15, 10), lam(0xf2efe8));
	base.position.y = 7.5; lh.add(base);
	const band = new MS(new CY(4.7, 5, 4.4, 10), lam(0xc93a2e));
	band.position.y = 10; lh.add(band);
	const lampRoom = new MS(new CY(2.4, 2.4, 3.4, 8), BM(0xffe9a3));
	lampRoom.position.y = 16.6; lh.add(lampRoom);
	G.lH = lampRoom.material;
	lh.position.set(-972, 0, -330);
	scene.add(lh);
	G.co.push({ minX: -980, maxX: -964, minZ: -338, maxZ: -322 });
}
function buildAirport(scene) {
	const b = new Bucket();
	b.box(-240, 6, 584, 90, 12, 44, 0x9aa4ac); b.box(60, 6, 584, 90, 12, 44, 0x8b959c);
	b.box(330, 6, 584, 90, 12, 44, 0x9aa4ac);
	b.box(-30, 8, 566, 190, 16, 26, 0xd8dee2);
	for (const hx of [-240, 60, 330]) G.co.push({ minX: hx - 45, maxX: hx + 45, minZ: 562, maxZ: 606 });
	G.co.push({ minX: -125, maxX: 65, minZ: 553, maxZ: 579 });
	const mesh = b.build(vertexMat()); mesh.castShadow = true; scene.add(mesh);
	pSgn("CORAL BAY AIRPORT", null, -30, 11, 552.4, 120, 10, "#ffffff", "#14425e", M.PI);
	const plane = new GR();
	const white = lam(0xf2f4f6);
	const fus = new MS(new CY(3.1, 3.1, 34, 12), white);
	fus.rotation.z = M.PI / 2; fus.position.y = 4.6; plane.add(fus);
	const nose = new MS(new SG(3.1, 10, 8), white);
	nose.position.set(17, 4.6, 0); plane.add(nose);
	const wing = new MS(new BG(9, 0.5, 30), lam(0xc93a2e));
	wing.position.set(1, 4.2, 0); plane.add(wing);
	const tail = new MS(new BG(5, 7, 0.6), lam(0xc93a2e));
	tail.position.set(-16.5, 8.6, 0); plane.add(tail);
	const fin = new MS(new BG(6, 0.5, 9), lam(0xc93a2e));
	fin.position.set(-16.5, 5.4, 0); plane.add(fin);
	for (const s of [-8, 8]) {
		const eng = new MS(new CY(1.3, 1.3, 4.6, 8), lam(0x596066));
		eng.rotation.z = M.PI / 2; eng.position.set(1, 3, s); plane.add(eng);
	}
	plane.position.set(330, 0, 712); plane.rotation.y = 0.04;
	scene.add(plane);
	G.co.push({ minX: 310, maxX: 352, minZ: 696, maxZ: 728 });
}
function signMesh(text, sub, w, h, fg, bg) {
	const cv = CE("canvas"); cv.width = 512; cv.height = M.max(32, M.round(512 * h / w));
	const c = cv.getContext("2d");
	c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
	c.fillStyle = fg; c.textAlign = "center"; c.textBaseline = "middle";
	let fs = M.round(cv.height * (sub ? 0.42 : 0.6));
	c.font = "bold " + fs + "px Trebuchet MS, sans-serif";
	const tw = c.measureText(text).width;
	if (tw > cv.width * 0.92) { fs = M.floor(fs * cv.width * 0.92 / tw); c.font = "bold " + fs + "px Trebuchet MS, sans-serif"; }
	c.fillText(text, cv.width / 2, sub ? cv.height * 0.34 : cv.height / 2);
	if (sub) { c.font = "bold " + M.round(cv.height * 0.19) + "px Trebuchet MS, sans-serif"; c.fillText(sub, cv.width / 2, cv.height * 0.76); }
	const t = new CT(cv); t.colorSpace = SC;
	return new MS(new PG(w, h), new MB({ map: t }));
}
function pSgn(text, sub, x, y, z, w, h, fg, bg, ry) {
	const m = signMesh(text, sub, w, h, fg, bg);
	m.position.set(x, y, z); if (ry) m.rotation.y = ry;
	G.sc.add(m); return m;
}
function billboard(text, sub, x, z, fg, bg, ry, w, h, cy) {
	w = w || 18; h = h || 5.5; cy = cy || 9.5;
	const g = new GR();
	const poleMat = lam(0x3a4046);
	for (const px of [-(w / 2 - 2), w / 2 - 2]) {
		const pole = new MS(new BG(0.5, cy + h / 2, 0.5), poleMat);
		pole.position.set(px, (cy + h / 2) / 2, 0); g.add(pole);
	}
	const f = signMesh(text, sub, w, h, fg, bg); f.position.set(0, cy, 0.35); g.add(f);
	const b = signMesh(text, sub, w, h, fg, bg); b.position.set(0, cy, -0.35); b.rotation.y = M.PI; g.add(b);
	g.position.set(x, 0, z); g.rotation.y = ry || 0;
	G.sc.add(g);
	G.co.push({ minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 });
}
function buildSigns(scene) {
	const htx = bTex(70, 100, "#b8c4cc");
	aBld(scene, 736, -160, 44, 44, 64, htx, 0xdfe8ee);
	aBld(scene, 736, -160, 30, 30, 12, htx, 0xdfe8ee, 64);
	pSgn("HOTEL CORALIA", "ON THE BEACH", 713.6, 50, -160, 40, 7.5, "#7df9ff", "#0b2038", -M.PI / 2);
	const ctx2 = bTex(40, 30, "#4a3550");
	aBld(scene, 30, -300, 48, 34, 26, ctx2, 0xf3e3c2);
	aBld(scene, 30, -300, 34, 24, 10, ctx2, 0xf3e3c2, 26);
	pSgn("CASINO", "CORAL BAY", 30, 19, -317.4, 40, 6.5, "#ffd94d", "#2a0a2e", M.PI);
	aBld(scene, -690, 20, 46, 34, 14, bTex(40, 14, "#d8dee2"), 0xffe9a3);
	pSgn("BANCO DEL MAR", null, -666.6, 10.5, 20, 34, 5.5, "#ffe9a3", "#0e2a1e", M.PI / 2);
	aBld(scene, -668, -60, 40, 30, 8, bTex(40, 14, "#e8dcc4"), 0xf6d9d0);
	pSgn("PASTA MARINA", null, -647.6, 6, -60, 30, 4.5, "#ffb37a", "#40260e", M.PI / 2);
	const huts = [["SURF SHACK", -520, "#fff3b0", "#7a4a21"], ["BEACH BAR", 60, "#ffd1dc", "#402030"], ["PIZZA BAY", 300, "#ffdf6b", "#7a1f1f"]];
	for (const [nm, hz, fg, bg] of huts) {
		aBld(scene, 706, hz, 20, 14, 6, bTex(20, 12, "#f0e6d2"), 0xe8e4da);
		pSgn(nm, null, 695.6, 4.2, hz, 16, 3.6, fg, bg, -M.PI / 2);
	}
	billboard("PALMERA PLAZA", "MALL · CINEMA", -452, -292, "#ffb37a", "#14262e", 0, 30, 6, 9.5);
	billboard("WELCOME TO CORAL BAY", null, 16, 344, "#12222e", "#ffd94d", M.PI, 17, 4, 4.6);
	billboard("VOLT COLA", "SPARK UP THE BAY", 706, -420, "#ffffff", "#c22030", -M.PI / 2);
	billboard("AERO AIR", "FLY THE BAY", 500, 520, "#dff4ff", "#1c4d8c", M.PI);
	billboard("CORAL BAY", "SUN · SEA · SYNDICATE", 672, -640, "#ffe9a3", "#0e3a4a", -M.PI / 2);
}
function buildSky(scene) {
	G.sun = new T3.DirectionalLight(0xffe3b3, 3);
	G.sun.castShadow = true;
	G.sun.shadow.mapSize.set(1024, 1024);
	G.sun.shadow.camera.left = -150; G.sun.shadow.camera.right = 150;
	G.sun.shadow.camera.top = 150; G.sun.shadow.camera.bottom = -150;
	G.sun.shadow.camera.far = 900; G.sun.shadow.bias = -0.0006;
	scene.add(G.sun); scene.add(G.sun.target);
	G.hm = new T3.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.9);
	scene.add(G.hm);
	scene.fog = new T3.Fog(0xf2c99a, 260, 1500);
	G.cL = [];
	const cm = new ML({ color: 0xffffff, transparent: true, opacity: 0.88 });
	for (let i = 0; i < 13; i++) {
		const cl = new GR();
		for (let j = 0; j < 4; j++) {
			const s = new MS(new SG(rand(9, 20), 7, 6), cm);
			s.position.set(rand(-16, 16), rand(-3, 3), rand(-8, 8));
			s.scale.y = 0.42; cl.add(s);
		}
		cl.position.set(rand(-1000, 1000), rand(120, 175), rand(-1000, 1000));
		scene.add(cl); G.cL.push(cl);
	}
	const starGeo = new BF();
	const sp = new Float32Array(700 * 3);
	const sr = m3(777);
	for (let i = 0; i < 700; i++) {
		const a = sr() * M.PI * 2, e = sr() * M.PI * 0.48 + 0.05, r = 2600;
		sp[i * 3] = M.cos(a) * M.cos(e) * r;
		sp[i * 3 + 1] = M.sin(e) * r;
		sp[i * 3 + 2] = M.sin(a) * M.cos(e) * r;
	}
	starGeo.setAttribute("position", new BA(sp, 3));
	G.sM = new PM({ color: 0xdfe9ff, size: 5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
	const stars = new PS(starGeo, G.sM);
	scene.add(stars); G.st = stars;
	G.mN = new MS(new T3.CircleGeometry(70, 24),
		new MB({ color: 0xf4f7ff, transparent: true, opacity: 0, fog: false }));
	scene.add(G.mN);
}
function buildRain(scene) {
	const N = 850;
	const geo = new BF();
	const p = new Float32Array(N * 3);
	const rr = m3(4242);
	for (let i = 0; i < N; i++) { p[i * 3] = (rr() - 0.5) * 110; p[i * 3 + 1] = rr() * 60; p[i * 3 + 2] = (rr() - 0.5) * 110; }
	geo.setAttribute("position", new BA(p, 3));
	const rcv = CE("canvas"); rcv.width = 16; rcv.height = 64;
	const rc = rcv.getContext("2d");
	const grad = rc.createLinearGradient(0, 0, 0, 64);
	grad.addColorStop(0, "rgba(170,204,238,0)");
	grad.addColorStop(0.5, "rgba(170,204,238,0.85)");
	grad.addColorStop(1, "rgba(170,204,238,0)");
	rc.fillStyle = grad; rc.fillRect(6, 0, 4, 64);
	const rtex = new CT(rcv);
	G.rM = new PM({ color: 0xaaccee, size: 1.9, map: rtex, transparent: true, opacity: 0, depthWrite: false });
	G.rn = new PS(geo, G.rM);
	G.rn.visible = false;
	scene.add(G.rn);
}
const SKY_KEYS = [
	[0, 0x0b1026, 0x0b1026, 0x93b8e8, 0.42, 0.66, 1],
	[5.5, 0x1a2340, 0x1a2340, 0x7d9cc4, 0.3, 0.6, 0.9],
	[7, 0xffb37a, 0xffc490, 0xffb37a, 1.6, 0.55, 0.25],
	[10, 0x7ec8e3, 0xbfe0ea, 0xfff2d8, 3, 0.95, 0],
	[16, 0x86cde8, 0xc4e2ec, 0xfff0d0, 3, 0.95, 0],
	[17.8, 0xffc478, 0xf7c489, 0xffbe78, 2.6, 0.92, 0],
	[19.3, 0x8a5f8e, 0x9a6f8a, 0xff9a5c, 1.2, 0.68, 0.35],
	[20.6, 0x27335e, 0x27335e, 0x87a8dd, 0.38, 0.62, 0.85],
	[24, 0x0b1026, 0x0b1026, 0x93b8e8, 0.42, 0.66, 1],
];
function skyAt(h) {
	const mix = (a, b, t) => new T3.Color(a).lerp(new T3.Color(b), t);
	for (let i = 0; i < SKY_KEYS.length - 1; i++) {
		const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
		if (h >= a[0] && h <= b[0]) {
			const t = (h - a[0]) / M.max(0.001, b[0] - a[0]);
			return {
				sky: mix(a[1], b[1], t), fog: mix(a[2], b[2], t), sun: mix(a[3], b[3], t),
				sunI: lerp(a[4], b[4], t), hemiI: lerp(a[5], b[5], t), night: lerp(a[6], b[6], t),
			};
		}
	}
	const a = SKY_KEYS[0];
	return { sky: new T3.Color(a[1]), fog: new T3.Color(a[2]), sun: new T3.Color(a[3]), sunI: a[4], hemiI: a[5], night: a[6] };
}
let hlPts = null, hlPos = null;
function hlTick(night) {
	if (!G.vs || !G.vs.length || !G.gT) return;
	if (!hlPts) {
		hlPos = new Float32Array(48 * 3);
		for (let i = 0; i < 48; i++) hlPos[i * 3 + 1] = -50;
		const g2 = new BF();
		g2.setAttribute("position", new BA(hlPos, 3));
		G.hG = new PM({ map: G.gT, color: 0xffe2ae, size: 6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: T3.AdditiveBlending });
		hlPts = new PS(g2, G.hG); hlPts.frustumCulled = false;
		G.sc.add(hlPts);
	}
	G.hG.opacity = night * 0.75;
	let n = 0;
	for (const v of G.vs) {
		if (n >= 48) break;
		if (!v.alive || v.kind === "bicycle" || v.kind === "heli") continue;
		const m = v.mesh;
		hlPos[n * 3] = m.position.x + M.sin(m.rotation.y) * 2.5;
		hlPos[n * 3 + 1] = 0.8 + (v.alt || 0);
		hlPos[n * 3 + 2] = m.position.z + M.cos(m.rotation.y) * 2.5;
		n++;
	}
	for (let i = n; i < 48; i++) hlPos[i * 3 + 1] = -50;
	hlPts.geometry.attributes.position.needsUpdate = true;
}
function updateSkyAndWeather(dt) {
	if (!G.sg) { G.hr += dt * (24 / 720); if (G.hr >= 24) G.hr -= 24; }
	const sk = skyAt(G.hr);
	G.night = sk.night;
	G.sc.background = sk.sky;
	G.sc.fog.color.copy(sk.fog);
	if (G.we === "hot") G.sc.fog.near = 200, G.sc.fog.far = 1050;
	else G.sc.fog.near = 280, G.sc.fog.far = 1550;
	const sunAng = ((G.hr - 6) / 12) * M.PI;
	const focus = G.vh && !G.oF ? G.vh.mesh.position : (G.pl ? G.pl.mesh.position : new T3.Vector3());
	G.sun.position.set(focus.x + M.cos(sunAng) * 260, M.max(95, M.sin(sunAng) * 300), focus.z + 120);
	G.sun.target.position.set(focus.x, 0, focus.z);
	G.sun.intensity = sk.sunI; G.sun.color.copy(sk.sun);
	G.hm.intensity = sk.hemiI;
	G.sM.opacity = sk.night * 0.95;
	G.st.position.set(focus.x, 0, focus.z);
	const moonAng = sunAng + M.PI;
	G.mN.position.set(focus.x + M.cos(moonAng) * 2200, M.max(60, M.sin(moonAng + 0.4) * 1500 + 300), focus.z - 1400);
	G.mN.lookAt(G.cm.position);
	G.mN.material.opacity = sk.night;
	G.lM.color.setHex(0xffe6a3).multiplyScalar(0.35 + sk.night * 1.5);
	if (G.lG) { G.lG.opacity = sk.night * 0.85; G.poolMat.opacity = sk.night * 0.15; }
	for (const m of G.bD) if (m.emissiveMap) m.emissiveIntensity = sk.night * 0.95;
	if (G.hM) for (const m of G.hM) m.color.setHex(0xffe9b0).multiplyScalar(0.25 + sk.night * 2.4);
	hlTick(sk.night);
	G.lH.color.setHex(0xffe9a3).multiplyScalar(0.4 + sk.night * 1.6);
	if (G.cN) G.cN.color.setHex(0xff4fa3).multiplyScalar(0.55 + sk.night * 1.3);
	for (const cl of G.cL) { cl.position.x += dt * 2.2; if (cl.position.x > 1150) cl.position.x = -1150; }
	for (const b of G.bt) {
		b.position.y = M.sin(G.tm * 0.9 + b.userData.phase) * 0.22;
		b.rotation.z = M.sin(G.tm * 0.7 + b.userData.phase) * 0.03;
	}
	G.wT -= dt;
	if (G.wT <= 0 && !G.sg) {
		const roll = rng();
		G.we = roll < 0.45 ? "clear" : (roll < 0.72 ? "hot" : "rain");
		G.wT = rand(45, 95);
		if (G.we === "rain") sToa("Rain front rolling in off the bay");
		else if (G.we === "hot") sToa("Heat haze over Coral Bay");
	}
	const raining = G.we === "rain";
	G.rn.visible = raining;
	if (raining) {
		G.rM.opacity = M.min(0.5, G.rM.opacity + dt * 0.5);
		G.rn.position.set(focus.x, 0, focus.z);
		const arr = G.rn.geometry.attributes.position.array;
		for (let i = 0; i < arr.length; i += 3) {
			arr[i + 1] -= dt * 55;
			if (arr[i + 1] < 0) { arr[i + 1] = 55; arr[i] = (rng() - 0.5) * 110; arr[i + 2] = (rng() - 0.5) * 110; }
		}
		G.rn.geometry.attributes.position.needsUpdate = true;
		G.gM.shininess = 90; G.gM.specular.setHex(0x666666);
	} else {
		G.rM.opacity = M.max(0, G.rM.opacity - dt * 0.5);
		G.gM.shininess = 0; G.gM.specular.setHex(0x222222);
	}
}
