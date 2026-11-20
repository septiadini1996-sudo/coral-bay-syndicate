// Coral Bay Syndicate - vehicles.js
// Every car in the game: one builder makes sedans, taxis and pickups
// (police.js reuses it for cruisers). Traffic cars drive the road
// graph, keep to their lane and stop at red lights. Cars have real
// health: gunfire damages them, they smoke under 45 health, and a car
// destroyed by gunfire or an explosion blows up with fire and area
// damage. A car wrecked by collisions alone never explodes.

'use strict';

var CAR_COLORS = [0xd84f4f, 0x3f7fbf, 0xf2f2f2, 0x2fbf9f, 0xf7d774, 0x8e6cc8, 0x444a52, 0xff8c42];
var wheelGeo = null, smokeTex = null, fireTex = null;

function carName(type, colorName) { return colorName + ' ' + type; }
var COLOR_NAMES = { '14267319': 'Red', '4166079': 'Blue', '15921906': 'White', '3138719': 'Teal', '16246516': 'Yellow', '9328072': 'Purple', '4474706': 'Grey', '16750530': 'Orange' };

function makeCarMesh(color, type) {
  if (!wheelGeo) wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  var g = new THREE.Group();
  var bodyMat = lam(color);
  var body = part(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat, 0, 0.62, 0, g);
  var hood = part(new THREE.BoxGeometry(1.9, 0.3, 1.0), bodyMat, 0, 0.78, 1.85, g);
  var cabinMat = lam(0x22303c);
  if (type === 'Pickup') {
    part(new THREE.BoxGeometry(1.9, 0.62, 1.5), cabinMat, 0, 1.2, 0.7, g);
    part(new THREE.BoxGeometry(1.9, 0.4, 1.9), lam(0x333a42), 0, 0.95, -1.2, g);   // open bed walls
  } else {
    part(new THREE.BoxGeometry(1.8, 0.55, 2.2), cabinMat, 0, 1.18, -0.2, g);
  }
  if (type === 'Taxi') {
    part(new THREE.BoxGeometry(1.0, 0.28, 0.4), lam(0xffd75e), 0, 1.6, -0.2, g);  // roof sign
  }
  part(new THREE.BoxGeometry(1.7, 0.16, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff6c9 }), 0, 0.66, 2.21, g);
  part(new THREE.BoxGeometry(1.7, 0.16, 0.06), new THREE.MeshBasicMaterial({ color: 0xff4444 }), 0, 0.66, -2.21, g);
  var wheels = [];
  var spots = [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]];
  for (var i = 0; i < 4; i++) {
    var w = part(wheelGeo, lam(0x14161a), spots[i][0], 0.42, spots[i][1], g);
    w.rotation.z = Math.PI / 2;
    wheels.push(w);
  }
  g.userData = { wheels: wheels, body: body, bodyMat: bodyMat };
  return g;
}

function createCar(x, z, angle, type, color) {
  var mesh = makeCarMesh(color, type);
  mesh.position.set(x, 0, z); mesh.rotation.y = angle;
  G.scene.add(mesh);
  var car = {
    mesh: mesh, x: x, z: z, angle: angle, speed: 0,
    hp: 100, maxHp: 100, type: type, color: color,
    name: carName(type, COLOR_NAMES[String(color)] || 'Custom'),
    driver: 'ai', route: [], ri: 0, dead: false, exploded: false,
    smokeT: 0, steer: 0, police: false, targetNode: null,
  };
  G.cars.push(car);
  return car;
}

function spawnTraffic() {
  var types = ['Sedan', 'Sedan', 'Sedan', 'Taxi', 'Pickup', 'Sedan', 'Taxi'];
  for (var i = 0; i < 22; i++) {
    var node = pick(G.nodes);
    var type = types[i % types.length];
    var car = createCar(node.x + rr(-3, 3), node.z + rr(-3, 3), ri(0, 3) * Math.PI / 2, type, type === 'Taxi' ? 0xf7d774 : pick(CAR_COLORS));
    planRoute(car, null);
  }
  // A few parked cars to steal near the marina and the mall.
  createCar(24, 1216, Math.PI / 2, 'Sedan', 0xd84f4f).driver = 'parked';
  createCar(-24, 1216, -Math.PI / 2, 'Pickup', 0x3f7fbf).driver = 'parked';
  createCar(176, 176, 0, 'Sedan', 0x2fbf9f).driver = 'parked';
}

// Give an AI car a fresh set of waypoints: a chain of road nodes that
// prefers going straight and never U-turns at an intersection.
function planRoute(car, fromNode) {
  var cur = nearestNode(car.x, car.z);
  var prev = fromNode || null;
  car.route = [];
  for (var s = 0; s < 6; s++) {
    var options = [];
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var d = 0; d < 4; d++) {
      var ni = cur.i + dirs[d][0], nj = cur.j + dirs[d][1];
      if (ni < 0 || nj < 0 || ni > 16 || nj > 16) continue;
      var nb = G.nodes[G.nodeAt[ni + ',' + nj]];
      if (prev && nb === prev) continue;
      var straight = prev && (nb.i - cur.i) === (cur.i - prev.i) && (nb.j - cur.j) === (cur.j - prev.j);
      options.push({ n: nb, w: straight ? 3 : 1 });
    }
    if (!options.length) break;
    var total = 0, o;
    for (o = 0; o < options.length; o++) total += options[o].w;
    var roll = rnd() * total, chosen = options[0].n;
    for (o = 0; o < options.length; o++) { roll -= options[o].w; if (roll <= 0) { chosen = options[o].n; break; } }
    car.route.push(chosen); prev = cur; cur = chosen;
  }
  car.ri = 0;
}

function lanePoint(car, node) {
  // Drive on the right: offset the target node to this car's lane.
  var dx = node.x - car.x, dz = node.z - car.z;
  var d = Math.sqrt(dx * dx + dz * dz) || 1;
  var px = dz / d, pz = -dx / d;
  return { x: node.x + px * 4.2, z: node.z + pz * 4.2 };
}

function carAhead(car) {
  for (var i = 0; i < G.cars.length; i++) {
    var o = G.cars[i];
    if (o === car || o.dead) continue;
    var dx = o.x - car.x, dz = o.z - car.z;
    var fx = Math.sin(car.angle), fz = Math.cos(car.angle);
    var fwd = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    if (fwd > 0 && fwd < 15 && side < 2.6) return o;
  }
  return null;
}

function tickTrafficCar(car, dt) {
  if (!car.route.length || car.ri >= car.route.length) planRoute(car, null);
  var node = car.route[car.ri];
  var lp = lanePoint(car, node);
  var dx = lp.x - car.x, dz = lp.z - car.z;
  var d = Math.sqrt(dx * dx + dz * dz);
  if (d < 7) { car.ri++; return; }
  var want = Math.atan2(dx, dz);
  car.angle = angLerp(car.angle, want, clamp(dt * 2.2, 0, 1));
  var target = 13.5;
  // Stop at red lights on approach to a lit intersection.
  if (d < 26 && lightIsRed(node.x, node.z, Math.sin(car.angle), Math.cos(car.angle))) target = 0;
  var ahead = carAhead(car);
  if (ahead) target = Math.min(target, ahead.speed * 0.9);
  car.speed = lerp(car.speed, target, clamp(dt * (target > car.speed ? 1.2 : 3.5), 0, 1));
  car.x += Math.sin(car.angle) * car.speed * dt;
  car.z += Math.cos(car.angle) * car.speed * dt;
  var fixed = collideXZ(car.x, car.z, 1.6);
  car.x = fixed[0]; car.z = fixed[1];
}

function tickPlayerCar(car, dt) {
  var accel = (G.keys.KeyW ? 1 : 0) - (G.keys.KeyS ? 1 : 0);
  var steer = (G.keys.KeyA ? 1 : 0) - (G.keys.KeyD ? 1 : 0);
  var maxF = car.type === 'Pickup' ? 30 : 36;
  if (accel > 0) car.speed = Math.min(car.speed + 16 * dt, maxF);
  else if (accel < 0) car.speed = Math.max(car.speed - (car.speed > 1 ? 26 * dt : 8 * dt), -10);
  else car.speed = lerp(car.speed, 0, clamp(dt * 0.7, 0, 1));
  car.steer = lerp(car.steer, steer, clamp(dt * 8, 0, 1));
  if (Math.abs(car.speed) > 0.2) {
    car.angle += car.steer * clamp(car.speed / 14, -1.4, 1.4) * dt * 1.15;
  }
  var nx = car.x + Math.sin(car.angle) * car.speed * dt;
  var nz = car.z + Math.cos(car.angle) * car.speed * dt;
  var fixed = collideXZ(nx, nz, 2.0);
  if (Math.abs(fixed[0] - nx) > 0.01 || Math.abs(fixed[1] - nz) > 0.01) {
    if (Math.abs(car.speed) > 9) { damageCar(car, 6, 'crash'); sfx('crash'); }
    car.speed *= 0.35;
  }
  car.x = fixed[0]; car.z = fixed[1];
  var sh = shoreClamp(car.x, car.z); car.x = sh[0]; car.z = sh[1];
  car.x = clamp(car.x, -G.bounds, G.bounds); car.z = clamp(car.z, -G.bounds, G.bounds);
  // Running into a pedestrian knocks them down.
  if (Math.abs(car.speed) > 3) {
    for (var i = 0; i < G.peds.length; i++) {
      var p = G.peds[i];
      if (!p.dead && p.state !== 'down' && dist2(car.x, car.z, p.x, p.z) < 2.6) {
        knockPed(p, car.x, car.z);
        addCrime(1, p.x, p.z);
        if (Math.abs(car.speed) > 10) car.speed *= 0.8;
      }
    }
  }
}

function syncCarMesh(car, dt) {
  car.mesh.position.set(car.x, car.dead ? 0.02 : 0, car.z);
  car.mesh.rotation.y = car.angle;
  car.mesh.rotation.z = car.dead ? 0.06 : 0;
  var w = car.mesh.userData.wheels;
  for (var i = 0; i < w.length; i++) {
    w[i].rotation.x += car.speed * dt / 0.42;
    if (i < 2) w[i].rotation.y = car.steer * 0.4;
  }
  // Smoke once health drops to 45 or below.
  if (!car.dead && car.hp <= 45) {
    car.smokeT -= dt;
    if (car.smokeT <= 0) { car.smokeT = 0.12; spawnPuff(car.x, 1.4, car.z, 0x555c64, 1.6); }
  }
}

// Damage with a cause: 'shot' and 'boom' can blow the car up at zero
// health; 'crash' damage only ever wrecks it.
function damageCar(car, dmg, cause) {
  if (car.dead) return;
  car.hp -= dmg;
  if (car.hp > 0) return;
  car.hp = 0; car.dead = true; car.speed = 0;
  car.mesh.userData.bodyMat.color.setHex(0x23262b);
  if (cause === 'shot' || cause === 'boom') explodeCar(car);
  if (G.inCar === car) {
    hurtPlayer(12);
    exitCar();
    showToast('Your ride is wrecked!');
  }
}

function explodeCar(car) {
  if (car.exploded) return;
  car.exploded = true;
  sfx('boom');
  spawnFire(car.x, car.z);
  // Area damage: pedestrians close in die, cars nearby chain-damage.
  for (var i = 0; i < G.peds.length; i++) {
    var p = G.peds[i], d = dist2(car.x, car.z, p.x, p.z);
    if (d < 3) hurtPed(p, 999, car.x, car.z);
    else if (d < 6.5) hurtPed(p, 45, car.x, car.z);
  }
  for (var j = 0; j < G.cars.length; j++) {
    var o = G.cars[j];
    if (o !== car && !o.dead && dist2(car.x, car.z, o.x, o.z) < 4.5) damageCar(o, 55, 'boom');
  }
  for (var c = 0; c < G.cops.length; c++) {
    var cop = G.cops[c];
    if (!cop.dead && dist2(car.x, car.z, cop.x, cop.z) < 4.5) damageCar(cop, 55, 'boom');
  }
  var pd = dist2(car.x, car.z, G.player.x, G.player.z);
  if (!G.inCar && pd < 6.5) hurtPlayer(Math.round(30 * (1 - pd / 7)));
  if (G.inCar && pd < 6.5 && G.inCar !== car) hurtPlayer(8);
  addCrime(2, car.x, car.z);
}

// Fire and smoke sprite pools --------------------------------------
function radialTex(inner, outer) {
  var cv = document.createElement('canvas'); cv.width = cv.height = 64;
  var c = cv.getContext('2d');
  var gr = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
function spawnFire(x, z) {
  if (!fireTex) fireTex = radialTex('rgba(255,220,120,1)', 'rgba(255,80,0,0)');
  var group = [];
  for (var i = 0; i < 13; i++) {
    var sm = new THREE.SpriteMaterial({ map: fireTex, blending: THREE.AdditiveBlending, depthWrite: false });
    var sp = new THREE.Sprite(sm);
    sp.position.set(x + rr(-1.6, 1.6), rr(0.5, 2), z + rr(-1.6, 1.6));
    var sc = rr(1.6, 3.4); sp.scale.set(sc, sc, 1);
    G.scene.add(sp); group.push(sp);
  }
  G.fires.push({ sprites: group, t: 6, x: x, z: z });
}
var puffPool = [];
function spawnPuff(x, y, z, color, size) {
  if (!smokeTex) smokeTex = radialTex('rgba(200,200,200,0.85)', 'rgba(200,200,200,0)');
  var sp = null;
  for (var i = 0; i < puffPool.length; i++) if (!puffPool[i].visible) { sp = puffPool[i]; break; }
  if (!sp) {
    if (puffPool.length > 70) return;
    sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true }));
    G.scene.add(sp); puffPool.push(sp);
  }
  sp.visible = true;
  sp.material.color.setHex(color);
  sp.material.opacity = 0.55;
  sp.position.set(x, y, z);
  sp.scale.set(size, size, 1);
  sp.userData = { t: 0, life: 1.4, size: size };
}
function tickEffects(dt) {
  for (var i = G.fires.length - 1; i >= 0; i--) {
    var f = G.fires[i]; f.t -= dt;
    for (var j = 0; j < f.sprites.length; j++) {
      var sp = f.sprites[j];
      sp.material.opacity = clamp(f.t / 2, 0, 1);
      var flick = 2.4 + Math.sin(G.t * 31 + j * 2.7) * 0.7;
      sp.scale.set(flick, flick * 1.15, 1);
      sp.position.y = 1 + Math.sin(G.t * 9 + j * 1.3) * 0.35;
    }
    if (f.t <= 0) {
      for (var k = 0; k < f.sprites.length; k++) G.scene.remove(f.sprites[k]);
      G.fires.splice(i, 1);
    }
  }
  for (var q = 0; q < puffPool.length; q++) {
    var pf = puffPool[q];
    if (!pf.visible) continue;
    pf.userData.t += dt;
    pf.position.y += dt * 1.6;
    var s = pf.userData.size * (1 + pf.userData.t);
    pf.scale.set(s, s, 1);
    pf.material.opacity = 0.55 * (1 - pf.userData.t / pf.userData.life);
    if (pf.userData.t >= pf.userData.life) pf.visible = false;
  }
}

function enterCar(car) {
  G.inCar = car; car.driver = 'player';
  G.player.mesh.visible = false;
  showToast(car.name + ' - CONDITION ' + Math.max(0, Math.round(car.hp)) + '%');
}
function exitCar() {
  var car = G.inCar; if (!car) return;
  car.driver = 'parked'; car.speed = 0;
  G.inCar = null;
  var side = car.angle + Math.PI / 2;
  G.player.x = car.x + Math.sin(side) * 3; G.player.z = car.z + Math.cos(side) * 3;
  var fixed = collideXZ(G.player.x, G.player.z, 0.55);
  G.player.x = fixed[0]; G.player.z = fixed[1];
  G.player.mesh.visible = true;
  G.player.mesh.position.set(G.player.x, 0, G.player.z);
}

function tickCars(dt) {
  for (var i = 0; i < G.cars.length; i++) {
    var car = G.cars[i];
    if (car.dead) { syncCarMesh(car, dt); continue; }
    if (car.driver === 'ai') tickTrafficCar(car, dt);
    else if (car.driver === 'player') tickPlayerCar(car, dt);
    syncCarMesh(car, dt);
  }
  tickEffects(dt);
}
