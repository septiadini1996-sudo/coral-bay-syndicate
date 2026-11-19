// people.js — articulated low-poly people in gangster styling (fedoras, panama
// hats, sunglasses, gold chains, tropical prints), the player on foot,
// pedestrians with sidewalk AI, dogs, seagulls, and hand-to-hand combat.
"use strict";

const SKIN_TONES = [0xf2c09a, 0xd99e63, 0xa96f3f, 0x7a4a28, 0xffd9b3];
const SHIRT_COLORS = [0xf26d5b, 0x3fbfae, 0xf2b13d, 0x7a5fd0, 0xe8e4da, 0x2e4053, 0xff8fab, 0x58a05c];
const PANTS_COLORS = [0x2e4053, 0xe8e4da, 0x5a4632, 0x30343a, 0x7a2e35];

function shirtTexture(base, print) {
  const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
  const c = cv.getContext("2d");
  c.fillStyle = base; c.fillRect(0, 0, 32, 32);
  if (print) {
    c.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(rng() * 32, rng() * 32, 2.2, 0, 7); c.fill(); }
    c.fillStyle = "rgba(20,120,60,0.55)";
    for (let i = 0; i < 6; i++) c.fillRect(rng() * 30, rng() * 30, 4, 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const SHIRT_TEX = [
  shirtTexture("#f26d5b", true), shirtTexture("#3fbfae", true), shirtTexture("#f2b13d", true),
  shirtTexture("#e8e4da", false), shirtTexture("#2e4053", false), shirtTexture("#ff8fab", true),
];
function lam(color) { return new THREE.MeshLambertMaterial({ color }); }

function makePerson(style) {
  style = style || {};
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  const skin = lam(style.skin !== undefined ? style.skin : pick(SKIN_TONES));
  const shirt = style.shirtTex !== undefined
    ? new THREE.MeshLambertMaterial({ map: SHIRT_TEX[style.shirtTex % SHIRT_TEX.length] })
    : lam(style.shirt !== undefined ? style.shirt : pick(SHIRT_COLORS));
  const pants = lam(style.pants !== undefined ? style.pants : pick(PANTS_COLORS));
  function limb(w, h, d, mat, x, y, z) {
    const geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true;
    inner.add(m); return m;
  }
  const ll = limb(0.34, 0.92, 0.38, pants, -0.15, 0.95, 0);
  const rl = limb(0.34, 0.92, 0.38, pants, 0.15, 0.95, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.74, 0.46), shirt);
  torso.position.y = 1.33; torso.castShadow = true; inner.add(torso);
  if (style.skirt) {
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.6, 8), lam(style.skirt));
    skirt.position.y = 0.98; inner.add(skirt);
  }
  const la = limb(0.26, 0.8, 0.3, shirt, -0.54, 1.66, 0);
  const ra = limb(0.26, 0.8, 0.3, shirt, 0.54, 1.66, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.52, 0.48), skin);
  head.position.y = 2.0; head.castShadow = true; inner.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.16, 0.52), lam(style.hair || 0x2a1c10));
  hair.position.y = 2.28; inner.add(hair);
  if (style.hat) {
    const hatMat = lam(style.hat === "panama" ? 0xf2e3c2 : 0x3a2e22);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(style.hat === "panama" ? 0.56 : 0.48, style.hat === "panama" ? 0.56 : 0.48, 0.07, 10), hatMat);
    brim.position.y = 2.3; inner.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.3, 10), hatMat);
    crown.position.y = 2.46; inner.add(crown);
  }
  if (style.shades) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.13, 0.08), new THREE.MeshBasicMaterial({ color: 0x101418 }));
    sh.position.set(0, 2.04, 0.26); inner.add(sh);
  }
  if (style.chain) {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 6, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd94d }));
    chain.position.set(0, 1.62, 0.24); chain.rotation.x = 0.5; inner.add(chain);
  }
  g.scale.setScalar(0.84);
  return { mesh: g, inner, la, ra, ll, rl, head, phase: rand(0, 6), hp: 3, dead: 0, fleeT: 0, target: null, speed: 0 };
}

function animatePerson(p, speed, dt) {
  p.phase += dt * (3 + speed * 2.1);
  const sw = Math.sin(p.phase) * clamp(speed / 3.4, 0, 1) * 0.62;
  p.la.rotation.x = sw; p.ra.rotation.x = -sw;
  p.ll.rotation.x = -sw; p.rl.rotation.x = sw;
  p.inner.position.y = Math.abs(Math.sin(p.phase)) * 0.05 * clamp(speed / 3, 0, 1);
  if (p.attackT > 0) { p.attackT -= dt; p.ra.rotation.x = -2 + (0.18 - p.attackT) * 6; }
}

function textSprite(text, color) {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 56;
  const c = cv.getContext("2d");
  c.font = "bold 34px Trebuchet MS, sans-serif"; c.textAlign = "center";
  c.lineWidth = 7; c.strokeStyle = "rgba(10,20,30,0.85)";
  c.strokeText(text, 128, 40); c.fillStyle = color || "#ffd94d"; c.fillText(text, 128, 40);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(7.5, 1.65, 1);
  return s;
}

// --- the cast ---------------------------------------------------------------
function buildCast(scene) {
  const rico = makePerson({ skin: 0xd99e63, shirtTex: 0, pants: 0xe8e4da, hat: "fedora", shades: true, chain: true, hair: 0x1c1410 });
  rico.mesh.position.set(SPOTS.safehouse.x, 0, SPOTS.safehouse.z);
  scene.add(rico.mesh);
  G.player = rico; rico.heading = Math.PI; rico.vy = 0; rico.y = 0; rico.attackT = 0;

  function contact(key, style, spot, name) {
    const p = makePerson(style);
    p.mesh.position.set(spot.x, 0, spot.z);
    p.mesh.rotation.y = rand(0, 6.28);
    scene.add(p.mesh);
    const label = textSprite(name, "#ffffff");
    label.position.set(spot.x, 3.1, spot.z); scene.add(label);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    beacon.position.set(spot.x, 17, spot.z); scene.add(beacon);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(spot.x, 0.15, spot.z); scene.add(ring);
    G.contacts = G.contacts || {};
    G.contacts[key] = { person: p, beacon, ring, spot, name };
    return p;
  }
  contact("celia", { skin: 0xf2c09a, shirtTex: 5, skirt: 0xc93a2e, hair: 0x4a2a12 }, SPOTS.celia, "Celia");
  contact("marco", { skin: 0xa96f3f, shirt: 0x2e4053, pants: 0x30343a, hat: "fedora", shades: true, chain: true }, SPOTS.marco, "Marco");
  contact("don", { skin: 0xffd9b3, shirtTex: 3, pants: 0xe8e4da, hat: "panama", shades: true, chain: true }, SPOTS.don, "Don Falso");

  // pedestrians on the sidewalks
  for (let i = 0; i < 24; i++) {
    const p = makePerson({
      hat: rng() > 0.55 ? pick(["fedora", "panama"]) : null,
      shades: rng() > 0.6, chain: rng() > 0.8,
      skirt: rng() > 0.72 ? pick(SHIRT_COLORS) : null,
    });
    const s = randomSidewalkPoint();
    p.mesh.position.set(s.x, 0, s.z);
    p.target = randomSidewalkPoint();
    p.walkSpeed = rand(1.8, 3.1);
    scene.add(p.mesh); G.peds.push(p);
  }
  buildDogs(scene); buildGulls(scene); buildPickups(scene);
}
function randomSidewalkPoint() {
  const road = pick(ROAD_LINES), side = rng() > 0.5 ? 20.5 : -20.5, along = rand(-800, 800);
  return rng() > 0.5 ? { x: road + side, z: along } : { x: along, z: road + side };
}

function buildDogs(scene) {
  G.dogs = [];
  const spots = [{ x: 700, z: -300 }, { x: -700, z: 100 }, { x: 700, z: 420 }, { x: -620, z: -420 }];
  for (const s of spots) {
    const d = new THREE.Group();
    const mat = lam(pick([0xb08954, 0x6e4f30, 0xd8d3c3, 0x404040]));
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.48, 0.42), mat); body.position.y = 0.52; d.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 0.36), mat); head.position.set(0.62, 0.72, 0); d.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), mat); tail.position.set(-0.6, 0.78, 0); tail.rotation.z = 0.7; d.add(tail);
    d.position.set(s.x, 0, s.z);
    scene.add(d);
    G.dogs.push({ mesh: d, target: { x: s.x + rand(-60, 60), z: s.z + rand(-60, 60) }, pauseT: rand(0, 3), phase: rand(0, 6) });
  }
}
function buildGulls(scene) {
  G.gulls = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const mat = lam(0xf4f6f8);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.34), mat); g.add(body);
    const wlGeo = new THREE.BoxGeometry(0.5, 0.06, 1.5); wlGeo.translate(0, 0, -0.78);
    const wrGeo = new THREE.BoxGeometry(0.5, 0.06, 1.5); wrGeo.translate(0, 0, 0.78);
    const wl = new THREE.Mesh(wlGeo, mat); g.add(wl);
    const wr = new THREE.Mesh(wrGeo, mat); g.add(wr);
    g.userData = { wl, wr };
    scene.add(g);
    G.gulls.push({ mesh: g, cx: -880 + rand(-50, 50), cz: rand(-260, 260), r: rand(35, 95), h: rand(22, 44), a: rand(0, 6.28), sp: rand(0.25, 0.5) * (rng() > 0.5 ? 1 : -1) });
  }
}
function buildPickups(scene) {
  const defs = [
    { kind: "bat", x: -148, z: 52, color: 0xb08954 },
    { kind: "pipe", x: 300, z: 296, color: 0x9aa0a3 },
    { kind: "pistol", x: -636, z: -44, color: 0x30343a },
    { kind: "pistol", x: 128, z: 596, color: 0x30343a },
  ];
  for (const d of defs) {
    const grp = new THREE.Group();
    const item = new THREE.Mesh(new THREE.BoxGeometry(d.kind === "pistol" ? 0.7 : 1.1, 0.22, 0.22), lam(d.color));
    item.position.y = 1.1; grp.add(item);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.14, 14),
      new THREE.MeshBasicMaterial({ color: 0x2ee6c8, transparent: true, opacity: 0.55 }));
    glow.position.y = 0.1; grp.add(glow);
    grp.position.set(d.x, 0, d.z);
    scene.add(grp);
    G.pickups.push({ kind: d.kind, grp, x: d.x, z: d.z, taken: false });
  }
}

// --- per-frame people updates -------------------------------------------------
function updatePeds(dt) {
  const pp = G.player.mesh.position;
  for (const p of G.peds) {
    if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0) { const s = randomSidewalkPoint(); p.mesh.position.set(s.x, 0, s.z); p.mesh.rotation.x = 0; p.hp = 3; } continue; }
    let tx = p.target.x, tz = p.target.z, sp = p.walkSpeed;
    if (p.fleeT > 0) {
      p.fleeT -= dt; sp = 6.4;
      tx = p.mesh.position.x + (p.mesh.position.x - pp.x);
      tz = p.mesh.position.z + (p.mesh.position.z - pp.z);
    } else if (dist2d(p.mesh.position.x, p.mesh.position.z, tx, tz) < 2.5) {
      p.target = randomSidewalkPoint(); continue;
    }
    movePerson(p, tx, tz, sp, dt);
  }
  for (const key of ["celia", "marco", "don"]) {
    const ct = G.contacts[key];
    ct.person.phase += dt * 1.4;
    ct.person.inner.position.y = Math.sin(ct.person.phase) * 0.02;
    ct.ring.rotation.z += dt * 0.8;
    const vis = contactHasJob(key);
    ct.beacon.visible = vis; ct.ring.visible = vis;
  }
  for (const d of G.dogs) {
    if (d.pauseT > 0) { d.pauseT -= dt; continue; }
    const m = d.mesh, dx = d.target.x - m.position.x, dz = d.target.z - m.position.z;
    const dd = Math.sqrt(dx * dx + dz * dz);
    if (dd < 3) { d.target = { x: clamp(m.position.x + rand(-90, 90), -840, 840), z: clamp(m.position.z + rand(-90, 90), -840, 840) }; d.pauseT = rand(1, 4); continue; }
    const a = Math.atan2(dx, dz);
    m.rotation.y = angLerp(m.rotation.y, a, dt * 6);
    m.position.x += Math.sin(m.rotation.y) * 4.2 * dt;
    m.position.z += Math.cos(m.rotation.y) * 4.2 * dt;
    d.phase += dt * 9; m.position.y = Math.abs(Math.sin(d.phase)) * 0.09;
  }
  for (const g of G.gulls) {
    g.a += g.sp * dt;
    const x = g.cx + Math.cos(g.a) * g.r, z = g.cz + Math.sin(g.a) * g.r;
    g.mesh.position.set(x, g.h + Math.sin(G.time * 0.8 + g.r) * 2, z);
    g.mesh.rotation.y = -g.a - (g.sp > 0 ? 0 : Math.PI);
    const flap = Math.sin(G.time * 7 + g.r) * 0.55;
    g.mesh.userData.wl.rotation.x = flap; g.mesh.userData.wr.rotation.x = -flap;
  }
  for (const pk of G.pickups) {
    if (pk.taken) continue;
    pk.grp.rotation.y += dt * 1.6;
    if (G.onFoot && dist2d(pp.x, pp.z, pk.x, pk.z) < 2.1) {
      pk.taken = true; pk.grp.visible = false;
      G.weapon = pk.kind; if (pk.kind === "pistol") G.ammo = 24;
      showToast(pk.kind === "pistol" ? "Picked up a pistol (24 rounds) — click to fire" : "Picked up a " + pk.kind + " — F or click to swing");
      sfxPickup(); updateHUD();
    }
  }
}
function movePerson(p, tx, tz, sp, dt) {
  const m = p.mesh, dx = tx - m.position.x, dz = tz - m.position.z;
  const dd = Math.sqrt(dx * dx + dz * dz);
  if (dd < 0.1) { animatePerson(p, 0, dt); return; }
  const a = Math.atan2(dx, dz);
  m.rotation.y = angLerp(m.rotation.y, a, dt * 8);
  let nx = m.position.x + Math.sin(m.rotation.y) * sp * dt;
  let nz = m.position.z + Math.cos(m.rotation.y) * sp * dt;
  const fixed = collideCircle(nx, nz, 0.55);
  nx = fixed.x; nz = fixed.z;
  if (!isLand(nx, nz)) { nx = m.position.x; nz = m.position.z; }
  m.position.x = nx; m.position.z = nz;
  p.speed = sp; animatePerson(p, sp, dt);
}

// --- the player on foot -------------------------------------------------------
function updatePlayerOnFoot(dt) {
  const p = G.player, m = p.mesh;
  const camA = G.camYaw;
  let ix = 0, iz = 0;
  if (G.keys["KeyW"] || G.keys["ArrowUp"]) iz -= 1;
  if (G.keys["KeyS"] || G.keys["ArrowDown"]) iz += 1;
  if (G.keys["KeyA"] || G.keys["ArrowLeft"]) ix -= 1;
  if (G.keys["KeyD"] || G.keys["ArrowRight"]) ix += 1;
  const moving = (ix !== 0 || iz !== 0);
  const run = G.keys["ShiftLeft"] || G.keys["ShiftRight"];
  const sp = run ? 10.6 : 6.2;
  if (moving) {
    const a = Math.atan2(ix, iz) + camA + Math.PI;
    m.rotation.y = angLerp(m.rotation.y, a, dt * 11);
    let nx = m.position.x + Math.sin(m.rotation.y) * sp * dt;
    let nz = m.position.z + Math.cos(m.rotation.y) * sp * dt;
    const fixed = collideCircle(nx, nz, 0.55);
    nx = fixed.x; nz = fixed.z;
    if (isLand(nx, nz) || isLand(m.position.x, m.position.z) === false) { m.position.x = nx; m.position.z = nz; }
    animatePerson(p, sp, dt);
    p.speed = sp;
  } else { p.speed = 0; animatePerson(p, 0, dt); }
  // jumping
  if ((G.keys["Space"]) && p.y <= 0) { p.vy = 7.4; }
  if (p.y > 0 || p.vy > 0) {
    p.vy -= 22 * dt; p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; }
  }
  m.position.y = p.y;
  // entering vehicles
  const near = nearestVehicle(m.position.x, m.position.z, 4.2);
  if (near && near.alive) {
    setInteract("E — Take the " + near.name);
    if (G.keys["KeyE"]) { G.keys["KeyE"] = false; enterVehicle(near); }
  } else if (G.giverPrompt) setInteract(G.giverPrompt);
  else setInteract(null);
  if (G.keys["KeyF"]) { G.keys["KeyF"] = false; playerAttack(); }
}

function playerAttack() {
  const p = G.player;
  if (G.mode !== "play" || !G.onFoot) return;
  p.attackT = 0.18;
  const m = p.mesh, fx = Math.sin(m.rotation.y), fz = Math.cos(m.rotation.y);
  if (G.weapon === "pistol") {
    if (G.ammo <= 0) { showToast("Out of ammo"); return; }
    G.ammo--; sfxShot(); updateHUD();
    let best = null, bestD = 34;
    for (const q of G.peds) {
      if (q.dead > 0) continue;
      const dx = q.mesh.position.x - m.position.x, dz = q.mesh.position.z - m.position.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD && (dx * fx + dz * fz) / Math.max(1, d) > 0.93) { best = q; bestD = d; }
    }
    showTracer(m.position.x, m.position.z, fx, fz, best ? bestD : 30);
    if (best) hurtPed(best, 2);
    addCrime(1);
    return;
  }
  sfxPunch();
  for (const q of G.peds) {
    if (q.dead > 0) continue;
    const dx = q.mesh.position.x - m.position.x, dz = q.mesh.position.z - m.position.z;
    if (dx * dx + dz * dz < 5.3 && dx * fx + dz * fz > 0) { hurtPed(q, G.weapon === "fists" ? 1 : 2); break; }
  }
}
function hurtPed(q, dmg) {
  q.hp -= dmg; q.fleeT = 3;
  if (q.hp <= 0 && q.dead <= 0) {
    q.dead = 5; q.mesh.rotation.x = -Math.PI / 2; q.mesh.position.y = 0.3;
    addCrime(1); showToast("You flattened a pedestrian!");
  }
}
let tracerMesh = null, tracerT = 0;
function showTracer(x, z, fx, fz, len) {
  if (!tracerMesh) {
    tracerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1),
      new THREE.MeshBasicMaterial({ color: 0xffe9a3 }));
    G.scene.add(tracerMesh);
  }
  tracerMesh.position.set(x + fx * len / 2, 1.6, z + fz * len / 2);
  tracerMesh.scale.z = len;
  tracerMesh.rotation.y = Math.atan2(fx, fz);
  tracerMesh.visible = true; tracerT = 0.06;
}
function updateCombatFx(dt) {
  if (tracerT > 0) { tracerT -= dt; if (tracerT <= 0 && tracerMesh) tracerMesh.visible = false; }
}
