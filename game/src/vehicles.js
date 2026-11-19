// vehicles.js — every drivable machine in Coral Bay: sports coupe, vintage
// roadster, monster truck, two motorcycles, a bicycle, traffic, police
// Interceptors and the helicopter — plus arcade driving physics and traffic AI.
"use strict";

const VEHICLE_KINDS = {
  comet: { name: "Comet GT", top: 47, accel: 27, radius: 1.9, open: false },
  roadster: { name: "Heritage Roadster", top: 34, accel: 18, radius: 1.9, open: true },
  crusher: { name: "Dune Crusher", top: 31, accel: 17, radius: 2.3, open: true },
  marlin: { name: "Marlin 250", top: 39, accel: 25, radius: 0.8, open: true, bike: true },
  falco: { name: "Falco RR", top: 54, accel: 33, radius: 0.8, open: true, bike: true },
  bicycle: { name: "Beach Cruiser", top: 13.5, accel: 10, radius: 0.7, open: true, bike: true, pedal: true },
  sedan: { name: "Sedan", top: 30, accel: 15, radius: 1.9, open: false },
  pickup: { name: "Pickup", top: 28, accel: 14, radius: 2, open: false },
  van: { name: "Van", top: 26, accel: 13, radius: 2.1, open: false },
  interceptor: { name: "Interceptor", top: 49, accel: 28, radius: 1.9, open: false },
  heli: { name: "Helicopter", top: 42, accel: 16, radius: 2.4, open: false, heli: true },
};
const CAR_COLORS = [0xc93a2e, 0x2e7fc9, 0xf2b13d, 0x39b5a6, 0xe8e4da, 0x30343a, 0xff8fab, 0x7a5fd0, 0x58a05c];

function vehicleMaterial(color) { return new THREE.MeshLambertMaterial({ color }); }

function makeWheel(r, w) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12), vehicleMaterial(0x181a1c));
  m.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.04, 8), vehicleMaterial(0xb9bec2));
  hub.rotation.z = Math.PI / 2; m.add(hub);
  m.castShadow = true;
  return m;
}

function makeVehicleMesh(kind, color) {
  const g = new THREE.Group();
  const wheels = [], steer = [];
  const paint = vehicleMaterial(color);
  const dark = vehicleMaterial(0x22262a), glass = vehicleMaterial(0x9fd4e8);
  function box(w, h, d, mat, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); if (ry) m.rotation.y = ry;
    m.castShadow = true; g.add(m); return m;
  }
  function wheel(x, z, r, w, steered) {
    const m = makeWheel(r, w); m.position.set(x, r, z); g.add(m);
    wheels.push(m); if (steered) steer.push(m);
    return m;
  }
  if (kind === "comet") {
    box(2.1, 0.62, 4.9, paint, 0, 0.62, 0);
    box(1.9, 0.5, 2.4, glass, 0, 1.14, -0.2);
    box(2.14, 0.16, 0.5, paint, 0, 1.02, -2.3);
    box(0.5, 0.14, 0.3, dark, -0.7, 0.62, 2.42); box(0.5, 0.14, 0.3, dark, 0.7, 0.62, 2.42);
    wheel(-1.02, 1.55, 0.42, 0.3, true); wheel(1.02, 1.55, 0.42, 0.3, true);
    wheel(-1.02, -1.55, 0.44, 0.32, false); wheel(1.02, -1.55, 0.44, 0.32, false);
  } else if (kind === "roadster") {
    box(2, 0.66, 4.7, paint, 0, 0.66, 0);
    box(1.8, 0.34, 1.7, vehicleMaterial(0x6e4f30), 0, 1.05, -0.5);
    box(1.86, 0.3, 0.16, glass, 0, 1.16, 0.5);
    wheel(-1.05, 1.5, 0.46, 0.26, true); wheel(1.05, 1.5, 0.46, 0.26, true);
    wheel(-1.05, -1.5, 0.46, 0.26, false); wheel(1.05, -1.5, 0.46, 0.26, false);
  } else if (kind === "crusher") {
    box(2.5, 0.9, 5.2, paint, 0, 1.55, 0);
    box(2.2, 0.85, 2.2, dark, 0, 2.4, -0.3);
    box(2.3, 0.4, 2.3, glass, 0, 2.45, -0.3);
    wheel(-1.45, 1.75, 0.95, 0.6, true); wheel(1.45, 1.75, 0.95, 0.6, true);
    wheel(-1.45, -1.75, 0.95, 0.6, false); wheel(1.45, -1.75, 0.95, 0.6, false);
  } else if (kind === "marlin" || kind === "falco") {
    const sport = kind === "falco";
    box(0.42, 0.5, 2.2, paint, 0, 0.72, 0);
    box(0.36, 0.42, 0.8, dark, 0, 0.98, -0.5);
    if (sport) { box(0.4, 0.34, 0.7, glass, 0, 0.95, 0.75); box(0.3, 0.2, 0.9, paint, 0, 1.02, -0.95); }
    wheel(0, 1.02, 0.4, 0.14, true); wheel(0, -1.02, 0.42, 0.16, false);
  } else if (kind === "bicycle") {
    box(0.08, 0.08, 1.7, paint, 0, 0.62, 0);
    box(0.3, 0.1, 0.4, dark, 0, 0.95, -0.45);
    wheel(0, 0.78, 0.36, 0.06, true); wheel(0, -0.78, 0.36, 0.06, false);
  } else if (kind === "heli") {
    box(2.3, 2, 5.6, paint, 0, 1.9, 0.3);
    box(2, 1.1, 1.8, glass, 0, 2.1, 2.6);
    box(0.7, 0.7, 4.6, paint, 0, 2.3, -4.4);
    box(0.24, 1.7, 1.1, paint, 0, 3.1, -6.5);
    box(4.4, 0.3, 1.1, dark, 0, 1, 0.4); // skids crossbar hint
    box(0.24, 0.24, 5.4, dark, -1.1, 0.35, 0.3); box(0.24, 0.24, 5.4, dark, 1.1, 0.35, 0.3);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.08, 0.5), dark);
    rotor.position.y = 3.55; g.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 0.3), dark);
    tailRotor.position.set(0.45, 3.1, -6.5); g.add(tailRotor);
    g.userData.rotor = rotor; g.userData.tailRotor = tailRotor;
  } else { // sedan, pickup, van, interceptor share a family look
    const h = kind === "van" ? 2.2 : 0.78, len = kind === "pickup" ? 5.2 : 4.7;
    box(2.05, h, len, paint, 0, kind === "van" ? 1.35 : 0.68, 0);
    if (kind !== "van") box(1.85, 0.52, 2.2, glass, 0, 1.28, -0.15);
    if (kind === "pickup") box(1.9, 0.5, 1.9, dark, 0, 1.05, -1.5);
    if (kind === "interceptor") {
      box(2.06, 0.3, len * 0.5, vehicleMaterial(0xf2f2f2), 0, 0.7, 0.4);
      const bar = box(1.3, 0.2, 0.5, dark, 0, 1.68, -0.15);
      const rl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      rl.position.set(-0.34, 0.2, 0); bar.add(rl);
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
      bl.position.set(0.34, 0.2, 0); bar.add(bl);
      g.userData.lightBar = bar;
    }
    wheel(-1, 1.5, 0.42, 0.28, true); wheel(1, 1.5, 0.42, 0.28, true);
    wheel(-1, -1.5, 0.42, 0.28, false); wheel(1, -1.5, 0.42, 0.28, false);
  }
  // headlights that wake up at night
  const hl = new THREE.MeshBasicMaterial({ color: 0x555544 });
  for (const s of [-0.6, 0.6]) {
    if (kind === "bicycle" || kind === "heli") continue;
    const lampMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), hl);
    lampMesh.position.set(s, 0.72, (VEHICLE_KINDS[kind].heli ? 3.4 : 2.36));
    g.add(lampMesh);
  }
  g.userData.headlightMat = hl;
  return { group: g, wheels, steer };
}

function spawnVehicle(kind, x, z, heading, color, driver) {
  const built = makeVehicleMesh(kind, color !== undefined ? color : pick(CAR_COLORS));
  built.group.traverse((o) => { if (o.material && o.material.color) o.userData.c = o.material.color.clone(); });
  built.group.position.set(x, 0, z);
  built.group.rotation.y = heading || 0;
  G.scene.add(built.group);
  const v = {
    kind, name: VEHICLE_KINDS[kind].name, mesh: built.group, wheels: built.wheels, steerW: built.steer,
    speed: 0, steer: 0, health: 100, alive: true, driver: driver || null,
    vy: 0, alt: 0, rotorSpin: 0, smokeT: 0, aiTarget: null, aiWait: 0, flashT: rand(0, 1),
  };
  G.vehicles.push(v);
  if (driver === "traffic") G.traffic.push(v);
  return v;
}

function buildVehicles(scene) {
  spawnVehicle("comet", -664, 96, Math.PI / 2, 0xff5f9e);                    // Celia's Comet at the marina
  spawnVehicle("crusher", SPOTS.crusherYard.x, SPOTS.crusherYard.z, 0.4, 0xf2762e); // industrial yard
  spawnVehicle("falco", SPOTS.beachFalco.x, SPOTS.beachFalco.z, Math.PI, 0x2e7fc9); // beachfront
  spawnVehicle("roadster", SPOTS.roadster.x, SPOTS.roadster.z, 2.4, 0x7a1f24);      // Palmera
  spawnVehicle("bicycle", SPOTS.bicycle.x, SPOTS.bicycle.z, 0, 0x39b5a6);
  spawnVehicle("marlin", -596, -216, 0.3, 0x58a05c);                                // cruiser bike by the marina cafes
  spawnVehicle("heli", SPOTS.airportHeli.x, SPOTS.airportHeli.z, 0, 0xe8e4da);       // airport apron
  const parkedSpots = [[150, -20], [-330, 130], [90, 480], [-20, -330], [490, -90], [-490, -490], [250, 250], [-90, 90]];
  for (const s of parkedSpots) spawnVehicle(pick(["sedan", "pickup", "van", "sedan"]), s[0], s[1], rand(0, 6.28));
  for (let i = 0; i < 13; i++) {
    const road = pick(ROAD_LINES), along = rand(-760, 760), horiz = rng() > 0.5;
    const v = spawnVehicle(pick(["sedan", "pickup", "van"]), horiz ? along : road, horiz ? road : along, 0, undefined, "traffic");
    v.mesh.rotation.y = horiz ? (rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() > 0.5 ? 0 : Math.PI);
    v.aiTarget = nextTrafficPoint(v);
  }
}
function nextTrafficPoint(v) {
  const p = v.mesh.position;
  const fx = Math.sin(v.mesh.rotation.y), fz = Math.cos(v.mesh.rotation.y);
  let nx = Math.round((p.x + fx * 90) / 160) * 160, nz = Math.round((p.z + fz * 90) / 160) * 160;
  nx = clamp(nx, -640, 640); nz = clamp(nz, -640, 640);
  if (rng() > 0.55) { // turn at the junction
    if (Math.abs(fx) > Math.abs(fz)) nz = clamp(Math.round(p.z / 160) * 160 + pick([-160, 160]), -640, 640);
    else nx = clamp(Math.round(p.x / 160) * 160 + pick([-160, 160]), -640, 640);
  }
  const lane = 6.5;
  return { x: nx + (Math.abs(fz) > 0.5 ? lane * Math.sign(fz || 1) : 0), z: nz + (Math.abs(fx) > 0.5 ? -lane * Math.sign(fx || 1) : 0) };
}

function nearestVehicle(x, z, maxD) {
  let best = null, bd = maxD;
  for (const v of G.vehicles) {
    if (v.driver || !v.alive) continue;
    const d = dist2d(x, z, v.mesh.position.x, v.mesh.position.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function enterVehicle(v) {
  G.onFoot = false; G.vehicle = v; v.driver = "player"; v.speed = 0;
  const kind = VEHICLE_KINDS[v.kind];
  if (kind.open) { G.player.mesh.visible = true; }
  else G.player.mesh.visible = false;
  G.camDist = v.kind === "heli" ? 17 : (kind.bike ? 7.5 : 10.5);
  sfxInit();
  showToast("Driving the " + v.name + " — WASD to drive, Space handbrake, E to exit" +
    (v.kind === "heli" ? ", R/F to climb and sink" : ""));
  onPlayerEnterVehicle(v);
}
function exitVehicle() {
  const v = G.vehicle; if (!v) return;
  v.driver = null;
  const m = v.mesh, side = 2.4;
  const px = m.position.x + Math.cos(m.rotation.y) * -side, pz = m.position.z - Math.sin(m.rotation.y) * -side;
  const fixed = collideCircle(px, pz, 0.55);
  G.player.mesh.position.set(fixed.x, 0, fixed.z);
  G.player.mesh.visible = true;
  G.player.mesh.rotation.set(0, m.rotation.y, 0);
  posePlayerSeated(false);
  G.onFoot = true; G.vehicle = null;
  G.camDist = 9;
}
function posePlayerSeated(seated) {
  const p = G.player; if (!p) return;
  p.ll.rotation.x = seated ? -1.35 : 0; p.rl.rotation.x = seated ? -1.35 : 0;
  p.la.rotation.x = seated ? -0.75 : 0; p.ra.rotation.x = seated ? -0.75 : 0;
}

// --- driving ------------------------------------------------------------------
function driveVehicle(v, dt, input) {
  const K = VEHICLE_KINDS[v.kind];
  const m = v.mesh;
  if (K.heli) { flyHelicopter(v, dt, input); return; }
  const throttle = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const steerIn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  v.steer = lerp(v.steer, steerIn, clamp(dt * 7, 0, 1));
  if (throttle > 0) v.speed += K.accel * dt * (1 - Math.max(0, v.speed) / K.top);
  else if (throttle < 0) v.speed += (v.speed > 0.5 ? -34 : -K.accel * 0.6) * dt;
  else v.speed -= v.speed * 0.55 * dt;
  if (input.brake) v.speed -= v.speed * 3.2 * dt;
  v.speed -= v.speed * Math.abs(v.steer) * 0.35 * dt;
  v.speed = clamp(v.speed, -13, K.top);
  if (Math.abs(v.speed) < 0.04 && throttle === 0) v.speed = 0;
  const turnRate = v.steer * clamp(Math.abs(v.speed) / 9, 0, 1) * (K.bike ? 1.5 : 0.95);
  m.rotation.y += turnRate * dt * (v.speed >= 0 ? 1 : -1);
  const fx = Math.sin(m.rotation.y), fz = Math.cos(m.rotation.y);
  const prevX = m.position.x, prevZ = m.position.z;
  let nx = m.position.x + fx * v.speed * dt;
  let nz = m.position.z + fz * v.speed * dt;
  const fixed = collideCircle(nx, nz, K.radius);
  const impact = Math.abs(fixed.x - nx) + Math.abs(fixed.z - nz);
  nx = fixed.x; nz = fixed.z;
  if (!isLand(nx, nz) && isLand(prevX, prevZ)) { nx = prevX; nz = prevZ; if (v.speed > 4) damageVehicle(v, 3); v.speed *= 0.3; }
  if (impact > 0.4 && Math.abs(v.speed) > 9) { damageVehicle(v, Math.abs(v.speed) * 0.22); if (v.driver === "player") sfxCrash(Math.abs(v.speed)); v.speed *= 0.35; }
  m.position.x = nx; m.position.z = nz;
  // wheels, lean and rider pose
  const wr = v.speed * dt / 0.42;
  for (const w of v.wheels) w.rotation.x += wr;
  for (const w of v.steerW) w.rotation.y = v.steer * 0.42;
  if (K.bike) {
    const targetRoll = -v.steer * clamp(Math.abs(v.speed) / K.top, 0, 1) * 0.55;
    m.rotation.z = lerp(m.rotation.z, targetRoll, clamp(dt * 6, 0, 1));
    if (v.driver === "player") seatPlayerOnBike(v);
  } else m.rotation.z = lerp(m.rotation.z, 0, dt * 5);
  vehicleSmoke(v, dt);
}

function seatPlayerOnBike(v) {
  const m = v.mesh, p = G.player.mesh;
  p.position.copy(m.position);
  p.position.y = m.position.y + 0.62;
  p.rotation.set(0, m.rotation.y, m.rotation.z * 0.9);
  posePlayerSeated(true);
}

function flyHelicopter(v, dt, input) {
  const m = v.mesh;
  v.rotorSpin += dt * (v.driver ? 26 : (v.rotorSpin > 0.2 ? -dt * 4 : 0));
  if (m.userData.rotor) m.userData.rotor.rotation.y = v.rotorSpin * 3;
  if (m.userData.tailRotor) m.userData.tailRotor.rotation.x = v.rotorSpin * 5;
  const up = (input.up2 ? 1 : 0) - (input.down2 ? 1 : 0);
  v.vy = lerp(v.vy, up * 13, clamp(dt * 3, 0, 1));
  if (v.alt > 0.2 || v.vy > 0) {
    const steerIn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    m.rotation.y += steerIn * 0.85 * dt;
    const fwd = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    v.speed = lerp(v.speed, fwd * VEHICLE_KINDS.heli.top, clamp(dt * 1.4, 0, 1));
  } else v.speed = lerp(v.speed, 0, dt * 4);
  const fx = Math.sin(m.rotation.y), fz = Math.cos(m.rotation.y);
  m.position.x = clamp(m.position.x + fx * v.speed * dt, -1000, 1000);
  m.position.z = clamp(m.position.z + fz * v.speed * dt, -1000, 1000);
  v.alt = clamp(v.alt + v.vy * dt, 0, 130);
  m.position.y = v.alt;
  m.rotation.x = lerp(m.rotation.x, clamp(v.speed * 0.006, -0.2, 0.28), dt * 3);
  vehicleSmoke(v, dt);
}

function damageVehicle(v, amt) {
  if (!v.alive) return;
  v.health -= amt;
  if (v.health <= 0) {
    v.health = 0; v.alive = false; v.speed = 0;
    v.mesh.traverse((o) => { if (o.material && o.material.color) o.material = o.material.clone(), o.material.color.multiplyScalar(0.35); });
    if (v.driver === "player") {
      G.health = Math.max(5, G.health - 18);
      showToast("The " + v.name + " is wrecked!");
      exitVehicle();
    }
    onVehicleWrecked(v);
  }
}
function vehicleSmoke(v, dt) {
  if (v.health > 45 || !v.alive) return;
  v.smokeT -= dt;
  if (v.smokeT <= 0) {
    v.smokeT = 0.14;
    spawnSmokePuff(v.mesh.position.x, 1.4 + (v.alt || 0), v.mesh.position.z);
  }
}
const smokePool = [];
function spawnSmokePuff(x, y, z) {
  let s = smokePool.find((p) => p.life <= 0);
  if (!s) {
    if (smokePool.length > 26) return;
    const mat = new THREE.SpriteMaterial({ color: 0x333333, transparent: true, opacity: 0.5 });
    s = { spr: new THREE.Sprite(mat), life: 0 };
    G.scene.add(s.spr); smokePool.push(s);
  }
  s.spr.position.set(x + rand(-0.5, 0.5), y, z + rand(-0.5, 0.5));
  s.spr.scale.setScalar(1.4); s.life = 1.1; s.spr.visible = true;
}
function updateSmoke(dt) {
  for (const s of smokePool) {
    if (s.life <= 0) continue;
    s.life -= dt;
    s.spr.position.y += dt * 2.6;
    s.spr.scale.multiplyScalar(1 + dt * 1.4);
    s.spr.material.opacity = Math.max(0, s.life * 0.45);
    if (s.life <= 0) s.spr.visible = false;
  }
}

// vehicle-on-vehicle bumps and running-down checks, shared by all drivers
function collideVehicles(dt) {
  const vs = G.vehicles;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i]; if (!a.alive) continue;
    for (let j = i + 1; j < vs.length; j++) {
      const b = vs[j]; if (!b.alive) continue;
      const dx = b.mesh.position.x - a.mesh.position.x, dz = b.mesh.position.z - a.mesh.position.z;
      const rr = (VEHICLE_KINDS[a.kind].radius + VEHICLE_KINDS[b.kind].radius) * 0.92;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (rr - d) / 2, ux = dx / d, uz = dz / d;
      if (!VEHICLE_KINDS[a.kind].heli || a.alt < 3) { a.mesh.position.x -= ux * push; a.mesh.position.z -= uz * push; }
      if (!VEHICLE_KINDS[b.kind].heli || b.alt < 3) { b.mesh.position.x += ux * push; b.mesh.position.z += uz * push; }
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 7) {
        damageVehicle(a, rel * 0.3); damageVehicle(b, rel * 0.3);
        if (a.driver === "player" || b.driver === "player") { sfxCrash(rel); addCrime(0); }
        a.speed *= 0.55; b.speed *= 0.55;
      }
    }
    // the player's machine versus pedestrians
    if (a.driver === "player" && Math.abs(a.speed) > 6) {
      for (const p of G.peds) {
        if (p.dead > 0) continue;
        if (dist2d(a.mesh.position.x, a.mesh.position.z, p.mesh.position.x, p.mesh.position.z) < 2.1) {
          hurtPed(p, 3); sfxCrash(6);
        }
      }
    }
  }
}

function updateTraffic(dt) {
  const pp = G.player ? G.player.mesh.position : { x: 0, z: 0 };
  for (const v of G.traffic) {
    if (!v.alive || v.driver !== "traffic") continue;
    const m = v.mesh;
    const far = dist2d(m.position.x, m.position.z, pp.x, pp.z);
    if (far > 720) { // recycle far-away traffic to a road nearer the player
      const road = pick(ROAD_LINES), horiz = rng() > 0.5, along = clamp(pp.x + rand(-420, 420), -780, 780);
      m.position.set(horiz ? along : road, 0, horiz ? road : clamp(pp.z + rand(-420, 420), -780, 780));
      m.rotation.y = horiz ? Math.PI / 2 : 0;
      v.aiTarget = nextTrafficPoint(v);
      continue;
    }
    if (!v.aiTarget) v.aiTarget = nextTrafficPoint(v);
    const t = v.aiTarget;
    const dx = t.x - m.position.x, dz = t.z - m.position.z;
    if (dx * dx + dz * dz < 90) { v.aiTarget = nextTrafficPoint(v); continue; }
    const want = Math.atan2(dx, dz);
    const diff = angWrap(want - m.rotation.y);
    let blocked = false;
    const fx = Math.sin(m.rotation.y), fz = Math.cos(m.rotation.y);
    for (const o of G.vehicles) {
      if (o === v || !o.alive) continue;
      const ox = o.mesh.position.x - m.position.x, oz = o.mesh.position.z - m.position.z;
      if (ox * fx + oz * fz > 0 && ox * fx + oz * fz < 10 && Math.abs(ox * fz - oz * fx) < 3.4) { blocked = true; break; }
    }
    if (!blocked && G.onFoot && (pp.x - m.position.x) * fx + (pp.z - m.position.z) * fz > 0 &&
        (pp.x - m.position.x) * fx + (pp.z - m.position.z) * fz < 9 && Math.abs((pp.x - m.position.x) * fz - (pp.z - m.position.z) * fx) < 3) blocked = true;
    const input = {
      up: !blocked && Math.abs(diff) < 1.2, down: false,
      left: diff > 0.06, right: diff < -0.06, brake: blocked,
    };
    if (Math.abs(v.speed) > 17) input.up = false;
    driveVehicle(v, dt, input);
  }
}

function updatePlayerVehicle(dt) {
  const v = G.vehicle; if (!v) return;
  const input = {
    up: !!G.keys["KeyW"] || !!G.keys["ArrowUp"], down: !!G.keys["KeyS"] || !!G.keys["ArrowDown"],
    left: !!G.keys["KeyA"] || !!G.keys["ArrowLeft"], right: !!G.keys["KeyD"] || !!G.keys["ArrowRight"],
    brake: !!G.keys["Space"],
    up2: !!G.keys["KeyR"], down2: !!G.keys["KeyF"] || !!G.keys["KeyC"],
  };
  driveVehicle(v, dt, input);
  if (G.keys["KeyE"]) { G.keys["KeyE"] = false; if (VEHICLE_KINDS[v.kind].heli && v.alt > 2) { showToast("Too high to bail out!"); } else exitVehicle(); }
  if (G.keys["KeyQ"]) { G.keys["KeyQ"] = false; G.radioOn = !G.radioOn; showToast(G.radioOn ? "Radio on — " + RADIO_STATIONS[G.radioStation].name : "Radio off"); }
  if (G.keys["KeyR"] && !VEHICLE_KINDS[v.kind].heli) { /* R is radio station in cars */ }
  if (G.keys["Digit1"]) { G.keys["Digit1"] = false; cycleRadio(-1); }
  if (G.keys["Digit2"]) { G.keys["Digit2"] = false; cycleRadio(1); }
}
function cycleRadio(d) {
  G.radioStation = (G.radioStation + d + RADIO_STATIONS.length) % RADIO_STATIONS.length;
  G.radioOn = true;
  showToast("Radio — " + RADIO_STATIONS[G.radioStation].name);
}
