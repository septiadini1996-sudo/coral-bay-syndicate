// Deterministic screenshot scenes for Coral Bay Syndicate. Opening the game
// with ?shot=<scene>&seed=1 skips the menu and stages a frozen moment of real
// gameplay — the same systems, the same city — with the camera placed by hand:
//   chase   a four-star CBPD pursuit at golden hour, mission objective live
//   drive   Rico in traffic on a downtown street
//   marina  on foot on the pier, boats and beach behind, city ahead
//   combat  a shootout stance against a CBPD Interceptor downtown
const THREE = window.THREE;
import { LANDMARKS } from './city.js';
import { createCarMesh, makeVehicle, flashLightBar } from './vehicles.js';

function stageCar(G, x, z, heading, color, kind = 'car') {
  const mesh = createCarMesh(color, kind, 3);
  mesh.position.set(x, 0.06, z);
  mesh.rotation.y = heading;
  G.scene.add(mesh);
  const v = makeVehicle(mesh, kind);
  v.heading = heading; v.driver = 'staged';
  return v;
}

export function applyShotScene(name, G) {
  const P = G.player;
  const cam = (x, y, z, tx, ty, tz) => { G.shotCam = { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(tx, ty, tz) }; };
  const beaconAt = (x, z, color = 0xffd23e) => {
    const b = G.missions.beacon;
    b.visible = true; b.position.x = x; b.position.z = z; b.material.color.setHex(color);
  };
  const asUnit = (vehicle) => G.police.units.push({ vehicle, shootCd: 1, disabledT: 0 });
  const mapObjective = (x, z) => { G.missions.objective = { x, z }; };
  G.police.heat = 0;

  if (name === 'drive') {
    const car = stageCar(G, -52.6, 34, Math.PI, 0xe63950);
    P.enterCar(car, G);
    G.hud.setVehicle(car.group.userData.name, 64);
    stageCar(G, -52.6, 14, Math.PI, 0x3ec6dd);
    stageCar(G, -59.4, 58, 0, 0xffd23e, 'taxi');
    stageCar(G, -59.4, -6, 0, 0xf4f1e8);
    G.hud.setObjective('FREE ROAM', 'Downtown Coral Bay — the city is open', null);
    cam(-50.5, 3.6, 17.5, -52.8, 1.1, 33);
    return;
  }

  if (name === 'marina') {
    P.group.position.set(-140, 0.85, 238);
    P.heading = 0.35; P.group.rotation.y = 0.35;
    P.camYaw = 0.35;
    beaconAt(LANDMARKS.garage.x, LANDMARKS.garage.z);
    mapObjective(LANDMARKS.garage.x, LANDMARKS.garage.z);
    G.hud.setObjective('FIRST RUN', 'Pick up the package at the Docks Garage', 62);
    cam(-134.5, 2.4, 256, -140.5, 1.2, 232);
    return;
  }

  if (name === 'combat') {
    P.group.position.set(6, 0.05, 10);
    P.heading = 2.36; P.group.rotation.y = 2.36;
    P.camYaw = 2.36; P.aimT = 1; P.armPivot.rotation.x = -1.45;
    asUnit(stageCar(G, 14.5, 1.5, -2.25, 0xffffff, 'police'));
    asUnit(stageCar(G, -7, -15, 0.6, 0xffffff, 'police'));
    G.police.heat = 3;
    mapObjective(90, -49.5);
    G.hud.setObjective('HOT METAL', 'Steal the pink Flamingo GT in Coral Heights', 118);
    cam(-2.5, 2.6, 17.5, 10, 1.2, 3.5);
    return;
  }

  // Default: 'chase' — the cover. Eastbound on the Marina Mile with the CBPD
  // on Rico's tail, four stars, and the Palms Hotel delivery live on the HUD.
  const car = stageCar(G, 4, 171.4, Math.PI / 2, 0xe63950);
  car.speed = 21;
  P.enterCar(car, G);
  G.hud.setVehicle(car.group.userData.name, 82);
  const cops = [];
  cops.push(stageCar(G, -8, 170.2, Math.PI / 2, 0xffffff, 'police'));
  cops.push(stageCar(G, -14, 174.8, Math.PI / 2, 0xffffff, 'police'));
  cops.push(stageCar(G, -12.5, 165.6, Math.PI / 2 + 0.14, 0xffffff, 'police'));
  for (const c of cops) { c.speed = 22; asUnit(c); }
  G.police.heat = 4;
  beaconAt(LANDMARKS.hotel.x, LANDMARKS.hotel.z);
  mapObjective(LANDMARKS.hotel.x, LANDMARKS.hotel.z);
  G.hud.setObjective('FIRST RUN', 'Deliver the package to the Palms Hotel', 26);
  cam(-26, 2.6, 173.8, 7, 1.3, 169.6);
}
