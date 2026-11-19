// Coral Bay itself: a sun-soaked coastal grid city built procedurally — pastel
// districts, a marina with a pier and boats, a beach lined with palms, street
// lights, landmark buildings with signs, and the collision boxes every other
// system walks and drives against. Deterministic from the seeded rand it is
// handed, so screenshot scenes always show the same city.
const THREE = window.THREE;
import { mulberry32, randRange, randPick, mergeParts, boxGeo, cylGeo, sphGeo, coneGeo, vertexColorMaterial, canvasTexture, textSprite } from './util.js';

export const STREET_LINES = [-168, -112, -56, 0, 56, 112, 168];
export const ROAD_HALF = 7;              // asphalt half width
export const BLOCK_CENTERS = [-140, -84, -28, 28, 84, 140];
export const BEACH_Z = 198;              // sand starts here
export const WATER_Z = 226;              // open water starts here
export const PIER_X = -140, PIER_END_Z = 282;

export const LANDMARKS = {
  marina:   { x: PIER_X, z: 206, label: 'MARINA' },
  hotel:    { x: 28, z: 177, label: 'PALMS HOTEL' },
  chopShop: { x: -177, z: -84, label: 'MARROW AUTO WORKS' },
  safehouse:{ x: 177, z: -28, label: 'SAFEHOUSE' },
  hospital: { x: -28, z: -177, label: 'ST. ALBA HOSPITAL' },
  police:   { x: 62, z: 62, label: 'CBPD' },
  race:     { x: 9, z: 9, label: 'DOWNTOWN' },
  garage:   { x: -120, z: 177, label: 'DOCKS GARAGE' },
};

export function isOnRoad(x, z) {
  for (const l of STREET_LINES) if (Math.abs(x - l) <= ROAD_HALF + 1 || Math.abs(z - l) <= ROAD_HALF + 1) return true;
  return false;
}
export function walkable(x, z) {
  if (x < -216 || x > 216 || z < -216) return false;
  if (z > WATER_Z - 2) return Math.abs(x - PIER_X) < 4.2 && z < PIER_END_Z; // the pier
  return true;
}
// Push a circle (entity position object with x/z) out of every building box.
export function resolveCollisions(pos, radius, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.x1, Math.min(pos.x, c.x2));
    const nz = Math.max(c.z1, Math.min(pos.z, c.z2));
    let dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 1e-6) { pos.x = c.x2 + radius; continue; }
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    }
  }
}

// One facade style per district: window grid, wall and glass colours differ,
// and at golden hour a fifth of the windows burn warm — the lit fraction is
// what sells the hour on a shrunken screenshot.
function facadeTexture(rand, { base, win, cols, rows }) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const lit = rand() < 0.2;
      g.fillStyle = lit ? '#ffe9a8' : win;
      g.fillRect(i * cw + 4, j * ch + 5, cw - 8, ch - 10);
    }
    g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(0, h - 10, w, 10);
  }, true);
}

function buildingMesh(w, h, d, tex, tint) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const s = Math.max(w, d) / 5.6, t = h / 5.6;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * t);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, color: tint }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

export function buildCity(scene, rand) {
  const colliders = [];
  const statics = [];   // merged vertex-coloured parts: palms, lights, pier, boats…
  const updaters = [];

  /* ----- sky, light, fog ----- */
  const skyTex = canvasTexture(4, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#17457e'); gr.addColorStop(0.34, '#4f96d6');
    gr.addColorStop(0.58, '#f2b879'); gr.addColorStop(0.8, '#ff9a5c'); gr.addColorStop(1, '#ff7e47');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xf7a56b, 210, 640);
  scene.add(new THREE.HemisphereLight(0x9fd0f0, 0xe08a4e, 0.62));
  const sun = new THREE.DirectionalLight(0xffab5e, 1.85);
  sun.position.set(-190, 130, 150);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -250; sun.shadow.camera.right = 250;
  sun.shadow.camera.top = 250; sun.shadow.camera.bottom = -250;
  sun.shadow.camera.far = 700; sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTexture(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(0.35, 'rgba(255,190,110,0.85)'); r.addColorStop(1, 'rgba(255,160,80,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    }), transparent: true, depthWrite: false, fog: false,
  }));
  sunSprite.scale.set(150, 150, 1); sunSprite.position.set(-330, 120, 260);
  scene.add(sunSprite);
  const cloudTex = canvasTexture(256, 128, (g) => {
    g.clearRect(0, 0, 256, 128);
    for (const [x, y, r] of [[70, 80, 42], [128, 66, 52], [186, 80, 40], [105, 88, 36], [155, 90, 34]]) {
      const gr = g.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    s.scale.set(randRange(rand, 90, 150), randRange(rand, 34, 52), 1);
    s.position.set(randRange(rand, -380, 380), randRange(rand, 95, 140), randRange(rand, -320, 320));
    scene.add(s); clouds.push(s);
  }
  updaters.push((dt) => { for (const c of clouds) { c.position.x += dt * 1.1; if (c.position.x > 420) c.position.x = -420; } });

  /* ----- ground: city slab, beach, sea ----- */
  const noiseTex = (base, fleck) => canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = fleck;
    for (let i = 0; i < 500; i++) g.fillRect(rand() * w, rand() * h, 2, 2);
  }, true);
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(470, 436), new THREE.MeshLambertMaterial({ map: noiseTex('#b3a58c', 'rgba(0,0,0,0.05)') }));
  slab.material.map.repeat.set(24, 22);
  slab.rotation.x = -Math.PI / 2; slab.position.set(0, 0, -8); slab.receiveShadow = true;
  scene.add(slab);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(470, 34), new THREE.MeshLambertMaterial({ map: noiseTex('#eed49e', 'rgba(160,120,60,0.15)') }));
  sand.material.map.repeat.set(24, 2);
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, BEACH_Z + 15); sand.receiveShadow = true;
  scene.add(sand);
  const waterTex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#17708a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(160,230,240,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 9; i++) { g.beginPath(); const y = rand() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 5, w * 0.6, y - 5, w, y); g.stroke(); }
  }, true);
  waterTex.repeat.set(30, 14);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(560, 260), new THREE.MeshPhongMaterial({ map: waterTex, color: 0x9fd8e8, shininess: 160, specular: 0xd8f4ff, emissive: 0x0d3542, transparent: true, opacity: 0.94 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.35, WATER_Z + 128);
  scene.add(water);
  updaters.push((dt, t) => {
    waterTex.offset.y = (t * 0.014) % 1; waterTex.offset.x = Math.sin(t * 0.05) * 0.02;
    water.material.opacity = 0.92 + Math.sin(t * 0.8) * 0.03;   // the surface breathes and glints
  });

  /* ----- roads & sidewalks ----- */
  const asphaltTex = canvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = '#3d4148'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (let i = 0; i < 90; i++) g.fillRect(rand() * w, rand() * h, 2, 2);
    g.fillStyle = '#f5d76e'; g.fillRect(w / 2 - 2, 8, 4, 42); g.fillRect(w / 2 - 2, 78, 4, 42);
  }, true);
  const roadMat = new THREE.MeshLambertMaterial({ map: asphaltTex });
  const walkTex = noiseTex('#d3c2a0', 'rgba(120,95,60,0.18)');
  walkTex.repeat.set(2, 44);
  const walkMat = new THREE.MeshLambertMaterial({ map: walkTex });
  for (const l of STREET_LINES) {
    for (const vertical of [true, false]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(20, 452), walkMat);
      walk.rotation.x = -Math.PI / 2; if (!vertical) walk.rotation.z = Math.PI / 2;
      walk.position.set(vertical ? l : 0, 0.04, vertical ? 0 : l); walk.receiveShadow = true; scene.add(walk);
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 452), roadMat.clone());
      road.material.map = asphaltTex.clone(); road.material.map.needsUpdate = true;
      road.material.map.repeat.set(1, 26);
      road.rotation.x = -Math.PI / 2; if (!vertical) road.rotation.z = Math.PI / 2;
      road.position.set(vertical ? l : 0, 0.07, vertical ? 0 : l); road.receiveShadow = true; scene.add(road);
    }
  }

  /* ----- buildings by district ----- */
  const FACADES = {
    tower: facadeTexture(rand, { base: '#bfccd4', win: '#17384e', cols: 6, rows: 12 }),  // downtown glass
    mid: facadeTexture(rand, { base: '#e6dfd0', win: '#2c4a63', cols: 5, rows: 10 }),     // warm stucco
    brick: facadeTexture(rand, { base: '#d9b48f', win: '#33506b', cols: 5, rows: 9 }),    // old-town brick
    beach: facadeTexture(rand, { base: '#fdf3e3', win: '#3a6a8a', cols: 4, rows: 7 }),    // low beachfront
  };
  const facadeFor = (centre, r) => centre <= 28 ? FACADES.tower : centre <= 84 ? (r < 0.6 ? FACADES.mid : FACADES.brick) : FACADES.beach;
  const PASTEL = [0xffd9c0, 0xffe9a8, 0xc7e8c3, 0xa8d8ea, 0xffb7c5, 0xe6ccff, 0xfff6e5, 0xf9c784, 0xb5ead7, 0xffc8a2];
  const roofParts = [];
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(42, 42), new THREE.MeshLambertMaterial({ color: 0xa89a80 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(bx, 0.03, bz); pad.receiveShadow = true; scene.add(pad);
    if (bx === -28 && bz === -28) { // Palm Park
      pad.material.color.set(0x77b255);
      continue;
    }
    const centre = Math.max(Math.abs(bx), Math.abs(bz));
    const tall = centre <= 28 ? randRange(rand, 20, 44) : centre <= 84 ? randRange(rand, 11, 26) : randRange(rand, 6, 15);
    const layout = rand();
    const plots = layout < 0.4 ? [[0, 0, 30, 30]] : layout < 0.75 ? [[-9, -9, 15, 15], [9, 9, 15, 15], [-9, 9, 15, 15], [9, -9, 15, 15]] : [[-9, 0, 15, 32], [10, 0, 13, 32]];
    for (const [ox, oz, w, d] of plots) {
      const h = Math.max(5, tall * randRange(rand, 0.55, 1.1));
      const b = buildingMesh(w, h, d, facadeFor(centre, rand()), randPick(rand, PASTEL));
      b.position.set(bx + ox, h / 2 + 0.05, bz + oz);
      scene.add(b);
      colliders.push({ x1: bx + ox - w / 2, x2: bx + ox + w / 2, z1: bz + oz - d / 2, z2: bz + oz + d / 2, h });
      roofParts.push({ geo: boxGeo(w * 0.7, 0.7, d * 0.7), x: bx + ox, y: h + 0.4, z: bz + oz, color: 0x8a7a63 });
      if (rand() < 0.4) roofParts.push({ geo: boxGeo(2.4, 1.4, 2.4), x: bx + ox + randRange(rand, -w / 4, w / 4), y: h + 1, z: bz + oz, color: 0xd8d3c8 });
    }
  }
  const roofs = new THREE.Mesh(mergeParts(roofParts), vertexColorMaterial());
  roofs.castShadow = true; scene.add(roofs);

  /* ----- palms & street lights (one merged mesh) ----- */
  const glowParts = [];   // lamp heads: unlit-bright material, so they read as ON at dusk
  const palmAt = (x, z, s) => {
    const lean = randRange(rand, -0.09, 0.09), parts = [];
    let px = x, pz = z;
    for (let i = 0; i < 3; i++) { parts.push({ geo: cylGeo(0.16 - i * 0.03, 0.2 - i * 0.03, 1.6, 6), x: px, y: 0.8 + i * 1.5, z: pz, rz: lean, color: 0x9a7b52 }); px += lean * 1.5; }
    const topY = 5.1 * s;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rand();
      parts.push({ geo: coneGeo(0.38, 4.6, 4), x: px + Math.cos(a) * 1.35, y: topY - 0.95, z: pz + Math.sin(a) * 1.35, rz: Math.cos(a) * 1.52, rx: -Math.sin(a) * 1.52, sx: 0.11, color: i % 2 ? 0x2f8f43 : 0x277a38 });
    }
    parts.push({ geo: sphGeo(0.22, 6), x: px + 0.2, y: topY - 0.35, z: pz, color: 0x7a5c2e });
    for (const p of parts) { p.x = x + (p.x - x) * s; p.z = z + (p.z - z) * s; p.y *= s; statics.push(p); }
  };
  for (let x = -205; x <= 205; x += 13) { if (Math.abs(x - PIER_X) > 9) palmAt(x + randRange(rand, -3, 3), 202 + randRange(rand, 0, 5), randRange(rand, 0.85, 1.15)); }
  for (const l of STREET_LINES) { palmAt(l + 10.5, 174, 0.95); palmAt(l - 10.5, -174, 0.9); }
  for (let i = 0; i < 9; i++) palmAt(-28 + randRange(rand, -17, 17), -28 + randRange(rand, -17, 17), randRange(rand, 0.8, 1.2));
  for (const l of STREET_LINES) for (const m of STREET_LINES) {
    statics.push({ geo: cylGeo(0.09, 0.11, 5.6, 6), x: l + 9.6, y: 2.8, z: m + 9.6, color: 0x5a6068 });
    glowParts.push({ geo: sphGeo(0.3, 8), x: l + 9.6, y: 5.7, z: m + 9.6, color: 0xffe9a8 });
  }
  // beach umbrellas
  for (let i = 0; i < 16; i++) {
    const x = randRange(rand, -200, 200), z = randRange(rand, 204, 218);
    if (Math.abs(x - PIER_X) < 10) continue;
    statics.push({ geo: cylGeo(0.05, 0.05, 2.2, 5), x, y: 1.1, z, color: 0xe8e2d4 });
    statics.push({ geo: coneGeo(1.7, 0.7, 8), x, y: 2.3, z, color: randPick(rand, [0xff5e78, 0xffb347, 0x3ec6dd, 0xffd23e]) });
  }
  // lifeguard towers: white-and-red silhouettes the whole beach reads by
  for (const lx of [-84, 84]) {
    for (const [dx, dz] of [[-1.1, -0.9], [1.1, -0.9], [-1.1, 0.9], [1.1, 0.9]])
      statics.push({ geo: boxGeo(0.26, 3.6, 0.26), x: lx + dx, y: 1.8, z: 210 + dz, color: 0xf4f1e8 });
    statics.push({ geo: boxGeo(3.2, 0.25, 2.8), x: lx, y: 3.7, z: 210, color: 0xe8e2d4 });
    statics.push({ geo: boxGeo(3, 2.1, 2.5), x: lx, y: 4.9, z: 210, color: 0xffffff });
    statics.push({ geo: boxGeo(3.5, 0.3, 3), x: lx, y: 6.1, z: 210, color: 0xe33f4e });
    statics.push({ geo: boxGeo(2.6, 0.9, 0.12), x: lx, y: 4.9, z: 211.3, color: 0x2c4a63 });
  }
  // promenade benches facing the water
  for (let x = -195; x <= 195; x += 26) {
    if (Math.abs(x - PIER_X) < 9) continue;
    statics.push({ geo: boxGeo(2.2, 0.12, 0.55), x, y: 0.55, z: 196.5, color: 0x9a7b52 });
    statics.push({ geo: boxGeo(2.2, 0.5, 0.1), x, y: 0.95, z: 196.2, color: 0x9a7b52 });
    statics.push({ geo: boxGeo(0.14, 0.55, 0.5), x: x - 0.9, y: 0.27, z: 196.5, color: 0x5a6068 });
    statics.push({ geo: boxGeo(0.14, 0.55, 0.5), x: x + 0.9, y: 0.27, z: 196.5, color: 0x5a6068 });
  }
  // crates and barrels stacked by the docks garage
  for (const [cx, cz, s] of [[-128, 183, 1.3], [-126.4, 183.4, 1.1], [-127.2, 183.2, 1], [-112, 184, 1.2], [-110.5, 183.5, 0.9]]) {
    statics.push({ geo: boxGeo(1.3 * s, 1.3 * s, 1.3 * s), x: cx, y: 0.65 * s, z: cz, color: 0xa8825a });
    statics.push({ geo: cylGeo(0.42, 0.42, 1.1, 8), x: cx + 1.6, y: 0.55, z: cz + 0.4, color: 0x3e6b8c });
  }

  /* ----- marina: pier, posts, boats ----- */
  statics.push({ geo: boxGeo(8, 0.5, PIER_END_Z - 208), x: PIER_X, y: 0.55, z: (PIER_END_Z + 208) / 2, color: 0x9a7b52 });
  for (let z = 214; z < PIER_END_Z; z += 9) for (const dx of [-3.6, 3.6])
    statics.push({ geo: cylGeo(0.22, 0.22, 2.2, 6), x: PIER_X + dx, y: -0.3, z, color: 0x6e5638 });
  const boatCols = [0xffffff, 0xff5e78, 0x3ec6dd, 0xffd23e, 0x7dff9a, 0xffb347];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, bx = PIER_X + side * 8.5, bz = 224 + i * 9.5, col = boatCols[i];
    statics.push({ geo: boxGeo(2.6, 1, 6.4), x: bx, y: 0.25, z: bz, color: col });
    statics.push({ geo: boxGeo(1.8, 0.9, 2.2), x: bx, y: 1.1, z: bz - 0.6, color: 0xf4f1e8 });
    statics.push({ geo: cylGeo(0.06, 0.06, 5.4, 5), x: bx, y: 3.4, z: bz + 0.8, color: 0x8a8f96 });
    statics.push({ geo: boxGeo(0.08, 3.4, 2.2), x: bx, y: 3.6, z: bz + 0.85, color: 0xffffff });
  }
  const staticMesh = new THREE.Mesh(mergeParts(statics), vertexColorMaterial());
  staticMesh.castShadow = true; staticMesh.receiveShadow = true;
  scene.add(staticMesh);
  const glowMesh = new THREE.Mesh(mergeParts(glowParts), new THREE.MeshBasicMaterial({ vertexColors: true }));
  scene.add(glowMesh);

  /* ----- landmark buildings & signs ----- */
  const landmark = (x, z, w, h, d, tint, label, labelY) => {
    const b = buildingMesh(w, h, d, FACADES.tower, tint);
    b.position.set(x, h / 2 + 0.05, z); scene.add(b);
    colliders.push({ x1: x - w / 2, x2: x + w / 2, z1: z - d / 2, z2: z + d / 2, h });
    const s = textSprite(label, { scale: 1.15, color: '#ffe9a8' });
    s.position.set(x, labelY ?? h + 2.4, z + (z < 0 ? -d / 2 - 1 : d / 2 + 1) * (label === 'CBPD' ? 0 : 1));
    if (label === 'CBPD') s.position.set(x, labelY ?? h + 2.4, z - d / 2 - 1);
    scene.add(s);
    return b;
  };
  landmark(28, 188, 36, 11, 12, 0xff9eb5, 'PALMS HOTEL');
  landmark(-28, -188, 26, 13, 12, 0xf4f6f8, 'ST. ALBA HOSPITAL');
  landmark(72, 72, 20, 12, 16, 0x7d94b8, 'CBPD');
  landmark(-148, -92, 22, 7, 18, 0x5c5648, 'MARROW AUTO WORKS', 9.4);
  landmark(150, -28, 13, 6, 10, 0x59c2b8, 'SAFEHOUSE', 8.4);
  landmark(-120, 188, 20, 8, 12, 0xd8b36a, 'DOCKS GARAGE');
  // hospital red cross
  const cross = new THREE.Mesh(mergeParts([
    { geo: boxGeo(3.4, 1.1, 0.3), x: -28, y: 10.5, z: -181.7, color: 0xe33f4e },
    { geo: boxGeo(1.1, 3.4, 0.3), x: -28, y: 10.5, z: -181.7, color: 0xe33f4e },
  ]), vertexColorMaterial());
  scene.add(cross);

  // Cars additionally collide with the pier deck (walkers stand on it instead).
  const carColliders = [...colliders, { x1: PIER_X - 4.6, x2: PIER_X + 4.6, z1: 207, z2: PIER_END_Z + 1, h: 1 }];
  return { colliders, carColliders, update: (dt, t) => { for (const u of updaters) u(dt, t); } };
}
