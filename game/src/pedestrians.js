// Pedestrians for Coral Bay Syndicate: residents who stroll the block sidewalks,
// the beach promenade and the marina pier — and who dive aside, flee gunfire and
// fall when a car finds them. Each walker is a small articulated figure (two
// swinging legs and a torso) tinted from a bright resort palette.
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
    };
    const start = route[ped.wp];
    ped.x = start[0] + randRange(rand, -4, 4); ped.z = start[1] + randRange(rand, -4, 4);
    fig.group.position.set(ped.x, 0.05, ped.z);
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

  function update(dt, ctx) {
    for (const ped of peds) {
      if (ped.down) {
        ped.stateT += dt;
        if (ped.stateT > 26) { // quietly clear away and respawn across town
          ped.down = false; ped.state = 'walk'; ped.group.rotation.set(0, 0, 0); ped.group.position.y = 0.05;
          const r = randPick(rand, routes); ped.route = r; ped.wp = 0;
          ped.x = r[0][0]; ped.z = r[0][1];
        }
        continue;
      }
      let speed = ped.speed;
      if (ped.state === 'flee') {
        ped.stateT -= dt; speed = 4.6;
        if (ped.stateT <= 0) ped.state = 'walk';
      } else if (ctx.gunshotAt && Math.hypot(ped.x - ctx.gunshotAt.x, ped.z - ctx.gunshotAt.z) < 26) {
        ped.state = 'flee'; ped.stateT = randRange(rand, 1.6, 3.2);
        ped.fleeFrom = ctx.gunshotAt;
      }
      // A car bearing down: step sharply away from the road.
      if (ctx.playerCarPos && ctx.playerCarSpeed > 6) {
        const d = Math.hypot(ped.x - ctx.playerCarPos.x, ped.z - ctx.playerCarPos.z);
        if (d < 5.5 && ped.state !== 'flee') { ped.state = 'flee'; ped.stateT = 1.1; ped.fleeFrom = ctx.playerCarPos; }
      }
      let tx, tz;
      if (ped.state === 'flee' && ped.fleeFrom) {
        tx = ped.x + (ped.x - ped.fleeFrom.x); tz = ped.z + (ped.z - ped.fleeFrom.z);
      } else {
        const target = ped.route[ped.wp];
        tx = target[0]; tz = target[1];
        if (Math.hypot(tx - ped.x, tz - ped.z) < 1.2) { ped.wp = (ped.wp + 1) % ped.route.length; continue; }
      }
      const dx = tx - ped.x, dz = tz - ped.z, len = Math.hypot(dx, dz) || 1;
      ped.heading = Math.atan2(dx / len, dz / len);
      ped.x += (dx / len) * speed * dt;
      ped.z += (dz / len) * speed * dt;
      ped.x = clamp(ped.x, -214, 214); ped.z = clamp(ped.z, -214, 276);
      ped.phase += dt * speed * 3.4;
      const groundY = Math.abs(ped.x - PIER_X) < 4.2 && ped.z > 207 ? 0.85 : 0.05;
      ped.group.position.set(ped.x, groundY + Math.abs(Math.sin(ped.phase)) * 0.045, ped.z);
      ped.group.rotation.y = ped.heading;
      const swing = Math.sin(ped.phase) * (ped.state === 'flee' ? 0.75 : 0.45);
      ped.legPivotL.rotation.x = swing; ped.legPivotR.rotation.x = -swing;
    }
  }

  return { peds, update, knockDown };
}
