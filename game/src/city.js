// city.js — builds Coral Bay itself: the golden-hour sky and light rig,
// the painted ground, six districts of procedural buildings, the beach
// and marina, and every static prop (palms, lamps, benches, boats,
// signs) fused into a handful of merged meshes. Also fills the shared
// collider and block lists the rest of the game navigates by.

import { makeRng, clamp, paintTexture, mergeParts } from './base.js';
import { G, AVENUES, BLOCK_CENTRES } from './state.js';

const rng = makeRng(7101); // fixed: the city is identical on every visit

export function districtAt(cx, cz) {
  if (cx === 0 && cz === 48) return 'plaza';
  if (cz === 96 && cx >= 48) return 'docks';
  if (cx === 96) return 'beach';
  if (cz === -96) return 'suburb';
  if (cx <= -48 && cz >= 48) return 'oldtown';
  if (cx >= -48 && cx <= 0 && cz >= -48 && cz <= 0) return 'downtown';
  return 'midtown';
}

// ---- facade painters: one canvas texture per district style ---------
function facadePainter(style) {
  return (ctx, w, h) => {
    const r = makeRng(style.length * 131 + 7);
    const base = {
      glass: '#274b5e', stucco: '#e8d9b8', brick: '#9c5a44',
      beach: '#f6efe6', dock: '#7d7a72', house: '#efe6d4',
    }[style];
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    if (style === 'brick') {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 500; i++) ctx.fillRect(r() * w, r() * h, 6, 2);
    }
    if (style === 'dock') {
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (let x = 0; x < w; x += 10) ctx.fillRect(x, 0, 3, h);
      ctx.fillStyle = '#5d5a52'; ctx.fillRect(w * 0.2, h * 0.55, w * 0.6, h * 0.45);
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(w * 0.2, h * 0.55, w * 0.6, 4);
    }
    if (style === 'beach') {
      ctx.fillStyle = 'rgba(30,120,130,0.35)';
      for (let y = 30; y < h; y += 42) ctx.fillRect(0, y, w, 7);
    }
    const cols = style === 'glass' ? 7 : style === 'house' ? 3 : 5;
    const rows = style === 'glass' ? 11 : style === 'house' ? 2 : 6;
    const cw = w / cols, ch = h / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (style === 'dock' && j < 3) continue;
        const lit = r() < (style === 'glass' ? 0.30 : 0.20);
        ctx.fillStyle = lit ? '#ffd98c' : (style === 'glass' ? '#9fd4e8' : '#33505e');
        const ww = cw * 0.52, wh = ch * 0.5;
        ctx.fillRect(i * cw + (cw - ww) / 2, j * ch + (ch - wh) / 2, ww, wh);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(i * cw + (cw - ww) / 2, j * ch + (ch - wh) / 2, ww, 2);
      }
    }
    if (style === 'house') {
      ctx.fillStyle = '#7a4a34'; ctx.fillRect(w * 0.42, h * 0.55, w * 0.16, h * 0.45);
    }
    const grad = ctx.createLinearGradient(0, h * 0.8, 0, h);
    grad.addColorStop(0, 'rgba(60,30,10,0)');
    grad.addColorStop(1, 'rgba(60,30,10,0.25)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  };
}

function signTexture(THREE, text, bg, fg) {
  return paintTexture(THREE, 512, 128, (ctx, w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = fg;
    ctx.font = 'bold 58px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

function mat4(THREE, x, y, z, rx, ry, rz, sx, sy, sz) {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz));
  return m;
}

export function buildCity(THREE, scene) {
  // ---------- light rig: low warm sun, soft shadows, amber fog -------
  const sunDir = new THREE.Vector3(-0.55, 0.42, 0.35).normalize();
  const sun = new THREE.DirectionalLight(0xffab5e, 1.85);
  sun.position.copy(sunDir).multiplyScalar(260);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -180; sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180; sun.shadow.camera.bottom = -180;
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 620;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xa8ccff, 0x9a7048, 0.74));
  scene.fog = new THREE.Fog(0xf7a56b, 190, 760);

  // ---------- sky dome: painted gradient with a sun glow -------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(880, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'varying vec3 vDir; uniform vec3 sunDir;',
        'void main(){',
        ' float h = clamp(vDir.y, -1.0, 1.0);',
        ' vec3 col = mix(vec3(1.0, 0.62, 0.34), vec3(1.0, 0.78, 0.48), smoothstep(-0.06, 0.14, h));',
        ' col = mix(col, vec3(0.16, 0.38, 0.68), smoothstep(0.10, 0.55, h));',
        ' float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);',
        ' col += vec3(1.0, 0.85, 0.55) * pow(s, 220.0) * 1.4 + vec3(1.0, 0.55, 0.25) * pow(s, 7.0) * 0.28;',
        ' gl_FragColor = vec4(col, 1.0); }',
      ].join('\n'),
    }));
  scene.add(sky);

  // clouds: soft sprites drifting far above the rooftops
  const cloudTex = paintTexture(THREE, 256, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,240,225,0.85)');
    g.addColorStop(0.6, 'rgba(255,220,200,0.35)');
    g.addColorStop(1, 'rgba(255,220,200,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  const clouds = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
    sp.position.set(rng() * 700 - 350, 120 + rng() * 70, rng() * 700 - 350);
    sp.scale.set(180 + rng() * 160, 42 + rng() * 30, 1);
    clouds.add(sp);
  }
  scene.add(clouds);

  // ---------- ground: one big painted canvas --------------------------
  const GS = 384, GX = -168, GZ = -192, PX = 2048 / GS;
  const w2px = (x) => (x - GX) * PX, w2pz = (z) => (z - GZ) * PX;
  const groundTex = paintTexture(THREE, 2048, 2048, (ctx) => {
    ctx.fillStyle = '#1d7186'; ctx.fillRect(0, 0, 2048, 2048);            // sea
    ctx.fillStyle = '#e9d09c';                                            // land
    ctx.fillRect(w2px(-156), w2pz(-156), 352 * PX, 312 * PX);
    ctx.fillStyle = '#a3a8ab';                                            // paved city
    ctx.fillRect(w2px(-140), w2pz(-140), 280 * PX, 280 * PX);
    ctx.fillStyle = '#989fa2';                                            // marina apron
    ctx.fillRect(w2px(140), w2pz(36), 34 * PX, 104 * PX);
    // beach shading and speckle
    const bg = ctx.createLinearGradient(w2px(148), 0, w2px(196), 0);
    bg.addColorStop(0, 'rgba(255,246,210,0)');
    bg.addColorStop(1, 'rgba(255,246,210,0.55)');
    ctx.fillStyle = bg;
    ctx.fillRect(w2px(148), w2pz(-156), 48 * PX, 312 * PX);
    ctx.fillStyle = 'rgba(160,120,60,0.25)';
    for (let i = 0; i < 900; i++) ctx.fillRect(w2px(150 + rng() * 44), w2pz(-150 + rng() * 300), 2, 2);
    // the marina basin: open water cut into the shore for the piers
    ctx.fillStyle = '#1d7186';
    ctx.fillRect(w2px(166), w2pz(38), 36 * PX, 100 * PX);
    ctx.fillStyle = '#227d94';
    ctx.fillRect(w2px(170), w2pz(42), 28 * PX, 92 * PX);
    // blocks: sidewalk rim + interior tint per district
    for (const cx of BLOCK_CENTRES) for (const cz of BLOCK_CENTRES) {
      const d = districtAt(cx, cz);
      ctx.fillStyle = '#c2c6c9';
      ctx.fillRect(w2px(cx - 18), w2pz(cz - 18), 36 * PX, 36 * PX);
      ctx.fillStyle = d === 'suburb' || d === 'plaza' ? '#7fae62' : d === 'docks' ? '#8f8b82' : '#a9a49a';
      ctx.fillRect(w2px(cx - 15), w2pz(cz - 15), 30 * PX, 30 * PX);
      G.blocks.push({ x0: cx - 18, z0: cz - 18, x1: cx + 18, z1: cz + 18, district: d, cx, cz });
    }
    // roads
    ctx.fillStyle = '#33373b';
    for (const a of AVENUES) {
      ctx.fillRect(w2px(a - 6), w2pz(-140), 12 * PX, 280 * PX);
      ctx.fillRect(w2px(-140), w2pz(a - 6), 280 * PX, 12 * PX);
    }
    ctx.fillStyle = 'rgba(255,214,120,0.85)';
    for (const a of AVENUES) {
      for (let t = -138; t < 138; t += 9) {
        ctx.fillRect(w2px(a) - 1, w2pz(t), 2, 4.5 * PX);
        ctx.fillRect(w2px(t), w2pz(a) - 1, 4.5 * PX, 2);
      }
    }
    // crosswalks
    ctx.fillStyle = 'rgba(240,240,240,0.75)';
    for (const ax of AVENUES) for (const az of AVENUES) {
      for (let s = -1; s <= 1; s += 2) {
        for (let b = -2; b <= 2; b++) {
          ctx.fillRect(w2px(ax + b * 2.2 - 0.8), w2pz(az + s * 7.6 - 0.7), 1.6 * PX, 1.4 * PX);
          ctx.fillRect(w2px(ax + s * 7.6 - 0.7), w2pz(az + b * 2.2 - 0.8), 1.4 * PX, 1.6 * PX);
        }
      }
    }
  });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GS, GS),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(GX + GS / 2, 0, GZ + GS / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- sea ------------------------------------------------------
  const waterTex = paintTexture(THREE, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2b93a8'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(220,250,255,0.35)'; ctx.lineWidth = 2;
    const r = makeRng(42);
    for (let i = 0; i < 46; i++) {
      ctx.beginPath();
      const y = r() * h, x = r() * w, len = 14 + r() * 30;
      ctx.moveTo(x, y); ctx.quadraticCurveTo(x + len / 2, y - 3, x + len, y); ctx.stroke();
    }
  }, { repeat: [46, 46] });
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1700, 1700),
    new THREE.MeshPhongMaterial({ map: waterTex, color: 0x9fd8e8, specular: 0xe8fbff, shininess: 170, transparent: true, opacity: 0.94 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(60, -0.45, 0);
  scene.add(water);

  // ---------- buildings -------------------------------------------------
  const facades = {};
  for (const s of ['glass', 'stucco', 'brick', 'beach', 'dock', 'house']) {
    facades[s] = new THREE.MeshStandardMaterial({ map: paintTexture(THREE, 256, 256, facadePainter(s)), roughness: 0.85 });
  }
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6e675f, roughness: 1 });
  const glassTint = [0xffffff, 0xcfe8ff, 0xffe2c4];
  const beachTint = [0xffc9da, 0xc9f2e4, 0xfff0bd, 0xd6e9ff];
  function addBuilding(x, z, w, d, h, style, tint) {
    const side = style === 'glass'
      ? new THREE.MeshStandardMaterial({ map: facades.glass.map, roughness: 0.4, metalness: 0.25, color: tint })
      : style === 'plain'
        ? new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9 })
        : facades[style];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      [side, side, roofMat, roofMat, side, side]);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    G.colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
    return mesh;
  }
  const signs = [];
  function addSign(text, bg, fg, x, y, z, yaw, w = 13) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4),
      new THREE.MeshBasicMaterial({ map: signTexture(THREE, text, bg, fg), toneMapped: false }));
    m.position.set(x, y, z); m.rotation.y = yaw;
    scene.add(m); signs.push(m);
  }
  for (const b of G.blocks) {
    const { cx, cz, district: d } = b;
    if (d === 'downtown') {
      const tower = cx === 0 && cz === 0;
      addBuilding(cx, cz, tower ? 26 : 20 + rng() * 7, tower ? 26 : 20 + rng() * 7,
        tower ? 88 : 44 + rng() * 38, 'glass', glassTint[Math.floor(rng() * 3)]);
      if (!tower && rng() < 0.8) addBuilding(cx + (rng() < 0.5 ? -9 : 9), cz + 10, 11, 11, 22 + rng() * 16, 'glass', 0xffffff);
      if (tower) addSign('CORAL TOWER', '#123a4d', '#ffd98c', cx - 13.2, 62, cz, -Math.PI / 2, 17);
    } else if (d === 'midtown' || d === 'oldtown') {
      const style = d === 'oldtown' ? 'brick' : 'stucco';
      for (const ox of [-8.5, 8.5]) for (const oz of [-8.5, 8.5]) {
        addBuilding(cx + ox, cz + oz, 13.5, 13.5, (d === 'oldtown' ? 9 : 15) + rng() * 9, style, 0xffffff);
      }
    } else if (d === 'beach') {
      const hotel = cx === 96 && cz === -48;
      if (hotel) {
        addBuilding(cx, cz, 30, 17, 25, 'beach', 0xffb9cd);
        addSign('PALMS HOTEL', '#c73e6d', '#ffffff', cx - 15.2, 17, cz, -Math.PI / 2, 16);
      } else {
        addBuilding(cx - 7, cz, 13, 15, 9 + rng() * 8, 'beach', beachTint[Math.floor(rng() * 4)]);
        addBuilding(cx + 8, cz + 4, 12, 13, 8 + rng() * 11, 'beach', beachTint[Math.floor(rng() * 4)]);
      }
    } else if (d === 'docks') {
      const garage = cx === 96 && cz === 96;
      addBuilding(cx - 4, cz - 4, 20, 17, 10 + rng() * 2, 'dock', 0xffffff);
      if (garage) {
        // open workshop mouth on the south face + its sign above
        const mouth = new THREE.Mesh(new THREE.PlaneGeometry(13, 5.4),
          new THREE.MeshBasicMaterial({ color: 0x14100c }));
        mouth.position.set(cx - 4, 2.7, cz + 4.56); scene.add(mouth);
        addSign('DOCKS GARAGE', '#2b2b30', '#ffb340', cx - 4, 8.6, cz + 4.6, 0, 15);
      } else {
        addBuilding(cx + 9.5, cz + 8, 11, 12, 8, 'dock', 0xffffff);
      }
    } else if (d === 'suburb') {
      for (const ox of [-11, 0, 11]) for (const oz of [-8.5, 8.5]) {
        const hx = cx + ox, hz = cz + oz;
        addBuilding(hx, hz, 8, 7, 4.6, 'house', 0xffffff);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.6, 4),
          new THREE.MeshStandardMaterial({ color: 0xb45a3c, roughness: 1 }));
        roof.position.set(hx, 5.9, hz); roof.rotation.y = Math.PI / 4;
        roof.castShadow = true; scene.add(roof);
      }
    }
    // plaza stays open: benches and palms arrive with the props below
  }

  // ---------- merged props ----------------------------------------------
  const solid = [];   // vertex-coloured standard material
  const fronds = [];  // textured palm leaves
  const glow = [];    // basic material (emissive look)
  const leafTex = paintTexture(THREE, 128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#2e7d32'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(4, h / 2); ctx.lineTo(w - 4, h / 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#43a047';
    for (let i = 0; i < 9; i++) {
      const x = 12 + i * 12;
      ctx.beginPath(); ctx.moveTo(x, h / 2); ctx.lineTo(x + 10, 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, h / 2); ctx.lineTo(x + 10, h - 8); ctx.stroke();
    }
  });
  function palm(x, z, s = 1) {
    const lean = rng() * 0.14, yaw = rng() * Math.PI * 2;
    solid.push({ geo: new THREE.CylinderGeometry(0.14, 0.3, 5.6, 6), color: 0x8a6a4a, mtx: mat4(THREE, x, 2.8, z, lean, yaw, 0, s, s, s) });
    const tx = x + Math.sin(lean) * 5.2 * s, tz = z;
    for (let i = 0; i < 6; i++) {
      const g = new THREE.PlaneGeometry(3.1, 1.0);
      g.translate(1.45, 0, 0);
      fronds.push({ geo: g, mtx: mat4(THREE, tx, 5.6 * s, tz, 0, (i / 6) * Math.PI * 2 + yaw, -0.55 - rng() * 0.25, s, s, s) });
    }
  }
  for (let z = -138; z <= 138; z += 16 + rng() * 6) palm(146 + rng() * 3, z, 0.9 + rng() * 0.35);
  for (let z = -120; z <= 132; z += 26) palm(141.5, z, 0.85);
  palm(8, 40); palm(-10, 56); palm(88, 88); palm(150, 60, 1.1); palm(150, 116, 1.05);

  // street lights: poles in the solid merge, heads in the glow merge
  function lamp(x, z, dirx, dirz) {
    solid.push({ geo: new THREE.CylinderGeometry(0.09, 0.13, 6.4, 5), color: 0x3c4147, mtx: mat4(THREE, x, 3.2, z, 0, 0, 0, 1, 1, 1) });
    solid.push({ geo: new THREE.BoxGeometry(0.14, 0.14, 1.9), color: 0x3c4147, mtx: mat4(THREE, x + dirx * 0.85, 6.35, z + dirz * 0.85, 0, Math.atan2(dirx, dirz), 0, 1, 1, 1) });
    glow.push({ geo: new THREE.BoxGeometry(0.34, 0.16, 0.8), color: 0xffd9a0, mtx: mat4(THREE, x + dirx * 1.7, 6.28, z + dirz * 1.7, 0, Math.atan2(dirx, dirz), 0, 1, 1, 1) });
  }
  for (const a of AVENUES) {
    for (let t = -132; t <= 132; t += 24) {
      lamp(a - 7.4, t, 1, 0); lamp(a + 7.4, t + 12, -1, 0);
      lamp(t, a - 7.4, 0, 1); lamp(t + 12, a + 7.4, 0, -1);
    }
  }
  // benches along the promenade and in the plaza
  for (let z = -126; z <= 132; z += 28) {
    solid.push({ geo: new THREE.BoxGeometry(0.5, 0.12, 2.4), color: 0xa9743f, mtx: mat4(THREE, 140.6, 0.55, z, 0, Math.PI / 2, 0, 1, 1, 1) });
    solid.push({ geo: new THREE.BoxGeometry(0.12, 0.55, 2.4), color: 0xa9743f, mtx: mat4(THREE, 140.2, 0.95, z, 0, Math.PI / 2, 0, 1, 1, 1) });
    solid.push({ geo: new THREE.BoxGeometry(0.45, 0.5, 0.14), color: 0x3c4147, mtx: mat4(THREE, 140.6, 0.25, z - 0.9, 0, 0, 0, 1, 1, 1) });
    solid.push({ geo: new THREE.BoxGeometry(0.45, 0.5, 0.14), color: 0x3c4147, mtx: mat4(THREE, 140.6, 0.25, z + 0.9, 0, 0, 0, 1, 1, 1) });
  }
  // beach umbrellas and lifeguard towers
  const umbCols = [0xff5a76, 0xffb340, 0x3ec6b8, 0xff7e47, 0x5a8aff];
  for (let i = 0; i < 16; i++) {
    const x = 158 + rng() * 26, z = -132 + rng() * 158;
    solid.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), color: 0xf2f2f2, mtx: mat4(THREE, x, 1.2, z, 0.16, 0, 0, 1, 1, 1) });
    solid.push({ geo: new THREE.ConeGeometry(1.9, 0.55, 8), color: umbCols[i % umbCols.length], mtx: mat4(THREE, x + 0.38, 2.5, z, 0.16, 0, 0, 1, 1, 1) });
  }
  for (const lz of [-58, 44]) {
    for (const [lx, lzz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
      solid.push({ geo: new THREE.BoxGeometry(0.18, 3.4, 0.18), color: 0xf4f4f4, mtx: mat4(THREE, 156 + lx, 1.7, lz + lzz, lx * 0.18, 0, lzz * 0.18, 1, 1, 1) });
    }
    solid.push({ geo: new THREE.BoxGeometry(3, 1.9, 3), color: 0xffffff, mtx: mat4(THREE, 156, 4.1, lz, 0, 0, 0, 1, 1, 1) });
    solid.push({ geo: new THREE.ConeGeometry(2.6, 1.1, 4), color: 0xe0483e, mtx: mat4(THREE, 156, 5.6, lz, 0, Math.PI / 4, 0, 1, 1, 1) });
  }
  // dock clutter: crates and barrels
  for (let i = 0; i < 26; i++) {
    const inDocks = rng() < 0.7;
    const x = inDocks ? 44 + rng() * 92 : 144 + rng() * 24;
    const z = inDocks ? 82 + rng() * 48 : 44 + rng() * 88;
    if (rng() < 0.55) solid.push({ geo: new THREE.BoxGeometry(1.3, 1.3, 1.3), color: 0xb08954, mtx: mat4(THREE, x, 0.65, z, 0, rng() * 3, 0, 1, 1, 1) });
    else solid.push({ geo: new THREE.CylinderGeometry(0.42, 0.42, 1.1, 9), color: pick3([0x707880, 0xa03c30, 0x3c6e91], rng), mtx: mat4(THREE, x, 0.55, z, 0, 0, 0, 1, 1, 1) });
  }
  function pick3(arr, r) { return arr[Math.floor(r() * arr.length) % arr.length]; }

  const solidMesh = new THREE.Mesh(mergeParts(THREE, solid),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  solidMesh.castShadow = true; solidMesh.receiveShadow = true;
  scene.add(solidMesh);
  const frondMesh = new THREE.Mesh(mergeParts(THREE, fronds),
    new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }));
  frondMesh.castShadow = true;
  scene.add(frondMesh);
  const glowMesh = new THREE.Mesh(mergeParts(THREE, glow),
    new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  scene.add(glowMesh);

  // ---------- marina: piers and sailboats -------------------------------
  const boats = [];
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x9a7b58, roughness: 1 });
  for (const pz of [56, 88, 120]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(27, 0.5, 4.2), pierMat);
    pier.position.set(182, 0.26, pz); pier.receiveShadow = true;
    scene.add(pier);
  }
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 });
  const hullCols = [0xff5a76, 0x3ec6b8, 0xffb340, 0xf2f2f2, 0x5a8aff, 0xff7e47, 0x9fe870];
  const boatSpots = [[176, 49], [188, 63], [178, 81], [190, 95], [176, 113], [189, 127], [183, 49]];
  boatSpots.forEach(([bx, bz], i) => {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 5.6, 4),
      new THREE.MeshStandardMaterial({ color: hullCols[i % hullCols.length], roughness: 0.6 }));
    hull.rotation.z = Math.PI / 2; hull.rotation.y = Math.PI / 4;
    hull.scale.set(1, 1, 0.62); hull.position.y = 0.25;
    boat.add(hull);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }));
    cab.position.set(-0.4, 0.85, 0); boat.add(cab);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.6, 5),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }));
    mast.position.set(0.7, 2.6, 0); boat.add(mast);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0.7, 4.7, 0, 0.7, 1.1, 0, 2.5, 1.1, 0], 3));
    sailGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0], 2));
    sailGeo.computeVertexNormals();
    boat.add(new THREE.Mesh(sailGeo, sailMat));
    boat.position.set(bx, 0, bz);
    boat.rotation.y = (i % 2 ? 0.12 : -0.1);
    scene.add(boat);
    boats.push({ g: boat, phase: rng() * 6.28 });
  });
  addSign('CORAL BAY MARINA', '#134a5e', '#ffffff', 143, 3.4, 88, -Math.PI / 2, 12);
  solid.length = 0;

  let t = 0;
  G.city = {
    update(dt) {
      t += dt;
      waterTex.offset.set((t * 0.008) % 1, (t * 0.005) % 1);
      for (const b of boats) {
        b.g.position.y = Math.sin(t * 0.85 + b.phase) * 0.11 - 0.05;
        b.g.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.028;
      }
      clouds.children.forEach((sp, i) => {
        sp.position.x += dt * (0.7 + (i % 3) * 0.3);
        if (sp.position.x > 420) sp.position.x = -420;
      });
    },
  };
  return { signs };
}
