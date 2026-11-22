// police.js — the Coral Bay PD: the wanted system (heat rises with crime and
// cools when the player stays unseen), pursuit cruisers that spawn on the
// road graph and hunt with target lead, officers who get out and shoot from
// two stars, the bust meter, roadblocks with spike strips at three stars,
// and AIR-1 "Kestrel", the helicopter that joins at four stars with a real
// sweeping searchlight.
(function () {
  'use strict';

  const CBS = (window.CBS = window.CBS || {});
  const U = CBS.util;
  const THREE = window.THREE;
  const V = CBS.vehicles;

  let scene = null;
  let city = null;
  let heat = 0; // 0..5, fractional
  let unseenT = 0;
  const units = []; // { car, name, officersOut, shootT }
  let unitCounter = 1;
  const officers = []; // pooled officer figures { fig, unit, side, shootT }
  let block = null; // active roadblock
  let blockTimer = 5;
  let heli = null;

  const stars = () => Math.max(0, Math.min(5, Math.ceil(heat - 0.001)));
  function addHeat(n) {
    heat = U.clamp(heat + n, 0, 5);
    unseenT = 0;
  }
  function setHeat(n) { heat = U.clamp(n, 0, 5); }
  function clearHeat() { heat = 0; unseenT = 0; }

  function init(sceneRef, cityRef) {
    scene = sceneRef;
    city = cityRef;
    // Officer pool: navy uniforms, caps of authority.
    for (let i = 0; i < 8; i++) {
      const fig = CBS.people.makePerson(0x22345e, 0x1a2438, 0xc68863);
      fig.visible = false;
      scene.add(fig);
      officers.push({ fig, unit: null, shootT: U.rand(0.5, 2), out: false });
    }
    buildHelicopter();
  }

  // --- helicopter ---------------------------------------------------------------
  function buildHelicopter() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2b3442 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.7, 4.6), bodyMat);
    body.castShadow = true;
    g.add(body);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), new THREE.MeshLambertMaterial({ color: 0x9fc4d8 }));
    nose.position.set(0, -0.1, 2.2);
    nose.scale.set(1, 0.8, 1);
    g.add(nose);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.4), bodyMat);
    boom.position.set(0, 0.3, -4.2);
    g.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.3, 0.7), new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
    fin.position.set(0, 0.7, -6.3);
    g.add(fin);
    const skidMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
    for (const sx of [-0.95, 0.95]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.6), skidMat);
      skid.position.set(sx, -1.25, 0.2);
      g.add(skid);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), skidMat);
      leg.position.set(sx, -0.95, 0.9);
      g.add(leg);
      const leg2 = leg.clone();
      leg2.position.z = -0.6;
      g.add(leg2);
    }
    const rotor = new THREE.Mesh(
      new THREE.BoxGeometry(11.5, 0.06, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x22242a })
    );
    rotor.position.y = 1.15;
    g.add(rotor);
    const tailRotor = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.7, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x22242a })
    );
    tailRotor.position.set(0.12, 0.7, -6.3);
    g.add(tailRotor);
    // Searchlight: a real spotlight plus a visible translucent cone.
    const spot = new THREE.SpotLight(0xffe2ae, 900, 120, 0.30, 0.55, 1.2);
    g.add(spot);
    g.add(spot.target);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(6.5, 23, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffdf9e, transparent: true, opacity: 0.13,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    g.add(cone);
    g.visible = false;
    scene.add(g);
    heli = { group: g, rotor, tailRotor, spot, cone, active: false, x: 0, z: 0, phase: 0 };
  }

  // --- pursuit units ---------------------------------------------------------------
  const DESIRED = [0, 1, 2, 3, 4, 5];

  function spawnUnit(player) {
    // Spawn on a road node 70–120 m away, preferably out of the camera's face.
    let bestNode = -1;
    let bestScore = -1;
    for (let tries = 0; tries < 14; tries++) {
      const n = Math.floor(U.rng() * city.graph.nodes.length);
      const node = city.graph.nodes[n];
      const d = U.dist2D(node.x, node.z, player.x, player.z);
      if (d < 65 || d > 150) continue;
      const score = d - (tries === 0 ? 0 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestNode = n;
      }
    }
    if (bestNode === -1) bestNode = CBS.city.nearestNode(city.graph, player.x + 80, player.z + 40);
    const node = city.graph.nodes[bestNode];
    const car = V.spawnCar(scene, 'cruiser', 0xf0f0f2, node.x, node.z, U.rand(0, 6.28), 'police');
    car.node = bestNode;
    unitCounter++;
    const unit = { car, name: 'Unit ' + unitCounter, shootT: U.rand(1, 2.4), flash: U.rng() * 6 };
    units.push(unit);
    return unit;
  }

  function removeUnit(unit) {
    scene.remove(unit.car.mesh);
    const i = V.all.indexOf(unit.car);
    if (i >= 0) V.all.splice(i, 1);
    units.splice(units.indexOf(unit), 1);
    for (const o of officers) if (o.unit === unit) sendOfficerIn(o);
  }

  function sendOfficerOut(o, unit) {
    o.out = true;
    o.unit = unit;
    o.fig.visible = true;
    o.shootT = U.rand(0.6, 2.2);
  }
  function sendOfficerIn(o) {
    o.out = false;
    o.unit = null;
    o.fig.visible = false;
  }

  // --- roadblocks ---------------------------------------------------------------------
  function placeRoadblock(player) {
    // Find an edge two graph steps ahead of the player's heading: far enough
    // to be a surprise, near enough that it is still there when they arrive.
    const start = CBS.city.nearestNode(city.graph, player.x, player.z);
    let cur = start;
    let prev = -1;
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    for (let step = 0; step < 2; step++) {
      const opts = city.graph.nodes[cur].edges.filter((e) => e !== prev);
      if (!opts.length) break;
      let bestE = opts[0];
      let bestDot = -2;
      for (const e of opts) {
        const n = city.graph.nodes[e];
        const c = city.graph.nodes[cur];
        const d = Math.hypot(n.x - c.x, n.z - c.z) || 1;
        const dot = ((n.x - c.x) / d) * fx + ((n.z - c.z) / d) * fz;
        if (dot > bestDot) {
          bestDot = dot;
          bestE = e;
        }
      }
      prev = cur;
      cur = bestE;
    }
    if (cur === start) return false;
    const a = city.graph.nodes[prev === -1 ? start : prev];
    const b = city.graph.nodes[cur];
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    const rx = Math.cos(ang); // across the road
    const rz = -Math.sin(ang);
    const cars = [];
    const mkBlockCar = (off, name) => {
      const car = V.spawnCar(scene, 'cruiser', 0xf0f0f2, mx + rx * off, mz + rz * off, ang + Math.PI / 2 + (off > 0 ? 0.16 : -0.16), 'block');
      car.parked = true;
      car.blockName = name;
      cars.push(car);
      return car;
    };
    // Sometimes leave a tempting gap on one side.
    const gap = U.rng() < 0.45 ? (U.rng() < 0.5 ? -1 : 1) : 0;
    if (gap !== -1) mkBlockCar(-2.9, 'Block 1');
    if (gap !== 1) mkBlockCar(2.9, 'Block 2');
    if (!cars.length) mkBlockCar(0, 'Block 1');
    // Spike strip across the busiest lane.
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 0.09, 1.1),
      new THREE.MeshLambertMaterial({ color: 0x24262b })
    );
    strip.position.set(mx - rx * (gap * 3), 0.06, mz - rz * (gap * 3));
    strip.rotation.y = ang;
    scene.add(strip);
    const offs = [];
    for (let i = 0; i < 2; i++) {
      const o = officers.find((q) => !q.out);
      if (!o) break;
      o.out = true;
      o.unit = null;
      o.blockOfficer = true;
      o.fig.visible = true;
      o.x = mx + rx * (i === 0 ? -5.4 : 5.4);
      o.z = mz + rz * (i === 0 ? -5.4 : 5.4) + 1.5;
      o.fig.position.set(o.x, 0, o.z);
      o.shootT = U.rand(0.8, 2);
      offs.push(o);
    }
    block = { x: mx, z: mz, ang, cars, strip, officers: offs, spikedCar: null, age: 0 };
    return true;
  }

  function clearRoadblock() {
    if (!block) return;
    for (const car of block.cars) {
      scene.remove(car.mesh);
      const i = V.all.indexOf(car);
      if (i >= 0) V.all.splice(i, 1);
    }
    scene.remove(block.strip);
    for (const o of block.officers) {
      o.blockOfficer = false;
      sendOfficerIn(o);
    }
    block = null;
  }

  // --- shooting ---------------------------------------------------------------------
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 });
  const tracers = [];
  function fireTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, 1.35, from.z), new THREE.Vector3(to.x, 1.0, to.z),
    ]);
    const line = new THREE.Line(geo, tracerMat);
    scene.add(line);
    tracers.push({ line, life: 0.09 });
  }

  function officerShoot(o, player, dt) {
    o.shootT -= dt;
    const d = U.dist2D(o.fig.position.x, o.fig.position.z, player.x, player.z);
    o.fig.rotation.y = Math.atan2(player.x - o.fig.position.x, player.z - o.fig.position.z);
    if (o.shootT > 0 || d > 46) return;
    o.shootT = U.rand(1.3, 2.5);
    fireTracer({ x: o.fig.position.x, z: o.fig.position.z }, player);
    if (CBS.audio) CBS.audio.shot(false);
    const hitChance = U.clamp(0.62 - d * 0.008, 0.15, 0.6);
    if (Math.random() < hitChance && CBS.hooks && CBS.hooks.hurtPlayer) {
      CBS.hooks.hurtPlayer(player.inCar ? 3.5 : 6);
    }
  }

  // --- main update ---------------------------------------------------------------------
  let bust = 0;

  function update(dt, t, player) {
    const st = stars();
    // Heat cools while nobody can see the player.
    let seen = false;
    for (const u of units) {
      if (U.dist2D(u.car.x, u.car.z, player.x, player.z) < 58) seen = true;
    }
    if (heli && heli.active) seen = true;
    if (seen) unseenT = 0;
    else {
      unseenT += dt;
      if (unseenT > 9 && heat > 0) {
        heat = Math.max(0, heat - dt * 0.06);
      }
    }

    // Maintain the pursuit strength for the current star count.
    const want = DESIRED[st];
    if (units.length < want && heat > 0) spawnUnit(player);
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      const d = U.dist2D(u.car.x, u.car.z, player.x, player.z);
      if ((units.length > want && d > 90) || d > 260 || u.car.dead) removeUnit(u);
    }

    // Drive the pursuit.
    for (const u of units) {
      const car = u.car;
      if (car.dead) continue;
      const lead = 0.55;
      const tx = player.x + (player.vx || 0) * lead;
      const tz = player.z + (player.vz || 0) * lead;
      const d = U.dist2D(car.x, car.z, player.x, player.z);
      const wantHeading = Math.atan2(tx - car.x, tz - car.z);
      car.steerVis = U.clamp(U.wrapAngle(wantHeading - car.heading) * 1.4, -0.5, 0.5);
      car.heading = U.angleLerp(car.heading, wantHeading, dt * 2.6);
      let target = 33.5;
      if (d < 16) target = Math.max(player.speedAbs || 0, 7);
      if (d < 7) target = 3;
      const ahead = V.carAhead(car, 10);
      if (ahead && ahead !== player.car) target = Math.min(target, ahead.speed + 2);
      car.speed = U.lerp(car.speed, target, dt * (target > car.speed ? 1.1 : 3.6));
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      car.wheelSpin += (car.speed * dt) / 0.37;
      V.syncMesh(car);
      V.collideWorld(car, city);
      // Light bar strobes.
      if (car.mesh.userData.lightBar) {
        const ph = Math.floor(t * 7 + u.flash) % 2;
        car.mesh.userData.lightBar.red.color.setHex(ph ? 0xff2a20 : 0x551512);
        car.mesh.userData.lightBar.blue.color.setHex(ph ? 0x112a66 : 0x2255ff);
      }
      // Officers pile out when the player is slow or on foot nearby.
      const shouldOut = d < 17 && (player.onFoot || (player.speedAbs || 0) < 4);
      const mine = officers.filter((o) => o.unit === u);
      if (shouldOut && mine.length < 2) {
        const o = officers.find((q) => !q.out);
        if (o) {
          sendOfficerOut(o, u);
          o.fig.position.set(car.x + 1.6, 0, car.z + 1.2);
        }
      } else if (!shouldOut) {
        for (const o of mine) sendOfficerIn(o);
      }
      if (CBS.audio && d < 60) CBS.audio.sirenNear(Math.max(0, 1 - d / 60));
    }
    // Officers on foot shoot from two stars.
    if (st >= 2) {
      for (const o of officers) {
        if (o.out) officerShoot(o, player, dt);
      }
    } else {
      for (const o of officers) {
        if (o.out) {
          o.fig.rotation.y = Math.atan2(player.x - o.fig.position.x, player.z - o.fig.position.z);
        }
      }
    }

    // Bust meter: standing still next to officers is how careers end.
    let nearOfficer = false;
    for (const o of officers) {
      if (o.out && U.dist2D(o.fig.position.x, o.fig.position.z, player.x, player.z) < 9.5) nearOfficer = true;
    }
    for (const u of units) {
      if (U.dist2D(u.car.x, u.car.z, player.x, player.z) < 8 && (player.speedAbs || 0) < 2) nearOfficer = true;
    }
    if (nearOfficer && st > 0 && (player.speedAbs || 0) < 2.2) {
      bust = Math.min(1, bust + dt * 0.30);
      if (bust >= 1 && CBS.hooks && CBS.hooks.onBusted) {
        bust = 0;
        CBS.hooks.onBusted();
      }
    } else {
      bust = Math.max(0, bust - dt * 0.22);
    }

    updateRoadblock(dt, player);
    updateHelicopter(dt, t, player, st);

    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].line);
        tracers.splice(i, 1);
      }
    }
  }

  function updateRoadblock(dt, player) {
    if (stars() >= 3 && player.inCar) {
      blockTimer -= dt;
      if (blockTimer <= 0) {
        blockTimer = U.rand(11, 17);
        if (!block) placeRoadblock(player);
      }
    }
    if (!block) return;
    block.age += dt;
    const d = U.dist2D(block.x, block.z, player.x, player.z);
    if (block.age > 3 && d > 190) {
      clearRoadblock();
      return;
    }
    // Spike strip: cross it fast in a car and the tyres are gone.
    if (player.inCar && player.car && !player.car.tyres && block.spikedCar !== player.car) {
      const lx = player.x - block.x;
      const lz = player.z - block.z;
      const along = lx * Math.sin(block.ang) + lz * Math.cos(block.ang);
      const across = lx * Math.cos(block.ang) - lz * Math.sin(block.ang);
      if (Math.abs(along) < 1.6 && Math.abs(across) < 3.4 && (player.speedAbs || 0) > 4) {
        player.car.tyres = true;
        block.spikedCar = player.car;
        V.effects.spawnSparks(player.x, 0.4, player.z, 22);
        if (CBS.audio) CBS.audio.spike();
        if (CBS.hooks && CBS.hooks.onSpike) CBS.hooks.onSpike();
      }
    }
    // The block's own light bars flash too.
    for (const car of block.cars) {
      if (car.mesh.userData.lightBar) {
        const ph = Math.floor(performance.now() * 0.007) % 2;
        car.mesh.userData.lightBar.red.color.setHex(ph ? 0xff2a20 : 0x551512);
        car.mesh.userData.lightBar.blue.color.setHex(ph ? 0x112a66 : 0x2255ff);
      }
    }
  }

  function updateHelicopter(dt, t, player, st) {
    if (!heli) return;
    const shouldFly = st >= 4;
    if (shouldFly && !heli.active) {
      heli.active = true;
      heli.group.visible = true;
      heli.x = player.x - 60;
      heli.z = player.z - 60;
    }
    if (!shouldFly && heli.active) {
      heli.active = false;
      heli.group.visible = false;
      return;
    }
    if (!heli.active) return;
    heli.phase += dt * 0.35;
    const ox = Math.sin(heli.phase) * 13;
    const oz = Math.cos(heli.phase * 0.8) * 13;
    heli.x = U.lerp(heli.x, player.x + ox, dt * 1.6);
    heli.z = U.lerp(heli.z, player.z + oz, dt * 1.6);
    heli.group.position.set(heli.x, 22 + Math.sin(t * 0.9) * 0.7, heli.z);
    heli.group.rotation.y = Math.atan2(player.x - heli.x, player.z - heli.z);
    heli.rotor.rotation.y += dt * 31;
    heli.tailRotor.rotation.x += dt * 40;
    // The searchlight sweeps a slow circle around the player.
    const sx = player.x + Math.sin(t * 0.8) * 6;
    const sz = player.z + Math.cos(t * 0.63) * 6;
    const dx = sx - heli.x;
    const dz = sz - heli.z;
    heli.spot.target.position.set(dx, -22, dz);
    // The cone hangs from the fuselage, its axis aimed at the light pool:
    // position it at the midpoint and tilt the down-axis onto the beam.
    const cone = heli.cone;
    cone.position.set(dx / 2, -11, dz / 2);
    const beam = new THREE.Vector3(dx, -22, dz).normalize();
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), beam);
    if (CBS.audio) CBS.audio.heliNear(Math.max(0, 1 - U.dist2D(heli.x, heli.z, player.x, player.z) / 130));
  }

  // What the police panel lists: nearest units, blocks and the air unit.
  function panelUnits(player) {
    const list = [];
    for (const u of units) {
      list.push({ name: u.name, dist: U.dist2D(u.car.x, u.car.z, player.x, player.z), kind: 'unit' });
    }
    if (block) {
      for (const car of block.cars) {
        list.push({ name: car.blockName, dist: U.dist2D(car.x, car.z, player.x, player.z), kind: 'block' });
      }
    }
    if (heli && heli.active) {
      list.push({ name: 'AIR-1 "Kestrel"', dist: U.dist2D(heli.x, heli.z, player.x, player.z), kind: 'air' });
    }
    list.sort((a, b) => a.dist - b.dist);
    return list.slice(0, 6);
  }

  CBS.police = {
    init, update, addHeat, setHeat, clearHeat, stars, panelUnits,
    get heat() { return heat; },
    get bust() { return bust; },
    get units() { return units; },
    get block() { return block; },
    get heliActive() { return !!(heli && heli.active); },
    placeRoadblock, // exposed for staged screenshots
    placeHeli: (x, z) => {
      // Park the air unit at an exact mark (staged screenshots compose it).
      if (!heli) return;
      heli.active = true;
      heli.group.visible = true;
      heli.x = x;
      heli.z = z;
      heli.group.position.set(x, 22, z);
    },
    forceHeli: (player) => {
      if (heli && !heli.active) {
        heli.active = true;
        heli.group.visible = true;
        heli.x = player.x + 14;
        heli.z = player.z - 10;
      }
    },
  };
})();
