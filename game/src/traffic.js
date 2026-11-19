// Traffic for Coral Bay Syndicate: civilian cars that cruise the street grid on
// proper right-hand lanes, slow for the car ahead, turn at intersections, plus
// parked cars lining the streets — every one of them stealable by the player.
// The drivers are not clockwork: they honk when the player cuts them up, swerve
// a half-lane away from a car bearing down on them, and freeze for a breath
// after a big crash nearby before they dare move again.
const THREE = window.THREE;
import { mulberry32, randRange, randPick, clamp, wrapAngle } from './util.js';
import { STREET_LINES } from './city.js';
import { createCarMesh, makeVehicle, CAR_COLORS } from './vehicles.js';

const LANE = 3.4;

// Where is a car on its rail? axis 'v' runs along z on street x=line, 'h' along x.
function railPoint(seg, s) {
  if (seg.axis === 'v') return { x: seg.line + (seg.dir > 0 ? -LANE : LANE), z: s };
  return { x: s, z: seg.line + (seg.dir > 0 ? LANE : -LANE) };
}
function railHeading(seg) {
  if (seg.axis === 'v') return seg.dir > 0 ? 0 : Math.PI;
  return seg.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

export function createTraffic(scene, rand, count = 18, hooks = {}) {
  const cars = [];       // every world car: traffic, parked, or the player's ride
  const movers = [];     // the subset currently driven by traffic AI

  function spawnParked(x, z, heading, color, kind = 'car') {
    const mesh = createCarMesh(color ?? randPick(rand, CAR_COLORS), kind, Math.floor(rand() * 8));
    mesh.position.set(x, 0.06, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const v = makeVehicle(mesh, kind);
    v.heading = heading; v.driver = 'parked'; v.parked = true;
    cars.push(v);
    return v;
  }

  function spawnMover() {
    const axis = rand() < 0.5 ? 'v' : 'h';
    const line = randPick(rand, STREET_LINES);
    const dir = rand() < 0.5 ? 1 : -1;
    const along = randRange(rand, -200, 200);
    const taxi = rand() < 0.14;
    const mesh = createCarMesh(taxi ? 0xffd23e : randPick(rand, CAR_COLORS), taxi ? 'taxi' : 'car', Math.floor(rand() * 8));
    scene.add(mesh);
    const v = makeVehicle(mesh, 'car');
    v.driver = 'traffic'; v.parked = false;
    v.seg = { axis, line, dir };
    v.s = along;
    v.turnAt = null; v.turnSeg = null; v.turnBlend = 0;
    v.cruise = randRange(rand, 8.5, 12.5);
    v.speed = v.cruise;
    v.stopped = 0;
    v.honkCd = randRange(rand, 2, 8);   // driver temperament: how soon they lean on the horn
    v.panicT = 0;                       // frozen after a nearby crash
    v.lat = 0; v.latT = 0;              // lateral swerve offset off the rail centre
    cars.push(v); movers.push(v);
    placeOnRail(v, 0);
    return v;
  }

  function placeOnRail(v, dt) {
    const p = railPoint(v.seg, v.s);
    let heading = railHeading(v.seg);
    if (v.turnSeg) {
      // Blend across the intersection onto the new rail for a natural turn:
      // the new rail's along-coordinate starts at the street we came from.
      const along = v.turnFrom + v.turnSeg.dir * (v.s - v.turnAt);
      const q = railPoint(v.turnSeg, along);
      const t = clamp((v.s - (v.turnAt - 8)) / 16, 0, 1);
      const e = t * t * (3 - 2 * t);
      p.x = p.x + (q.x - p.x) * e;
      p.z = p.z + (q.z - p.z) * e;
      const h2 = railHeading(v.turnSeg);
      heading = heading + wrapAngle(h2 - heading) * e;
      if (t >= 1) { v.seg = v.turnSeg; v.s = along; v.turnSeg = null; v.turnCooldown = 3; }
    }
    if (v.lat) { if (v.seg.axis === 'v') p.x += v.lat; else p.z += v.lat; }
    v.group.position.set(p.x, 0.06, p.z);
    v.heading = heading;
    v.group.rotation.set(0, heading, 0);
    v.wheelSpin = (v.wheelSpin || 0) + (v.speed * dt) / 0.35;
    const w = v.group.userData.wheels;
    if (w) for (const k of ['fl', 'fr', 'rl', 'rr']) { w[k].children[0].rotation.x = v.wheelSpin; w[k].children[1].rotation.x = v.wheelSpin; }
  }

  for (let i = 0; i < count; i++) spawnMover();
  // Parked cars along the kerbs, ready to steal.
  const parkSpots = [
    [-49, -30, 0], [-49, 60, 0], [63, -90, Math.PI], [10, -49, Math.PI / 2], [-90, 49, -Math.PI / 2],
    [49, 130, 0], [-130, -49, Math.PI / 2], [118, 49, -Math.PI / 2], [-49, -140, 0], [160, -49, Math.PI / 2],
    [49, -160, Math.PI], [-160, 49, -Math.PI / 2],
  ];
  for (const [x, z, h] of parkSpots) spawnParked(x, z, h);

  function update(dt, playerPos, frozen, ctx) {
    for (const v of movers) {
      if (v.driver !== 'traffic') continue;
      // Keep spacing with the car ahead on the same rail.
      let target = v.cruise;
      for (const o of movers) {
        if (o === v || o.driver !== 'traffic') continue;
        if (o.seg.axis === v.seg.axis && o.seg.line === v.seg.line && o.seg.dir === v.seg.dir && !o.turnSeg && !v.turnSeg) {
          const gap = (o.s - v.s) * 1;
          if (gap > 0 && gap < 11) target = Math.min(target, gap < 6 ? 0 : o.speed);
        }
      }
      // Brake for the player sitting in the lane.
      const p = railPoint(v.seg, v.s + 9);
      const blockedByPlayer = Math.hypot(playerPos.x - p.x, playerPos.z - p.z) < 5.5;
      if (blockedByPlayer) target = 0;

      if (!frozen && ctx) {
        v.honkCd -= dt;
        const vx = v.group.position.x, vz = v.group.position.z;
        // A fresh crash nearby: freeze, stare, maybe honk — then creep on.
        if (ctx.crashAt && ctx.time - ctx.crashAt.t < 1 && !v.panicT) {
          const cd = Math.hypot(vx - ctx.crashAt.x, vz - ctx.crashAt.z);
          if (cd < 20) {
            v.panicT = randRange(rand, 1.2, 2.6);
            if (cd < 13 && v.honkCd <= 0) { hooks.onHonk?.(); v.honkCd = randRange(rand, 3, 6); }
          }
        }
        if (v.panicT > 0) { v.panicT -= dt; target = 0; }
        const pc = ctx.playerCar;
        if (pc && pc !== v) {
          const dx = pc.group.position.x - vx, dz = pc.group.position.z - vz;
          const dist = Math.hypot(dx, dz);
          const fX = Math.sin(v.heading), fZ = Math.cos(v.heading);
          const ahead = dist > 0.01 ? (dx * fX + dz * fZ) / dist : 0;
          const side = (dx * fZ - dz * fX) / (dist || 1);
          // Cut up or tailgated hard: one indignant honk, on a long cooldown.
          if (v.honkCd <= 0 && ((dist < 9 && ahead > 0.7 && Math.abs(side) < 0.45) || dist < 3.4 || blockedByPlayer)) {
            hooks.onHonk?.();
            v.honkCd = randRange(rand, 3.5, 7);
          }
          // The player's car bearing down on us: shy a half-lane away from it.
          const pX = Math.sin(pc.heading), pZ = Math.cos(pc.heading);
          const toward = dist > 0.01 ? -(dx * pX + dz * pZ) / dist : 0;
          if (dist < 13 && Math.abs(pc.speed) > 12 && toward > 0.75) {
            v.latT = v.seg.axis === 'v' ? -Math.sign(dx || 1) * 1.15 : -Math.sign(dz || 1) * 1.15;
          } else v.latT = 0;
        } else v.latT = 0;
        v.lat += (v.latT - v.lat) * Math.min(1, dt * 2.6);
      }

      v.speed += clamp(target - v.speed, -18 * dt * 3, 6 * dt) * (frozen ? 0 : 1);
      if (frozen) v.speed = 0;
      v.s += v.speed * dt;
      if (v.s > 216) v.s = -216; if (v.s < -216) v.s = 216;
      // Decide turns at intersections: from a vertical street a left turn keeps
      // the sign of travel on the new axis, from a horizontal street it flips.
      v.turnCooldown = Math.max(0, (v.turnCooldown || 0) - dt);
      if (!v.turnSeg && v.turnCooldown <= 0) {
        for (const cross of STREET_LINES) {
          if (Math.abs(v.s - cross) < 1.2) {
            const roll = rand();
            if (roll > 0.45) {
              const left = roll > 0.72;
              const nd = v.seg.axis === 'v' ? (left ? v.seg.dir : -v.seg.dir) : (left ? -v.seg.dir : v.seg.dir);
              v.turnSeg = { axis: v.seg.axis === 'v' ? 'h' : 'v', line: cross, dir: nd };
              v.turnAt = cross;
              v.turnFrom = v.seg.line;
            }
            break;
          }
        }
      }
      placeOnRail(v, dt);
      // Respawn distant cars near the action.
      const d = Math.hypot(v.group.position.x - playerPos.x, v.group.position.z - playerPos.z);
      if (d > 300) { v.s = randRange(rand, -160, 160); v.seg.line = randPick(rand, STREET_LINES); }
    }
  }

  return { cars, movers, update, spawnParked };
}
