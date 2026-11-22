// main.js — Coral Bay Syndicate's engine room: boot and the renderer, input
// and pointer-lock mouse look, the player on foot and behind the wheel,
// third-person and over-the-shoulder cameras, gunplay, the crime-and-punish
// hooks the police call back through, saving, respawns, the GPS route, the
// main loop (pause truly freezes game time) and the deterministic staged
// scenes the screenshots are taken from.
(function () {
  'use strict';

  const CBS = (window.CBS = window.CBS || {});
  const U = CBS.util;
  const THREE = window.THREE;
  const V = CBS.vehicles;

  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

  const params = new URLSearchParams(location.search);
  const SHOT = params.get('shot') ? parseInt(params.get('shot'), 10) : 0;

  // --- renderer / scene ------------------------------------------------------
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 2600);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- world -------------------------------------------------------------------
  const city = CBS.city.build(scene);
  V.effects.init(scene);
  V.createTraffic(scene, city, 18);
  CBS.people.createCrowd(scene, city, 22);
  CBS.police.init(scene, city);
  CBS.story.init(scene, city);
  CBS.hud.init(city);

  // --- player --------------------------------------------------------------------
  const CAR_NAMES = { coupe: 'Vireo Coupe', sedan: 'Meridian Sedan', hatch: 'Pico Hatch', van: 'Hauler Van', cruiser: 'CBPD Interceptor' };
  const WEAPONS = [
    { id: 'fists', name: 'Fists', damage: 0, range: 2.4, rate: 0.34, auto: false },
    { id: 'pistol', name: 'Pistol', damage: 17, range: 95, rate: 0.27, auto: false, mag: 12 },
    { id: 'smg', name: 'Micro SMG', damage: 9, range: 75, rate: 0.095, auto: true, mag: 30 },
  ];
  const player = {
    fig: CBS.people.makePerson(0x1f6f6b, 0x2b2b30, 0xc68863),
    x: 250, z: 113, heading: 2.35, speedAbs: 0, vx: 0, vz: 0,
    health: 100, armour: 50, inCar: false, car: null,
    weapon: WEAPONS[0], lastShotT: -9, lastHurtT: -9, reloading: 0,
    ammo: { pistol: { mag: 12, reserve: 72 }, smg: { mag: 30, reserve: 150 } },
  };
  player.fig.position.set(player.x, 0, player.z);
  scene.add(player.fig);
  let camYaw = 2.35;
  let camPitch = 0.16;
  let gameTime = 0;
  let clockMin = 17 * 60 + 4;
  let state = SHOT ? 'playing' : 'menu';
  let threat = null; // {x, z, until} — what the crowd is running from
  let endKind = null;

  // --- crime & punishment hooks ---------------------------------------------------
  CBS.hooks = {
    hurtPlayer(dmg) {
      if (SHOT || state !== 'playing') return;
      const absorbed = Math.min(player.armour, dmg * 0.65);
      player.armour -= absorbed;
      player.health -= dmg - absorbed;
      player.lastHurtT = gameTime;
      if (player.health <= 0) wasted();
    },
    onBusted() {
      if (SHOT || state !== 'playing') return;
      const fine = Math.min(CBS.story.state.money, 120 + CBS.police.stars() * 50);
      CBS.story.state.money -= fine;
      CBS.police.clearHeat();
      endKind = 'busted';
      state = 'ended';
      document.exitPointerLock && document.exitPointerLock();
      CBS.hud.showEnd('busted', 'The Coral Bay PD empties your pockets of ' + U.fmtMoney(fine) + ' and your evening of everything else. You walk out of the station into the last of the light.');
    },
    onSpike() {
      CBS.hud.subtitle('Spikes! The tyres are shredded — this car is done. Find another one.');
    },
    onJobComplete() {
      player.armour = Math.min(100, player.armour + 25);
    },
  };

  function wasted() {
    if (state === 'ended') return;
    const fee = Math.min(CBS.story.state.money, 150);
    CBS.story.state.money -= fee;
    CBS.police.clearHeat();
    endKind = 'wasted';
    state = 'ended';
    document.exitPointerLock && document.exitPointerLock();
    CBS.hud.showEnd('wasted', 'The clinic at Palmetto Row patches you up and bills you ' + U.fmtMoney(fee) + '. The bay, and Vera, are still out there.');
  }

  function respawn() {
    CBS.hud.hideEnd();
    if (player.inCar) exitCar(true);
    if (endKind === 'busted') {
      player.x = -180; player.z = -112;
    } else {
      player.x = -120; player.z = -178;
    }
    player.health = 100;
    player.armour = 25;
    player.heading = Math.PI;
    camYaw = Math.PI;
    state = 'playing';
    canvas.requestPointerLock && canvas.requestPointerLock();
  }

  // --- input -----------------------------------------------------------------------
  const keys = {};
  let mouseDown = false;
  let aimDown = false;
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (state === 'playing') {
      if (e.code === 'KeyE') interact();
      if (e.code === 'KeyR') {
        if (player.inCar) {
          const idx = CBS.audio.cycleStation();
          if (idx >= 0) CBS.hud.subtitle('Radio: ' + CBS.audio.STATIONS[idx].name);
        } else reload();
      }
      if (e.code === 'Digit1') player.weapon = WEAPONS[0];
      if (e.code === 'Digit2') player.weapon = WEAPONS[1];
      if (e.code === 'Digit3') player.weapon = WEAPONS[2];
      if (e.code === 'KeyM') CBS.hud.subtitle(CBS.audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    if (e.code === 'KeyP') {
      if (state === 'playing') pauseGame();
      else if (state === 'paused') resumeGame();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  canvas.addEventListener('mousedown', (e) => {
    if (state !== 'playing') return;
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) aimDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
    if (e.button === 2) aimDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas || state !== 'playing') return;
    camYaw -= e.movementX * 0.0026;
    camPitch = U.clamp(camPitch - e.movementY * 0.0022, -0.35, 1.1);
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && state === 'playing' && !SHOT) pauseGame();
  });
  document.getElementById('start-btn').addEventListener('click', () => {
    CBS.audio.ensure();
    CBS.hud.hideStart();
    state = 'playing';
    canvas.requestPointerLock && canvas.requestPointerLock();
    CBS.hud.subtitle('Vera: There you are. Come and talk to me — gold light, gold money.');
  });
  document.getElementById('resume-btn').addEventListener('click', resumeGame);
  document.getElementById('respawn-btn').addEventListener('click', respawn);

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    CBS.hud.showPause(true);
    document.exitPointerLock && document.exitPointerLock();
  }
  function resumeGame() {
    if (state !== 'paused') return;
    CBS.hud.showPause(false);
    state = 'playing';
    canvas.requestPointerLock && canvas.requestPointerLock();
  }

  // --- cars: getting in and out -------------------------------------------------------
  function enterableNear() {
    let best = null;
    let bd = 4.1;
    for (const car of V.all) {
      if (car.dead) continue;
      if (!(car.driver === 'parked' || (car.driver === 'traffic' && Math.abs(car.speed) < 3))) continue;
      const d = U.dist2D(player.x, player.z, car.x, car.z);
      if (d < bd) {
        bd = d;
        best = car;
      }
    }
    return best;
  }

  function interact() {
    CBS.audio.ensure();
    if (player.inCar) {
      exitCar(false);
      return;
    }
    const vera = CBS.people.vera;
    if (vera && U.dist2D(player.x, player.z, vera.x, vera.z) < 3.6) {
      CBS.story.talkToVera(player);
      return;
    }
    const car = enterableNear();
    if (car) enterCar(car);
  }

  function enterCar(car) {
    const wasTraffic = car.driver === 'traffic';
    car.driver = 'player';
    car.parked = false;
    player.inCar = true;
    player.car = car;
    player.fig.visible = false;
    CBS.story.onPlayerEnterCar(car, player);
    if (wasTraffic) {
      CBS.police.addHeat(0.8);
      threat = { x: car.x, z: car.z, until: gameTime + 2 };
      CBS.hud.subtitle('Driver: Hey! That is my— okay. Okay. It is yours now.');
    } else {
      CBS.police.addHeat(0.35);
    }
    if (CBS.audio) CBS.audio.blip(520);
  }

  function exitCar(silent) {
    const car = player.car;
    if (!car) return;
    const rx = -Math.cos(car.heading);
    const rz = Math.sin(car.heading);
    player.x = car.x + rx * 2.4;
    player.z = car.z + rz * 2.4;
    player.heading = car.heading;
    car.driver = 'parked';
    car.parked = true;
    car.speed = 0;
    V.syncMesh(car);
    player.inCar = false;
    player.car = null;
    player.fig.visible = true;
    if (!silent && CBS.audio) CBS.audio.blip(440);
  }

  // --- gunplay ---------------------------------------------------------------------------
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe2ae, transparent: true, opacity: 0.95 });
  const tracers = [];
  function tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, tracerMat);
    scene.add(line);
    tracers.push({ line, life: 0.07 });
  }

  function reload() {
    const w = player.weapon;
    if (!w.mag) return;
    const a = player.ammo[w.id];
    if (a.mag >= w.mag || a.reserve <= 0 || player.reloading > 0) return;
    player.reloading = 1.1;
    CBS.hud.subtitle('Reloading…');
  }

  function rayHit(origin, dir, maxDist) {
    // Cars and pedestrians as spheres, buildings as ground-plane slabs.
    let best = maxDist;
    let hit = null;
    for (const car of V.all) {
      if (car.dead) continue;
      const cx = car.x - origin.x;
      const cy = 0.85 - origin.y;
      const cz = car.z - origin.z;
      const along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along < 0 || along > best) continue;
      const px = origin.x + dir.x * along - car.x;
      const py = origin.y + dir.y * along - 0.85;
      const pz = origin.z + dir.z * along - car.z;
      if (px * px + py * py + pz * pz < 2.7 * 2.7) {
        best = along;
        hit = { kind: 'car', car, dist: along };
      }
    }
    for (const ped of CBS.people.peds) {
      if (ped.state === 'down') continue;
      const cx = ped.x - origin.x;
      const cy = 1.05 - origin.y;
      const cz = ped.z - origin.z;
      const along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along < 0 || along > best) continue;
      const px = origin.x + dir.x * along - ped.x;
      const py = origin.y + dir.y * along - 1.05;
      const pz = origin.z + dir.z * along - ped.z;
      if (px * px + py * py + pz * pz < 0.95 * 0.95) {
        best = along;
        hit = { kind: 'ped', ped, dist: along };
      }
    }
    return hit;
  }

  function shoot() {
    const w = player.weapon;
    if (gameTime - player.lastShotT < w.rate) return;
    if (player.reloading > 0) return;
    player.lastShotT = gameTime;
    if (w.id === 'fists') {
      // A swing at whoever is unwise enough to be in front.
      for (const ped of CBS.people.peds) {
        const d = U.dist2D(player.x, player.z, ped.x, ped.z);
        if (d < w.range && ped.state !== 'down') {
          CBS.people.knockDown(ped);
          CBS.police.addHeat(0.5);
          threat = { x: ped.x, z: ped.z, until: gameTime + 2 };
          break;
        }
      }
      return;
    }
    const a = player.ammo[w.id];
    if (a.mag <= 0) {
      reload();
      return;
    }
    a.mag--;
    CBS.audio.shot(true);
    CBS.police.addHeat(0.32);
    threat = { x: player.x, z: player.z, until: gameTime + 2.5 };
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.x += (Math.random() - 0.5) * 0.012;
    dir.y += (Math.random() - 0.5) * 0.012;
    dir.normalize();
    const hit = rayHit(origin, dir, w.range);
    const end = hit
      ? origin.clone().add(dir.clone().multiplyScalar(hit.dist))
      : origin.clone().add(dir.clone().multiplyScalar(w.range));
    const muzzle = new THREE.Vector3(player.x + Math.sin(player.heading) * 0.5, 1.35, player.z + Math.cos(player.heading) * 0.5);
    tracer(muzzle, end);
    if (hit && hit.kind === 'car') {
      V.damage(hit.car, w.damage * 0.55, end.x, end.z);
      if (hit.car.driver === 'police' || hit.car.driver === 'block') CBS.police.addHeat(0.5);
    } else if (hit && hit.kind === 'ped') {
      CBS.people.knockDown(hit.ped);
      CBS.police.addHeat(0.8);
    } else {
      V.effects.spawnSparks(end.x, Math.max(0.3, end.y), end.z, 3);
    }
  }

  // --- per-frame update ---------------------------------------------------------------------
  let routePts = [];
  let routeTimer = 0;
  let prevCarHealth = 100;

  function stepGame(dt) {
    gameTime += dt;
    clockMin += dt * 0.5;
    if (player.reloading > 0) {
      player.reloading -= dt;
      if (player.reloading <= 0) {
        const w = player.weapon;
        const a = player.ammo[w.id];
        const take = Math.min(w.mag - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
    // Slow recovery once the shooting stops.
    if (gameTime - player.lastHurtT > 7 && player.health > 0) {
      player.health = Math.min(100, player.health + dt * 2.2);
    }

    if (player.inCar && player.car) {
      const car = player.car;
      const input = {
        throttle: keys.KeyW || keys.ArrowUp ? 1 : 0,
        brake: keys.KeyS || keys.ArrowDown ? 1 : 0,
        steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0),
      };
      if (keys.Space) {
        car.speed -= car.speed * 2.6 * dt;
        input.steer *= 1.5;
      }
      prevCarHealth = car.health;
      V.drivePlayerCar(car, SHOT ? { throttle: 0, brake: 0, steer: 0 } : input, dt);
      V.collideWorld(car, city);
      if (car._pin !== undefined) {
        // Staged scenes hold their speed exactly, whatever traffic does.
        car.speed = car._pin;
        player.speedAbs = Math.abs(car.speed);
      }
      if (prevCarHealth - car.health > 11) CBS.hooks.hurtPlayer((prevCarHealth - car.health) * 0.22);
      player.x = car.x;
      player.z = car.z;
      player.heading = car.heading;
      player.speedAbs = Math.abs(car.speed);
      player.vx = Math.sin(car.heading) * car.speed;
      player.vz = Math.cos(car.heading) * car.speed;
      CBS.audio.setEngine(true, Math.abs(car.speed) / 36, Math.abs(input.throttle));
    } else {
      updateOnFoot(dt);
      CBS.audio.setEngine(false, 0, 0);
    }

    CBS.story.update(dt, player);
    V.updateTraffic(city, dt, gameTime);
    CBS.police.update(dt, gameTime, player);
    CBS.people.update(city, dt, threat && gameTime < threat.until ? threat : null);
    V.effects.tick(dt);
    CBS.city.tick(city, scene, gameTime);
    city.focus = { x: player.x, z: player.z };
    CBS.audio.tick(dt, player.inCar);
    CBS.audio.applyLevels(dt);

    // GPS route to the current objective.
    routeTimer -= dt;
    const panel = CBS.story.panelData(player);
    if (routeTimer <= 0) {
      routeTimer = 0.7;
      if (panel.target) {
        const from = CBS.city.nearestNode(city.graph, player.x, player.z);
        const to = CBS.city.nearestNode(city.graph, panel.target.x, panel.target.z);
        const path = U.shortestPath(city.graph, from, to);
        routePts = path ? path.map((i) => city.graph.nodes[i]) : [];
        if (panel.target) routePts.push({ x: panel.target.x, z: panel.target.z });
      } else routePts = [];
    }

    updateCamera(dt);
    CBS.hud.update(hudSnapshot(panel));
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].line);
        tracers.splice(i, 1);
      }
    }
  }

  function updateOnFoot(dt) {
    const fwd = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
    const right = { x: -Math.cos(camYaw), z: Math.sin(camYaw) };
    let mx = 0;
    let mz = 0;
    if (keys.KeyW || keys.ArrowUp) { mx += fwd.x; mz += fwd.z; }
    if (keys.KeyS || keys.ArrowDown) { mx -= fwd.x; mz -= fwd.z; }
    if (keys.KeyD || keys.ArrowRight) { mx += right.x; mz += right.z; }
    if (keys.KeyA || keys.ArrowLeft) { mx -= right.x; mz -= right.z; }
    const len = Math.hypot(mx, mz);
    const sprint = keys.ShiftLeft || keys.ShiftRight;
    const speed = sprint ? 7.6 : 4.6;
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      player.x += mx * speed * dt;
      player.z += mz * speed * dt;
      player.speedAbs = speed;
      if (!aimDown) player.heading = U.angleLerp(player.heading, Math.atan2(mx, mz), dt * 12);
      player.walkPhase = (player.walkPhase || 0) + dt * speed * 2.6;
    } else {
      player.speedAbs = 0;
    }
    if (aimDown) player.heading = camYaw;
    player.vx = mx * player.speedAbs;
    player.vz = mz * player.speedAbs;
    // Building and car collisions, then the shoreline.
    for (const b of city.colliders) {
      const nx = U.clamp(player.x, b.minX, b.maxX);
      const nz = U.clamp(player.z, b.minZ, b.maxZ);
      const dx = player.x - nx;
      const dz = player.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.55 * 0.55 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        player.x += (dx / d) * (0.55 - d);
        player.z += (dz / d) * (0.55 - d);
      } else if (d2 <= 0.0001) {
        player.x = b.maxX + 0.56;
      }
    }
    for (const car of V.all) {
      if (car.dead) continue;
      const d = U.dist2D(player.x, player.z, car.x, car.z);
      if (d < 2.3 && d > 0.01) {
        player.x += ((player.x - car.x) / d) * (2.3 - d);
        player.z += ((player.z - car.z) / d) * (2.3 - d);
      }
      // Moving traffic that finds the player is a crime scene, not a bug.
      if (car.driver === 'traffic' && Math.abs(car.speed) > 5 && d < 2.1) {
        CBS.hooks.hurtPlayer(9);
        car.speed *= 0.4;
        threat = { x: player.x, z: player.z, until: gameTime + 2 };
      }
    }
    const onPier = player.z > 106 && player.z < 136;
    const onMarina = player.z > 90 && player.z < 174;
    const maxX = onPier ? 354 : onMarina ? 303 : 300;
    player.x = U.clamp(player.x, -262, maxX);
    player.z = U.clamp(player.z, -202, 202);
    player.fig.position.set(player.x, 0, player.z);
    player.fig.rotation.y = player.heading;
    CBS.people.animateFigure(player.fig, player.walkPhase || 0, player.speedAbs > 0.2 ? 0.6 : 0);
    if (mouseDown && !SHOT) shoot();
  }

  // --- camera ---------------------------------------------------------------------------------
  let shotCam = null;
  const camPos = new THREE.Vector3(240, 4, 130);
  function updateCamera(dt) {
    if (shotCam) {
      camera.position.set(shotCam.x, shotCam.y, shotCam.z);
      camera.lookAt(shotCam.lx, shotCam.ly, shotCam.lz);
      return;
    }
    if (player.inCar && player.car) {
      const car = player.car;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const want = new THREE.Vector3(car.x - fx * 9.6, 3.4, car.z - fz * 9.6);
      camPos.lerp(want, SHOT ? 1 : 1 - Math.exp(-dt * 5.5));
      camera.position.copy(camPos);
      camera.lookAt(car.x + fx * 7, 1.3, car.z + fz * 7);
      camYaw = car.heading;
    } else {
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      const dist = aimDown ? 2.8 : 5.4;
      const rx = -Math.cos(camYaw);
      const rz = Math.sin(camYaw);
      const side = aimDown ? 0.85 : 0;
      const want = new THREE.Vector3(
        player.x - fx * dist + rx * side,
        1.95 + camPitch * 2.4,
        player.z - fz * dist + rz * side
      );
      if (want.y < 0.55) want.y = 0.55;
      camPos.lerp(want, SHOT ? 1 : 1 - Math.exp(-dt * 14));
      camera.position.copy(camPos);
      camera.lookAt(player.x + fx * 6, 1.45 + camPitch * 1.2, player.z + fz * 6);
    }
  }

  function hudSnapshot(panel) {
    const car = player.car;
    let prompt = '';
    if (SHOT) {
      // Staged scenes show the prompt their composition calls for.
      prompt = SHOT === 2 ? 'E — talk to Vera Lark' : '';
    } else if (state === 'playing') {
      if (player.inCar) prompt = 'E — exit the ' + (CAR_NAMES[car.kind] || 'car');
      else {
        const vera = CBS.people.vera;
        if (vera && U.dist2D(player.x, player.z, vera.x, vera.z) < 3.6) prompt = 'E — talk to Vera Lark';
        else {
          const near = enterableNear();
          if (near) prompt = near.isMissionVan ? 'E — steal the Glass Eels van' : 'E — enter the ' + (CAR_NAMES[near.kind] || 'car');
        }
      }
    }
    const blips = [];
    for (const u of CBS.police.units) blips.push({ x: u.car.x, z: u.car.z, kind: 'unit' });
    if (CBS.police.block) for (const c of CBS.police.block.cars) blips.push({ x: c.x, z: c.z, kind: 'unit' });
    const ammoHud = {};
    for (const w of WEAPONS) {
      if (w.mag) ammoHud[w.id] = player.ammo[w.id].mag + ' / ' + player.ammo[w.id].reserve;
    }
    return {
      money: CBS.story.state.money, clockMin, stars: CBS.police.stars(),
      bust: CBS.police.bust, health: player.health, armour: player.armour,
      inCar: player.inCar,
      carName: car ? CAR_NAMES[car.kind] : '',
      speedKmh: car ? Math.abs(car.speed) * 3.6 : 0,
      carHealth: car ? car.health : 100,
      tyres: car ? car.tyres : false,
      weapon: player.weapon, ammo: ammoHud,
      stationName: CBS.audio.stationIndex >= 0 ? CBS.audio.stationName : (SHOT ? 'Baywave 101.7' : 'Off'),
      mission: panel, policeUnits: CBS.police.panelUnits(player),
      prompt, route: routePts, target: panel.target,
      player: { x: player.x, z: player.z, heading: player.heading },
      blips,
    };
  }

  // --- staged screenshot scenes ------------------------------------------------------------------
  function stageShot(n) {
    CBS.hud.hideStart();
    state = 'playing';
    const S = CBS.story.state;
    if (n === 1) {
      // The cover: a red coupe at speed on Coast Avenue, the law behind it.
      S.money = 1840;
      S.jobIndex = 1;
      S.active = { job: CBS.story.JOBS[1], step: 0, stepT: 0, markedCar: null };
      clockMin = 17 * 60 + 21.4;
      const coupe = V.spawnCar(scene, 'coupe', 0xc23b2e, 242.6, 46, Math.PI, 'player');
      coupe.speed = 16.4;
      coupe._pin = 16.4;
      player.inCar = true;
      player.car = coupe;
      player.fig.visible = false;
      player.x = coupe.x;
      player.z = coupe.z;
      player.heading = Math.PI;
      CBS.police.setHeat(4.2);
    } else if (n === 2) {
      clockMin = 17 * 60 + 13;
      // South-west of Vera, close, aiming a step wide of her so she stands
      // clear of the player's back: the moored boats and the pier stretch
      // out behind her, the coast road runs along the left of the frame.
      player.x = 252; player.z = 117; player.heading = 2.395; camYaw = 2.395;
      player.fig.position.set(player.x, 0, player.z);
    } else if (n === 3) {
      S.money = 1650;
      S.jobIndex = 2;
      S.active = { job: CBS.story.JOBS[2], step: 0, stepT: 0, markedCar: null };
      clockMin = 17 * 60 + 31;
      // Beside the player's shoulder, not behind their back: Vera stands
      // right of frame centre, close enough to read the violet suit.
      player.x = 255.8; player.z = 101.5; player.heading = 0.42; camYaw = 0.42;
      player.fig.position.set(player.x, 0, player.z);
      CBS.hud.subtitle('Vera: Listen close. The Glass Eels move their product through my marina at dusk, in a grey van with no plates.');
    } else if (n === 4) {
      S.money = 1840;
      S.jobIndex = 1;
      S.active = { job: CBS.story.JOBS[1], step: 0, stepT: 0, markedCar: null };
      clockMin = 17 * 60 + 26;
      // Stand the player (on foot, for now) on Coast Avenue facing north:
      // the roadblock logic plants its cruisers three junctions ahead.
      player.x = 240;
      player.z = 60;
      player.heading = Math.PI;
      player.fig.position.set(player.x, 0, player.z);
      CBS.police.setHeat(4.2);
      CBS.police.placeRoadblock(player);
    }
    // Let the world settle into the staged moment, deterministically.
    for (let i = 0; i < 55; i++) stepGame(1 / 30);
    if (n === 1) {
      // Compose the pursuit on a clean stretch of Coast Avenue: the coupe
      // reset to a fixed mark, two cruisers tucked in behind it, the
      // helicopter overhead, and the camera on the city side looking
      // north-east so the road, the beach and the bay all share the frame.
      const coupe = player.car;
      coupe.x = 242.6;
      coupe.z = 10;
      coupe.heading = Math.PI;
      coupe.speed = 16.4;
      player.x = coupe.x;
      player.z = coupe.z;
      player.heading = Math.PI;
      V.syncMesh(coupe);
      const us = CBS.police.units;
      if (us[0]) {
        us[0].car.x = 241.0; us[0].car.z = 21.5; us[0].car.heading = Math.PI; us[0].car.speed = 16.8;
        V.syncMesh(us[0].car);
      }
      if (us[1]) {
        us[1].car.x = 245.0; us[1].car.z = 28.0; us[1].car.heading = Math.PI; us[1].car.speed = 16.8;
        V.syncMesh(us[1].car);
      }
      if (CBS.police.forceHeli) CBS.police.forceHeli(player);
      shotCam = { x: 234.6, y: 4.3, z: 36.5, lx: 243.8, ly: 1.1, lz: 0 };
      stepGame(1 / 30);
      // The helicopter hangs in the top of the frame, over the water.
      if (CBS.police.placeHeli) CBS.police.placeHeli(coupe.x + 17, coupe.z - 15);
      CBS.hud.update(hudSnapshot(CBS.story.panelData(player)));
    }
    if (n === 4) {
      // If the settle cleared the block (player too far away), plant it again.
      if (!CBS.police.block) {
        player.x = 240;
        player.z = 60;
        player.heading = Math.PI;
        CBS.police.placeRoadblock(player);
      }
      const b = CBS.police.block;
      if (b) {
        const sedan = V.spawnCar(scene, 'sedan', 0x2e62c2, b.x, b.z + 19.5, Math.PI, 'player');
        sedan.speed = 14;
        sedan._pin = 14;
        player.inCar = true;
        player.car = sedan;
        player.fig.visible = false;
        player.x = sedan.x;
        player.z = sedan.z;
        player.heading = Math.PI;
        player.speedAbs = 14;
        V.syncMesh(sedan);
        shotCam = { x: b.x + 8.2, y: 3.5, z: b.z + 31.5, lx: b.x - 1, ly: 1.0, lz: b.z - 6 };
        stepGame(1 / 30);
        CBS.hud.update(hudSnapshot(CBS.story.panelData(player)));
      }
    }
    if (n === 3) {
      CBS.hud.subtitle('Vera: Listen close. The Glass Eels move their product through my marina at dusk, in a grey van with no plates.');
      CBS.hud.update(hudSnapshot(CBS.story.panelData(player)));
    }
    window.__SHOT_READY = true;
  }

  if (SHOT) stageShot(SHOT);

  // --- the loop -------------------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (SHOT) {
      renderer.render(scene, camera);
      return;
    }
    if (state === 'playing') stepGame(rawDt);
    else {
      CBS.city.tick(city, scene, gameTime);
      V.effects.tick(rawDt);
      if (state === 'menu') {
        // The start screen floats over a slow drift across the marina.
        const t = now * 0.000016;
        camera.position.set(302 + Math.sin(t) * 22, 21 + Math.sin(now * 0.00011) * 2.5, 196 - Math.cos(t) * 14);
        camera.lookAt(30, 2, 30);
      }
      renderer.render(scene, camera);
    }
    if (state === 'playing') renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  window.__game = { player, city, scene, story: CBS.story, police: CBS.police, vehicles: V, state: () => state, time: () => gameTime };
  if (!SHOT) CBS.hud.showStart();
})();
