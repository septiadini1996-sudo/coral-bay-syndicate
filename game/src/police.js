// The Coral Bay PD: a five-star wanted system and the Interceptors that answer
// it. Heat rises with every crime the player commits in the open and cools when
// no officer has eyes on them; units spawn on the street grid, hunt the player
// down, ram, shoot, and close in for the bust when the player is cornered.
const THREE = window.THREE;
import { clamp, wrapAngle, randRange } from './util.js';
import { STREET_LINES, resolveCollisions } from './city.js';
import { createCarMesh, makeVehicle, stepVehicle, flashLightBar } from './vehicles.js';

const UNITS_BY_STARS = [0, 1, 2, 3, 4, 6];

// Scratch objects reused every frame: the pursuit loop must not allocate.
// stepVehicle skips the vehicle being stepped, so one shared "everyone" list
// can be handed to every unit instead of a fresh filtered copy per unit.
const scratchOthers = [];
const shotFrom = new THREE.Vector3();
const shotTo = new THREE.Vector3();

export function createPolice(scene, city, rand) {
  const police = {
    units: [], heat: 0, bustMeter: 0, lastSeen: -99, spawnCd: 0, nearestDist: 999,
    get stars() { return clamp(Math.ceil(this.heat - 1e-4), 0, 5); },
  };

  police.addHeat = (n) => { police.heat = clamp(police.heat + n, 0, 5); };

  function spawnUnit(G) {
    const a = rand() * Math.PI * 2;
    const dist = randRange(rand, 92, 125);
    let x = clamp(G.player.x + Math.cos(a) * dist, -205, 205);
    let z = clamp(G.player.z + Math.sin(a) * dist, -205, 205);
    // Snap to the nearest street so units arrive on the road.
    const snap = (v) => STREET_LINES.reduce((best, l) => (Math.abs(l - v) < Math.abs(best - v) ? l : best), STREET_LINES[0]);
    if (rand() < 0.5) x = snap(x); else z = snap(z);
    const pos = { x, z }; resolveCollisions(pos, 2, city.colliders);
    const mesh = createCarMesh(0xffffff, 'police');
    mesh.position.set(pos.x, 0.06, pos.z);
    scene.add(mesh);
    const vehicle = makeVehicle(mesh, 'police');
    vehicle.driver = 'police';
    vehicle.heading = Math.atan2(G.player.x - pos.x, G.player.z - pos.z);
    police.units.push({ vehicle, shootCd: randRange(rand, 0.4, 1.2), disabledT: 0 });
  }

  function removeUnit(u) {
    scene.remove(u.vehicle.group);
    police.units.splice(police.units.indexOf(u), 1);
  }

  police.reset = () => {
    while (police.units.length) removeUnit(police.units[0]);
    police.heat = 0; police.bustMeter = 0; police.nearestDist = 999;
  };

  police.update = (dt, G) => {
    const stars = police.stars;
    const px = G.player.x, pz = G.player.z;
    let seen = false;
    police.nearestDist = 999;
    for (const u of police.units) {
      const d = Math.hypot(u.vehicle.x - px, u.vehicle.z - pz);
      police.nearestDist = Math.min(police.nearestDist, d);
      if (d < 58) seen = true;
    }
    if (seen) police.lastSeen = G.time;
    if (G.time - police.lastSeen > 7 && stars > 0) police.addHeat(-dt * (police.heat > 2 ? 0.035 : 0.1));

    const desired = UNITS_BY_STARS[stars];
    police.spawnCd -= dt;
    if (police.units.filter((u) => !u.vehicle.disabled).length < desired && police.spawnCd <= 0 && !G.shotMode) {
      spawnUnit(G); police.spawnCd = 1.4;
    }

    // Build the shared collision list once per frame (traffic + every unit +
    // the player's car); each unit's own vehicle is skipped inside stepVehicle.
    scratchOthers.length = 0;
    for (const c of G.traffic.cars) scratchOthers.push(c);
    for (const u of police.units) scratchOthers.push(u.vehicle);
    if (G.player.car) scratchOthers.push(G.player.car);

    let bustPressure = false;
    for (let i = police.units.length - 1; i >= 0; i--) {
      const u = police.units[i], v = u.vehicle;
      flashLightBar(v.group, G.time + i);
      const dx = px - v.x, dz = pz - v.z;
      const dist = Math.hypot(dx, dz);
      if (v.disabled) {
        u.disabledT += dt;
        v.speed = 0;
        if (u.disabledT > 20 || dist > 280) removeUnit(u);
        continue;
      }
      if (dist > 300 && police.units.length > desired) { removeUnit(u); continue; }
      if (G.shotMode) continue;

      // Pursuit steering: aim at the player, leading a moving car a little.
      const lead = G.player.mode === 'car' ? clamp(Math.abs(G.player.car.speed) * 0.35, 0, 9) : 0;
      const tx = px + Math.sin(G.player.mode === 'car' ? G.player.car.heading : G.player.heading) * lead;
      const tz = pz + Math.cos(G.player.mode === 'car' ? G.player.car.heading : G.player.heading) * lead;
      const desiredHeading = Math.atan2(tx - v.x, tz - v.z);
      const diff = wrapAngle(desiredHeading - v.heading);
      const onFootCreep = G.player.mode === 'foot' && dist < 9;
      const ctrl = {
        throttle: Math.abs(diff) > 2.3 && dist < 11 ? -1 : onFootCreep ? 0.32 : 1,
        steer: clamp(diff * 1.9, -1, 1),
        boost: dist > 110, handbrake: false,
      };
      const impact = stepVehicle(v, ctrl, dt, city.carColliders, scratchOthers);
      if (impact > 6 && dist < 6) { G.audio.crash(impact * 0.8); if (G.player.mode === 'foot') G.player.takeDamage(impact * 0.5, G); }

      // Officers open fire at two stars and up.
      if (stars >= 2 && dist < 30 && dist > 3.5) {
        u.shootCd -= dt;
        if (u.shootCd <= 0) {
          u.shootCd = randRange(rand, 0.8, 1.4);
          shotFrom.set(v.x, 1.35, v.z);
          shotTo.set(px + randRange(rand, -0.7, 0.7), 1.1, pz + randRange(rand, -0.7, 0.7));
          G.fx.tracer(shotFrom, shotTo, 0xffb3a0); G.fx.flash(shotFrom);
          G.audio.shoot(0.35);
          if (rand() < 0.55 - dist * 0.007) {
            if (G.player.mode === 'car') { G.player.car.health -= 4; G.player.takeDamage(2.2, G); }
            else G.player.takeDamage(6, G);
          }
        }
      }

      // Bust pressure: close and slow means cornered.
      if (G.player.mode === 'foot' && dist < 6.5 && G.player.speedNow < 2) bustPressure = true;
      if (G.player.mode === 'car' && dist < 8 && Math.abs(G.player.car.speed) < 1.2) bustPressure = true;
    }
    if (bustPressure && stars > 0) {
      police.bustMeter += dt;
      if (police.bustMeter > (G.player.mode === 'foot' ? 2.2 : 3)) { police.bustMeter = 0; G.onBusted(); }
    } else police.bustMeter = Math.max(0, police.bustMeter - dt * 1.6);
  };

  return police;
}
