// city.js — builds Coral Bay from the layout in defs.js: painted ground
// (the same painting feeds the minimap), buildings, palms and canopy trees,
// the marina, the sky rig (sun, moon, stars, clouds), the weather machine
// with its pooled rain, and the gulls over the water.
import { CITY, G, clamp, lerp, mulberry, districtAt, SAND_Z, SEA_Z } from './defs.js';

const W2P = (S) => S / 512; // world [-256,256] -> canvas px scale
function wpx(S, wx) { return (wx + 256) * W2P(S); }

// Paints the whole city top-down into a 2D context of size S. Used at 1024
// for the ground texture and at 512 for the minimap base: one drawing, two
// scales, so the map can never disagree with the streets.
export function paintGround(ctx, S) {
  const u = W2P(S);
  const X = (wx) => wpx(S, wx), Z = (wz) => wpx(S, wz);
  ctx.fillStyle = '#2b6f8e'; ctx.fillRect(0, 0, S, S); // sea
  ctx.fillStyle = '#3590b0';
  for (let i = 0; i < 26; i++) { // lazy wave sparkle in the basin
    ctx.fillRect(((i * 173) % 512) * u, ((i * 269) % 512) * u, 14 * u, 2 * u);
  }
  // Land slab with per-district ground tint.
  const groundTone = { downtown: '#8d8d94', midtown: '#a49a8a', boardwalk: '#b8a888', beach: '#c9b18c', suburb: '#7fae62', industrial: '#97907f', airport: '#8f9296' };
  for (const b of CITY.blocks) {
    ctx.fillStyle = b.park ? '#69a854' : groundTone[b.district];
    ctx.fillRect(X(b.x - 28), Z(b.z - 28), 56 * u, 56 * u);
  }
  ctx.fillStyle = '#7fae62'; ctx.fillRect(X(-190), Z(-190), 380 * u, 340 * u); // rim grass under blocks? no: repaint order fix below
  for (const b of CITY.blocks) {
    ctx.fillStyle = b.park ? '#69a854' : groundTone[b.district];
    ctx.fillRect(X(b.x - 21), Z(b.z - 21), 42 * u, 42 * u);
    if (b.park) { // park paths
      ctx.fillStyle = '#cbb98f';
      ctx.fillRect(X(b.x - 21), Z(b.z - 1.5), 42 * u, 3 * u);
      ctx.fillRect(X(b.x - 1.5), Z(b.z - 21), 3 * u, 42 * u);
    }
  }
  // Roads: asphalt bands between blocks, then dashed lane lines.
  ctx.fillStyle = '#4a4a52';
  for (let c = -168; c <= 168; c += 56) {
    ctx.fillRect(X(c - 7), Z(-190), 14 * u, 340 * u);
    ctx.fillRect(X(-190), Z(c - 7), 380 * u, 14 * u);
  }
  ctx.strokeStyle = '#e8e4d2'; ctx.lineWidth = Math.max(1, 0.5 * u); ctx.setLineDash([4 * u, 5 * u]);
  for (let c = -168; c <= 168; c += 56) {
    ctx.beginPath(); ctx.moveTo(X(c), Z(-190)); ctx.lineTo(X(c), Z(150)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(-190), Z(c)); ctx.lineTo(X(190), Z(c)); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Airport runway along the north edge.
  ctx.fillStyle = '#3f4046'; ctx.fillRect(X(-186), Z(-186), 226 * u, 22 * u);
  ctx.fillStyle = '#f2f2f2';
  for (let x = -182; x < 32; x += 16) ctx.fillRect(X(x), Z(-176), 8 * u, 2 * u);
  ctx.fillRect(X(-186), Z(-186), 10 * u, 22 * u); ctx.fillRect(X(30), Z(-186), 10 * u, 22 * u);
  // Marina quay + beach sand + foam line.
  ctx.fillStyle = '#b0a58e'; ctx.fillRect(X(-196), Z(-190), 8 * u, 340 * u);
  ctx.fillStyle = '#eed9a4'; ctx.fillRect(X(-196), Z(SAND_Z), 396 * u, (SEA_Z - SAND_Z) * u);
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(X(-196), Z(SEA_Z - 1.5), 396 * u, 2.4 * u);
  ctx.fillRect(X(-197), Z(-190), 2.4 * u, 340 * u);
  // Buildings as footprints (this is what the minimap shows as masses).
  for (const b of CITY.buildings) {
    ctx.fillStyle = b.district === 'downtown' ? '#5d6d7d' : b.district === 'suburb' ? '#8a7a5f' : '#6d6d75';
    ctx.fillRect(X(b.x - b.w / 2), Z(b.z - b.d / 2), b.w * u, b.d * u);
  }
}

let sun, hemi, stars, moon, moonGlow, groundMat, rain, rainPos, clouds = [], gulls = [];
let skyTop, skyBot;
const RAIN_N = 380;
const rainVel = new Float32Array(RAIN_N * 2);
const _c1 = new THREE.Color(), _c2 = new THREE.Color();

function windowTexture(rnd, warm) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#cfd4d8'; c.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 10) for (let x = 5; x < 58; x += 11) {
    const lit = rnd() < 0.34;
    c.fillStyle = lit ? (warm ? '#ffd98a' : '#ffe9b0') : '#54626e';
    c.fillRect(x, y, 7, 6);
  }
  const t = new THREE.CanvasTexture(cv);
  return t;
}
function frondTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 128, 128);
  c.strokeStyle = '#3f7d33'; c.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2, ex = 64 + Math.cos(a) * 58, ey = 64 + Math.sin(a) * 46 + 12;
    c.lineWidth = 5; c.beginPath(); c.moveTo(64, 70);
    c.quadraticCurveTo(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 22 - 8, ex, ey); c.stroke();
    c.lineWidth = 2.4; c.strokeStyle = '#55a047';
    c.beginPath(); c.moveTo(64, 70); c.quadraticCurveTo(64 + Math.cos(a) * 34, 64 + Math.sin(a) * 26 - 4, ex, ey + 4); c.stroke();
    c.strokeStyle = '#3f7d33';
  }
  const t = new THREE.CanvasTexture(cv);
  return t;
}
function adTexture(lines, bg, fg) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, 256, 128);
  c.fillStyle = fg; c.textAlign = 'center'; c.font = 'bold 34px sans-serif';
  lines.forEach((ln, i) => c.fillText(ln, 128, 52 + i * 38));
  return new THREE.CanvasTexture(cv);
}

export function buildWorld(scene) {
  const rnd = mulberry(777);
  // --- ground & sea
  const gc = document.createElement('canvas'); gc.width = gc.height = 1024;
  paintGround(gc.getContext('2d'), 1024);
  const gtex = new THREE.CanvasTexture(gc);
  groundMat = new THREE.MeshPhongMaterial({ map: gtex, shininess: 0, specular: new THREE.Color(0x222222) });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(512, 512), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshPhongMaterial({ color: 0x2b6f8e, shininess: 90, specular: new THREE.Color(0x99ccee) }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.55;
  scene.add(sea);
  // --- buildings
  const winTex = [windowTexture(rnd, true), windowTexture(rnd, false), windowTexture(rnd, true)];
  const mats = {};
  const matFor = (tone, ti) => {
    const k = tone + ':' + ti;
    if (!mats[k]) mats[k] = new THREE.MeshLambertMaterial({ map: winTex[ti], color: tone });
    return mats[k];
  };
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4c4640 });
  const pitchMat = new THREE.MeshLambertMaterial({ color: 0xa5503c });
  const plainMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (let bi = 0; bi < CITY.buildings.length; bi++) {
    const b = CITY.buildings[bi];
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), b.roof === 'pitch' || b.roof === 'hangar' ? new THREE.MeshLambertMaterial({ color: b.tone }) : matFor(b.tone, bi % 3));
    body.position.y = b.h / 2; body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    if (b.roof === 'pitch') {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(b.w, b.d) * 0.74, b.h * 0.55, 4), pitchMat);
      roof.position.y = b.h + b.h * 0.27; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
      g.add(roof);
    } else if (b.roof === 'hangar') {
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(b.d / 2, b.d / 2, b.w, 10, 1, false, 0, Math.PI), roofMat);
      roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2;
      roof.position.y = b.h; roof.castShadow = true;
      g.add(roof);
    } else {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.5, 0.5, b.d + 0.5), roofMat);
      cap.position.y = b.h + 0.25; g.add(cap);
      if (b.h > 20) { // rooftop box + blinking beacon on towers
        const hut = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), plainMat);
        hut.position.y = b.h + 1.2; g.add(hut);
      }
    }
    g.position.set(b.x, 0, b.z);
    scene.add(g);
  }
  // --- vegetation (instanced): palm trunks + crowns, canopy trunks + blobs
  const palms = CITY.trees.filter((t) => t.kind === 'palm');
  const canopies = CITY.trees.filter((t) => t.kind === 'canopy');
  const dummy = new THREE.Object3D();
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 5.6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
  const palmTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palms.length);
  const crownGeo = new THREE.PlaneGeometry(6.4, 6.4);
  const crownMat = new THREE.MeshLambertMaterial({ map: frondTexture(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palms.length * 2);
  palms.forEach((t, i) => {
    const lean = (rnd() - 0.5) * 0.22, la = rnd() * Math.PI * 2;
    dummy.position.set(t.x, 2.8 * t.s, t.z);
    dummy.rotation.set(Math.cos(la) * lean, 0, Math.sin(la) * lean);
    dummy.scale.setScalar(t.s); dummy.updateMatrix();
    palmTrunks.setMatrixAt(i, dummy.matrix);
    const tx = t.x + Math.sin(la) * lean * 4.4 * t.s, tz = t.z + Math.cos(la) * lean * 4.4 * t.s;
    dummy.position.set(tx, 5.7 * t.s, tz); dummy.rotation.set(-Math.PI / 2 + 0.5, 0, rnd() * 3);
    dummy.updateMatrix(); crowns.setMatrixAt(i * 2, dummy.matrix);
    dummy.rotation.set(-Math.PI / 2 - 0.4, 0.6, rnd() * 3); dummy.updateMatrix();
    crowns.setMatrixAt(i * 2 + 1, dummy.matrix);
  });
  palmTrunks.castShadow = true;
  scene.add(palmTrunks); scene.add(crowns);
  const cTrunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6);
  const cTrunks = new THREE.InstancedMesh(cTrunkGeo, trunkMat, canopies.length);
  const blobGeo = new THREE.IcosahedronGeometry(2.5, 1);
  const blobMat = new THREE.MeshLambertMaterial({ color: 0x4d8a3f });
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, canopies.length);
  canopies.forEach((t, i) => {
    dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(t.s);
    dummy.position.set(t.x, 1.2 * t.s, t.z); dummy.updateMatrix();
    cTrunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, (2.4 + 1.6) * t.s, t.z); dummy.scale.set(t.s, t.s * 0.82, t.s); dummy.updateMatrix();
    blobs.setMatrixAt(i, dummy.matrix);
  });
  blobs.castShadow = true;
  scene.add(cTrunks); scene.add(blobs);
  // --- lamps (instanced) + downtown planters and bins
  const lampGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x3c4148 });
  const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, CITY.lamps.length);
  const bulbGeo = new THREE.SphereGeometry(0.32, 6, 5);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
  const bulbMesh = new THREE.InstancedMesh(bulbGeo, bulbMat, CITY.lamps.length);
  CITY.lamps.forEach((l, i) => {
    dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
    dummy.position.set(l.x, 2.7, l.z); dummy.updateMatrix(); lampMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(l.x, 5.5, l.z); dummy.updateMatrix(); bulbMesh.setMatrixAt(i, dummy.matrix);
  });
  scene.add(lampMesh); scene.add(bulbMesh);
  // --- marina: piers, posts, moored boats
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x9a7c55 });
  const hullCols = [0xe8e2d4, 0xc8553d, 0x3d7ea6, 0xf2b544, 0x7fb069, 0xe8e2d4];
  DOCK_ZS.forEach((dz, di) => {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(48, 0.35, 4.6), woodMat);
    pier.position.set(-214, 0.18, dz); pier.receiveShadow = true; scene.add(pier);
    for (let px = -234; px <= -196; px += 9) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 6), woodMat);
      post.position.set(px, -0.3, dz + 2.1); scene.add(post);
    }
    for (let bn = 0; bn < 2; bn++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.1, 2.2), new THREE.MeshLambertMaterial({ color: hullCols[(di * 2 + bn) % hullCols.length] }));
      hull.position.y = 0.35; boat.add(hull);
      const bow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 4), hull.material);
      bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(4.1, 0.35, 0); bow.scale.set(1, 1, 0.9); boat.add(bow);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.4, 5), woodMat);
      mast.position.y = 3.2; boat.add(mast);
      if (bn === 0) {
        const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.6), new THREE.MeshLambertMaterial({ color: 0xf7f3e8, side: THREE.DoubleSide }));
        sail.position.set(1.1, 3.1, 0.05); boat.add(sail);
      }
      boat.position.set(-224 + bn * 16, -0.15, dz + (bn ? 4.4 : -4.4));
      boat.rotation.y = bn ? 0.06 : -0.05;
      scene.add(boat);
    }
  });
  // --- beach umbrellas
  const umbCols = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0xf78c6b];
  for (let i = 0; i < 11; i++) {
    const ux = -160 + i * 30 + rnd() * 8, uz = 160 + (i % 3) * 7;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), woodMat);
    pole.position.set(ux, 1.2, uz); scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8), new THREE.MeshLambertMaterial({ color: umbCols[i % umbCols.length] }));
    top.position.set(ux, 2.5, uz); top.castShadow = true; scene.add(top);
  }
  // --- billboards downtown
  const ads = [
    { p: [-66, -66], t: ['CORAL', 'BAY'], bg: '#123c4c', fg: '#ffd166' },
    { p: [66, 10], t: ['MARLIN', 'BIKES'], bg: '#7a1f2b', fg: '#ffe8d6' },
    { p: [-10, 66], t: ['CAFE', 'SOL'], bg: '#e07a2f', fg: '#fff6ea' },
    { p: [122, -66], t: ['AERO', 'CORAL'], bg: '#274156', fg: '#a8dadc' },
  ];
  for (const ad of ads) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 11, 6), lampMat);
    pole.position.y = 5.5; g.add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(9, 4.4, 0.3), new THREE.MeshLambertMaterial({ map: adTexture(ad.t, ad.bg, ad.fg) }));
    board.position.y = 12; board.castShadow = true; g.add(board);
    g.position.set(ad.p[0], 0, ad.p[1]);
    g.rotation.y = rnd() * Math.PI;
    scene.add(g);
  }
  // --- a parked airliner at the airport
  const plane = new THREE.Group();
  const pMat = new THREE.MeshLambertMaterial({ color: 0xeef1f4 });
  const pAccent = new THREE.MeshLambertMaterial({ color: 0x118ab2 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 17, 10), pMat);
  fus.rotation.z = Math.PI / 2; fus.position.y = 3.1; plane.add(fus);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), pMat);
  nose.position.set(8.5, 3.1, 0); plane.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 13), pAccent);
  wing.position.set(0.5, 2.8, 0); plane.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 0.2), pAccent);
  tail.position.set(-8.2, 5, 0); plane.add(tail);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.5, 3.5), pAccent);
  stripe.position.y = 3.5; plane.add(stripe);
  plane.position.set(-120, 0, -176); plane.rotation.y = 0.12;
  plane.traverse((o) => { o.castShadow = true; });
  scene.add(plane);
  buildSky(scene);
  buildRain(scene);
  buildGulls(scene);
}

export const DOCK_ZS = [-120, -40, 40, 120];
// Where a walker or car may be: the land slab, the quay, or on a pier.
export function groundOk(x, z) {
  if (x >= -196 && x <= 190 && z >= -192 && z <= 184) return true;
  for (const dz of DOCK_ZS) if (x >= -238 && x < -196 && Math.abs(z - dz) <= 2.6) return true;
  return false;
}

function buildSky(scene) {
  hemi = new THREE.HemisphereLight(0xffe0b8, 0x51606e, 0.75);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffd9a0, 1.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  skyTop = new THREE.Color(); skyBot = new THREE.Color();
  // Stars on a dome.
  const n = 380, pos = new Float32Array(n * 3), r = mulberry(42);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, e = Math.acos(r() * 0.95);
    pos[i * 3] = Math.cos(a) * Math.sin(e) * 760;
    pos[i * 3 + 1] = Math.cos(e) * 760 + 10;
    pos[i * 3 + 2] = Math.sin(a) * Math.sin(e) * 760;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  scene.add(stars);
  moon = new THREE.Mesh(new THREE.CircleGeometry(26, 24), new THREE.MeshBasicMaterial({ color: 0xf4f1de, transparent: true, opacity: 0, fog: false }));
  scene.add(moon);
  const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128;
  const g2 = glowCv.getContext('2d');
  const grad = g2.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, 'rgba(240,240,220,0.55)'); grad.addColorStop(1, 'rgba(240,240,220,0)');
  g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
  moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCv), transparent: true, opacity: 0, fog: false, depthWrite: false }));
  moonGlow.scale.setScalar(150);
  scene.add(moonGlow);
  // Clouds: puffy flattened sphere clusters, drifting slowly east.
  const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
  const cr = mulberry(99);
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const puffs = 3 + Math.floor(cr() * 3);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(4 + cr() * 5, 8, 6), cm);
      s.position.set(p * 5 - puffs * 2.4, cr() * 1.6, cr() * 4 - 2);
      s.scale.y = 0.45;
      g.add(s);
    }
    g.position.set(-320 + cr() * 640, 74 + cr() * 26, -300 + cr() * 560);
    clouds.push(g); scene.add(g);
  }
}

function buildRain(scene) {
  rainPos = new Float32Array(RAIN_N * 6);
  for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 6] = (Math.random() - 0.5) * 76;
    rainPos[i * 6 + 1] = Math.random() * 40;
    rainPos[i * 6 + 2] = (Math.random() - 0.5) * 76;
    rainVel[i * 2] = 36 + Math.random() * 14;
    rainVel[i * 2 + 1] = Math.random() * Math.PI * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaec6e8, transparent: true, opacity: 0 }));
  rain.frustumCulled = false;
  scene.add(rain);
}

function buildGulls(scene) {
  const bodyGeo = new THREE.ConeGeometry(0.16, 1.05, 5);
  const wingGeo = new THREE.PlaneGeometry(1.5, 0.42);
  const mat = new THREE.MeshLambertMaterial({ color: 0xf4f6f8, side: THREE.DoubleSide });
  const centers = [[-218, 25, -42], [-214, 28, 44], [30, 23, 168], [110, 21, 164], [-60, 24, 170]];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, mat);
    body.rotation.x = Math.PI / 2; g.add(body);
    const wl = new THREE.Mesh(wingGeo, mat); wl.position.x = -0.75; g.add(wl);
    const wr = new THREE.Mesh(wingGeo, mat); wr.position.x = 0.75; g.add(wr);
    const c = centers[i % centers.length];
    gulls.push({ g, wl, wr, cx: c[0], cy: c[1], cz: c[2], r: 12 + (i % 5) * 5, sp: 0.25 + (i % 4) * 0.07, ph: i * 1.7 });
    scene.add(g);
  }
}

// Per-frame sky, weather, rain and gull update. focus = camera focus point
// (rain volume follows it). darkness is returned for other modules' lights.
let darkness = 0;
export function updateSky(dt, focus) {
  // Day cycle: dayT creeps forward; the last stretch deepens into dusk with
  // stars and moon, then wraps back to morning gold.
  if (!G.forceDay) G.dayT = (G.dayT + dt / 520) % 1;
  const t = G.dayT;
  darkness = clamp((Math.sin((t - 0.55) * Math.PI * 2) * 0.5 + 0.5 - 0.28) * 2.4, 0, 1) * (t > 0.5 ? 1 : 0.25);
  const sunA = lerp(-0.5, Math.PI + 0.6, t); // azimuth sweep
  const sunE = Math.max(0.06, Math.sin(t * Math.PI) * 0.85) * (1 - darkness * 0.55);
  const sx = Math.cos(sunA) * Math.cos(sunE), sy = Math.sin(sunE), sz = Math.sin(sunA) * Math.cos(sunE);
  sun.position.set(focus.x + sx * 180, sy * 180 + 24, focus.z + sz * 180);
  sun.target.position.copy(focus);
  _c1.setHex(0xffd9a0).lerp(_c2.setHex(0xff8a52), darkness);
  sun.color.copy(_c1);
  sun.intensity = lerp(1.3, 0.55, darkness);
  hemi.intensity = lerp(0.8, 0.34, darkness);
  stars.material.opacity = darkness * 0.95;
  stars.position.set(focus.x, 0, focus.z);
  const ma = sunA + Math.PI; // moon rides opposite the sun
  moon.position.set(focus.x + Math.cos(ma) * 700, 210 + darkness * 160, focus.z + Math.sin(ma) * 700);
  moon.lookAt(focus.x, 60, focus.z);
  moon.material.opacity = darkness;
  moonGlow.position.copy(moon.position);
  moonGlow.material.opacity = darkness * 0.8;
  for (const c of clouds) {
    c.position.x += dt * 1.1;
    if (c.position.x > 360) c.position.x = -360;
    c.position.x += focus.x * 0; // clouds live in world space; no follow needed
  }
  // Weather machine (game-time driven; staging may pin it).
  if (G.forceWeather) {
    G.weather = G.forceWeather;
  } else {
    G.weatherT -= dt;
    if (G.weatherT <= 0) {
      if (G.weather === 'clear') { G.weather = 'cloudy'; G.weatherT = 16 + Math.random() * 10; }
      else if (G.weather === 'cloudy' && Math.random() < 0.65) { G.weather = 'rain'; G.weatherT = 24 + Math.random() * 22; }
      else if (G.weather === 'rain') { G.weather = 'cloudy'; G.weatherT = 12 + Math.random() * 8; }
      else { G.weather = 'clear'; G.weatherT = 42 + Math.random() * 45; }
    }
  }
  const wetTarget = G.weather === 'rain' ? 1 : G.weather === 'cloudy' ? 0.22 : 0;
  G.wet = clamp(G.wet + (wetTarget - G.wet) * dt * 0.12, 0, 1);
  if (groundMat) {
    groundMat.shininess = lerp(2, 85, G.wet);
    const d = 1 - G.wet * 0.22;
    groundMat.color.setRGB(d, d, d);
  }
  // Rain streaks around the focus point.
  const show = G.wet > 0.04;
  rain.visible = show;
  if (show) {
    rain.material.opacity = 0.5 * G.wet;
    const fall = 34 + G.wet * 16;
    for (let i = 0; i < RAIN_N; i++) {
      let y = rainPos[i * 6 + 1] - fall * dt * (rainVel[i * 2] / 40);
      let x = rainPos[i * 6], z = rainPos[i * 6 + 2];
      if (y < 0) {
        y = 34 + Math.random() * 6;
        x = focus.x + (Math.random() - 0.5) * 76;
        z = focus.z + (Math.random() - 0.5) * 76;
      } else if (Math.abs(x - focus.x) > 44 || Math.abs(z - focus.z) > 44) {
        x = focus.x + (Math.random() - 0.5) * 76;
        z = focus.z + (Math.random() - 0.5) * 76;
        y = 20 + Math.random() * 18;
      }
      rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
      rainPos[i * 6 + 3] = x + 0.35; rainPos[i * 6 + 4] = y + 1.15; rainPos[i * 6 + 5] = z;
    }
    rain.geometry.attributes.position.needsUpdate = true;
  }
  // Gulls circle the marina and the beach, wings flapping.
  for (const gu of gulls) {
    const a = G.time * gu.sp + gu.ph;
    gu.g.position.set(gu.cx + Math.cos(a) * gu.r, gu.cy + Math.sin(G.time * 0.8 + gu.ph) * 1.8, gu.cz + Math.sin(a) * gu.r);
    gu.g.rotation.y = -a - Math.PI / 2 + Math.PI;
    const flap = Math.sin(G.time * 9 + gu.ph * 3) * 0.65;
    gu.wl.rotation.z = flap; gu.wr.rotation.z = -flap;
    gu.g.rotation.z = 0.3;
  }
  return darkness;
}
export function getDarkness() { return darkness; }
