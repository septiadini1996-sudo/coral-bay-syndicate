// Pedestrians for Coral Bay Syndicate: residents with a small life of their
// own. Each walker runs an individual state machine — stroll between corners,
// wait at the kerb, idle a moment with their phone, watch a police chase roll
// past — and perceives the city: a gunshot close by makes them cower, then
// run; a car bearing down makes them dive aside; a crash draws a crowd of
// onlookers. Speed, size and nerve vary per person. Each walker is a small
// articulated figure (two swinging legs and a torso) in resort colours.
const THREE = window.THREE;
import { randRange, randPick, clamp, mergeParts, boxGeo, sphGeo, vertexColorMaterial } from './util.js';
import { BLOCK_CENTERS, PIER_X } from './city.js';

const SKIN = [0xf2c79b, 0xc98d5f, 0x8a5a34, 0x6e4525, 0xffd9b3];
const SHIRTS = [0xff5e78, 0x3ec6dd, 0xffd23e, 0x7dff9a, 0xffffff, 0xff8c42, 0xe6ccff, 0x59c2b8];
const PANTS = [0x2c3e50, 0xf4f1e8, 0x7a5c2e, 0x38618c, 0xd95f43];

function buildFigure(rand) {
  const group = new THREE.Group();
  const skin = randPick(rand, SKIN), shirt = randPick(rand, SHIRTS), pants = randPick(rand, PANTS);
  const legGeo = boxGeo(0.17, 0.78, 0.2);
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const legL = new THREE.Mesh(legGeo, legMat); legL.position.set(-0.11, 0.78, 0);
  const legR = new THREE.Mesh(legGeo, legMat); legR.position.set(0.11, 0.78, 0);
  const legPivotL = new THREE.Group(); legPivotL.position.set(-0.11, 0.8, 0); legL.position.set(0, -0.39, 0); legPivotL.add(legL);
  const legPivotR = new THREE.Group(); legPivotR.position.set(0.11, 0.8, 0); legR.position.set(0, -0.39, 0); legPivotR.add(legR);
  const torso = new THREE.Mesh(mergeParts([
    { geo: boxGeo(0.52, 0.62, 0.3), x: 0, y: 1.12, z: 0, color: shirt },
    { geo: boxGeo(0.13, 0.52, 0.16), x: -0.34, y: 1.08, z: 0, color: shirt },
    { geo: boxGeo(0.13, 0.52, 0.16), x: 0.34, y: 1.08, z: 0, color: shirt },
    { geo: sphGeo(0.21, 10), x: 0, y: 1.62, z: 0, color: skin },
    { geo: boxGeo(0.46, 0.1, 0.46), x: 0, y: 1.78, z: 0, color: randPick(rand, SHIRTS) },
  ]), vertexColorMaterial());
  torso.castShadow = true;
  group.add(legPivotL); group.add(legPivotR); group.add(torso);
  return { group, legPivotL, legPivotR, torso };
}

// A walk route is a loop of waypoints; the ped walks point to point forever.
function blockLoop(bx, bz) {
  const o = 24.6;
  return [[bx - o, bz - o], [bx + o, bz - o], [bx + o, bz + o], [bx - o, bz + o]];
}

export function createPedestrians(scene, rand, count = 34) {
  const peds = [];
  const routes = [];
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) routes.push(blockLoop(bx, bz));
  routes.push([[-205, 205], [205, 205], [205, 212], [-205, 212]]);                    // promenade
  routes.push([[PIER_X - 2.4, 212], [PIER_X - 2.4, 274], [PIER_X + 2.4, 274], [PIER_X + 2.4, 212]]); // pier

  for (let i = 0; i < count; i++) {
    const fig = buildFigure(rand);
    scene.add(fig.group);
    const route = randPick(rand, routes);
    const ped = {
      ...fig, route, wp: Math.floor(rand() * route.length),
      x: 0, z: 0, heading: 0, speed: randRange(rand, 1.1, 1.9),
      state: 'walk', stateT: 0, phase: rand() * 9, down: false, id: i,
      nerve: randRange(rand, 0.8, 1.25),          // how close trouble must be before they react
      scaleV: randRange(rand, 0.92, 1.08),        // height variety
      crouch: 0,                                   // 0 standing, 1 fully cowering
      lastShotT: -9, lastCrashT: -9,
      fleeFrom: null, watchX: 0, watchZ: 0, cowerFrom: null,
    };
    const start = route[ped.wp];
    ped.x = start[0] + randRange(rand, -4, 4); ped.z = start[1] + randRange(rand, -4, 4);
    fig.group.position.set(ped.x, 0.05, ped.z);
    fig.group.scale.set(ped.scaleV, ped.scaleV, ped.scaleV);
    fig.group.traverse((o) => { o.userData.pedId = i; });
    peds.push(ped);
  }

  function knockDown(ped, cause) {
    if (ped.down) return;
    ped.down = true; ped.state = 'down'; ped.stateT = 0;
    ped.torso.rotation.x = 0;
    ped.group.rotation.set(-Math.PI / 2 + 0.12, ped.heading, 0);
    ped.group.position.y = 0.28;
    ped.legPivotL.rotation.x = 0.3; ped.legPivotR.rotation.x = -0.2;
    ped.cause = cause;
  }

  function setState(ped, state, t) { ped.state = state; ped.stateT = t; }

  function update(dt, ctx) {
    for (const ped of peds) {
      if (ped.down) {
        ped.stateT += dt;
        if (ped.stateT > 26) { // quietly clear away and respawn across town
          ped.down = false; ped.state = 'walk'; ped.crouch = 0;
          ped.group.rotation.set(0, 0, 0); ped.group.position.y = 0.05;
          ped.group.scale.set(ped.scaleV, ped.scaleV, ped.scaleV);
          const r = randPick(rand, routes); ped.route = r; ped.wp = 0;
          ped.x = r[0][0]; ped.z = r[0][1];
        }
        continue;
      }

      /* ----- perception: shots, crashes, cars, sirens ----- */
      const calm = ped.state === 'walk' || ped.state === 'wait' || ped.state === 'idle' || ped.state === 'watch';
      if (ctx.gunshotAt && ctx.gunshotAt.t !== ped.lastShotT) {
        ped.lastShotT = ctx.gunshotAt.t;
        const d = Math.hypot(ped.x - ctx.gunshotAt.x, ped.z - ctx.gunshotAt.z);
        if (d < 11 * ped.nerve) { ped.cowerFrom = ctx.gunshotAt; setState(ped, 'cower', randRange(rand, 1.1, 2)); }
        else if (d < 27 * ped.nerve) { ped.fleeFrom = ctx.gunshotAt; setState(ped, 'flee', randRange(rand, 1.6, 3.2)); }
      }
      if (ctx.crashAt && ctx.crashAt.t !== ped.lastCrashT) {
        ped.lastCrashT = ctx.crashAt.t;
        const d = Math.hypot(ped.x - ctx.crashAt.x, ped.z - ctx.crashAt.z);
        if (d < 9 * ped.nerve) { ped.fleeFrom = ctx.crashAt; setState(ped, 'flee', randRange(rand, 1.2, 2.2)); }
        else if (d < 19 && calm) { ped.watchX = ctx.crashAt.x; ped.watchZ = ctx.crashAt.z; setState(ped, 'watch', randRange(rand, 1.6, 2.8)); }
      }
      // A car bearing down: dive aside early, run if it is truly on top of us.
      const car = ctx.playerCar;
      if (car && Math.abs(car.speed) > 6) {
        const dx = ped.x - car.x, dz = ped.z - car.z;
        const d = Math.hypot(dx, dz);
        const fX = Math.sin(car.heading), fZ = Math.cos(car.heading);
        const toward = d > 0.01 ? -(dx * fX + dz * fZ) / d : 0;   // car driving at the ped?
        if (d < 6.5 || (d < 11 && Math.abs(car.speed) > 11 && toward > 0.55)) {
          if (ped.state !== 'flee') { ped.fleeFrom = { x: car.x, z: car.z }; setState(ped, 'flee', 1.1); }
        }
      }
      // Sirens close by and a chase on: stop and watch it go past.
      if (calm && ped.state !== 'watch' && ctx.policeAt && ctx.wanted > 0) {
        const d = Math.hypot(ped.x - ctx.policeAt.x, ped.z - ctx.policeAt.z);
        if (d < 22) { ped.watchX = ctx.policeAt.x; ped.watchZ = ctx.policeAt.z; setState(ped, 'watch', randRange(rand, 1.8, 3)); }
      }

      /* ----- behaviour ----- */
      let speed = 0, tx = null, tz = null, moving = false;
      if (ped.state === 'flee') {
        ped.stateT -= dt;
        speed = 4.6;
        if (ped.fleeFrom) { tx = ped.x + (ped.x - ped.fleeFrom.x); tz = ped.z + (ped.z - ped.fleeFrom.z); }
        if (ped.stateT <= 0) setState(ped, 'walk', 0);
      } else if (ped.state === 'cower') {
        ped.stateT -= dt;
        if (ped.stateT <= 0) { ped.fleeFrom = ped.cowerFrom; setState(ped, 'flee', randRange(rand, 1.4, 2.4)); }
      } else if (ped.state === 'wait' || ped.state === 'idle' || ped.state === 'watch') {
        ped.stateT -= dt;
        if (ped.state === 'watch') ped.heading = Math.atan2(ped.watchX - ped.x, ped.watchZ - ped.z);
        if (ped.stateT <= 0) setState(ped, 'walk', 0);
      } else { // walk: stroll to the next corner, then decide what a person does there
        const target = ped.route[ped.wp];
        tx = target[0]; tz = target[1];
        speed = ped.speed;
        if (Math.hypot(tx - ped.x, tz - ped.z) < 1.2) {
          ped.wp = (ped.wp + 1) % ped.route.length;
          const roll = rand();
          if (roll < 0.3) setState(ped, 'wait', randRange(rand, 1.2, 3.2));       // kerb pause, checking the road
          else if (roll < 0.42) setState(ped, 'idle', randRange(rand, 2, 4.5));   // phone out, nowhere to be
          continue;
        }
      }
      ped.crouch += (((ped.state === 'cower') ? 1 : 0) - ped.crouch) * Math.min(1, dt * 9);

      if (tx !== null && speed > 0) {
        const dx = tx - ped.x, dz = tz - ped.z, len = Math.hypot(dx, dz) || 1;
        ped.heading = Math.atan2(dx / len, dz / len);
        ped.x += (dx / len) * speed * dt;
        ped.z += (dz / len) * speed * dt;
        moving = true;
      }
      ped.x = clamp(ped.x, -214, 214); ped.z = clamp(ped.z, -214, 276);
      ped.phase += dt * (moving ? speed * 3.4 : 0.8);   // idle figures still breathe and sway
      const groundY = Math.abs(ped.x - PIER_X) < 4.2 && ped.z > 207 ? 0.85 : 0.05;
      const bob = moving ? Math.abs(Math.sin(ped.phase)) * 0.045 : Math.sin(ped.phase * 0.22 + ped.id) * 0.012;
      ped.group.position.set(ped.x, groundY + bob, ped.z);
      ped.group.rotation.y = ped.heading;
      ped.group.rotation.z = ped.state === 'idle' ? Math.sin(ped.phase * 0.3 + ped.id * 2) * 0.03 : 0;
      ped.group.scale.set(ped.scaleV, ped.scaleV * (1 - ped.crouch * 0.32), ped.scaleV);
      const swing = moving ? Math.sin(ped.phase) * (ped.state === 'flee' ? 0.75 : 0.45) : 0;
      ped.legPivotL.rotation.x = swing; ped.legPivotR.rotation.x = -swing;
    }
  }

  return { peds, update, knockDown };
}
