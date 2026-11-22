// vehicles.js — every car in Coral Bay: the low-poly car factory (coupe,
// sedan, hatch, van and police cruiser with a flashing light bar), the
// traffic system that drives them lane-correctly around the road graph with
// car-following and red-light manners, parked cars waiting to be stolen,
// arcade driving physics for the player, collision and damage, tyre-shredding
// and the explosion effects that end a car's life.
(function () {
  'use strict';

  const CBS = (window.CBS = window.CBS || {});
  const U = CBS.util;
  const THREE = window.THREE;

  const all = []; // every car entity, any driver
  let sceneRef = null;

  const PAINTS = [0xc23b2e, 0x2e62c2, 0xd8d5cc, 0x2b2b30, 0x3fae7c, 0xe0a83c, 0x7a4b9e, 0xb8bcc2, 0x87431f, 0x2e8c9e];

  function makeCarMesh(kind, color) {
    const g = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color });
    const glass = new THREE.MeshLambertMaterial({ color: 0x1d2733 });
    const trim = new THREE.MeshLambertMaterial({ color: 0x17181c });
    const dims = {
      coupe: { w: 1.9, h: 0.5, l: 4.4, cab: 1.9, cabH: 0.42 },
      sedan: { w: 1.9, h: 0.58, l: 4.5, cab: 2.1, cabH: 0.5 },
      hatch: { w: 1.85, h: 0.6, l: 3.9, cab: 2.2, cabH: 0.55 },
      van: { w: 2.0, h: 1.15, l: 4.7, cab: 3.4, cabH: 0.75 },
      cruiser: { w: 1.95, h: 0.58, l: 4.7, cab: 2.2, cabH: 0.5 },
    }[kind] || { w: 1.9, h: 0.58, l: 4.5, cab: 2.1, cabH: 0.5 };

    const body = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h, dims.l), paint);
    body.position.y = 0.38 + dims.h / 2;
    body.castShadow = true;
    g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(dims.w - 0.24, dims.cabH, dims.cab), kind === 'van' ? paint : glass);
    cab.position.set(0, 0.38 + dims.h + dims.cabH / 2 - 0.04, kind === 'van' ? 0.35 : -0.15);
    cab.castShadow = true;
    g.add(cab);
    if (kind === 'van') {
      const shield = new THREE.Mesh(new THREE.BoxGeometry(dims.w - 0.3, 0.55, 0.1), glass);
      shield.position.set(0, 1.45, 2.16);
      g.add(shield);
    }
    if (kind === 'coupe') {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.07, 0.4), trim);
      spoiler.position.set(0, 1.06, -2.05);
      g.add(spoiler);
    }
    // Headlights and tail lights (emissive-look basic materials).
    const hl = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
    const tl = new THREE.MeshBasicMaterial({ color: 0xb02020 });
    for (const sx of [-0.6, 0.6]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), hl);
      h.position.set(sx, 0.72, dims.l / 2 + 0.01);
      g.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), tl);
      t.position.set(sx, 0.78, -dims.l / 2 - 0.01);
      g.add(t);
    }
    // Wheels: front pair on steering pivots.
    const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 10);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x121216 });
    const wheels = [];
    const frontPivots = [];
    for (const [sx, sz, front] of [[-0.88, 1.45, 1], [0.88, 1.45, 1], [-0.88, -1.45, 0], [0.88, -1.45, 0]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx, 0.37, sz);
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.castShadow = true;
      pivot.add(w);
      g.add(pivot);
      wheels.push(w);
      if (front) frontPivots.push(pivot);
    }
    let lightBar = null;
    if (kind === 'cruiser') {
      const bar = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.42), trim);
      bar.add(base);
      const red = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
      const blue = new THREE.MeshBasicMaterial({ color: 0x2255ff });
      const rl = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.36), red);
      rl.position.set(-0.33, 0.12, 0);
      bar.add(rl);
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.36), blue);
      bl.position.set(0.33, 0.12, 0);
      bar.add(bl);
      bar.position.set(0, 1.52, -0.15);
      g.add(bar);
      const push = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 0.18), trim);
      push.position.set(0, 0.55, dims.l / 2 + 0.12);
      g.add(push);
      lightBar = { red, blue };
    }
    g.userData = { wheels, frontPivots, lightBar, paint };
    return g;
  }

  function spawnCar(scene, kind, color, x, z, heading, driver) {
    const mesh = makeCarMesh(kind, color);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      kind, color, mesh, x, z, heading, speed: 0, health: 100,
      tyres: false, dead: false, driver, steerVis: 0, wheelSpin: 0,
      node: -1, targetNode: -1, cruise: 10, id: all.length + 1,
    };
    all.push(car);
    return car;
  }

  // --- traffic ---------------------------------------------------------------
  function lanePoint(city, a, b) {
    // Waypoint for travelling a -> b: the target node shifted to the right lane.
    const na = city.graph.nodes[a];
    const nb = city.graph.nodes[b];
    const dx = nb.x - na.x;
    const dz = nb.z - na.z;
    const len = Math.hypot(dx, dz) || 1;
    const rx = -dz / len; // right-hand side of the travel direction
    const rz = dx / len;
    return { x: nb.x + rx * 2.6 - (dx / len) * 3.4, z: nb.z + rz * 2.6 - (dz / len) * 3.4, dx: dx / len, dz: dz / len };
  }

  function createTraffic(scene, city, count) {
    sceneRef = scene;
    U.rngReset(777);
    const kinds = ['sedan', 'coupe', 'hatch', 'van', 'sedan', 'coupe'];
    const cars = [];
    for (let i = 0; i < count; i++) {
      const a = Math.floor(U.rng() * city.graph.nodes.length);
      const b = city.graph.nodes[a].edges[0];
      const na = city.graph.nodes[a];
      const nb = city.graph.nodes[b];
      const t = U.rng();
      const x = na.x + (nb.x - na.x) * t + 2.6;
      const z = na.z + (nb.z - na.z) * t;
      const car = spawnCar(scene, kinds[i % kinds.length], PAINTS[i % PAINTS.length], x, z, Math.atan2(nb.x - na.x, nb.z - na.z), 'traffic');
      car.node = a;
      car.targetNode = b;
      car.cruise = 8.5 + U.rng() * 3.5;
      cars.push(car);
    }
    // Parked cars along kerbs, waiting to be borrowed.
    const parkedSpots = [
      [246, -120, 0], [246, -30, 0], [246, 60, 0], [246, 150, 0],
      [-120, 66, Math.PI / 2], [-30, -114, Math.PI / 2], [60, 126, Math.PI / 2],
      [126, -54, Math.PI / 2], [-186, 6, 0], [6, -186, Math.PI / 2],
      [180, 66, Math.PI / 2], [-66, 186, Math.PI / 2], [252, 84, 0.3], [-240, -66, 0],
    ];
    for (let i = 0; i < parkedSpots.length; i++) {
      const [x, z, h] = parkedSpots[i];
      const car = spawnCar(scene, kinds[(i + 2) % kinds.length], PAINTS[(i + 3) % PAINTS.length], x, z, h, 'parked');
      car.parked = true;
      cars.push(car);
    }
    return cars;
  }

  function carAhead(car, gap) {
    // Nearest other live car inside the cone ahead of `car`.
    let best = null;
    let bd = gap;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    for (const o of all) {
      if (o === car || o.dead) continue;
      const dx = o.x - car.x;
      const dz = o.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d > gap || d < 0.01) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot > 0.72 && d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  function updateTraffic(city, dt, t) {
    for (const car of all) {
      if (car.driver !== 'traffic' || car.dead) continue;
      const wp = lanePoint(city, car.node, car.targetNode);
      const dx = wp.x - car.x;
      const dz = wp.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.2) {
        // Arrived: choose the next node (avoid the U-turn when possible).
        const from = car.node;
        car.node = car.targetNode;
        const opts = city.graph.nodes[car.node].edges.filter((e) => e !== from);
        car.targetNode = opts.length ? opts[Math.floor(U.rng() * opts.length)] : from;
        continue;
      }
      const want = Math.atan2(dx, dz);
      car.heading = U.angleLerp(car.heading, want, dt * 3.2);
      let target = car.cruise;
      // Red lights: stop when the light for our axis at the target node is red.
      const axis = Math.abs(wp.dz) > Math.abs(wp.dx) ? 'ns' : 'ew';
      if (dist < 13 && CBS.city.lightState(city, car.targetNode, axis, t) === 'red') target = 0;
      const ahead = carAhead(car, 11);
      if (ahead) target = Math.min(target, ahead.speed * 0.92);
      if (Math.abs(U.wrapAngle(want - car.heading)) > 0.5) target = Math.min(target, 5);
      car.speed = U.lerp(car.speed, target, dt * (target > car.speed ? 1.4 : 4.5));
      if (target === 0 && car.speed < 0.4) car.speed = 0;
      moveCar(car, dt);
    }
  }

  function moveCar(car, dt) {
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    car.wheelSpin += (car.speed * dt) / 0.37;
    syncMesh(car);
  }

  function syncMesh(car) {
    car.mesh.position.set(car.x, car.dead ? -0.12 : 0, car.z);
    car.mesh.rotation.y = car.heading;
    const u = car.mesh.userData;
    for (const w of u.wheels) w.rotation.x = car.wheelSpin;
    for (const p of u.frontPivots) p.rotation.y = car.steerVis || 0;
    if (car.tyres) car.mesh.rotation.z = Math.sin(car.wheelSpin * 2.2) * 0.012;
  }

  // --- player driving ----------------------------------------------------------
  const TOPSPEED = { coupe: 39, sedan: 34, hatch: 31, van: 28, cruiser: 37 };

  function drivePlayerCar(car, input, dt) {
    const top = (TOPSPEED[car.kind] || 33) * (car.tyres ? 0.45 : 1);
    const accel = car.tyres ? 7 : 13.5;
    if (input.throttle > 0) car.speed += accel * input.throttle * dt * (1 - Math.max(0, car.speed) / (top * 1.25));
    else if (input.brake > 0) {
      if (car.speed > 0.6) car.speed -= 26 * input.brake * dt;
      else car.speed = Math.max(-8, car.speed - 7 * input.brake * dt);
    } else {
      car.speed -= car.speed * 0.35 * dt; // engine drag
      if (Math.abs(car.speed) < 0.05) car.speed = 0;
    }
    car.speed = U.clamp(car.speed, -8, top);
    const steerTarget = input.steer * 0.55 * (car.tyres ? 0.7 : 1);
    car.steerVis = U.lerp(car.steerVis || 0, steerTarget, dt * 8);
    if (Math.abs(car.speed) > 0.1) {
      const grip = 1 / (1 + Math.abs(car.speed) * 0.028);
      car.heading += car.steerVis * grip * (car.speed > 0 ? 1 : -1) * dt * 1.9;
      if (car.tyres) car.heading += Math.sin(performance.now() * 0.004) * 0.12 * dt * Math.abs(car.speed) * 0.14;
    }
    moveCar(car, dt);
  }

  // --- collisions & damage -------------------------------------------------------
  function collideWorld(car, city) {
    // Buildings: circle vs AABB push-out.
    for (const b of city.colliders) {
      const nx = U.clamp(car.x, b.minX, b.maxX);
      const nz = U.clamp(car.z, b.minZ, b.maxZ);
      const dx = car.x - nx;
      const dz = car.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 2.3 * 2.3) {
        const d = Math.sqrt(d2) || 0.01;
        const push = (2.3 - d) + 0.02;
        if (d2 > 0.0001) {
          car.x += (dx / d) * push;
          car.z += (dz / d) * push;
        } else {
          car.x = b.maxX + 2.32;
        }
        if (Math.abs(car.speed) > 7) damage(car, Math.abs(car.speed) * 0.55, car.x, car.z);
        car.speed *= 0.35;
      }
    }
    // The bay: cars stop at the shoreline unless they are on the pier.
    const onPier = car.z > 110 && car.z < 132;
    if (!onPier && car.x > 296) {
      car.x = 296;
      if (Math.abs(car.speed) > 7) damage(car, 6, car.x, car.z);
      car.speed *= 0.4;
    }
    if (onPier && car.x > 352) car.x = 352;
    car.x = U.clamp(car.x, -262, 356);
    car.z = U.clamp(car.z, -202, 202);
    // Other cars: soft circle bumps.
    for (const o of all) {
      if (o === car || o.dead) continue;
      const dx = car.x - o.x;
      const dz = car.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 4.4 * 4.4 && d2 > 0.001) {
        const d = Math.sqrt(d2);
        const push = (4.4 - d) / 2;
        car.x += (dx / d) * push;
        car.z += (dz / d) * push;
        if (o.driver !== 'parked') {
          o.x -= (dx / d) * push * 0.4;
          o.z -= (dz / d) * push * 0.4;
          syncMesh(o);
        }
        const rel = Math.abs(car.speed - o.speed);
        if (rel > 6) {
          damage(car, rel * 0.5, car.x, car.z);
          damage(o, rel * 0.4, o.x, o.z);
          if (o.driver === 'traffic') o.speed = car.speed * 0.5;
        }
        car.speed *= 0.72;
      }
    }
    syncMesh(car);
  }

  function damage(car, amount, x, z) {
    if (car.dead) return;
    car.health -= amount;
    if (amount > 5) effects.spawnSparks(x === undefined ? car.x : x, 0.8, z === undefined ? car.z : z, 6);
    if (car.health <= 0) {
      car.health = 0;
      car.dead = true;
      car.speed = 0;
      car.mesh.userData.paint.color.setHex(0x191919);
      effects.spawnExplosion(car.x, 1, car.z);
      if (CBS.audio) CBS.audio.explosion();
    } else if (car.health < 35) {
      effects.spawnSmoke(car.x, 1.1, car.z);
    }
  }

  // --- particle effects ----------------------------------------------------------
  const effects = (() => {
    const MAX = 240;
    let points = null;
    let parts = [];
    let geo = null;
    function init(scene) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
      points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.85, vertexColors: true }));
      points.frustumCulled = false;
      scene.add(points);
      for (let i = 0; i < MAX; i++) parts.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, grav: 0 });
    }
    function spawn(x, y, z, vx, vy, vz, life, r, g, b, grav) {
      const p = parts.find((q) => q.life <= 0);
      if (!p) return;
      Object.assign(p, { x, y, z, vx, vy, vz, life, maxLife: life, r, g, b, grav });
    }
    function spawnExplosion(x, y, z) {
      for (let i = 0; i < 42; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 7;
        spawn(x, y, z, Math.cos(a) * s, 2.5 + Math.random() * 6, Math.sin(a) * s,
          0.7 + Math.random() * 0.9, 1, 0.45 + Math.random() * 0.3, 0.12, -3);
      }
      for (let i = 0; i < 16; i++) {
        spawn(x, y + 0.5, z, (Math.random() - 0.5) * 2, 1.6 + Math.random() * 2, (Math.random() - 0.5) * 2,
          1.6 + Math.random(), 0.16, 0.16, 0.16, 1.2);
      }
    }
    function spawnSparks(x, y, z, n) {
      for (let i = 0; i < (n || 6); i++) {
        spawn(x, y, z, (Math.random() - 0.5) * 6, Math.random() * 3.5, (Math.random() - 0.5) * 6,
          0.3 + Math.random() * 0.3, 1, 0.8, 0.3, -6);
      }
    }
    function spawnSmoke(x, y, z) {
      spawn(x, y, z, (Math.random() - 0.5) * 0.7, 1.7, (Math.random() - 0.5) * 0.7, 1.4, 0.2, 0.2, 0.2, 0.7);
    }
    function tick(dt) {
      if (!points) return;
      const pos = geo.attributes.position.array;
      const col = geo.attributes.color.array;
      for (let i = 0; i < MAX; i++) {
        const p = parts[i];
        if (p.life > 0) {
          p.life -= dt;
          p.vy += (p.grav || 0) * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          if (p.y < 0.1) p.y = 0.1;
        } else {
          p.y = -99;
        }
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        const f = p.life > 0 ? Math.min(1, p.life / (p.maxLife * 0.5)) : 0;
        col[i * 3] = p.r * f;
        col[i * 3 + 1] = p.g * f;
        col[i * 3 + 2] = p.b * f;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
    return { init, spawnExplosion, spawnSparks, spawnSmoke, tick };
  })();

  CBS.vehicles = {
    all, makeCarMesh, spawnCar, createTraffic, updateTraffic, drivePlayerCar,
    collideWorld, damage, effects, syncMesh, carAhead, TOPSPEED,
  };
})();
