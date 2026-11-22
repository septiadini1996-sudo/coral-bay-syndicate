// city.js — Coral Bay itself: the road graph (~65 nodes), streets with lane
// markings, city blocks and towers, traffic lights, palms, the marina with its
// pier, boats and harbormaster hut, the beach, and the golden-hour sky, sun
// and fog rig that gives the whole game its late-afternoon look.
(function () {
  'use strict';

  const CBS = (window.CBS = window.CBS || {});
  const U = CBS.util;
  const THREE = window.THREE;

  const COLS = 9; // x: -240 .. 240
  const ROWS = 7; // z: -180 .. 180
  const STEP = 60;
  const MAP = { minX: -290, maxX: 400, minZ: -215, maxZ: 215 };

  function nodeX(c) { return -240 + c * STEP; }
  function nodeZ(r) { return -180 + r * STEP; }
  function nodeId(c, r) { return r * COLS + c; }

  function buildGraph() {
    const nodes = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        nodes.push({ x: nodeX(c), z: nodeZ(r), edges: [] });
      }
    }
    const link = (a, b) => {
      nodes[a].edges.push(b);
      nodes[b].edges.push(a);
    };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c + 1 < COLS) link(nodeId(c, r), nodeId(c + 1, r));
        if (r + 1 < ROWS) link(nodeId(c, r), nodeId(c, r + 1));
      }
    }
    return { nodes };
  }

  // --- canvas textures ------------------------------------------------------
  function canvasTexture(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const tx = new THREE.CanvasTexture(cv);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.anisotropy = 4;
    return tx;
  }

  function asphaltTexture() {
    return canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#33343c';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 380; i++) {
        g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      g.fillStyle = '#e8c96a';
      g.fillRect(w / 2 - 2, 6, 4, 40);
      g.fillRect(w / 2 - 2, 82, 4, 40);
    });
  }

  function facadeTexture(base, litRatio) {
    return canvasTexture(128, 256, (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let y = 10; y < h - 12; y += 22) {
        for (let x = 10; x < w - 14; x += 24) {
          const lit = Math.random() < litRatio;
          g.fillStyle = lit ? '#ffd98c' : '#2b3546';
          g.fillRect(x, y, 14, 13);
          g.fillStyle = 'rgba(255,255,255,0.16)';
          g.fillRect(x, y, 14, 3);
        }
      }
    });
  }

  function signTexture(text, bg, fg) {
    const tx = canvasTexture(256, 64, (g, w, h) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = fg;
      g.font = 'bold 30px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 1);
    });
    tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
    return tx;
  }

  // --- the build ------------------------------------------------------------
  function build(scene) {
    const graph = buildGraph();
    const colliders = [];
    const city = {
      graph, colliders, lights: [], MAP,
      marina: { vera: { x: 259, z: 106 }, hut: { x: 264, z: 152 }, pierZ: [112, 128] },
      station: { x: -180, z: -126 },
      warehouse: { x: 208, z: -148 },
      cafe: { x: -96, z: 66 },
    };

    // Sky dome with a warm gradient and a soft sun glow.
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { sunDir: { value: new THREE.Vector3(0.78, 0.30, -0.42).normalize() } },
      vertexShader:
        'varying vec3 vDir; void main(){ vDir = normalize(position);' +
        ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'varying vec3 vDir; uniform vec3 sunDir;' +
        'void main(){ float h = clamp(vDir.y, -0.08, 1.0);' +
        ' vec3 zen = vec3(0.36, 0.52, 0.78); vec3 mid = vec3(0.96, 0.66, 0.44);' +
        ' vec3 hor = vec3(1.0, 0.78, 0.52);' +
        ' vec3 col = mix(hor, mid, smoothstep(0.0, 0.18, h));' +
        ' col = mix(col, zen, smoothstep(0.15, 0.65, h));' +
        ' float s = pow(max(dot(normalize(vDir), sunDir), 0.0), 90.0);' +
        ' col += vec3(1.0, 0.62, 0.30) * s * 0.85;' +
        ' float s2 = pow(max(dot(normalize(vDir), sunDir), 0.0), 7.0);' +
        ' col += vec3(0.95, 0.45, 0.18) * s2 * 0.22;' +
        ' gl_FragColor = vec4(col, 1.0); }',
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 14), skyMat);
    scene.add(sky);
    city.sky = sky;

    // Golden-hour light rig: one shadow-casting sun, warm hemisphere fill.
    const sun = new THREE.DirectionalLight(0xffb066, 3.1);
    sun.position.set(390, 150, -210);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -330;
    sun.shadow.camera.right = 330;
    sun.shadow.camera.top = 330;
    sun.shadow.camera.bottom = -330;
    sun.shadow.camera.far = 1400;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);
    city.sun = sun;
    const hemi = new THREE.HemisphereLight(0xffd9a8, 0x3d4a5c, 0.85);
    scene.add(hemi);
    scene.add(new THREE.AmbientLight(0xffe2bb, 0.25));
    scene.fog = new THREE.Fog(0xeaa26a, 190, 1250);

    // Land base, beach and water.
    const land = new THREE.Mesh(
      new THREE.PlaneGeometry(620, 440),
      new THREE.MeshLambertMaterial({ color: 0x77806b })
    );
    land.rotation.x = -Math.PI / 2;
    land.position.set(-5, 0, 0);
    land.receiveShadow = true;
    scene.add(land);

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 440),
      new THREE.MeshLambertMaterial({ color: 0xe3c184 })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(282, 0.015, 0);
    sand.receiveShadow = true;
    scene.add(sand);

    const waterMat = new THREE.MeshPhongMaterial({
      color: 0x2e6f8e, shininess: 160, specular: 0xffc98a,
      transparent: true, opacity: 0.93,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(760, 900), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(690, -0.55, 0);
    scene.add(water);
    city.waterMat = waterMat;

    // City block ground slabs with slight per-block variation.
    const slabMats = [0x848b74, 0x7d8570, 0x8a9078].map(
      (c) => new THREE.MeshLambertMaterial({ color: c })
    );
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const slab = new THREE.Mesh(
          new THREE.PlaneGeometry(STEP - 13, STEP - 13),
          slabMats[(r * 7 + c * 3) % 3]
        );
        slab.rotation.x = -Math.PI / 2;
        slab.position.set(nodeX(c) + STEP / 2, 0.012, nodeZ(r) + STEP / 2);
        slab.receiveShadow = true;
        scene.add(slab);
      }
    }

    // Roads: sidewalk underlay plus an asphalt strip with a dashed centre line.
    const walkMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a2 });
    const asphalt = asphaltTexture();
    for (let i = 0; i < graph.nodes.length; i++) {
      const a = graph.nodes[i];
      for (const j of a.edges) {
        if (j < i) continue;
        const b = graph.nodes[j];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const ang = Math.atan2(b.x - a.x, b.z - a.z);
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(15.5, len + 15.5), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.rotation.z = -ang;
        walk.position.set((a.x + b.x) / 2, 0.02, (a.z + b.z) / 2);
        walk.receiveShadow = true;
        scene.add(walk);
        const tex = asphalt.clone();
        tex.needsUpdate = true;
        tex.repeat.set(1, len / 26);
        const road = new THREE.Mesh(
          new THREE.PlaneGeometry(10.6, len + 10),
          new THREE.MeshLambertMaterial({ map: tex })
        );
        road.rotation.x = -Math.PI / 2;
        road.rotation.z = -ang;
        road.position.set((a.x + b.x) / 2, 0.035, (a.z + b.z) / 2);
        road.receiveShadow = true;
        scene.add(road);
      }
    }

    buildBuildings(scene, colliders);
    buildPalms(scene);
    buildLamps(scene);
    buildTrafficLights(scene, city);
    buildMarina(scene, city, colliders);
    return city;
  }

  function buildBuildings(scene, colliders) {
    U.rngReset(4242);
    const facades = [
      facadeTexture('#8d7f74', 0.35), facadeTexture('#6f7d8c', 0.3),
      facadeTexture('#a08b74', 0.42), facadeTexture('#7a6a80', 0.28),
      facadeTexture('#94a3ad', 0.38),
    ].map((tx) => new THREE.MeshLambertMaterial({ map: tx }));
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x4c4640 });
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        if (c === 7 && r >= 4) continue; // marina green instead of towers
        const cx = nodeX(c) + STEP / 2;
        const cz = nodeZ(r) + STEP / 2;
        const spots = U.rng() < 0.45
          ? [{ dx: 0, dz: 0, w: 30, d: 30 }]
          : [
              { dx: -11, dz: -11, w: 17, d: 17 }, { dx: 11, dz: 11, w: 17, d: 17 },
              { dx: 11, dz: -11, w: 15, d: 15 },
            ];
        for (const s of spots) {
          if (U.rng() < 0.14) continue;
          const hgt = 11 + U.rng() * U.rng() * 34;
          const mat = facades[Math.floor(U.rng() * facades.length)];
          const b = new THREE.Mesh(new THREE.BoxGeometry(s.w, hgt, s.d), mat);
          b.position.set(cx + s.dx, hgt / 2, cz + s.dz);
          b.castShadow = true;
          b.receiveShadow = true;
          scene.add(b);
          const roof = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.7, 0.7, s.d + 0.7), roofMat);
          roof.position.set(cx + s.dx, hgt + 0.35, cz + s.dz);
          scene.add(roof);
          colliders.push({
            minX: cx + s.dx - s.w / 2, maxX: cx + s.dx + s.w / 2,
            minZ: cz + s.dz - s.d / 2, maxZ: cz + s.dz + s.d / 2,
          });
        }
      }
    }
    // Police station: a stout block with a blue band, west side.
    const st = new THREE.Mesh(
      new THREE.BoxGeometry(26, 13, 22),
      new THREE.MeshLambertMaterial({ map: facadeTexture('#7d8aa0', 0.3) })
    );
    st.position.set(-186, 6.5, -148);
    st.castShadow = true;
    scene.add(st);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(26.4, 2.2, 22.4),
      new THREE.MeshLambertMaterial({ color: 0x274b8f })
    );
    band.position.set(-186, 10.5, -148);
    scene.add(band);
    colliders.push({ minX: -199, maxX: -173, minZ: -159, maxZ: -137 });
  }

  function buildPalms(scene) {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x558c4a, emissive: 0x16280f, side: THREE.DoubleSide });
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7.5, 6);
    const frondGeo = new THREE.BoxGeometry(0.34, 0.05, 3.1);
    frondGeo.translate(0, 0, 1.5);
    function palm(x, z, lean) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3.75;
      trunk.rotation.z = lean;
      trunk.castShadow = true;
      g.add(trunk);
      const top = new THREE.Group();
      top.position.set(Math.sin(-lean) * 3.4, 7.3, 0);
      for (let i = 0; i < 8; i++) {
        const f = new THREE.Mesh(frondGeo, leafMat);
        f.rotation.y = (i / 8) * Math.PI * 2 + (i % 2) * 0.2;
        f.rotation.x = -0.38 - (i % 4) * 0.16;
        f.castShadow = true;
        top.add(f);
      }
      g.add(top);
      g.position.set(x, 0, z);
      g.rotation.y = (x * 13.7 + z * 7.1) % 3;
      scene.add(g);
    }
    for (let z = -195; z <= 195; z += 26) {
      palm(249.5, z, 0.1);
      if (z % 52 === 0) palm(258, z + 12, -0.06);
    }
    for (let x = -210; x <= 210; x += 52) palm(x, -193, 0.05);
    U.rngReset(991);
    for (let i = 0; i < 12; i++) palm(268 + U.rng() * 26, -190 + U.rng() * 380, 0.08);
  }

  function buildLamps(scene) {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4148 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5);
    const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if ((c + r) % 2 !== 0) continue;
        const x = nodeX(c) + 6.4;
        const z = nodeZ(r) + 6.4;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 2.8, z);
        scene.add(pole);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(x, 5.7, z);
        scene.add(bulb);
      }
    }
  }

  function buildTrafficLights(scene, city) {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3238 });
    const boxMat = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        const x = nodeX(c);
        const z = nodeZ(r);
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 4.6, 6), poleMat);
        pole.position.set(6.2, 2.3, 6.2);
        pole.castShadow = true;
        g.add(pole);
        const lamps = {};
        const mkHead = (ry, key) => {
          const head = new THREE.Group();
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.4), boxMat);
          head.add(box);
          const cols = [0xff3b30, 0xffcc00, 0x35d05a];
          const mats = [];
          for (let i = 0; i < 3; i++) {
            const m = new THREE.MeshBasicMaterial({ color: 0x222222 });
            const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), m);
            s.position.set(0, 0.48 - i * 0.48, 0.22);
            head.add(s);
            mats.push(m);
          }
          head.position.set(6.2, 5.1, 6.2);
          head.rotation.y = ry;
          g.add(head);
          lamps[key] = mats;
        };
        mkHead(Math.PI, 'ns'); // faces north-south traffic
        mkHead(Math.PI / 2, 'ew');
        g.position.set(x, 0, z);
        scene.add(g);
        city.lights.push({ node: nodeId(c, r), lamps, phase: (nodeId(c, r) * 0.618) % 14 });
      }
    }
  }

  // Traffic light state for an axis ('ns' | 'ew') at a node, given game time.
  function lightState(cityRef, node, axis, t) {
    const L = cityRef.lights.find((l) => l.node === node);
    const phase = L ? (t + L.phase) % 14 : t % 14;
    const nsGreen = phase < 6;
    const nsYellow = phase >= 6 && phase < 7;
    const ewGreen = phase >= 7 && phase < 13;
    const ewYellow = phase >= 13;
    if (axis === 'ns') return nsGreen ? 'green' : nsYellow ? 'yellow' : 'red';
    return ewGreen ? 'green' : ewYellow ? 'yellow' : 'red';
  }

  function buildMarina(scene, city, colliders) {
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x9a7648 });
    const woodDark = new THREE.MeshLambertMaterial({ color: 0x77572f });
    // Boardwalk along the shore.
    const walk = new THREE.Mesh(new THREE.BoxGeometry(52, 0.35, 76), woodMat);
    walk.position.set(276, 0.18, 132);
    walk.receiveShadow = true;
    scene.add(walk);
    // Pier reaching into the bay.
    const pier = new THREE.Mesh(new THREE.BoxGeometry(58, 0.35, 13), woodMat);
    pier.position.set(326, 0.18, 120);
    pier.receiveShadow = true;
    scene.add(pier);
    for (let x = 300; x <= 352; x += 8) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 5), woodDark);
      post.position.set(x, -0.4, 114);
      scene.add(post);
      const post2 = post.clone();
      post2.position.z = 126;
      scene.add(post2);
    }
    // Harbormaster hut with its painted sign.
    const hut = new THREE.Mesh(
      new THREE.BoxGeometry(11, 5.5, 9),
      new THREE.MeshLambertMaterial({ color: 0xd8cfc0 })
    );
    hut.position.set(264, 2.75, 152);
    hut.castShadow = true;
    scene.add(hut);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(8.4, 2.6, 4),
      new THREE.MeshLambertMaterial({ color: 0x9c4a32 })
    );
    roof.position.set(264, 6.8, 152);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    scene.add(roof);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.2),
      new THREE.MeshBasicMaterial({ map: signTexture('HARBORMASTER', '#274b8f', '#ffffff') })
    );
    sign.position.set(258.4, 4.2, 152);
    sign.rotation.y = -Math.PI / 2;
    scene.add(sign);
    colliders.push({ minX: 258.5, maxX: 269.5, minZ: 147.5, maxZ: 156.5 });

    // Boats: hulls, cabins, masts, one proud sail.
    const hullCols = [0xc74b3c, 0x3c6fc7, 0xe8e4da, 0x3fae7c, 0xe0a83c];
    const boatAt = (x, z, ry, i) => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 1.1, 8.4),
        new THREE.MeshLambertMaterial({ color: hullCols[i % hullCols.length] })
      );
      hull.position.y = 0.25;
      g.add(hull);
      const bow = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.6, 4), hull.material);
      bow.rotation.x = Math.PI / 2;
      bow.rotation.y = Math.PI / 4;
      bow.position.set(0, 0.25, 5.4);
      g.add(bow);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.1, 2.6),
        new THREE.MeshLambertMaterial({ color: 0xf2efe8 })
      );
      cabin.position.set(0, 1.3, -0.8);
      g.add(cabin);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 7.5, 5),
        new THREE.MeshLambertMaterial({ color: 0xb9b0a0 })
      );
      mast.position.set(0, 4.4, 0.9);
      g.add(mast);
      if (i === 1) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0, 5.6);
        shape.lineTo(2.6, 0.4);
        shape.lineTo(0, 0);
        const sail = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshLambertMaterial({ color: 0xf7f3e8, side: THREE.DoubleSide })
        );
        sail.position.set(0.1, 1.6, 0.95);
        g.add(sail);
      }
      g.position.set(x, -0.25, z);
      g.rotation.y = ry;
      scene.add(g);
      return g;
    };
    city.boats = [
      boatAt(318, 100, 0.12, 0), boatAt(330, 108, -0.08, 1), boatAt(320, 140, 0.2, 2),
      boatAt(336, 148, -0.15, 3), boatAt(312, 158, 0.05, 4),
    ];
  }

  // Per-frame city animation: water shimmer, boat bobbing, signal lamps.
  function tick(cityRef, scene, t) {
    cityRef.waterMat.color.setHSL(0.55, 0.52, 0.30 + Math.sin(t * 0.7) * 0.02);
    if (cityRef.boats) {
      for (let i = 0; i < cityRef.boats.length; i++) {
        cityRef.boats[i].position.y = -0.25 + Math.sin(t * 0.9 + i * 1.7) * 0.09;
        cityRef.boats[i].rotation.z = Math.sin(t * 0.7 + i) * 0.02;
      }
    }
    for (const L of cityRef.lights) {
      const ns = lightState(cityRef, L.node, 'ns', t);
      const ew = lightState(cityRef, L.node, 'ew', t);
      const set = (mats, st) => {
        mats[0].color.setHex(st === 'red' ? 0xff3b30 : 0x2a0f0d);
        mats[1].color.setHex(st === 'yellow' ? 0xffcc00 : 0x2a2408);
        mats[2].color.setHex(st === 'green' ? 0x35d05a : 0x0d2413);
      };
      set(L.lamps.ns, ns);
      set(L.lamps.ew, ew);
    }
    // The sun shadow camera follows the action so shadows stay crisp.
    if (cityRef.focus) {
      const f = cityRef.focus;
      cityRef.sun.position.set(f.x + 390, 150, f.z - 210);
      cityRef.sun.target.position.set(f.x, 0, f.z);
      cityRef.sky.position.set(f.x, 0, f.z);
    }
  }

  function nearestNode(graph, x, z) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < graph.nodes.length; i++) {
      const d = (graph.nodes[i].x - x) ** 2 + (graph.nodes[i].z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  // Draw the static base of the minimap: water, sand, land, roads, marina.
  function drawMinimapBase(ctx, W, H) {
    const sx = (x) => ((x - MAP.minX) / (MAP.maxX - MAP.minX)) * W;
    const sz = (z) => ((z - MAP.minZ) / (MAP.maxZ - MAP.minZ)) * H;
    ctx.fillStyle = '#2e6f8e';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#77806b';
    ctx.fillRect(0, 0, sx(252), H);
    ctx.fillStyle = '#e3c184';
    ctx.fillRect(sx(252), 0, sx(314) - sx(252), H);
    ctx.fillStyle = '#9a7648';
    ctx.fillRect(sx(250), sz(94), sx(354) - sx(250), sz(170) - sz(94));
    ctx.strokeStyle = '#c9ccd2';
    ctx.lineWidth = Math.max(2, W / 110);
    ctx.beginPath();
    const g = buildGraph();
    for (let i = 0; i < g.nodes.length; i++) {
      for (const j of g.nodes[i].edges) {
        if (j < i) continue;
        ctx.moveTo(sx(g.nodes[i].x), sz(g.nodes[i].z));
        ctx.lineTo(sx(g.nodes[j].x), sz(g.nodes[j].z));
      }
    }
    ctx.stroke();
    return { sx, sz };
  }

  CBS.city = { build, tick, lightState, nearestNode, drawMinimapBase, MAP, nodeId, nodeX, nodeZ };
})();
