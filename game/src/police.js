// Coral Bay Syndicate - police.js
// The wanted system. Crimes raise the star level; cruisers spawn on
// the road graph and hunt the player. While a unit has eyes on the
// player the state is PURSUIT; lose them and it drops to SEARCHING,
// and a wanted level that stays unseen slowly cools off. Getting
// pinned by a unit fills the bust meter and ends in an arrest.

'use strict';

function addCrime(stars, x, z) {
  if (G.dead) return;
  G.wanted = clamp(G.wanted + stars, 0, 5);
  G.seenT = 0;
}

function spawnCop() {
  // Spawn on a road node a few blocks away, never right on top of us.
  var px = G.inCar ? G.inCar.x : G.player.x, pz = G.inCar ? G.inCar.z : G.player.z;
  var tries = 0, node = null;
  while (tries++ < 12) {
    var cand = pick(G.nodes);
    var d = dist2(px, pz, cand.x, cand.z);
    if (d > 130 && d < 320) { node = cand; break; }
  }
  if (!node) return;
  var mesh = makeCarMesh(0xf2f2f2, 'Sedan');
  // Two-tone doors and a red/blue light bar mark the cruiser.
  part(new THREE.BoxGeometry(2.04, 0.4, 2.0), lam(0x1d2733), 0, 0.6, 0.1, mesh);
  part(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff3b30 }), -0.4, 1.62, -0.2, mesh);
  part(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2f7fff }), 0.4, 1.62, -0.2, mesh);
  mesh.position.set(node.x, 0, node.z);
  G.scene.add(mesh);
  var cop = {
    mesh: mesh, x: node.x, z: node.z, angle: 0, speed: 0, hp: 120, maxHp: 120,
    type: 'Cruiser', name: 'Police Cruiser', driver: 'cop', dead: false,
    exploded: false, smokeT: 0, steer: 0, police: true, route: [], ri: 0, repath: 0,
  };
  mesh.userData.bodyMat = mesh.userData.bodyMat || null;
  G.cops.push(cop);
}

function copRoute(cop) {
  var tx = G.inCar ? G.inCar.x : G.player.x, tz = G.inCar ? G.inCar.z : G.player.z;
  cop.route = routeNodes(cop.x, cop.z, tx, tz);
  cop.ri = 0;
}

function tickCop(cop, dt) {
  if (cop.dead) { syncCarMesh(cop, dt); return; }
  var px = G.inCar ? G.inCar.x : G.player.x, pz = G.inCar ? G.inCar.z : G.player.z;
  var dP = dist2(cop.x, cop.z, px, pz);
  cop.repath -= dt;
  if (cop.repath <= 0) { cop.repath = 1.6; copRoute(cop); }
  var tx = px, tz = pz;
  if (dP > 46 && cop.route.length) {
    // Follow the road route until close, then hunt directly.
    while (cop.ri < cop.route.length - 1 && dist2(cop.x, cop.z, cop.route[cop.ri].x, cop.route[cop.ri].z) < 12) cop.ri++;
    tx = cop.route[cop.ri].x; tz = cop.route[cop.ri].z;
  }
  var want = Math.atan2(tx - cop.x, tz - cop.z);
  cop.angle = angLerp(cop.angle, want, clamp(dt * 2.6, 0, 1));
  var target = dP > 130 ? 30 : 21.5;
  if (dP < 9) target = 6;
  var ahead = carAhead(cop);
  if (ahead && ahead !== G.inCar) target = Math.min(target, ahead.speed);
  cop.speed = lerp(cop.speed, target, clamp(dt * 2.2, 0, 1));
  cop.x += Math.sin(cop.angle) * cop.speed * dt;
  cop.z += Math.cos(cop.angle) * cop.speed * dt;
  var fixed = collideXZ(cop.x, cop.z, 1.8);
  cop.x = fixed[0]; cop.z = fixed[1];
  syncCarMesh(cop, dt);
}

var bustMeter = 0;
function tickPolice(dt) {
  var px = G.inCar ? G.inCar.x : G.player.x, pz = G.inCar ? G.inCar.z : G.player.z;
  // Eyes on the player?
  var seen = false, nearest = Infinity;
  for (var i = 0; i < G.cops.length; i++) {
    var c = G.cops[i];
    if (c.dead) continue;
    var d = dist2(c.x, c.z, px, pz);
    if (d < nearest) nearest = d;
    if (d < 95) seen = true;
  }
  if (seen) G.seenT = 0; else G.seenT += dt;
  G.policeState = G.wanted === 0 ? 'CLEAR' : (G.seenT < 4 ? 'PURSUIT' : 'SEARCHING');
  G.nearestCop = nearest === Infinity ? -1 : Math.round(nearest);

  // Keep the unit count matched to the wanted level.
  var want = G.wanted === 0 ? 0 : Math.min(4, G.wanted);
  var alive = G.cops.filter(function (c) { return !c.dead; }).length;
  if (alive < want && G.spawnT === undefined) G.spawnT = 0;
  if (alive < want) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) { spawnCop(); G.spawnT = 2.5; }
  }
  for (var j = G.cops.length - 1; j >= 0; j--) {
    var cop = G.cops[j];
    if ((G.wanted === 0 && dist2(cop.x, cop.z, px, pz) > 200) || dist2(cop.x, cop.z, px, pz) > 700) {
      G.scene.remove(cop.mesh); G.cops.splice(j, 1); continue;
    }
    tickCop(cop, dt);
  }
  // Cool-off: unseen wanted levels fade one star at a time.
  if (G.wanted > 0 && G.seenT > 13) {
    G.wanted--; G.seenT = 5;
    if (G.wanted === 0) showToast('You lost the police');
  }
  // Bust: a live unit pinning a slow or on-foot player fills the meter.
  var pinned = false;
  if (G.wanted > 0 && !G.dead) {
    var pSpeed = G.inCar ? Math.abs(G.inCar.speed) : 0;
    if (nearest < 8 && (!G.inCar || pSpeed < 2.5)) pinned = true;
  }
  if (pinned) {
    bustMeter += dt;
    if (bustMeter > 2.4) { bustMeter = 0; respawn(true); }
  } else bustMeter = Math.max(0, bustMeter - dt * 1.5);
  G.bust = bustMeter / 2.4;
}
