// Cars for Coral Bay Syndicate: a low-poly car factory (civilian, taxi and CBPD
// liveries, with spinnable wheels and a flashing light bar on police cars) and
// the arcade driving model every vehicle shares — acceleration, steering that
// bites harder at speed, handbrake slides, building and car-to-car impacts.
const THREE = window.THREE;
import { clamp, mergeParts, boxGeo, vertexColorMaterial } from './util.js';
import { resolveCollisions } from './city.js';

export const CAR_COLORS = [0xff5e78, 0x3ec6dd, 0xffd23e, 0x7dff9a, 0xffb347, 0xe6ccff, 0xf4f1e8, 0x59c2b8, 0xff8c42, 0x9db4ff];
export const CAR_NAMES = ['Pelican Coupe', 'Sunset Sedan', 'Marlin Hatch', 'Coral Cruiser', 'Bayline Wagon', 'Tidepool Compact', 'Flamingo GT', 'Harbour Pickup'];

export function createCarMesh(color, kind = 'car', nameIndex = 0) {
  const group = new THREE.Group();
  const police = kind === 'police';
  const bodyCol = police ? 0xf2f4f6 : color;
  const parts = [
    { geo: boxGeo(1.82, 0.52, 4.3), x: 0, y: 0.58, z: 0, color: bodyCol },
    { geo: boxGeo(1.86, 0.2, 1.1), x: 0, y: 0.42, z: 1.85, color: police ? 0x1c2733 : bodyCol },   // nose / black hood band
    { geo: boxGeo(1.6, 0.52, 2.1), x: 0, y: 1.08, z: -0.25, color: 0x22384c },                     // glasshouse
    { geo: boxGeo(1.66, 0.1, 2.2), x: 0, y: 1.36, z: -0.25, color: bodyCol },                      // roof
    { geo: boxGeo(1.7, 0.3, 0.25), x: 0, y: 0.5, z: -2.18, color: police ? 0x1c2733 : bodyCol },  // rear band
    { geo: boxGeo(0.34, 0.16, 0.06), x: -0.6, y: 0.62, z: 2.16, color: 0xfff3b0 },                 // headlights
    { geo: boxGeo(0.34, 0.16, 0.06), x: 0.6, y: 0.62, z: 2.16, color: 0xfff3b0 },
    { geo: boxGeo(0.34, 0.14, 0.06), x: -0.6, y: 0.62, z: -2.31, color: 0xff4040 },                // taillights
    { geo: boxGeo(0.34, 0.14, 0.06), x: 0.6, y: 0.62, z: -2.31, color: 0xff4040 },
  ];
  if (kind === 'taxi') parts.push({ geo: boxGeo(0.7, 0.22, 0.4), x: 0, y: 1.5, z: -0.25, color: 0xffd23e });
  // Glossy paint: a Phong body with a tight specular highlight from the sun
  // reads as polished metal and clearcoat where flat Lambert looked matte.
  const body = new THREE.Mesh(mergeParts(parts),
    new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 80, specular: 0x93a7ba }));
  body.castShadow = true;
  group.add(body);

  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x181a1c });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xb9c0c7 });
  const wheels = {};
  for (const [key, x, z] of [['fl', -0.88, 1.42], ['fr', 0.88, 1.42], ['rl', -0.88, -1.42], ['rr', 0.88, -1.42]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.35, z);
    const tyre = new THREE.Mesh(wheelGeo, wheelMat);
    tyre.rotation.z = Math.PI / 2; tyre.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 8), hubMat);
    hub.rotation.z = Math.PI / 2;
    pivot.add(tyre); pivot.add(hub);
    group.add(pivot);
    wheels[key] = pivot;
  }

  let lightBar = null;
  if (police) {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.set(-0.3, 0, 0);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    blue.position.set(0.3, 0, 0);
    bar.add(red); bar.add(blue);
    bar.position.set(0, 1.52, -0.25);
    group.add(bar);
    const glow = new THREE.PointLight(0xff4444, 0, 26);
    glow.position.set(0, 2, 0);
    group.add(glow);
    lightBar = { red, blue, glow };
  }
  group.userData.wheels = wheels;
  group.userData.lightBar = lightBar;
  group.userData.name = police ? 'CBPD Interceptor' : kind === 'taxi' ? 'Coral Cab' : CAR_NAMES[nameIndex % CAR_NAMES.length];
  return group;
}

export function makeVehicle(group, kind = 'car') {
  return {
    group, kind,
    heading: 0, speed: 0, health: 100, disabled: false,
    maxSpeed: kind === 'police' ? 39 : 33,
    radius: 1.75, wheelSpin: 0, lastImpact: 0,
    get x() { return group.position.x; }, get z() { return group.position.z; },
  };
}

// Advance one vehicle. ctrl: { throttle -1..1, steer -1..1, boost, handbrake }.
// Returns the impact speed (m/s) of the hardest collision this step, else 0.
export function stepVehicle(v, ctrl, dt, colliders, others = []) {
  const g = v.group;
  const accel = v.disabled ? 3 : 15;
  const top = v.disabled ? 5 : v.maxSpeed * (ctrl.boost ? 1.22 : 1);
  if (ctrl.throttle > 0) v.speed += accel * ctrl.throttle * dt * (1 - Math.max(0, v.speed) / (top + 6));
  else if (ctrl.throttle < 0) v.speed += (v.speed > 0.5 ? -26 : -8) * dt * -ctrl.throttle * (v.speed > 0.5 ? 1 : (1 + v.speed / 10));
  else v.speed -= v.speed * 0.55 * dt;
  if (ctrl.handbrake) v.speed -= v.speed * 2.1 * dt;
  v.speed -= v.speed * 0.12 * dt;                       // rolling drag
  v.speed = clamp(v.speed, -11, top + 8);

  const speedRatio = clamp(Math.abs(v.speed) / 12, 0, 1);
  const steerPower = (0.55 + 0.75 * speedRatio) * (ctrl.handbrake ? 1.5 : 1);
  if (Math.abs(v.speed) > 0.05) v.heading -= ctrl.steer * steerPower * dt * Math.sign(v.speed) * clamp(Math.abs(v.speed) / 9, 0.25, 1.15);

  const before = { x: g.position.x, z: g.position.z };
  g.position.x += Math.sin(v.heading) * v.speed * dt;
  g.position.z += Math.cos(v.heading) * v.speed * dt;
  g.position.x = clamp(g.position.x, -214, 214);
  g.position.z = clamp(g.position.z, -214, 232);

  let impact = 0;
  const pos = { x: g.position.x, z: g.position.z };
  resolveCollisions(pos, v.radius, colliders);
  if (Math.abs(pos.x - g.position.x) > 0.001 || Math.abs(pos.z - g.position.z) > 0.001) {
    impact = Math.abs(v.speed);
    v.speed *= -0.25;
    g.position.x = pos.x; g.position.z = pos.z;
  }
  for (const o of others) {
    if (o === v || o.dead) continue;
    const dx = g.position.x - o.group.position.x, dz = g.position.z - o.group.position.z;
    const d2 = dx * dx + dz * dz, min = v.radius + (o.radius ?? 1.75);
    if (d2 < min * min && d2 > 0.0001) {
      const d = Math.sqrt(d2), push = (min - d) / 2;
      g.position.x += (dx / d) * push; g.position.z += (dz / d) * push;
      o.group.position.x -= (dx / d) * push; o.group.position.z -= (dz / d) * push;
      const rel = Math.abs(v.speed - (o.speed ?? 0));
      if (rel > impact) impact = rel * 0.8;
      v.speed *= 0.72; if (o.speed !== undefined) o.speed *= 0.72;
    }
  }

  g.position.y = 0.06 + Math.abs(Math.sin(performance.now() * 0.02)) * 0.004 * Math.abs(v.speed);
  g.rotation.set(0, v.heading, 0);
  g.rotateX(clamp(-ctrl.throttle * 0.012 * speedRatio, -0.02, 0.02));
  g.rotateZ(clamp(ctrl.steer * speedRatio * 0.05, -0.06, 0.06));

  v.wheelSpin += (v.speed * dt) / 0.35;
  const w = g.userData.wheels;
  for (const k of ['fl', 'fr', 'rl', 'rr']) {
    w[k].rotation.y = (k === 'fl' || k === 'fr') ? -ctrl.steer * 0.42 : 0;
    w[k].children[0].rotation.x = v.wheelSpin;
    w[k].children[1].rotation.x = v.wheelSpin;
  }
  v.lastImpact = impact;
  return impact;
}

export function flashLightBar(group, t) {
  const bar = group.userData.lightBar;
  if (!bar) return;
  const phase = Math.floor(t * 5) % 2 === 0;
  bar.red.material.color.setHex(phase ? 0xff2a2a : 0x571111);
  bar.blue.material.color.setHex(phase ? 0x1144aa : 0x2a6bff);
  bar.glow.color.setHex(phase ? 0xff3333 : 0x3366ff);
  bar.glow.intensity = 1.6;
}
