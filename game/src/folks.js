// folks.js — people: the gangster-styled character factory (separate arms,
// shades, fedoras, loud jackets, tropical shirts, Rico's gold chain), the
// player controller on foot and in vehicles, and the pedestrian state
// machines (stroll, chat, flee, knocked down) with their dogs.
import { G, keys, clamp, lerp, wrapAng, angToward, collide, d2, mulberry } from './defs.js';
import { groundOk } from './city.js';
import { stepVehicle } from './rides.js';
import { sfx } from './sound.js';

const SKINS = [0xf2c49b, 0xc68863, 0x8d5a3b, 0x6e4530, 0xffdbac];
const JACKETS = [0xd94f3d, 0x118ab2, 0xef476f, 0x06d6a0, 0xffd166, 0x7b2d8b, 0xf4f1de, 0x2a9d8f, 0xe76f51];
const PANTS = [0x2b2d42, 0x4a4e69, 0x6c5849, 0x22223b, 0x5a5350];
let tropicTex = null;
function shirtTexture() {
  if (tropicTex) return tropicTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#fdf6e3'; c.fillRect(0, 0, 64, 64);
  const cols = ['#ef476f', '#06d6a0', '#ffd166', '#118ab2'];
  for (let i = 0; i < 14; i++) {
    c.fillStyle = cols[i % 4];
    const x = (i * 37) % 60, y = (i * 23) % 60;
    c.beginPath(); c.ellipse(x, y, 4.5, 2.6, i, 0, 7); c.fill();
    c.beginPath(); c.ellipse(x + 3, y + 3, 3, 1.8, i + 2, 0, 7); c.fill();
  }
  tropicTex = new THREE.CanvasTexture(cv);
  return tropicTex;
}
function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });

// A person ~1.75 m tall, origin at the feet. Arms and legs hang from pivot
// groups at the shoulders/hips so the walk cycle can swing them.
export function makePerson(o = {}) {
  const g = new THREE.Group();
  const skin = lam(o.skin ?? SKINS[Math.floor(Math.random() * SKINS.length)]);
  const jacket = o.tropic ? new THREE.MeshLambertMaterial({ map: shirtTexture() }) : lam(o.jacket ?? JACKETS[Math.floor(Math.random() * JACKETS.length)]);
  const pants = lam(o.pants ?? PANTS[Math.floor(Math.random() * PANTS.length)]);
  const legL = new THREE.Group(); legL.position.set(-0.11, 0.82, 0); g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.11, 0.82, 0); g.add(legR);
  box(0.15, 0.8, 0.17, pants, 0, -0.4, 0, legL);
  box(0.15, 0.8, 0.17, pants, 0, -0.4, 0, legR);
  box(0.16, 0.09, 0.26, lam(0x222222), 0, -0.78, 0.04, legL);
  box(0.16, 0.09, 0.26, lam(0x222222), 0, -0.78, 0.04, legR);
  const torso = box(0.46, 0.62, 0.25, jacket, 0, 1.13, 0, g);
  if (o.chain) { // Rico's gold chain
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 14), new THREE.MeshBasicMaterial({ color: 0xffc93c }));
    chain.position.set(0, 1.3, 0.14); chain.rotation.x = 0.5; g.add(chain);
  }
  const armL = new THREE.Group(); armL.position.set(-0.3, 1.4, 0); g.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.3, 1.4, 0); g.add(armR);
  box(0.13, 0.6, 0.15, jacket, 0, -0.28, 0, armL);
  box(0.13, 0.6, 0.15, jacket, 0, -0.28, 0, armR);
  box(0.11, 0.14, 0.13, skin, 0, -0.62, 0, armL);
  box(0.11, 0.14, 0.13, skin, 0, -0.62, 0, armR);
  const headG = new THREE.Group(); headG.position.y = 1.44; g.add(headG);
  box(0.3, 0.34, 0.3, skin, 0, 0.17, 0, headG);
  if (o.hat) {
    const hatMat = lam(o.hat === 'panama' ? 0xe8dcc0 : 0x2e2a26);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.035, 12), hatMat);
    brim.position.y = 0.35; brim.castShadow = true; headG.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.17, 12), hatMat);
    crown.position.y = 0.44; crown.castShadow = true; headG.add(crown);
    box(0.4, 0.05, 0.4, lam(0xb03050), 0, 0.37, 0, headG); // hat band
  } else {
    box(0.32, 0.09, 0.32, lam(o.hair ?? 0x2a2019), 0, 0.36, 0, headG);
  }
  if (o.shades) box(0.33, 0.08, 0.06, lam(0x101014), 0, 0.2, 0.16, headG);
  return { g, legL, legR, armL, armR, headG, torso, phase: Math.random() * 6 };
}

function animateWalk(p, speed, dt, armSwing = 1) {
  p.phase += dt * (2.2 + speed * 1.55);
  const amp = clamp(speed / 3.4, 0, 1) * 0.62;
  p.legL.rotation.x = Math.sin(p.phase) * amp;
  p.legR.rotation.x = -Math.sin(p.phase) * amp;
  p.armL.rotation.x = -Math.sin(p.phase) * amp * 0.8 * armSwing;
  p.armR.rotation.x = Math.sin(p.phase) * amp * 0.8 * armSwing;
  return Math.abs(Math.sin(p.phase)) * 0.045 * clamp(speed / 3, 0, 1);
}

// --- Player ------------------------------------------------------------------
export function buildPlayer(scene) {
  const body = makePerson({ jacket: 0xd92662, pants: 0x22223b, skin: 0xc68863, hat: 'fedora', shades: true, chain: true });
  body.g.position.set(-166, 0, 30);
  scene.add(body.g);
  const P = {
    ...body, heading: Math.PI / 2, speed: 0, vy: 0, y: 0, vehicle: null,
    punchT: 0, punchCd: 0, stepT: 0, name: 'Rico Solano',
  };
  G.player = P;
  return P;
}
export function playerPos() { const p = G.player; return p.vehicle ? p.vehicle.group.position : p.g.position; }

export function enterVehicle(v) {
  const P = G.player;
  P.vehicle = v; v.driver = 'player'; v.parked = false; v.ai = null;
  if (v.stats.two) { P.g.visible = true; poseRider(P, v); }
  else P.g.visible = false;
  if (G.hooks.onEnterVehicle) G.hooks.onEnterVehicle(v);
}
function poseRider(P, v) {
  const lean = v.type === 'sportbike' ? 0.42 : v.type === 'bike' ? 0.28 : 0.08;
  P.torso.rotation.x = lean;
  P.legL.rotation.x = -1.15; P.legR.rotation.x = -1.15;
  P.armL.rotation.x = -0.85; P.armR.rotation.x = -0.85;
}
export function exitVehicle() {
  const P = G.player, v = P.vehicle;
  if (!v) return;
  v.driver = null;
  P.vehicle = null;
  P.g.visible = true;
  P.torso.rotation.x = 0;
  const side = 1;
  const rx = Math.cos(v.heading), rz = -Math.sin(v.heading); // left/right offsets
  let nx = v.group.position.x + rx * side * (v.radius + 0.9);
  let nz = v.group.position.z + rz * side * (v.radius + 0.9);
  [nx, nz] = collide(nx, nz, 0.5);
  P.g.position.set(nx, 0, nz);
  P.heading = v.heading;
  P.y = 0; P.vy = 0;
}

function updatePlayer(dt) {
  const P = G.player;
  P.punchCd = Math.max(0, P.punchCd - dt);
  if (G.mode === 'dialog') return; // rooted while talking
  if (P.vehicle) {
    const v = P.vehicle;
    let input = {
      thr: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
      steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0),
      brake: !!keys.Space,
    };
    if (G.autoDrive && !keys.KeyW && !keys.KeyA && !keys.KeyD && !keys.KeyS) {
      // Screenshot staging only: follow the waypoint loop (a downtown ring
      // of junctions by default; a scene may pin its own with G.autoWps).
      const wps = G.autoWps ?? [[56, 56], [56, -56], [-56, -56], [-56, 56]];
      const wp = wps[G.autoWp ?? 0];
      const dx = wp[0] - v.group.position.x, dz = wp[1] - v.group.position.z;
      if (Math.hypot(dx, dz) < 13) G.autoWp = ((G.autoWp ?? 0) + 1) % 4;
      input = { thr: 0.8, steer: clamp(wrapAng(Math.atan2(dx, dz) - v.heading) * 1.4, -1, 1), brake: false };
    }
    if (v.stats.pedal && input.thr > 0) { P.legL.rotation.x = Math.sin(G.time * 11) * 0.7; P.legR.rotation.x = -Math.sin(G.time * 11) * 0.7; }
    stepVehicle(v, input, dt);
    if (v.stats.two) {
      P.g.position.copy(v.group.position);
      P.g.position.y = 0.55;
      P.g.rotation.y = v.heading;
      P.torso.rotation.x = (v.type === 'sportbike' ? 0.42 : v.type === 'bike' ? 0.28 : 0.08) + clamp(v.speed, 0, 30) * 0.004;
    }
    P.heading = v.heading;
    return;
  }
  // On foot: camera-relative WASD.
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let iz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  const moving = ix !== 0 || iz !== 0;
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  const target = moving ? (sprint ? 6.6 : 3.4) : 0;
  P.speed = lerp(P.speed, target, 1 - Math.exp(-9 * dt));
  if (moving) {
    // Move in the input direction (camera-relative); the body turns to face it.
    const sy = Math.sin(G.camYaw), cy = Math.cos(G.camYaw);
    let mx = sy * -iz - cy * ix, mz = cy * -iz + sy * ix;
    const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    P.heading = angToward(P.heading, Math.atan2(mx, mz), 11 * dt);
    let nx = P.g.position.x + mx * P.speed * dt;
    let nz = P.g.position.z + mz * P.speed * dt;
    if (!groundOk(nx, nz)) {
      if (groundOk(nx, P.g.position.z)) nz = P.g.position.z;
      else if (groundOk(P.g.position.x, nz)) nx = P.g.position.x;
      else { nx = P.g.position.x; nz = P.g.position.z; }
    }
    const [cx, cz] = collide(nx, nz, 0.45);
    P.g.position.x = cx; P.g.position.z = cz;
    P.stepT -= dt * P.speed;
    if (P.stepT <= 0 && P.y === 0) { sfx.step(); P.stepT = 2.6; }
  }
  // Hop.
  if (keys.Space && P.y === 0) { P.vy = 4.4; P.y = 0.01; }
  if (P.y > 0 || P.vy !== 0) {
    P.vy -= 13 * dt; P.y += P.vy * dt;
    if (P.y <= 0) { P.y = 0; P.vy = 0; }
  }
  P.g.position.y = P.y;
  P.g.rotation.y = P.heading;
  const bob = animateWalk(P, P.speed, dt);
  if (P.speed > 0.2) P.g.position.y = P.y + bob;
  // Punch / shoot share the F key: close target -> punch, else gunfire.
  if (P.punchT > 0) {
    P.punchT -= dt;
    const k = Math.sin((0.24 - P.punchT) / 0.24 * Math.PI);
    P.armR.rotation.x = -1.9 * k;
  }
}

// --- Pedestrians ---------------------------------------------------------------
const RING = 19.5;
export function buildPeds(scene) {
  const rnd = mulberry(31337);
  const outfits = [
    { hat: 'panama', shades: true }, { tropic: true }, { hat: 'fedora' }, { tropic: true, shades: true },
    {}, { hat: 'panama' }, { shades: true }, { tropic: true, hat: 'panama' },
  ];
  for (let i = 0; i < 26; i++) {
    const body = makePerson(outfits[i % outfits.length]);
    const bi = Math.floor(rnd() * 6), bj = Math.floor(rnd() * 6);
    const cx = -140 + bi * 56, cz = -140 + bj * 56;
    const corner = Math.floor(rnd() * 4);
    const ped = {
      ...body, state: 'walk', t: rnd() * 4, speed: 1.05 + rnd() * 0.6,
      bx: bi, bj: bj, corner, prog: rnd(), downT: 0, chatWith: null, dog: null,
    };
    placePedOnRing(ped);
    scene.add(body.g);
    if (i % 5 === 2) { // every fifth walker has a dog trotting along
      const dog = makeDog();
      ped.dog = dog; scene.add(dog.g);
    }
    G.peds.push(ped);
  }
}
function ringPoint(bx, bj, corner, prog) {
  const cx = -140 + bx * 56, cz = -140 + bj * 56;
  const c = [[-RING, -RING], [RING, -RING], [RING, RING], [-RING, RING]][corner];
  const n = [[RING, -RING], [RING, RING], [-RING, RING], [-RING, -RING]][corner];
  return [cx + c[0] + (n[0] - c[0]) * prog, cz + c[1] + (n[1] - c[1]) * prog];
}
function placePedOnRing(ped) {
  const [x, z] = ringPoint(ped.bx, ped.bj, ped.corner, ped.prog);
  ped.g.position.set(x, 0, z);
}
function makeDog() {
  const g = new THREE.Group();
  const mat = lam([0x8a5a33, 0x3a3230, 0xd8cfc0][Math.floor(Math.random() * 3)]);
  box(0.52, 0.3, 0.24, mat, 0, 0.36, 0, g);
  box(0.2, 0.2, 0.2, mat, 0, 0.48, 0.32, g);
  const tail = box(0.06, 0.3, 0.06, mat, 0, 0.52, -0.3, g);
  tail.rotation.x = -0.7;
  for (const [lx, lz] of [[-0.1, 0.18], [0.1, 0.18], [-0.1, -0.18], [0.1, -0.18]]) box(0.07, 0.24, 0.07, mat, lx, 0.12, lz, g);
  return { g, phase: Math.random() * 6 };
}

function updatePeds(dt) {
  const pp = playerPos();
  for (const ped of G.peds) {
    const pos = ped.g.position;
    ped.t -= dt;
    // Danger sense: gunfire, crashes and fast cars scatter walkers.
    const danger = (G.time - (G.lastDangerAt ?? -99) < 0.6) &&
      d2(pos.x, pos.z, G.lastDangerX ?? 0, G.lastDangerZ ?? 0) < 17;
    if (danger && ped.state !== 'down') { ped.state = 'flee'; ped.t = 2.4 + Math.random(); ped.fleeX = G.lastDangerX; ped.fleeZ = G.lastDangerZ; }
    if (ped.state === 'down') {
      ped.downT -= dt;
      ped.g.rotation.x = lerp(ped.g.rotation.x, -Math.PI / 2, 1 - Math.exp(-8 * dt));
      if (ped.downT <= 0) { ped.state = 'flee'; ped.t = 2; ped.fleeX = pp.x; ped.fleeZ = pp.z; }
      continue;
    }
    ped.g.rotation.x = lerp(ped.g.rotation.x, 0, 1 - Math.exp(-8 * dt));
    let mvx = 0, mvz = 0, spd = 0;
    if (ped.state === 'flee') {
      const dx = pos.x - (ped.fleeX ?? pp.x), dz = pos.z - (ped.fleeZ ?? pp.z);
      const m = Math.hypot(dx, dz) || 1;
      mvx = dx / m; mvz = dz / m; spd = 4.4;
      ped.armL.rotation.x = -2.6; ped.armR.rotation.x = -2.6;
      if (ped.t <= 0) { ped.state = 'walk'; snapToRing(ped); }
    } else if (ped.state === 'chat') {
      spd = 0;
      ped.armR.rotation.x = Math.sin(G.time * 2.4 + ped.phase) * 0.35 - 0.3;
      if (ped.t <= 0) { ped.state = 'walk'; ped.chatWith = null; }
    } else {
      // Walk the block ring; sometimes cross to the next block.
      const [tx, tz] = ringPoint(ped.bx, ped.bj, ped.corner, 1);
      const dx = tx - pos.x, dz = tz - pos.z, m = Math.hypot(dx, dz);
      if (m < 0.4) {
        if (Math.random() < 0.18) { // cross the street
          const dir = Math.floor(Math.random() * 4);
          const nbx = clamp(ped.bx + [1, 0, -1, 0][dir], 0, 5), nbj = clamp(ped.bj + [0, 1, 0, -1][dir], 0, 5);
          ped.bx = nbx; ped.bj = nbj; ped.corner = [2, 3, 0, 1][dir]; ped.prog = 0;
        } else { ped.corner = (ped.corner + 1) % 4; ped.prog = 0; }
        // Chance to stop and chat with a nearby walker.
        if (Math.random() < 0.1) {
          for (const o of G.peds) {
            if (o !== ped && o.state === 'walk' && d2(pos.x, pos.z, o.g.position.x, o.g.position.z) < 2.2) {
              ped.state = 'chat'; ped.t = 3 + Math.random() * 3;
              o.state = 'chat'; o.t = ped.t; o.chatWith = ped;
              ped.g.rotation.y = Math.atan2(o.g.position.x - pos.x, o.g.position.z - pos.z);
              o.g.rotation.y = Math.atan2(pos.x - o.g.position.x, pos.z - o.g.position.z);
              break;
            }
          }
        }
      } else {
        mvx = dx / m; mvz = dz / m; spd = ped.speed;
        ped.prog = Math.min(1, ped.prog + (spd * dt) / (RING * 2));
      }
    }
    if (spd > 0) {
      let nx = pos.x + mvx * spd * dt, nz = pos.z + mvz * spd * dt;
      if (!groundOk(nx, nz)) { nx = pos.x; nz = pos.z; ped.state = 'walk'; snapToRing(ped); }
      else {
        const [cx, cz] = collide(nx, nz, 0.4);
        pos.x = cx; pos.z = cz;
      }
      ped.g.rotation.y = angToward(ped.g.rotation.y, Math.atan2(mvx, mvz), 10 * dt);
      const bob = animateWalk(ped, spd, dt, ped.state === 'flee' ? 0.3 : 1);
      pos.y = bob;
    } else if (ped.state !== 'chat') {
      ped.armL.rotation.x *= 0.9; ped.armR.rotation.x *= 0.9;
    }
    // Vehicle impact.
    for (const v of G.vehicles) {
      if (Math.abs(v.speed) < 3.4) continue;
      if (d2(pos.x, pos.z, v.group.position.x, v.group.position.z) < v.radius + 0.45) {
        ped.state = 'down'; ped.downT = 2.6;
        if (G.hooks.onPedHit) G.hooks.onPedHit(ped, v);
        break;
      }
    }
    // Dog trots at its owner's heel.
    if (ped.dog) {
      const d = ped.dog;
      const tx = pos.x - Math.sin(ped.g.rotation.y) * 0.8 + 0.4, tz = pos.z - Math.cos(ped.g.rotation.y) * 0.8;
      const dx = tx - d.g.position.x, dz = tz - d.g.position.z, m = Math.hypot(dx, dz);
      if (m > 0.25) {
        const ds = Math.min(m * 3.2, 5.2) * dt;
        d.g.position.x += (dx / m) * ds; d.g.position.z += (dz / m) * ds;
        d.g.rotation.y = Math.atan2(dx, dz);
        d.phase += dt * 13;
        d.g.position.y = Math.abs(Math.sin(d.phase)) * 0.05;
      }
    }
  }
}
function snapToRing(ped) {
  // After a flee, re-attach to the nearest block ring.
  let best = 1e9;
  for (let bj = 0; bj < 6; bj++) for (let bi = 0; bi < 6; bi++) {
    const [x, z] = ringPoint(bi, bj, 0, 0);
    const dd = d2(ped.g.position.x, ped.g.position.z, x, z);
    if (dd < best) { best = dd; ped.bx = bi; ped.bj = bj; }
  }
  ped.corner = 0; ped.prog = 0;
  placePedOnRing(ped);
}

export function updateFolks(dt) {
  updatePlayer(dt);
  updatePeds(dt);
}
