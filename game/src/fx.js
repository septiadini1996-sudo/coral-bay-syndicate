// Transient effects for Coral Bay Syndicate: bullet tracers, muzzle-flash light
// and impact sparks, all pooled so gunfire never allocates in the frame loop.
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

  const SPARKS = 240;
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffcf7a, size: 0.14, transparent: true, opacity: 0.95 }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkIdx = 0;
  for (let i = 0; i < SPARKS; i++) sparkPos[i * 3 + 1] = -50;

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
        const i = sparkIdx++ % SPARKS;
        sparkPos[i * 3] = point.x; sparkPos[i * 3 + 1] = point.y; sparkPos[i * 3 + 2] = point.z;
        sparkVel[i * 3] = (Math.random() - 0.5) * 4.4;
        sparkVel[i * 3 + 1] = Math.random() * 3.6 + 0.6;
        sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 4.4;
        sparkLife[i] = 0.32;
      }
    },
    update(dt) {
      for (const t of tracers) {
        if (t.ttl > 0) { t.ttl -= dt; if (t.ttl <= 0) t.line.visible = false; }
      }
      if (flashTtl > 0) { flashTtl -= dt; if (flashTtl <= 0) flashLight.intensity = 0; }
      let any = false;
      for (let i = 0; i < SPARKS; i++) {
        if (sparkLife[i] <= 0) continue;
        any = true;
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 11 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        if (sparkLife[i] <= 0 || sparkPos[i * 3 + 1] < 0) sparkPos[i * 3 + 1] = -50;
      }
      if (any) sparkGeo.attributes.position.needsUpdate = true;
    },
  };
}
