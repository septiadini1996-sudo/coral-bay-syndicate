"use strict";
const ROAD_LINES = [-640, -480, -320, -160, 0, 160, 320, 480, 640];
const BLOCK_CENTERS = [-560, -400, -240, -80, 80, 240, 400, 560];
const PIERS = [-240, -80, 80, 240];
const SPOTS = {
	safehouse: { x: 60, z: 306 }, club: { x: -34, z: -34 },
	celia: { x: -884, z: 74 }, marco: { x: 178, z: -178 },
	don: { x: -408, z: -350 }, lockup: { x: 430, z: 462 },
	crusherYard: { x: 452, z: 300 }, airportHeli: { x: -300, z: 612 },
	helipad: { x: -700, z: 262 }, raceStart: { x: 640, z: 556 },
	beachFalco: { x: 622, z: 470 }, roadster: { x: -392, z: -352 },
	bicycle: { x: 668, z: 120 },
};
const RACE_CHECKPOINTS = [
	{ x: 640, z: 380 }, { x: 640, z: 220 }, { x: 640, z: 60 },
	{ x: 640, z: -100 }, { x: 640, z: -260 }, { x: 640, z: -420 },
];
function districtAt(x, z) {
	if (z > 540) return "Coral Bay Airport";
	if (x > 600) return "Beachfront";
	if (x < -580) return "The Marina";
	if (x < -180 && z < -140) return "Palmera Heights";
	if (x > 190 && z > 230) return "Industrial Yards";
	if (Math.abs(x) < 370 && z > -370 && z < 230) return "Downtown";
	return "Coral Bay";
}
function isAirport(x, z) { return z > 540 && Math.abs(x) < 580; }
function isLand(x, z) {
	if (Math.abs(x) <= 852 && Math.abs(z) <= 852) return true;
	for (const pz of PIERS) if (x < -852 && x > -1000 && Math.abs(z - pz) < 11) return true;
	return false;
}
const UNIT_BOX = () => new THREE.BoxGeometry(1, 1, 1);
class Bucket {
	constructor() { this.items = []; }
	add(geo, x, y, z, o) {
		o = o || {};
		const m = new THREE.Matrix4();
		const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0));
		m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(o.sx || 1, o.sy || 1, o.sz || 1));
		const c = new THREE.Color(o.color === undefined ? 0xffffff : o.color);
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
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
		geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
		const mesh = new THREE.Mesh(geo, material);
		mesh.matrixAutoUpdate = false;
		return mesh;
	}
}
function vertexMat(opts) { return new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, opts || {})); }
function buildGroundCanvas() {
	const S = 2048, W = G.citySize, sc = S / W;
	const cv = document.createElement("canvas"); cv.width = S; cv.height = S;
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
	for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
		if (isAirport(bx, bz) || bx > 600) continue;
		FR(bx - 68, bz - 68, 136, 136);
	}
	c.fillStyle = "#5da248"; FR(12, -308, 136, 136);
	c.fillStyle = "#3f7fbf"; c.beginPath(); c.arc(X(80), Y(-240), U(22), 0, 7); c.fill();
	c.fillStyle = "#3c4147";
	for (const r of ROAD_LINES) {
		FR(r - 15, -852, 30, 1704);
		FR(-852, r - 15, 1704, 30);
	}
	c.fillStyle = "#f5f2e4";
	for (const r of ROAD_LINES) for (let t = -840; t < 850; t += 36) {
		FR(r - 1, t, 2, 16);
		FR(t, r - 1, 16, 2);
	}
	c.fillStyle = "#a9805a"; FR(694, -852, 10, 1704);
	c.fillStyle = "#7a6248";
	for (const pz of PIERS) FR(-998, pz - 10, 146, 20);
	for (const p of [SPOTS.helipad, SPOTS.airportHeli]) {
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
	G.groundCanvas = cv;
	return cv;
}
const WINDOW_TINTS = [0xdfe8ee, 0xf3e3c2, 0xcfe0ea, 0xf6d9d0];
function bTex(w, h, base) {
	const cv = document.createElement("canvas"); cv.width = 64; cv.height = 128;
	const c = cv.getContext("2d");
	c.fillStyle = base; c.fillRect(0, 0, 64, 128);
	const cols = Math.max(2, Math.round(w / 9)), rows = Math.max(3, Math.round(h / 7));
	for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
		const lit = rng() > 0.45;
		c.fillStyle = lit ? "#ffd98c" : "#2c3e50";
		c.fillRect(4 + i * (56 / cols), 5 + j * (118 / rows), 56 / cols - 5, 118 / rows - 6);
	}
	const t = new THREE.CanvasTexture(cv);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}
function buildWorld() {
	const scene = G.scene;
	const groundCv = buildGroundCanvas();
	const gtex = new THREE.CanvasTexture(groundCv);
	gtex.colorSpace = THREE.SRGBColorSpace;
	gtex.anisotropy = 4;
	G.groundMat = new THREE.MeshPhongMaterial({ map: gtex, shininess: 0, specular: 0x222222 });
	const ground = new THREE.Mesh(new THREE.PlaneGeometry(G.citySize, G.citySize), G.groundMat);
	ground.rotation.x = -Math.PI / 2;
	ground.receiveShadow = true;
	scene.add(ground);
	const waterMat = new THREE.MeshPhongMaterial({ color: 0x1b6a8c, shininess: 140, specular: 0x99ccdd });
	const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), waterMat);
	water.rotation.x = -Math.PI / 2; water.position.y = -0.5;
	scene.add(water);
	G.waterMat = waterMat;
	buildDistricts(scene);
	buildVegetation(scene);
	buildMarina(scene);
	buildAirport(scene);
	buildSky(scene);
	buildRain(scene);
}
function addBuilding(scene, x, z, w, d, h, tex, tint) {
	const mat = new THREE.MeshLambertMaterial({ map: tex, color: tint });
	const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
	m.position.set(x, h / 2, z);
	m.castShadow = true; m.receiveShadow = true;
	scene.add(m);
	G.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
	G.buildingMats.push(mat);
	return m;
}
function buildDistricts(scene) {
	G.buildingMats = [];
	const towerTex = [bTex(70, 100, "#b8c4cc"), bTex(60, 80, "#d8c9ae"), bTex(80, 115, "#aebfd0")];
	const midTex = [bTex(40, 30, "#e3d7c3"), bTex(36, 24, "#d5dee2")];
	const houseTex = bTex(20, 12, "#f0e6d2");
	const roofs = new Bucket();
	for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
		if (isAirport(bx, bz) || bx > 600 || (bx === 80 && bz === -240)) continue;
		const d = districtAt(bx, bz);
		if (d === "Downtown") {
			const n = rng() > 0.4 ? 1 : 2;
			for (let i = 0; i < n; i++) {
				const w = rand(44, 66), dep = rand(44, 66), h = rand(42, 112);
				const ox = n === 2 ? (i === 0 ? -32 : 32) : rand(-8, 8), oz = rand(-10, 10);
				addBuilding(scene, bx + ox, bz + oz, w, dep, h, pick(towerTex), pick(WINDOW_TINTS));
			}
		} else if (d === "Palmera Heights") {
			addBuilding(scene, bx, bz, rand(52, 66), rand(40, 52), rand(10, 15), houseTex, pick(WINDOW_TINTS));
			roofs.box(bx + 40, 0.8, bz + 30, 26, 1.6, 18, 0x3f7fbf);
		} else if (d === "Industrial Yards") {
			addBuilding(scene, bx, bz, rand(78, 100), rand(52, 68), rand(14, 20), pick(midTex), 0xcfc4ae);
			for (let i = 0; i < 5; i++)
				roofs.box(bx + rand(-52, 52), 1.5, bz + rand(-40, 40), 6, 3, 6, pick([0xc96f2e, 0x2e7fc9, 0x9aa0a3, 0x58a05c]));
		} else if (d === "The Marina") {
			addBuilding(scene, bx + rand(-14, 14), bz, rand(50, 70), rand(38, 50), rand(9, 16), pick(midTex), pick(WINDOW_TINTS));
		} else {
			for (let i = 0; i < 3; i++) {
				const ox = (i - 1) * 40 + rand(-5, 5), oz = rand(-30, 30);
				const hw = rand(24, 32), hd = rand(20, 28), hh = rand(8, 13);
				addBuilding(scene, bx + ox, bz + oz, hw, hd, hh, houseTex, pick(WINDOW_TINTS));
				roofs.add(new THREE.ConeGeometry(1, 1, 4), bx + ox, hh + 3.4, bz + oz,
					{ sx: hw * 0.78, sy: 7, sz: hd * 0.78, color: pick([0xb5502e, 0x8a5a34, 0x707880]), ry: Math.PI / 4 });
			}
		}
	}
	const club = addBuilding(scene, -80, -80, 56, 48, 17, midTex[0], 0xf6d9d0);
	club.position.y = 8.5;
	const sign = new THREE.Mesh(new THREE.BoxGeometry(30, 4, 1.5), BM(0xff4fa3));
	sign.position.set(-52, 15, -55); scene.add(sign);
	G.clubSignMat = sign.material;
	addBuilding(scene, 60, 348, 44, 30, 12, houseTex, 0xd8f2ee);
	const doorGlow = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 1), BM(0x2ee6c8));
	doorGlow.position.set(60, 4, 332); scene.add(doorGlow);
	const poles = new Bucket(), heads = new Bucket();
	for (const r of ROAD_LINES) for (let t = -800; t <= 800; t += 107) {
		if (Math.abs(t - r) < 20) continue;
		poles.box(r + 17, 3.4, t, 0.5, 6.8, 0.5, 0x3a4046);
		heads.box(r + 17, 7, t, 1.6, 0.5, 1.6, 0xffe6a3);
		poles.box(t, 3.4, r - 17, 0.5, 6.8, 0.5, 0x3a4046);
		heads.box(t, 7, r - 17, 1.6, 0.5, 1.6, 0xffe6a3);
	}
	const poleMesh = poles.build(vertexMat()); scene.add(poleMesh);
	G.lampMat = BM(0x8a7f5c);
	const headMesh = heads.build(G.lampMat); scene.add(headMesh);
	const crates = roofs.build(vertexMat()); crates.castShadow = true; scene.add(crates);
	const rails = new Bucket();
	for (const bx of [-640, -480]) {
		rails.box(bx - 16, 0.7, 417, 1.2, 1.4, 26, 0xd8d3c3);
		rails.box(bx + 16, 0.7, 417 + 26, 1.2, 1.4, 26, 0xd8d3c3);
		G.colliders.push({ minX: bx - 17, maxX: bx - 15, minZ: 404, maxZ: 456 });
		G.colliders.push({ minX: bx + 15, maxX: bx + 17, minZ: 404, maxZ: 456 });
	}
	for (const side of [414, 446]) {
		const segs = [[-852, -658], [-622, -498], [-462, -300]];
		for (const s of segs) G.colliders.push({ minX: s[0], maxX: s[1], minZ: side - 2, maxZ: side + 2 });
	}
	scene.add(rails.build(vertexMat()));
}
function buildVegetation(scene) {
	const trunks = new Bucket(), leaves = new Bucket();
	const frond = new THREE.ConeGeometry(0.6, 7, 5), canopy = new THREE.SphereGeometry(1, 7, 6);
	function palm(x, z, s) {
		const lean = rand(-0.7, 0.7);
		trunks.add(new THREE.CylinderGeometry(0.32, 0.45, 8, 6), x + lean, 4, z, { color: 0x8a6a44, rz: lean * 0.09 });
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2;
			leaves.add(frond, x + lean * 2 + Math.cos(a) * 2.6, 8.6, z + Math.sin(a) * 2.6,
				{ sx: s, sy: s, sz: s, color: 0x3f9e4d, rx: Math.sin(a) * 1.15, rz: -Math.cos(a) * 1.15 });
		}
	}
	function tree(x, z, s) {
		trunks.add(new THREE.CylinderGeometry(0.4, 0.55, 3.6, 6), x, 1.8, z, { color: 0x6e4f30 });
		leaves.add(canopy, x, 5.6, z, { sx: 4.6 * s, sy: 3.8 * s, sz: 4.6 * s, color: pick([0x4da653, 0x5cb85e, 0x3f9e4d]) });
		leaves.add(canopy, x + 1.8, 4.6, z + 1, { sx: 3 * s, sy: 2.6 * s, sz: 3 * s, color: 0x55a84f });
	}
	for (let z = -820; z < 830; z += rand(46, 70)) palm(676 + rand(-6, 6), z, rand(0.8, 1.15));
	for (let i = 0; i < 26; i++) palm(rand(-830, -600), rand(-340, 340), rand(0.8, 1.1));
	for (let i = 0; i < 22; i++) palm(rand(-560, -200), rand(-640, -350), rand(0.85, 1.2));
	for (let i = 0; i < 14; i++) tree(80 + rand(-55, 55), -240 + rand(-55, 55), rand(0.9, 1.3));
	for (let i = 0; i < 30; i++) { const x = rand(-560, 560), z = rand(-560, 520); if (Math.abs(x % 160) > 30 && Math.abs(z % 160) > 30) tree(x, z, rand(0.8, 1.2)); }
	const tuft = new THREE.ConeGeometry(0.5, 1.1, 4);
	for (let i = 0; i < 380; i++) {
		const x = rand(-840, 840), z = rand(-840, 840);
		if (Math.abs(x % 160) < 22 || Math.abs(z % 160) < 22 || isAirport(x, z)) continue;
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
	for (const mz of [-300, -140, 20, 180, 330]) {
		if (mz === 20) continue;
		addBuilding(scene, -668 + rand(-16, 16), mz, rand(52, 74), rand(36, 48), rand(9, 15), cafeTex, pick(WINDOW_TINTS));
	}
	G.boats = [];
	const hullCols = [0xe8e4da, 0x2e7fc9, 0xc93a2e, 0xf2b13d, 0x39b5a6];
	for (const pz of PIERS) {
		for (let i = 0; i < 3; i++) {
			const bx = -884 - i * 38, bz = pz + (i % 2 === 0 ? -17 : 17);
			const boat = new THREE.Group();
			const hull = new THREE.Mesh(new THREE.BoxGeometry(13, 2.2, 4.6), lam(pick(hullCols)));
			hull.position.y = 0.4; boat.add(hull);
			const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2, 3.4), lam(0xf4f1e8));
			cabin.position.set(-0.5, 2.4, 0); boat.add(cabin);
			const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 11, 5), lam(0x8a8f94));
			mast.position.set(2.4, 6.4, 0); boat.add(mast);
			const sail = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 7.6),
				new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
			sail.position.set(0.6, 6, 0); sail.rotation.y = Math.PI / 2; boat.add(sail);
			boat.position.set(bx, 0, bz);
			boat.rotation.y = Math.PI / 2 + rand(-0.06, 0.06);
			boat.userData.phase = rand(0, 6);
			scene.add(boat); G.boats.push(boat);
		}
	}
	const lh = new THREE.Group();
	const base = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.6, 15, 10), lam(0xf2efe8));
	base.position.y = 7.5; lh.add(base);
	const band = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 5, 4.4, 10), lam(0xc93a2e));
	band.position.y = 10; lh.add(band);
	const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.4, 8), BM(0xffe9a3));
	lampRoom.position.y = 16.6; lh.add(lampRoom);
	G.lighthouseMat = lampRoom.material;
	lh.position.set(-972, 0, -330);
	scene.add(lh);
	G.colliders.push({ minX: -980, maxX: -964, minZ: -338, maxZ: -322 });
}
function buildAirport(scene) {
	const b = new Bucket();
	b.box(-240, 6, 584, 90, 12, 44, 0x9aa4ac); b.box(60, 6, 584, 90, 12, 44, 0x8b959c);
	b.box(330, 6, 584, 90, 12, 44, 0x9aa4ac);
	b.box(-30, 8, 566, 190, 16, 26, 0xd8dee2);
	for (const hx of [-240, 60, 330]) G.colliders.push({ minX: hx - 45, maxX: hx + 45, minZ: 562, maxZ: 606 });
	G.colliders.push({ minX: -125, maxX: 65, minZ: 553, maxZ: 579 });
	const mesh = b.build(vertexMat()); mesh.castShadow = true; scene.add(mesh);
	const plane = new THREE.Group();
	const white = lam(0xf2f4f6);
	const fus = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 34, 12), white);
	fus.rotation.z = Math.PI / 2; fus.position.y = 4.6; plane.add(fus);
	const nose = new THREE.Mesh(new THREE.SphereGeometry(3.1, 10, 8), white);
	nose.position.set(17, 4.6, 0); plane.add(nose);
	const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 30), lam(0xc93a2e));
	wing.position.set(1, 4.2, 0); plane.add(wing);
	const tail = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 0.6), lam(0xc93a2e));
	tail.position.set(-16.5, 8.6, 0); plane.add(tail);
	const fin = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 9), lam(0xc93a2e));
	fin.position.set(-16.5, 5.4, 0); plane.add(fin);
	for (const s of [-8, 8]) {
		const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 4.6, 8), lam(0x596066));
		eng.rotation.z = Math.PI / 2; eng.position.set(1, 3, s); plane.add(eng);
	}
	plane.position.set(330, 0, 712); plane.rotation.y = 0.04;
	scene.add(plane);
	G.colliders.push({ minX: 310, maxX: 352, minZ: 696, maxZ: 728 });
}
function buildSky(scene) {
	G.sun = new THREE.DirectionalLight(0xffe3b3, 3);
	G.sun.castShadow = true;
	G.sun.shadow.mapSize.set(1024, 1024);
	G.sun.shadow.camera.left = -150; G.sun.shadow.camera.right = 150;
	G.sun.shadow.camera.top = 150; G.sun.shadow.camera.bottom = -150;
	G.sun.shadow.camera.far = 900; G.sun.shadow.bias = -0.0006;
	scene.add(G.sun); scene.add(G.sun.target);
	G.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.9);
	scene.add(G.hemi);
	scene.fog = new THREE.Fog(0xf2c99a, 260, 1500);
	G.clouds = [];
	const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
	for (let i = 0; i < 13; i++) {
		const cl = new THREE.Group();
		for (let j = 0; j < 4; j++) {
			const s = new THREE.Mesh(new THREE.SphereGeometry(rand(9, 20), 7, 6), cm);
			s.position.set(rand(-16, 16), rand(-3, 3), rand(-8, 8));
			s.scale.y = 0.42; cl.add(s);
		}
		cl.position.set(rand(-1000, 1000), rand(120, 175), rand(-1000, 1000));
		scene.add(cl); G.clouds.push(cl);
	}
	const starGeo = new THREE.BufferGeometry();
	const sp = new Float32Array(700 * 3);
	const sr = mulberry32(777);
	for (let i = 0; i < 700; i++) {
		const a = sr() * Math.PI * 2, e = sr() * Math.PI * 0.48 + 0.05, r = 2600;
		sp[i * 3] = Math.cos(a) * Math.cos(e) * r;
		sp[i * 3 + 1] = Math.sin(e) * r;
		sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
	}
	starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
	G.starMat = new THREE.PointsMaterial({ color: 0xdfe9ff, size: 5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
	const stars = new THREE.Points(starGeo, G.starMat);
	scene.add(stars); G.stars = stars;
	G.moon = new THREE.Mesh(new THREE.CircleGeometry(70, 24),
		new THREE.MeshBasicMaterial({ color: 0xf4f7ff, transparent: true, opacity: 0, fog: false }));
	scene.add(G.moon);
}
function buildRain(scene) {
	const N = 850;
	const geo = new THREE.BufferGeometry();
	const p = new Float32Array(N * 3);
	const rr = mulberry32(4242);
	for (let i = 0; i < N; i++) { p[i * 3] = (rr() - 0.5) * 110; p[i * 3 + 1] = rr() * 60; p[i * 3 + 2] = (rr() - 0.5) * 110; }
	geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
	const rcv = document.createElement("canvas"); rcv.width = 16; rcv.height = 64;
	const rc = rcv.getContext("2d");
	const grad = rc.createLinearGradient(0, 0, 0, 64);
	grad.addColorStop(0, "rgba(170,204,238,0)");
	grad.addColorStop(0.5, "rgba(170,204,238,0.85)");
	grad.addColorStop(1, "rgba(170,204,238,0)");
	rc.fillStyle = grad; rc.fillRect(6, 0, 4, 64);
	const rtex = new THREE.CanvasTexture(rcv);
	G.rainMat = new THREE.PointsMaterial({ color: 0xaaccee, size: 1.9, map: rtex, transparent: true, opacity: 0, depthWrite: false });
	G.rain = new THREE.Points(geo, G.rainMat);
	G.rain.visible = false;
	scene.add(G.rain);
}
const SKY_KEYS = [
	[0, 0x0b1026, 0x0b1026, 0x223, 0, 0.3, 1],
	[5.5, 0x1a2340, 0x1a2340, 0x334, 0.1, 0.36, 0.9],
	[7, 0xffb37a, 0xffc490, 0xffb37a, 1.6, 0.55, 0.25],
	[10, 0x7ec8e3, 0xbfe0ea, 0xfff2d8, 3, 0.95, 0],
	[16, 0x86cde8, 0xc4e2ec, 0xfff0d0, 3, 0.95, 0],
	[17.8, 0xffc478, 0xf7c489, 0xffbe78, 2.6, 0.92, 0],
	[19.3, 0x8a5f8e, 0x9a6f8a, 0xff9a5c, 1.2, 0.58, 0.35],
	[20.6, 0x27335e, 0x27335e, 0x445, 0.15, 0.4, 0.85],
	[24, 0x0b1026, 0x0b1026, 0x223, 0, 0.3, 1],
];
function skyAt(h) {
	const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
	for (let i = 0; i < SKY_KEYS.length - 1; i++) {
		const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
		if (h >= a[0] && h <= b[0]) {
			const t = (h - a[0]) / Math.max(0.001, b[0] - a[0]);
			return {
				sky: mix(a[1], b[1], t), fog: mix(a[2], b[2], t), sun: mix(a[3], b[3], t),
				sunI: lerp(a[4], b[4], t), hemiI: lerp(a[5], b[5], t), night: lerp(a[6], b[6], t),
			};
		}
	}
	const a = SKY_KEYS[0];
	return { sky: new THREE.Color(a[1]), fog: new THREE.Color(a[2]), sun: new THREE.Color(a[3]), sunI: a[4], hemiI: a[5], night: a[6] };
}
function updateSkyAndWeather(dt) {
	if (!G.stage) { G.hour += dt * (24 / 720); if (G.hour >= 24) G.hour -= 24; }
	const sk = skyAt(G.hour);
	G.night = sk.night;
	G.scene.background = sk.sky;
	G.scene.fog.color.copy(sk.fog);
	if (G.weather === "hot") G.scene.fog.near = 200, G.scene.fog.far = 1050;
	else G.scene.fog.near = 280, G.scene.fog.far = 1550;
	const sunAng = ((G.hour - 6) / 12) * Math.PI;
	const focus = G.vehicle && !G.onFoot ? G.vehicle.mesh.position : (G.player ? G.player.mesh.position : new THREE.Vector3());
	G.sun.position.set(focus.x + Math.cos(sunAng) * 260, Math.max(95, Math.sin(sunAng) * 300), focus.z + 120);
	G.sun.target.position.set(focus.x, 0, focus.z);
	G.sun.intensity = sk.sunI; G.sun.color.copy(sk.sun);
	G.hemi.intensity = sk.hemiI;
	G.starMat.opacity = sk.night * 0.95;
	G.stars.position.set(focus.x, 0, focus.z);
	const moonAng = sunAng + Math.PI;
	G.moon.position.set(focus.x + Math.cos(moonAng) * 2200, Math.max(60, Math.sin(moonAng + 0.4) * 1500 + 300), focus.z - 1400);
	G.moon.lookAt(G.camera.position);
	G.moon.material.opacity = sk.night;
	G.lampMat.color.setHex(0xffe6a3).multiplyScalar(0.35 + sk.night * 1.5);
	G.lighthouseMat.color.setHex(0xffe9a3).multiplyScalar(0.4 + sk.night * 1.6);
	if (G.clubSignMat) G.clubSignMat.color.setHex(0xff4fa3).multiplyScalar(0.55 + sk.night * 1.3);
	for (const cl of G.clouds) { cl.position.x += dt * 2.2; if (cl.position.x > 1150) cl.position.x = -1150; }
	for (const b of G.boats) {
		b.position.y = Math.sin(G.time * 0.9 + b.userData.phase) * 0.22;
		b.rotation.z = Math.sin(G.time * 0.7 + b.userData.phase) * 0.03;
	}
	G.weatherTimer -= dt;
	if (G.weatherTimer <= 0 && !G.stage) {
		const roll = rng();
		G.weather = roll < 0.45 ? "clear" : (roll < 0.72 ? "hot" : "rain");
		G.weatherTimer = rand(45, 95);
		if (G.weather === "rain") showToast("Rain front rolling in off the bay");
		else if (G.weather === "hot") showToast("Heat haze over Coral Bay");
	}
	const raining = G.weather === "rain";
	G.rain.visible = raining;
	if (raining) {
		G.rainMat.opacity = Math.min(0.5, G.rainMat.opacity + dt * 0.5);
		G.rain.position.set(focus.x, 0, focus.z);
		const arr = G.rain.geometry.attributes.position.array;
		for (let i = 0; i < arr.length; i += 3) {
			arr[i + 1] -= dt * 55;
			if (arr[i + 1] < 0) { arr[i + 1] = 55; arr[i] = (rng() - 0.5) * 110; arr[i + 2] = (rng() - 0.5) * 110; }
		}
		G.rain.geometry.attributes.position.needsUpdate = true;
		G.groundMat.shininess = 90; G.groundMat.specular.setHex(0x666666);
	} else {
		G.rainMat.opacity = Math.max(0, G.rainMat.opacity - dt * 0.5);
		G.groundMat.shininess = 0; G.groundMat.specular.setHex(0x222222);
	}
}
