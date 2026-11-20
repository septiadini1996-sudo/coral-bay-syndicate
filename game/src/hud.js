// Coral Bay Syndicate - hud.js
// Everything the player reads: health and the steel-blue armor bar,
// cash, wanted stars, the three-slot weapon bar with ammo, mission
// panel with STEP x/y progress, the police panel (state, units,
// nearest distance), the vehicle panel with CONDITION %, the
// Syndicate Rank chip, the persistent radio bar, toasts, subtitles,
// the minimap, the full-screen GPS map and the gold route ribbon.

'use strict';

var toastT = 0;
function showToast(text) {
  var t = el('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  toastT = 3.6;
}

function hudInit() {
  el('radio-name').textContent = STATIONS[AU.station].name;
  el('radio-tag').textContent = STATIONS[AU.station].tag;
  buildRibbon();
}

var ribbon = null, ribbonKey = '';
function buildRibbon() {
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 64), 3));
  ribbon = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd75e }));
  ribbon.frustumCulled = false;
  G.scene.add(ribbon);
}
function updateRibbon() {
  if (!ribbon) return;
  var pts = G.route || [];
  var key = pts.length + ':' + (pts.length ? pts[pts.length - 1].x + ',' + pts[pts.length - 1].z : '');
  var pos = ribbon.geometry.attributes.position;
  if (key !== ribbonKey) {
    ribbonKey = key;
    var n = Math.min(pts.length, 64);
    var px = G.inCar ? G.inCar.x : G.player.x, pz = G.inCar ? G.inCar.z : G.player.z;
    pos.setXYZ(0, px, 1.4, pz);
    for (var i = 0; i < n; i++) pos.setXYZ(i + 1 > 63 ? 63 : i + 1, pts[i].x, 1.4, pts[i].z);
    ribbon.geometry.setDrawRange(0, n + 1);
    pos.needsUpdate = true;
  } else if (pts.length) {
    var px2 = G.inCar ? G.inCar.x : G.player.x, pz2 = G.inCar ? G.inCar.z : G.player.z;
    pos.setXYZ(0, px2, 1.4, pz2);
    pos.needsUpdate = true;
  }
  ribbon.visible = pts.length > 1 && !cutsceneActive();
}

// The full HUD refresh. Called every frame; cheap DOM writes only
// when a value actually changed (cached in hudCache).
var hudCache = {};
function setText(id, text) {
  if (hudCache[id] !== text) { hudCache[id] = text; el(id).textContent = text; }
}
function setBar(id, frac) {
  var v = Math.round(clamp(frac, 0, 1) * 100);
  if (hudCache[id] !== v) { hudCache[id] = v; el(id).style.width = v + '%'; }
}

function hudTick(dt) {
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) el('toast').classList.remove('show'); }
  setBar('hp-fill', G.hp / 100);
  setBar('armor-fill', G.armor / 100);
  setText('cash', fmt$(G.cash));
  setText('rank-chip', 'SYNDICATE RANK: ' + G.rankName.toUpperCase());
  var stars = '';
  for (var i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '☆';
  setText('stars', stars);
  el('stars').style.opacity = G.wanted ? 1 : 0.25;

  // Weapon bar: three slots, active one lit, ammo on the active slot.
  for (var w = 0; w < 3; w++) {
    var slot = el('wslot' + w);
    var on = G.weapon === w;
    if (hudCache['ws' + w] !== on) { hudCache['ws' + w] = on; slot.classList.toggle('active', on); }
  }
  setText('ammo', G.weapon === 0 ? '—' : (G.ammo[G.weapon] + ' rounds'));

  // Mission panel.
  if (G.job < JOBS.length) {
    var job = JOBS[G.job];
    setText('job-title', 'JOB ' + (G.job + 1) + ' — ' + job.title.toUpperCase());
    setText('job-step', 'STEP ' + Math.min(G.jobStep + 1, job.steps.length) + '/' + job.steps.length);
    var obj = stepLabel();
    if (G.holdFrac > 0) obj += '  (' + Math.round(G.holdFrac * 100) + '%)';
    setText('job-obj', obj);
    if (G.targetPos) {
      var px = G.inCar ? G.inCar.x : G.player.x, pz = G.inCar ? G.inCar.z : G.player.z;
      setText('job-dist', Math.round(dist2(px, pz, G.targetPos.x, G.targetPos.z)) + ' m');
    } else setText('job-dist', G.jobStep >= 0 && currentStep() && currentStep().k === 'escape' ? 'LOSE THEM' : '');
  } else {
    setText('job-title', 'CORAL BAY IS YOURS');
    setText('job-step', 'ALL 6 JOBS DONE');
    setText('job-obj', 'Free roam: the city belongs to the Syndicate.');
    setText('job-dist', '');
  }

  // Police panel.
  var units = G.cops.filter(function (c) { return !c.dead; }).length;
  setText('pol-state', G.policeState || 'CLEAR');
  el('pol-state').style.color = G.policeState === 'PURSUIT' ? '#ff6b5e' : (G.policeState === 'SEARCHING' ? '#ffd75e' : '#8fd48f');
  setText('pol-units', units + (units === 1 ? ' unit' : ' units'));
  setText('pol-dist', G.nearestCop >= 0 ? G.nearestCop + ' m' : '—');
  el('bust-wrap').style.display = G.bust > 0.02 ? 'block' : 'none';
  if (G.bust > 0.02) setBar('bust-fill', G.bust);

  // Vehicle panel.
  var vp = el('vehicle-panel');
  if (G.inCar) {
    vp.style.display = 'block';
    setText('veh-name', G.inCar.name.toUpperCase());
    var cond = Math.max(0, Math.round(G.inCar.hp / G.inCar.maxHp * 100));
    setText('veh-cond', 'CONDITION ' + cond + '%');
    setBar('veh-fill', G.inCar.hp / G.inCar.maxHp);
    el('veh-fill').style.background = cond > 50 ? '#57c96b' : (cond > 25 ? '#ffd75e' : '#ff6b5e');
  } else vp.style.display = 'none';

  // Crosshair: hot (red) when a target is inside the aim cone.
  var ch = el('crosshair');
  ch.style.display = (G.weapon > 0 && G.aimT > 0 && !G.inCar) ? 'block' : 'none';
  ch.classList.toggle('hot', !!G.aimHot);

  // Subtitles.
  var sub = el('subtitle');
  if (G.cut) {
    sub.style.display = 'block';
    var line = G.cut.lines[G.cut.i];
    setText('sub-who', line[0]);
    setText('sub-text', line[1]);
  } else sub.style.display = 'none';

  // Finale card.
  el('finale').style.display = G.finale ? 'flex' : 'none';

  drawMinimap();
  updateRibbon();
  updateGpsArrow();
}

function updateGpsArrow() {
  var arrow = el('gps-arrow');
  if (!G.targetPos || !G.route.length) { arrow.style.display = 'none'; return; }
  arrow.style.display = 'block';
  var next = G.route[Math.min(1, G.route.length - 1)];
  var px = G.inCar ? G.inCar.x : G.player.x, pz = G.inCar ? G.inCar.z : G.player.z;
  var bearing = Math.atan2(next.x - px, next.z - pz);
  var rel = angWrap(bearing - G.camYaw);
  arrow.style.transform = 'rotate(' + (-rel * 180 / Math.PI) + 'deg)';
}

// Minimap: north-up, player-centred, ~520 m across.
function drawMinimap() {
  var cv = el('minimap'); if (!cv) return;
  var c = cv.getContext('2d');
  var W = cv.width, H = cv.height, scale = W / 520;
  var px = G.inCar ? G.inCar.x : G.player.x, pz = G.inCar ? G.inCar.z : G.player.z;
  c.fillStyle = '#20303c'; c.fillRect(0, 0, W, H);
  function mx(x) { return (x - px) * scale + W / 2; }
  function mz(z) { return (z - pz) * scale + H / 2; }
  // Water and beach to the south.
  c.fillStyle = '#1e7fa8'; c.fillRect(0, mz(1420), W, H);
  c.fillStyle = '#e8d49a'; c.fillRect(0, mz(1300), W, mz(1420) - mz(1300));
  // Roads.
  c.strokeStyle = '#4a5560'; c.lineWidth = Math.max(2, 26 * scale);
  c.beginPath();
  for (var k = 0; k <= 16; k++) {
    var p = -CITY + k * ROAD_STEP;
    c.moveTo(mx(p), mz(-CITY)); c.lineTo(mx(p), mz(CITY));
    c.moveTo(mx(-CITY), mz(p)); c.lineTo(mx(CITY), mz(p));
  }
  c.stroke();
  // GPS route and target.
  if (G.route.length > 1) {
    c.strokeStyle = '#ffd75e'; c.lineWidth = 3; c.beginPath();
    c.moveTo(mx(px), mz(pz));
    for (var i = 0; i < G.route.length; i++) c.lineTo(mx(G.route[i].x), mz(G.route[i].z));
    c.stroke();
  }
  if (G.targetPos) {
    c.fillStyle = '#ffd75e';
    c.beginPath(); c.arc(mx(G.targetPos.x), mz(G.targetPos.z), 5, 0, 7); c.fill();
  }
  // Police and traffic dots.
  c.fillStyle = '#ff5040';
  for (var j = 0; j < G.cops.length; j++) if (!G.cops[j].dead) { c.beginPath(); c.arc(mx(G.cops[j].x), mz(G.cops[j].z), 3.4, 0, 7); c.fill(); }
  c.fillStyle = '#cfd8dc';
  for (var q = 0; q < G.cars.length; q++) { c.beginPath(); c.arc(mx(G.cars[q].x), mz(G.cars[q].z), 2.2, 0, 7); c.fill(); }
  // Player arrow, pointing where the camera faces. On this north-up
  // map a yaw of 0 looks south (down-map), hence the PI flip.
  c.save();
  c.translate(W / 2, H / 2);
  c.rotate(Math.PI - G.camYaw);
  c.fillStyle = '#ffffff';
  c.beginPath(); c.moveTo(0, -8); c.lineTo(5.5, 6); c.lineTo(-5.5, 6); c.closePath(); c.fill();
  c.restore();
}

// Full-screen map (M): the whole city, the route, named places.
var MAP_PLACES = [
  [0, 1470, 'MARINA PIER'], [172, -148, 'SYNDICATE GARAGE'], [168, 88, 'CORAL BANK'],
  [-648, 472, 'WEST WAREHOUSE'], [-800, 168, 'CHOP SHOP'], [488, -448, 'EAST LOOKOUT'],
];
function drawBigMap() {
  var cv = el('bigmap'); if (!cv) return;
  var c = cv.getContext('2d');
  var W = cv.width, H = cv.height, scale = W / 3400;
  function mx(x) { return (x + 1700) * scale; }
  function mz(z) { return (z + 1700) * scale; }
  c.fillStyle = '#16232e'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#1e7fa8'; c.fillRect(0, mz(1420), W, H);
  c.fillStyle = '#e8d49a'; c.fillRect(0, mz(1300), W, mz(1420) - mz(1300));
  c.strokeStyle = '#546672'; c.lineWidth = 3;
  c.beginPath();
  for (var k = 0; k <= 16; k++) {
    var p = -CITY + k * ROAD_STEP;
    c.moveTo(mx(p), mz(-CITY)); c.lineTo(mx(p), mz(CITY));
    c.moveTo(mx(-CITY), mz(p)); c.lineTo(mx(CITY), mz(p));
  }
  c.stroke();
  if (G.route.length > 1) {
    c.strokeStyle = '#ffd75e'; c.lineWidth = 4; c.beginPath();
    var px = G.inCar ? G.inCar.x : G.player.x, pz = G.inCar ? G.inCar.z : G.player.z;
    c.moveTo(mx(px), mz(pz));
    for (var i = 0; i < G.route.length; i++) c.lineTo(mx(G.route[i].x), mz(G.route[i].z));
    c.stroke();
  }
  c.fillStyle = '#9fd8ff'; c.font = 'bold 15px Arial'; c.textAlign = 'center';
  for (var m = 0; m < MAP_PLACES.length; m++) c.fillText(MAP_PLACES[m][2], mx(MAP_PLACES[m][0]), mz(MAP_PLACES[m][1]));
  if (G.targetPos) {
    c.fillStyle = '#ffd75e';
    c.beginPath(); c.arc(mx(G.targetPos.x), mz(G.targetPos.z), 8, 0, 7); c.fill();
    c.fillText('TARGET', mx(G.targetPos.x), mz(G.targetPos.z) - 14);
  }
  var px2 = G.inCar ? G.inCar.x : G.player.x, pz2 = G.inCar ? G.inCar.z : G.player.z;
  c.fillStyle = '#ffffff';
  c.beginPath(); c.arc(mx(px2), mz(pz2), 6, 0, 7); c.fill();
  c.fillText('YOU', mx(px2), mz(pz2) - 12);
}

// Mission menu (Tab): the whole chain with its states.
function renderMenu() {
  var html = '<h2>SYNDICATE JOBS</h2>';
  for (var i = 0; i < JOBS.length; i++) {
    var state = i < G.job || G.storyDone ? 'DONE' : (i === G.job ? 'ACTIVE' : 'LOCKED');
    var cls = state === 'DONE' ? 'done' : (state === 'ACTIVE' ? 'active' : 'locked');
    html += '<div class="jobrow ' + cls + '"><span>' + (i + 1) + '. ' + JOBS[i].title + '</span>' +
      '<span>' + fmt$(JOBS[i].pay) + ' · ' + state + '</span></div>';
  }
  html += '<p class="menuhint">WASD move · Mouse look · E enter/exit car · 1/2/3 weapons · Click shoot · ' +
    'Shift sprint · M map · , / . radio · Tab close</p>';
  el('menu-list').innerHTML = html;
}
