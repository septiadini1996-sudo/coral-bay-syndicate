// Coral Bay Syndicate - people.js
// One shared builder makes every human in the game: Rico, the 32
// wandering pedestrians and the story characters. Story characters
// are flagged in their data: gunfire makes them duck or flee and they
// can never die. This file also owns the player's on-foot movement,
// damage (armor absorbs before health) and respawn rules.

'use strict';

var legGeo = null, torsoGeo = null, armGeo = null, headGeo = null;
var SKIN = [0xf2c79b, 0xd9a066, 0xa0663a, 0x7a4a26, 0xffe0bd];
var SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0xe67e22, 0x1abc9c, 0xfd79a8, 0x00b8d4];
var PANTS = [0x2c3e50, 0x34495e, 0x6d4c41, 0x546e7a, 0x212f3c, 0x7f5539];

function part(geo, mat, x, y, z, parent) {
  var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
}

// Builds a person as a group of boxes. The returned group's userData
// carries the limb references the animator swings, plus the gun group
// (hidden until a weapon is drawn).
function makePerson(shirt, pants, skin, hairColor) {
  if (!legGeo) {
    legGeo = new THREE.BoxGeometry(0.34, 0.78, 0.34);
    torsoGeo = new THREE.BoxGeometry(0.78, 0.74, 0.42);
    armGeo = new THREE.BoxGeometry(0.24, 0.72, 0.24);
    headGeo = new THREE.BoxGeometry(0.42, 0.44, 0.42);
  }
  var g = new THREE.Group();
  // Limbs hang from pivot groups at the hip/shoulder joints, so a
  // rotation swings them like real steps and raises them onto a gun.
  function limb(geo, mat, jx, jy) {
    var pivot = new THREE.Group();
    pivot.position.set(jx, jy, 0);
    var m = new THREE.Mesh(geo, mat);
    m.position.y = -geo.parameters.height / 2 + 0.04;
    pivot.add(m); g.add(pivot);
    return pivot;
  }
  var legL = limb(legGeo, lam(pants), -0.2, 0.8);
  var legR = limb(legGeo, lam(pants), 0.2, 0.8);
  var torso = part(torsoGeo, lam(shirt), 0, 1.14, 0, g);
  var armL = limb(armGeo, lam(shirt), -0.52, 1.46);
  var armR = limb(armGeo, lam(shirt), 0.52, 1.46);
  var head = part(headGeo, lam(skin), 0, 1.74, 0, g);
  var hair = part(new THREE.BoxGeometry(0.46, 0.16, 0.46), lam(hairColor), 0, 1.98, 0, g);
  g.userData = { legL: legL, legR: legR, armL: armL, armR: armR, torso: torso, head: head };
  g.userData.gun = buildGun();
  g.userData.gun.position.set(0.55, 0.82, 0.14);
  g.userData.gun.visible = false;
  g.add(g.userData.gun);
  return g;
}

// A visible multi-part 3D gun: receiver, barrel, muzzle, grip,
// magazine and a rear sight, held in the right hand.
function buildGun() {
  var g = new THREE.Group();
  var dark = lam(0x1d2126), steel = lam(0x565e66);
  part(new THREE.BoxGeometry(0.09, 0.16, 0.52), dark, 0, 0, 0.1, g);          // receiver
  part(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 6), steel, 0, 0.03, 0.5, g)
    .rotation.x = Math.PI / 2;                                                // barrel
  part(new THREE.BoxGeometry(0.07, 0.2, 0.1), dark, 0, -0.16, -0.05, g);      // grip
  part(new THREE.BoxGeometry(0.06, 0.24, 0.12), steel, 0, -0.17, 0.16, g);    // magazine
  part(new THREE.BoxGeometry(0.04, 0.09, 0.04), dark, 0, 0.13, -0.12, g);     // sight
  return g;
}

function spawnPed(x, z, opts) {
  opts = opts || {};
  var mesh = makePerson(opts.shirt || pick(SHIRTS), opts.pants || pick(PANTS),
    opts.skin || pick(SKIN), opts.hair !== undefined ? opts.hair : ri(0x111111, 0x888888));
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  var ped = {
    mesh: mesh, x: x, z: z, angle: rr(0, Math.PI * 2),
    hp: 100, story: !!opts.story, name: opts.name || '',
    state: 'walk', t: rr(0, 3), tx: x, tz: z, speed: rr(1.6, 2.6),
    threatX: 0, threatZ: 0, dead: false, phase: rr(0, 6),
  };
  if (ped.story) { ped.state = 'stand'; }
  G.peds.push(ped);
  return ped;
}

function buildPeople() {
  // Rico, the player character: teal shirt, dark jeans.
  var mesh = makePerson(0x0e7c86, 0x22303c, 0xd9a066, 0x14100c);
  G.player = {
    mesh: mesh, x: 8, z: 1150, angle: Math.PI, speed: 0,
    stepT: 0, name: 'Rico', phase: 0,
  };
  mesh.position.set(G.player.x, 0, G.player.z);
  G.scene.add(mesh);
  // Story cast. Celia waits at the end of the marina pier: job 1.
  spawnPed(0, 1490, { story: true, name: 'Celia', shirt: 0xd6336c, pants: 0xf5f5f5, skin: 0xf2c79b, hair: 0x3a2314 });
  spawnPed(172, -148, { story: true, name: 'Marco', shirt: 0x37474f, pants: 0x212f3c, skin: 0xa0663a, hair: 0x0c0c0c });
  spawnPed(-332, 172, { story: true, name: 'Vera', shirt: 0x6a1b9a, pants: 0x212121, skin: 0xffe0bd, hair: 0xb71c1c });
  // 32 pedestrians on sidewalks all over the city.
  for (var i = 0; i < 32; i++) {
    var onXRoad = rnd() < 0.5;
    var road = -CITY + ri(0, 16) * ROAD_STEP;
    var along = rr(-CITY + 30, CITY - 30);
    var off = (rnd() < 0.5 ? -1 : 1) * rr(16, 20);
    spawnPed(onXRoad ? road + off : along, onXRoad ? along : road + off, {});
  }
}

function animatePerson(p, speed, dt) {
  var u = p.mesh.userData;
  p.phase += dt * (2 + speed * 2.4);
  var sw = clamp(speed * 0.16, 0, 0.55) * Math.sin(p.phase);
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  if (G.player && p === G.player && G.weapon > 0 && G.aimT > 0) {
    u.armR.rotation.x = -1.35; u.armL.rotation.x = -1.1;      // both hands on the gun
    u.gun.position.set(0.5, 1.3, 0.62); u.gun.rotation.set(0, 0, 0);
  } else {
    u.armL.rotation.x = -sw * 0.8; u.armR.rotation.x = sw * 0.8;
    if (G.player && p === G.player) { u.gun.position.set(0.55, 0.82, 0.14); u.gun.rotation.set(0.35, 0, 0); }
  }
  p.mesh.position.y = speed > 0.2 ? Math.abs(Math.sin(p.phase)) * 0.07 : 0;
}

// Damage to a pedestrian. Story characters never take damage: they
// duck, then flee, and stay in the story.
function hurtPed(ped, dmg, fromX, fromZ) {
  if (ped.dead) return;
  ped.threatX = fromX; ped.threatZ = fromZ;
  if (ped.story) {
    if (ped.state !== 'duck') { ped.state = 'duck'; ped.t = 1.4; }
    return;
  }
  ped.hp -= dmg;
  if (ped.hp <= 0) {
    ped.dead = true; ped.state = 'down'; ped.t = 7;
    ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.25;
    return;
  }
  ped.state = 'flee'; ped.t = 4;
}
// Knocked down by a vehicle: survivors get up after ~2.4 s and flee.
function knockPed(ped, fromX, fromZ) {
  if (ped.dead) return;
  ped.threatX = fromX; ped.threatZ = fromZ;
  if (ped.story) { ped.state = 'duck'; ped.t = 1.2; return; }
  ped.hp -= 18;
  if (ped.hp <= 0) { hurtPed(ped, 999, fromX, fromZ); return; }
  ped.state = 'down'; ped.t = 2.4;
  ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.25;
}

function tickPeds(dt) {
  for (var i = G.peds.length - 1; i >= 0; i--) {
    var p = G.peds[i];
    if (p.dead) {
      p.t -= dt;
      if (p.t <= 0) { G.scene.remove(p.mesh); G.peds.splice(i, 1); }
      continue;
    }
    var moving = 0;
    if (p.state === 'stand') {
      p.mesh.rotation.y = p.angle + Math.sin(G.t * 0.6 + p.phase) * 0.14;
    } else if (p.state === 'duck') {
      p.mesh.scale.y = 0.68; p.t -= dt;
      if (p.t <= 0) { p.mesh.scale.y = 1; p.state = 'flee'; p.t = 3.5; }
    } else if (p.state === 'down') {
      p.t -= dt;
      if (p.t <= 0) { p.mesh.rotation.x = 0; p.mesh.position.y = 0; p.state = 'flee'; p.t = 4; }
    } else if (p.state === 'flee') {
      var fa = Math.atan2(p.x - p.threatX, p.z - p.threatZ);
      p.angle = angLerp(p.angle, fa, dt * 8);
      p.x += Math.sin(p.angle) * 6 * dt; p.z += Math.cos(p.angle) * 6 * dt;
      moving = 6; p.t -= dt;
      if (p.t <= 0) p.state = 'walk';
    } else { // walk: stroll to a sidewalk waypoint, then pick another
      var dx = p.tx - p.x, dz = p.tz - p.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 3) {
        var onX = rnd() < 0.5, road = -CITY + ri(0, 16) * ROAD_STEP;
        var off = (rnd() < 0.5 ? -1 : 1) * rr(16, 20);
        if (onX) { p.tx = road + off; p.tz = clamp(p.z + rr(-320, 320), -CITY + 24, CITY - 24); }
        else { p.tz = road + off; p.tx = clamp(p.x + rr(-320, 320), -CITY + 24, CITY - 24); }
      } else {
        p.angle = angLerp(p.angle, Math.atan2(dx, dz), dt * 6);
        p.x += Math.sin(p.angle) * p.speed * dt; p.z += Math.cos(p.angle) * p.speed * dt;
        moving = p.speed;
      }
    }
    if (p.state !== 'down' && p.state !== 'duck') {
      var fixed = collideXZ(p.x, p.z, 0.55);
      p.x = fixed[0]; p.z = fixed[1];
      var sh = shoreClamp(p.x, p.z); p.x = sh[0]; p.z = sh[1];
      p.x = clamp(p.x, -G.bounds, G.bounds); p.z = clamp(p.z, -G.bounds, G.bounds);
      p.mesh.position.set(p.x, p.mesh.position.y, p.z);
      if (p.state !== 'stand') p.mesh.rotation.y = p.angle;
    }
    animatePerson(p, moving, dt);
  }
}

// Player damage: armor absorbs first, health takes the rest.
function hurtPlayer(dmg) {
  if (G.dead) return;
  var absorbed = Math.min(G.armor, dmg);
  G.armor -= absorbed;
  G.hp -= (dmg - absorbed);
  sfx('hurt');
  if (G.hp <= 0) { G.hp = 0; respawn(false); }
}
function respawn(arrested) {
  G.dead = true;
  setTimeout(function () { G.dead = false; }, 900);
  G.armor = 0; G.hp = 100; G.wanted = 0; G.seenT = 99;
  if (arrested) G.cash = Math.max(0, Math.floor(G.cash * 0.9));
  if (G.inCar) { G.inCar.driver = null; G.inCar = null; }
  var spot = arrested ? { x: 336, z: 336 } : { x: 44, z: 1100 };
  G.player.x = spot.x; G.player.z = spot.z;
  G.player.mesh.position.set(spot.x, 0, spot.z);
  showToast(arrested ? 'BUSTED - the police take 10% of your cash' : 'You wake up at Bayview Clinic');
  saveGame();
}

// On-foot movement, driven from main.js input each frame.
function tickPlayer(dt) {
  var p = G.player;
  if (G.inCar || G.dead) { animatePerson(p, 0, dt); return; }
  var fwd = (G.keys.KeyW ? 1 : 0) - (G.keys.KeyS ? 1 : 0);
  var str = (G.keys.KeyD ? 1 : 0) - (G.keys.KeyA ? 1 : 0);
  var sprint = (G.keys.ShiftLeft || G.keys.ShiftRight) ? 1.55 : 1;
  var sp = 7.2 * sprint, moving = 0;
  if (fwd || str) {
    var a = G.camYaw + Math.atan2(str, fwd);
    p.x += Math.sin(a) * sp * dt; p.z += Math.cos(a) * sp * dt;
    moving = sp;
    if (G.aimT <= 0) p.angle = angLerp(p.angle, a, dt * 12);
  }
  if (G.aimT > 0) p.angle = angLerp(p.angle, G.camYaw, dt * 18);  // face the aim
  var fixed = collideXZ(p.x, p.z, 0.55);
  p.x = fixed[0]; p.z = fixed[1];
  var sh = shoreClamp(p.x, p.z); p.x = sh[0]; p.z = sh[1];
  p.x = clamp(p.x, -G.bounds, G.bounds); p.z = clamp(p.z, -G.bounds, G.bounds);
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.angle;
  p.mesh.userData.gun.visible = G.weapon > 0;
  if (moving > 0) {
    p.stepT -= dt;
    if (p.stepT <= 0) { p.stepT = sprint > 1 ? 0.3 : 0.42; sfx('step'); }
  }
  animatePerson(p, moving, dt);
}
