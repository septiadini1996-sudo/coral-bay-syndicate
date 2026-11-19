// The player: Rico Solano on foot and behind the wheel. Third-person mouse-look
// camera, WASD movement, sprinting, entering and stealing cars with E, hitscan
// gunplay with the mouse, an F-key melee shove, health with out-of-combat regen,
// and the driving inputs that feed the shared arcade vehicle model.
const THREE = window.THREE;
import { clamp, lerp, wrapAngle, mergeParts, boxGeo, sphGeo, vertexColorMaterial } from './util.js';
import { resolveCollisions, walkable } from './city.js';
import { stepVehicle } from './vehicles.js';

function buildRico() {
  const group = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: 0x27313d });
  const legGeo = boxGeo(0.18, 0.8, 0.21);
  const mkLeg = (x) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.82, 0);
    const leg = new THREE.Mesh(legGeo, legMat); leg.position.set(0, -0.4, 0); leg.castShadow = true;
    pivot.add(leg); group.add(pivot); return pivot;
  };
  const legL = mkLeg(-0.11), legR = mkLeg(0.11);
  const torso = new THREE.Mesh(mergeParts([
    { geo: boxGeo(0.54, 0.64, 0.31), x: 0, y: 1.14, z: 0, color: 0xbc1f38 },      // coral jacket
    { geo: boxGeo(0.3, 0.5, 0.33), x: 0, y: 1.14, z: 0, color: 0xf4f1e8 },        // tee
    { geo: boxGeo(0.13, 0.52, 0.16), x: -0.35, y: 1.1, z: 0, color: 0xbc1f38 },    // left arm
    { geo: sphGeo(0.21, 10), x: 0, y: 1.66, z: 0, color: 0xc98d5f },              // head
    { geo: boxGeo(0.44, 0.09, 0.44), x: 0, y: 1.83, z: 0, color: 0x22384c },      // cap
    { geo: boxGeo(0.44, 0.05, 0.24), x: 0, y: 1.79, z: 0.3, color: 0x22384c },    // cap brim
  ]), vertexColorMaterial());
  torso.castShadow = true;
  group.add(torso);
  // Right arm on its own pivot so it can raise the pistol.
  const armPivot = new THREE.Group(); armPivot.position.set(0.35, 1.38, 0);
  const arm = new THREE.Mesh(mergeParts([
    { geo: boxGeo(0.13, 0.52, 0.16), x: 0, y: -0.24, z: 0, color: 0xbc1f38 },
    { geo: boxGeo(0.09, 0.3, 0.14), x: 0, y: -0.52, z: 0.06, color: 0x191c1f },   // pistol
  ]), vertexColorMaterial());
  armPivot.add(arm); group.add(armPivot);
  return { group, legL, legR, armPivot };
}

export function createPlayer(scene) {
  const fig = buildRico();
  fig.group.position.set(-132, 0.05, 186);
  scene.add(fig.group);
  const p = {
    ...fig, mode: 'foot', car: null, health: 100, heading: 2.6,
    camYaw: 2.6, camPitch: 0.16, fireCd: 0, lastHurt: -99, walkPhase: 0,
    speedNow: 0, aimT: 0, dead: false,
    get x() { return this.mode === 'car' ? this.car.group.position.x : this.group.position.x; },
    get z() { return this.mode === 'car' ? this.car.group.position.z : this.group.position.z; },
  };

  p.enterCar = (car, G) => {
    p.car = car; p.mode = 'car';
    car.driver = 'player'; car.parked = false;
    p.group.visible = false;
    p.camYaw = car.heading;
    G.hud.setVehicle(car.group.userData.name, 0);
    if (car.stolenOnce !== true) { car.stolenOnce = true; }
  };
  p.exitCar = (G) => {
    const car = p.car; if (!car) return;
    const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
    p.group.position.set(car.group.position.x + rx * 2.1, 0.05, car.group.position.z + rz * 2.1);
    resolveCollisions(p.group.position, 0.55, G.city.colliders);
    p.heading = car.heading;
    car.driver = 'parked'; car.parked = true; car.speed = 0;
    p.car = null; p.mode = 'foot';
    p.group.visible = true;
    G.hud.setVehicle(null, 0);
  };

  p.takeDamage = (n, G) => {
    if (p.dead || G.state !== 'play') return;
    p.health -= n; p.lastHurt = G.time;
    G.hud.damageFlash(Math.min(0.75, 0.25 + n * 0.03));
    if (p.health <= 0) { p.health = 0; p.dead = true; G.onWasted(); }
  };

  function rayHit(G) {
    const cam = G.camera;
    const o = cam.position.clone();
    const d = new THREE.Vector3(); cam.getWorldDirection(d);
    let best = { t: 120, kind: 'sky', point: o.clone().addScaledVector(d, 120) };
    const consider = (t, kind, obj) => {
      if (t > 0.4 && t < best.t) { best = { t, kind, obj, point: o.clone().addScaledVector(d, t) }; }
    };
    if (d.y < -0.001) consider(-o.y / d.y, 'ground');
    for (const c of G.city.colliders) {
      // slab test against the building box (x/z from the collider, height c.h)
      let tmin = 0, tmax = Infinity;
      const axes = [[o.x, d.x, c.x1, c.x2], [o.y, d.y, 0, c.h ?? 14], [o.z, d.z, c.z1, c.z2]];
      let ok = true;
      for (const [oo, dd, lo, hi] of axes) {
        if (Math.abs(dd) < 1e-8) { if (oo < lo || oo > hi) { ok = false; break; } }
        else {
          let t1 = (lo - oo) / dd, t2 = (hi - oo) / dd;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok) consider(tmin, 'building');
    }
    for (const ped of G.peds.peds) {
      const cy = ped.down ? 0.4 : 1.15;
      const cx = ped.x - o.x, cyy = cy - o.y, cz = ped.z - o.z;
      const b = cx * d.x + cyy * d.y + cz * d.z;
      const disc = b * b - (cx * cx + cyy * cyy + cz * cz - 0.72);
      if (disc > 0) consider(b - Math.sqrt(disc), 'ped', ped);
    }
    const carTest = (v, kind) => {
      const px = v.group.position.x, pz = v.group.position.z;
      const cos = Math.cos(-v.heading), sin = Math.sin(-v.heading);
      let lx = (o.x - px) * cos - (o.z - pz) * sin, lz = (o.x - px) * sin + (o.z - pz) * cos, ly = o.y - 0.8;
      let dx = d.x * cos - d.z * sin, dz = d.x * sin + d.z * cos, dy = d.y;
      let tmin = 0, tmax = Infinity;
      const axes = [[lx, dx, -0.98, 0.98], [ly, dy, -0.8, 0.85], [lz, dz, -2.25, 2.25]];
      for (const [oo, dd, lo, hi] of axes) {
        if (Math.abs(dd) < 1e-8) { if (oo < lo || oo > hi) return; }
        else {
          let t1 = (lo - oo) / dd, t2 = (hi - oo) / dd;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          if (tmin > tmax) return;
        }
      }
      consider(tmin, kind, v);
    };
    for (const v of G.traffic.cars) if (v !== p.car) carTest(v, 'car');
    for (const u of G.police.units) if (!u.disabled) carTest(u.vehicle, 'policecar');
    return best;
  }

  p.shoot = (G) => {
    const hit = rayHit(G);
    const from = new THREE.Vector3(p.x, 1.5, p.z);
    if (p.mode === 'car') from.set(p.x, 1.6, p.z);
    from.x += Math.sin(p.camYaw) * 0.5; from.z += Math.cos(p.camYaw) * 0.5;
    G.fx.tracer(from, hit.point);
    G.fx.flash(from);
    G.audio.shoot();
    G.lastGunshot = { x: p.x, z: p.z, t: G.time };
    if (G.time - (G.lastCrimeShot ?? -9) > 3) { G.lastCrimeShot = G.time; G.crime('shotsFired'); }
    if (hit.kind === 'ped' && !hit.obj.down) { G.peds.knockDown(hit.obj, 'shot'); G.crime('shootPed'); }
    else if (hit.kind === 'car') { hit.obj.health -= 34; if (hit.obj.health <= 0) hit.obj.disabled = true; G.crime('shootCar'); G.fx.spark(hit.point); }
    else if (hit.kind === 'policecar') { hit.obj.health -= 30; G.crime('shootCop'); G.fx.spark(hit.point); }
    else G.fx.spark(hit.point);
    p.camPitch = Math.min(0.62, p.camPitch + 0.006);
  };

  p.melee = (G) => {
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    for (const ped of G.peds.peds) {
      if (ped.down) continue;
      const dx = ped.x - p.x, dz = ped.z - p.z;
      if (dx * dx + dz * dz < 5.3 && dx * fx + dz * fz > 0.4) {
        G.peds.knockDown(ped, 'melee'); G.audio.punch(); G.crime('assault');
        return;
      }
    }
    G.audio.punch();
  };

  p.update = (dt, G) => {
    p.fireCd -= dt;
    if (p.health < 100 && G.time - p.lastHurt > 6) p.health = Math.min(100, p.health + 7 * dt);
    const keys = G.keys;

    if (p.mode === 'car') {
      const car = p.car;
      const ctrl = {
        throttle: (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0),
        steer: (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0),
        boost: !!keys['ShiftLeft'], handbrake: !!keys['Space'],
      };
      const others = [...G.traffic.cars, ...G.police.units.map((u) => u.vehicle)];
      const impact = stepVehicle(car, ctrl, dt, G.city.carColliders, others);
      p.speedNow = Math.abs(car.speed);
      if (impact > 7) {
        G.audio.crash(impact);
        if (impact > 11) p.takeDamage((impact - 10) * 0.7, G);
        G.onCarImpact(impact, car);
      }
      // Running someone down is a serious crime.
      if (Math.abs(car.speed) > 3.5) {
        for (const ped of G.peds.peds) {
          if (!ped.down && Math.hypot(ped.x - p.x, ped.z - p.z) < 1.9) {
            G.peds.knockDown(ped, 'runover'); G.crime('runOver'); G.audio.crash(5);
          }
        }
      }
      // Camera trails the car, mouse can still swing it.
      const targetYaw = car.heading;
      let dy = wrapAngle(targetYaw - p.camYaw);
      if (Math.abs(car.speed) > 2) p.camYaw += dy * Math.min(1, dt * 2.2);
      p.camPitch = clamp(p.camPitch, 0.02, 0.5);
      placeCamera(G, car.group.position, 9.6 + Math.abs(car.speed) * 0.09, 2.6);
      G.hud.setVehicle(car.group.userData.name, Math.abs(car.speed) * 3.6);
      if (G.mouseDown && p.fireCd <= 0) { p.fireCd = 0.14; p.shoot(G); }
      return;
    }

    // ---- on foot ----
    let mx = 0, mz = 0;
    const f = { x: Math.sin(p.camYaw), z: Math.cos(p.camYaw) };
    const r = { x: -Math.cos(p.camYaw), z: Math.sin(p.camYaw) };
    if (keys['KeyW'] || keys['ArrowUp']) { mx += f.x; mz += f.z; }
    if (keys['KeyS'] || keys['ArrowDown']) { mx -= f.x; mz -= f.z; }
    if (keys['KeyD'] || keys['ArrowRight']) { mx += r.x; mz += r.z; }
    if (keys['KeyA'] || keys['ArrowLeft']) { mx -= r.x; mz -= r.z; }
    const moving = Math.hypot(mx, mz) > 0.01;
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
    const speed = sprint ? 8.2 : 5.0;
    p.speedNow = moving ? speed : 0;
    if (moving) {
      const len = Math.hypot(mx, mz); mx /= len; mz /= len;
      const nx = p.group.position.x + mx * speed * dt;
      const nz = p.group.position.z + mz * speed * dt;
      if (walkable(nx, p.group.position.z)) p.group.position.x = nx;
      if (walkable(p.group.position.x, nz)) p.group.position.z = nz;
      resolveCollisions(p.group.position, 0.55, G.city.colliders);
      if (!G.mouseDown) p.heading = Math.atan2(mx, mz);
      p.walkPhase += dt * speed * 1.9;
    }
    if (G.mouseDown) {
      p.heading = p.camYaw;
      if (p.fireCd <= 0) { p.fireCd = 0.14; p.shoot(G); }
    }
    p.aimT = clamp(p.aimT + ((G.mouseDown ? 1 : 0) - (G.mouseDown ? 0 : 1)) * dt * 7, 0, 1);
    p.armPivot.rotation.x = -1.45 * p.aimT;
    const onPier = Math.abs(p.group.position.x + 140) < 4.2 && p.group.position.z > 207;
    p.group.position.y = (onPier ? 0.85 : 0.05) + (moving ? Math.abs(Math.sin(p.walkPhase)) * 0.05 : 0);
    p.group.rotation.y = p.heading;
    const swing = moving ? Math.sin(p.walkPhase) * 0.55 : 0;
    p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
    placeCamera(G, p.group.position, 6.4, 1.75);
  };

  function placeCamera(G, targetPos, dist, height) {
    const cp = Math.cos(p.camPitch), sp = Math.sin(p.camPitch);
    const back = { x: Math.sin(p.camYaw) * cp, y: sp, z: Math.cos(p.camYaw) * cp };
    const camPos = {
      x: targetPos.x - back.x * dist,
      y: targetPos.y + height + back.y * dist,
      z: targetPos.z - back.z * dist,
    };
    camPos.y = Math.max(0.7, camPos.y);
    const c = { x: camPos.x, z: camPos.z };
    resolveCollisions(c, 0.5, G.city.colliders);
    camPos.x = c.x; camPos.z = c.z;
    G.camera.position.set(camPos.x, camPos.y, camPos.z);
    G.camera.lookAt(targetPos.x + back.x * 6, targetPos.y + height - sp * 3.2, targetPos.z + back.z * 6);
  }

  return p;
}
