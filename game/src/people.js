// people.js — the citizens of Coral Bay: low-poly pedestrians who stroll the
// sidewalks and gather at the marina, Vera Lark in her violet suit waiting by
// the harbormaster hut, and the articulated figure factory the player
// character is built from. Pedestrians flee from gunfire and explosions and
// go down when a car finds them.
(function () {
  'use strict';

  const CBS = (window.CBS = window.CBS || {});
  const U = CBS.util;
  const THREE = window.THREE;

  // A simple articulated figure: swinging arms and legs, a head, flat colours.
  function makePerson(shirt, pants, skin) {
    const g = new THREE.Group();
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), mat(shirt));
    torso.position.y = 1.12;
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.34), mat(skin));
    head.position.y = 1.72;
    head.castShadow = true;
    g.add(head);
    const limb = (w, h, c) => {
      const geo = new THREE.BoxGeometry(w, h, w);
      geo.translate(0, -h / 2, 0);
      const m = new THREE.Mesh(geo, mat(c));
      m.castShadow = true;
      return m;
    };
    const legL = limb(0.2, 0.78, pants); legL.position.set(-0.16, 0.78, 0);
    const legR = limb(0.2, 0.78, pants); legR.position.set(0.16, 0.78, 0);
    const armL = limb(0.15, 0.68, shirt); armL.position.set(-0.4, 1.46, 0);
    const armR = limb(0.15, 0.68, shirt); armR.position.set(0.4, 1.46, 0);
    g.add(legL, legR, armL, armR);
    g.userData = { legL, legR, armL, armR, torso };
    return g;
  }

  function animateFigure(fig, phase, amount) {
    const u = fig.userData;
    const s = Math.sin(phase) * amount;
    u.legL.rotation.x = s;
    u.legR.rotation.x = -s;
    u.armL.rotation.x = -s * 0.8;
    u.armR.rotation.x = s * 0.8;
  }

  const SHIRTS = [0xd8d5cc, 0xc23b2e, 0x2e62c2, 0xe0a83c, 0x3fae7c, 0xe8e4da, 0x87431f, 0x2e8c9e, 0xd469a8, 0x666c78];
  const PANTS = [0x2b2b30, 0x3a4a6b, 0x6b5136, 0x484848, 0x7a7f52];
  const SKINS = [0xe8b98d, 0xc68863, 0x8d5a3b, 0xf0c8a0, 0x6e4530];

  const peds = [];
  let vera = null;

  const MARINA_SPOTS = [
    { x: 262, z: 104 }, { x: 276, z: 118 }, { x: 290, z: 130 }, { x: 268, z: 142 },
    { x: 306, z: 120 }, { x: 330, z: 120 }, { x: 258, z: 122 }, { x: 282, z: 100 },
  ];

  function createCrowd(scene, city, count) {
    U.rngReset(31337);
    for (let i = 0; i < count; i++) {
      const fig = makePerson(
        SHIRTS[i % SHIRTS.length], PANTS[i % PANTS.length], SKINS[i % SKINS.length]
      );
      const ped = {
        fig, x: 0, z: 0, heading: U.rand(0, 6.28), speed: 0, phase: U.rand(0, 6),
        node: 0, targetNode: 0, side: i % 2 ? 6.3 : -6.3, state: 'walk',
        fleeT: 0, downT: 0, spot: null, spotT: 0,
      };
      if (i < 8) {
        // Marina crowd: they drift between boardwalk spots.
        ped.spot = MARINA_SPOTS[i % MARINA_SPOTS.length];
        ped.x = ped.spot.x + U.rand(-2, 2);
        ped.z = ped.spot.z + U.rand(-2, 2);
        ped.state = 'spot';
      } else {
        ped.node = Math.floor(U.rng() * city.graph.nodes.length);
        ped.targetNode = city.graph.nodes[ped.node].edges[0];
        const n = city.graph.nodes[ped.node];
        ped.x = n.x + ped.side;
        ped.z = n.z;
      }
      fig.position.set(ped.x, 0, ped.z);
      scene.add(fig);
      peds.push(ped);
    }
    // Vera Lark: violet suit, gold blouse, waiting at the marina.
    const vfig = makePerson(0x7433b8, 0x2e1a47, 0xc68863);
    vfig.userData.torso.material = new THREE.MeshLambertMaterial({ color: 0x7433b8 });
    const blouse = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.46, 0.37),
      new THREE.MeshLambertMaterial({ color: 0xe8b62a })
    );
    blouse.position.y = 1.2;
    vfig.add(blouse);
    vfig.position.set(city.marina.vera.x, 0, city.marina.vera.z);
    vfig.rotation.y = -Math.PI / 2; // faces the boardwalk and the road
    scene.add(vfig);
    vera = { fig: vfig, x: city.marina.vera.x, z: city.marina.vera.z };
    return { peds, vera };
  }

  function sidewalkPoint(city, ped) {
    const a = city.graph.nodes[ped.node];
    const b = city.graph.nodes[ped.targetNode];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: b.x + (dz / len) * ped.side, z: b.z + (-dx / len) * ped.side };
  }

  function update(city, dt, threat) {
    for (const ped of peds) {
      if (ped.state === 'down') {
        ped.downT -= dt;
        ped.fig.rotation.x = -Math.PI / 2;
        ped.fig.position.y = 0.25;
        if (ped.downT <= 0) {
          ped.state = 'walk';
          ped.fig.rotation.x = 0;
          ped.fig.position.y = 0;
        }
        continue;
      }
      // Danger sends everyone running.
      if (threat && U.dist2D(ped.x, ped.z, threat.x, threat.z) < 16) {
        ped.state = 'flee';
        ped.fleeT = 2.6;
        ped.fleeFrom = { x: threat.x, z: threat.z };
      }
      let tx;
      let tz;
      let speed = 1.35;
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        if (ped.fleeT <= 0) ped.state = ped.spot ? 'spot' : 'walk';
        tx = ped.x + (ped.x - ped.fleeFrom.x) * 2;
        tz = ped.z + (ped.z - ped.fleeFrom.z) * 2;
        speed = 4.6;
      } else if (ped.state === 'spot') {
        ped.spotT -= dt;
        if (!ped.spot || U.dist2D(ped.x, ped.z, ped.spot.x, ped.spot.z) < 1.2) {
          if (ped.spotT <= 0) {
            ped.spot = MARINA_SPOTS[Math.floor(U.rng() * MARINA_SPOTS.length)];
            ped.spotT = U.rand(4, 14);
          } else {
            speed = 0; // stand and watch the boats
          }
        }
        tx = ped.spot.x;
        tz = ped.spot.z;
      } else {
        const wp = sidewalkPoint(city, ped);
        tx = wp.x;
        tz = wp.z;
        if (U.dist2D(ped.x, ped.z, tx, tz) < 1.4) {
          const from = ped.node;
          ped.node = ped.targetNode;
          const opts = city.graph.nodes[ped.node].edges.filter((e) => e !== from);
          ped.targetNode = opts.length ? opts[Math.floor(U.rng() * opts.length)] : from;
          continue;
        }
      }
      const dx = tx - ped.x;
      const dz = tz - ped.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05 && speed > 0) {
        ped.heading = U.angleLerp(ped.heading, Math.atan2(dx, dz), dt * 7);
        ped.x += Math.sin(ped.heading) * speed * dt;
        ped.z += Math.cos(ped.heading) * speed * dt;
        ped.phase += dt * speed * 3.4;
      }
      ped.x = U.clamp(ped.x, -258, 350);
      ped.z = U.clamp(ped.z, -200, 200);
      ped.fig.position.set(ped.x, 0, ped.z);
      ped.fig.rotation.y = ped.heading;
      animateFigure(ped.fig, ped.phase, speed > 2 ? 0.75 : 0.5);
    }
    if (vera) {
      // Vera idles: a slow weight shift, watching for the player.
      vera.fig.position.y = Math.sin(performance.now() * 0.0012) * 0.02;
    }
  }

  function knockDown(ped) {
    if (ped.state !== 'down') {
      ped.state = 'down';
      ped.downT = 7;
    }
  }

  CBS.people = {
    makePerson, animateFigure, createCrowd, update, knockDown,
    get peds() { return peds; },
    get vera() { return vera; },
  };
})();
