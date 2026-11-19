// Transient effects for Coral Bay Syndicate: bullet tracers, muzzle-flash light,
// impact sparks, dust bursts at hard hits and a thin smoke thread that rises
// off wrecked cars — every system pooled, so effects never allocate per frame.
const THREE = window.THREE;

export function createFX(scene) {
  const tracers = [];
  for (let i = 0; i < 26; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    line.frustumCulled = false; line.visible = false;
    scene.add(line);
    tracers.push({ line, ttl: 0 });
  }
  let tracerIdx = 0;
  const flashLight = new THREE.PointLight(0xffc37a, 0, 15);
  scene.add(flashLight);
  let flashTtl = 0;

  // One pooled point cloud: positions, velocities and lifetimes in flat arrays.
  function makeCloud(count, matOpts) {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const life = new Float32Array(count);
    for (let i = 0; i < count; i++) pos[i * 3 + 1] = -60;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial(matOpts));
    points.frustumCulled = false;
    scene.add(points);
    return { count, pos, vel, life, geo, idx: 0 };
  }
  const sparks = makeCloud(240, { color: 0xffcf7a, size: 0.14, transparent: true, opacity: 0.95 });
  const dust = makeCloud(180, { color: 0xd9ba8a, size: 0.42, transparent: true, opacity: 0.55, depthWrite: false });
  const smoke = makeCloud(170, { color: 0x848b93, size: 2.6, transparent: true, opacity: 0.3, depthWrite: false });

  function spawn(cloud, x, y, z, vx, vy, vz, life) {
    const i = cloud.idx++ % cloud.count;
    cloud.pos[i * 3] = x; cloud.pos[i * 3 + 1] = y; cloud.pos[i * 3 + 2] = z;
    cloud.vel[i * 3] = vx; cloud.vel[i * 3 + 1] = vy; cloud.vel[i * 3 + 2] = vz;
    cloud.life[i] = life;
  }
  function stepCloud(cloud, dt, gravity, drag) {
    let any = false;
    for (let i = 0; i < cloud.count; i++) {
      if (cloud.life[i] <= 0) continue;
      any = true;
      cloud.life[i] -= dt;
      cloud.vel[i * 3 + 1] += gravity * dt;
      if (drag) { cloud.vel[i * 3] *= drag; cloud.vel[i * 3 + 2] *= drag; }
      cloud.pos[i * 3] += cloud.vel[i * 3] * dt;
      cloud.pos[i * 3 + 1] += cloud.vel[i * 3 + 1] * dt;
      cloud.pos[i * 3 + 2] += cloud.vel[i * 3 + 2] * dt;
      if (cloud.life[i] <= 0 || cloud.pos[i * 3 + 1] < -1) cloud.pos[i * 3 + 1] = -60;
    }
    if (any) cloud.geo.attributes.position.needsUpdate = true;
  }

  return {
    tracer(from, to, color = 0xffe9a8) {
      const t = tracers[tracerIdx++ % tracers.length];
      const pos = t.line.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      t.line.material.color.setHex(color);
      t.line.material.opacity = 0.9;
      t.line.visible = true;
      t.ttl = 0.07;
    },
    flash(pos) {
      flashLight.position.copy(pos);
      flashLight.intensity = 2.6;
      flashTtl = 0.05;
    },
    spark(point) {
      for (let n = 0; n < 9; n++) {
        spawn(sparks, point.x, point.y, point.z,
          (Math.random() - 0.5) * 4.4, Math.random() * 3.6 + 0.6, (Math.random() - 0.5) * 4.4, 0.32);
      }
    },
    dust(x, y, z) {
      for (let n = 0; n < 14; n++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 2.6;
        spawn(dust, x, y + Math.random() * 0.4, z,
          Math.cos(a) * r, Math.random() * 1.8 + 0.5, Math.sin(a) * r, 0.5 + Math.random() * 0.25);
      }
    },
    smoke(x, y, z) {
      for (let n = 0; n < 2; n++) {
        spawn(smoke, x + (Math.random() - 0.5) * 0.7, y, z + (Math.random() - 0.5) * 0.7,
          0.35 + Math.random() * 0.3, 1.5 + Math.random() * 0.9, (Math.random() - 0.5) * 0.3, 1.7 + Math.random() * 0.5);
      }
    },
    update(dt) {
      for (const t of tracers) {
        if (t.ttl > 0) { t.ttl -= dt; if (t.ttl <= 0) t.line.visible = false; }
      }
      if (flashTtl > 0) { flashTtl -= dt; if (flashTtl <= 0) flashLight.intensity = 0; }
      stepCloud(sparks, dt, -11, 0);
      stepCloud(dust, dt, -2.6, 0.92);
      stepCloud(smoke, dt, 0.55, 0);   // smoke buoyantly rises instead of falling
    },
  };
}
