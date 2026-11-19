// crowd.js — the pedestrians of Coral Bay. Each one is a small
// articulated figure with its own state machine: stroll between block
// corners, wait at the kerb, idle over a phone, watch trouble, cower at
// gunfire, flee from danger. Perception runs on a staggered timer per
// person and reads the shared event stamps (gunshots, crashes) plus the
// speed and heading of nearby cars.

import { clamp, rand, pick, wrapAngle } from './base.js';
import { G, pushOutOfBuildings } from './state.js';

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRT = [0xff5a76, 0x3ec6b8, 0xffb340, 0x5a8aff, 0x9fe870, 0xffffff, 0xff7e47, 0xc95dd8];
const PANTS = [0x2c3550, 0x4a3b2c, 0x5d6670, 0x223528, 0x71584a];

function buildFigure(THREE, rng) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: pick(rng, SKIN), roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: pick(rng, SHIRT), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: pick(rng, PANTS), roughness: 0.95 });
  const mkLimb = (mat, w, h, d, x, y, z) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, -h / 2, 0);                    // pivot at the joint
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true;
    g.add(m); return m;
  };
  const legL = mkLimb(pants, 0.15, 0.52, 0.17, -0.11, 0.54, 0);
  const legR = mkLimb(pants, 0.15, 0.52, 0.17, 0.11, 0.54, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.6, 0.24), shirt);
  torso.position.y = 0.86; torso.castShadow = true; g.add(torso);
  const armL = mkLimb(shirt, 0.11, 0.5, 0.13, -0.29, 1.12, 0);
  const armR = mkLimb(shirt, 0.11, 0.5, 0.13, 0.29, 1.12, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), skin);
  head.position.y = 1.33; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6),
    new THREE.MeshStandardMaterial({ color: pick(rng, [0x2b1c10, 0x4a2f18, 0x777777, 0xb5894a, 0x181818]), roughness: 1 }));
  hair.position.y = 1.38; hair.scale.y = 0.72; g.add(hair);
  return { g, legL, legR, armL, armR, head };
}

// Sidewalk loops: the four corners of the pavement ring just inside
// each block face (the ground texture paints that ring as sidewalk).
function cornerLoop(b) {
  const m = 1.7;
  return [
    [b.x0 + m, b.z0 + m], [b.x1 - m, b.z0 + m],
    [b.x1 - m, b.z1 - m], [b.x0 + m, b.z1 - m],
  ];
}

export function spawnCrowd(THREE, scene, count) {
  const rng = G.world;
  const loops = G.blocks.map(cornerLoop);
  for (let i = 0; i < count; i++) {
    const fig = buildFigure(THREE, rng);
    const bi = Math.floor(rng() * loops.length);
    const ci = Math.floor(rng() * 4);
    const [x, z] = loops[bi][ci];
    fig.g.position.set(x, 0, z);
    const hScale = rand(rng, 0.93, 1.05);
    fig.g.scale.setScalar(hScale);
    scene.add(fig.g);
    G.peds.push({
      ...fig, block: bi, corner: ci, loops, hScale,
      state: 'stroll', stateT: rand(rng, 0, 2),
      speed: rand(rng, 1.1, 1.9), nerve: rand(rng, 0.8, 1.25),
      phase: rng() * 6.28, think: rng() * 0.25, yaw: rng() * 6.28,
      threatX: 0, threatZ: 0, down: 0, seenShotAt: -1, seenCrashAt: -1,
    });
  }
}

// A driver bailing out of a car the player just took: appears at the
// door and runs. Also used to replace knocked-down pedestrians.
export function spawnFleeingPed(THREE, scene, x, z, fromX, fromZ) {
  const rng = G.world;
  const fig = buildFigure(THREE, rng);
  fig.g.position.set(x, 0, z);
  scene.add(fig.g);
  fig.g.scale.setScalar(rand(rng, 0.93, 1.05));
  const ped = {
    ...fig, block: 0, corner: 0, loops: G.blocks.map(cornerLoop), hScale: fig.g.scale.x,
    state: 'flee', stateT: 3.5, speed: rand(rng, 1.5, 1.9), nerve: 1,
    phase: 0, think: 0.2, yaw: Math.atan2(x - fromX, z - fromZ),
    threatX: fromX, threatZ: fromZ, down: 0, seenShotAt: -1, seenCrashAt: -1,
  };
  // send the refugee to the nearest block loop when it calms down
  let best = 1e9;
  ped.loops.forEach((loop, bi) => loop.forEach(([cx, cz], ci) => {
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < best) { best = d; ped.block = bi; ped.corner = ci; }
  }));
  G.peds.push(ped);
  return ped;
}

function setState(ped, state, t) { ped.state = state; ped.stateT = t; }

function perceive(ped) {
  const p = ped.g.position;
  const ev = G.events;
  if (ev.shot && ev.shot.t !== ped.seenShotAt) {
    const d = Math.hypot(ev.shot.x - p.x, ev.shot.z - p.z);
    if (d < 15 / ped.nerve) {
      ped.seenShotAt = ev.shot.t;
      ped.threatX = ev.shot.x; ped.threatZ = ev.shot.z;
      setState(ped, 'cower', 0.8);
      return;
    }
  }
  if (ev.crash && ev.crash.t !== ped.seenCrashAt) {
    const d = Math.hypot(ev.crash.x - p.x, ev.crash.z - p.z);
    if (d < 26 / ped.nerve) {
      ped.seenCrashAt = ev.crash.t;
      if (d < 11) { ped.threatX = ev.crash.x; ped.threatZ = ev.crash.z; setState(ped, 'flee', rand(G.world, 2.5, 4)); }
      else setState(ped, 'watch', rand(G.world, 2, 4));
      return;
    }
  }
  // a car bearing down fast: step off early
  for (const car of G.cars) {
    if (Math.abs(car.speed) < 10) continue;
    const dx = p.x - car.g.position.x, dz = p.z - car.g.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 130) continue;
    const fx = Math.sin(car.head), fz = Math.cos(car.head);
    const along = dx * fx + dz * fz;
    const lat = Math.abs(dx * fz - dz * fx);
    if (along > 2 && along < 12 && lat < 2.6) {
      ped.threatX = car.g.position.x; ped.threatZ = car.g.position.z;
      setState(ped, 'flee', rand(G.world, 1.6, 2.6));
      return;
    }
  }
  // police drama nearby is worth stopping for
  if (G.wanted.stars > 0) {
    for (const cop of G.cops) {
      const d = Math.hypot(cop.car.g.position.x - p.x, cop.car.g.position.z - p.z);
      if (d < 22 && Math.abs(cop.car.speed) > 5) { setState(ped, 'watch', 1.6); return; }
    }
  }
}

export function updateCrowd(dt) {
  const rng = G.world;
  for (const ped of G.peds) {
    const p = ped.g.position;
    if (ped.down > 0) {
      ped.down -= dt;
      if (ped.down <= 0) { // crawl away and rejoin the city elsewhere
        const b = G.blocks[Math.floor(rng() * G.blocks.length)];
        p.set(b.x0 - 1.7, 0, b.z0 - 1.7);
        ped.g.rotation.x = 0;
        setState(ped, 'stroll', 1);
      }
      continue;
    }
    ped.think -= dt;
    if (ped.think <= 0 && ped.state !== 'flee' && ped.state !== 'cower') {
      ped.think = rand(rng, 0.18, 0.3);
      perceive(ped);
    }
    ped.stateT -= dt;
    let moveSpeed = 0, targetYaw = ped.yaw;
    if (ped.state === 'stroll') {
      const loop = ped.loops[ped.block];
      const [tx, tz] = loop[ped.corner];
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.7) {
        const roll = rng();
        if (roll < 0.16) setState(ped, 'idle', rand(rng, 2, 4.5));
        else if (roll < 0.34) setState(ped, 'wait', rand(rng, 1.2, 3.2));
        else if (roll < 0.44) { // cross to a neighbouring block's loop
          ped.block = Math.floor(rng() * ped.loops.length);
          let bc = 0, bd = 1e9;
          ped.loops[ped.block].forEach(([cx, cz], ci) => {
            const dd = (cx - p.x) ** 2 + (cz - p.z) ** 2;
            if (dd < bd) { bd = dd; bc = ci; }
          });
          ped.corner = bc;
        } else ped.corner = (ped.corner + 1) % 4;
      } else {
        targetYaw = Math.atan2(dx, dz);
        moveSpeed = ped.speed;
      }
    } else if (ped.state === 'flee') {
      const dx = p.x - ped.threatX, dz = p.z - ped.threatZ;
      const d = Math.hypot(dx, dz) || 1;
      targetYaw = Math.atan2(dx / d + Math.sin(G.time * 1.7 + ped.phase) * 0.25, dz / d);
      moveSpeed = ped.speed * 1.9;
      if (ped.stateT <= 0) setState(ped, 'stroll', 1);
    } else if (ped.state === 'cower') {
      if (ped.stateT <= 0) { setState(ped, 'flee', rand(rng, 2.5, 4.5)); }
    } else if (ped.state === 'watch') {
      const ev = G.events.crash;
      const tx = G.driveCar ? G.driveCar.g.position.x : (ev ? ev.x : p.x);
      const tz = G.driveCar ? G.driveCar.g.position.z : (ev ? ev.z : p.z);
      targetYaw = Math.atan2(tx - p.x, tz - p.z);
      if (ped.stateT <= 0) setState(ped, 'stroll', 1);
    } else { // wait / idle just run their clocks out
      if (ped.stateT <= 0) setState(ped, 'stroll', 1);
    }
    ped.yaw += wrapAngle(targetYaw - ped.yaw) * Math.min(1, dt * 8);
    if (moveSpeed > 0) {
      p.x += Math.sin(ped.yaw) * moveSpeed * dt;
      p.z += Math.cos(ped.yaw) * moveSpeed * dt;
      const [nx, nz] = pushOutOfBuildings(p.x, p.z, 0.4);
      p.x = nx; p.z = nz;
      ped.phase += dt * moveSpeed * 3.4;
    }
    // ---- pose the figure for its state
    const sw = Math.sin(ped.phase) * (moveSpeed > 0 ? 0.55 : 0);
    ped.legL.rotation.x = sw; ped.legR.rotation.x = -sw;
    ped.armL.rotation.x = ped.state === 'idle' ? -0.25 : -sw * 0.7;
    ped.armR.rotation.x = ped.state === 'idle' ? -1.85 : sw * 0.7;
    ped.head.rotation.x = ped.state === 'idle' ? 0.38 : ped.state === 'cower' ? 0.5 : 0;
    const targetScaleY = (ped.state === 'cower' ? 0.64 : 1) * (ped.hScale || 1);
    ped.g.scale.y += (targetScaleY - ped.g.scale.y) * Math.min(1, dt * 10);
    ped.g.position.y = moveSpeed > 0 ? Math.abs(Math.sin(ped.phase)) * 0.045 : 0;
    ped.g.rotation.y = ped.yaw;
    void clamp;
  }
}

// A car meeting a pedestrian at speed knocks them down; slow contact
// just shoves them into a flee. Returns true when a crime happened
// (the caller decides who is blamed).
export function carMeetPed(car) {
  let crime = false;
  for (const ped of G.peds) {
    if (ped.down > 0) continue;
    const p = ped.g.position;
    const dx = p.x - car.g.position.x, dz = p.z - car.g.position.z;
    if (dx * dx + dz * dz > 4.4) continue;
    if (Math.abs(car.speed) > 3.2) {
      ped.down = 4;
      ped.g.rotation.x = -Math.PI / 2;
      crime = true;
      if (G.fx) G.fx.dust(p.x, 0.4, p.z, 6);
    } else {
      ped.threatX = car.g.position.x; ped.threatZ = car.g.position.z;
      setState(ped, 'flee', 2);
    }
  }
  return crime;
}
