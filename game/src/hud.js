// hud.js — everything drawn over the 3D view: the minimap (pre-rendered base,
// GPS route, blinking police blips, player arrow), the weapon bar, mission
// and police-response panels, vehicle status, the radio row, subtitles,
// notifications, the bust meter and the damage flash.

'use strict';

const el = id => document.getElementById(id);
let mapBase = null, lastHudSig = '';

function prerenderMap() {
  const S = 480, world = 470, k = S / world, ox = S / 2, oz = S / 2;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  const X = x => ox + x * k, Z = z => oz + z * k;
  g.fillStyle = '#2d6a8a'; g.fillRect(0, 0, S, S);                       // sea
  g.fillStyle = '#77915c'; g.fillRect(0, 0, S, Z(158));                  // land
  g.fillStyle = '#d9bf95'; g.fillRect(0, Z(136), S, Z(158) - Z(136));    // beach
  g.fillStyle = '#8f9296'; g.fillRect(X(-212), Z(-184), X(212) - X(-212), Z(136) - Z(-184));
  g.strokeStyle = '#3c3f45'; g.lineCap = 'round';
  for (const x of ROAD_VX) { g.lineWidth = ROAD_W * k; g.beginPath(); g.moveTo(X(x), Z(-178)); g.lineTo(X(x), Z(134)); g.stroke(); }
  for (const z of [...ROAD_HZ, COAST_Z]) { g.lineWidth = ROAD_W * k; g.beginPath(); g.moveTo(X(-206), Z(z)); g.lineTo(X(206), Z(z)); g.stroke(); }
  g.fillStyle = '#7a5c38'; g.fillRect(X(146), Z(138), X(200) - X(146), Z(180) - Z(138));
  mapBase = c;
}

W.notify = function (text) {
  const box = el('notify');
  if (!box) return;
  const d = document.createElement('div');
  d.className = 'note'; d.textContent = text;
  box.appendChild(d);
  if (text.startsWith('+$')) playCash();
  setTimeout(() => { d.classList.add('fade'); }, 3400);
  setTimeout(() => { d.remove(); }, 4100);
  while (box.children.length > 4) box.children[0].remove();
};

function flashDamage() {
  const f = el('dmg');
  if (f) { f.style.opacity = '0.5'; f.dataset.t = '0.5'; }
}

function fmtClock() {
  const m = Math.floor(W.clockMin) % (24 * 60);
  const hh = String(Math.floor(m / 60)).padStart(2, '0'), mm = String(m % 60).padStart(2, '0');
  return hh + ':' + mm;
}

function drawMinimap() {
  const cv = el('minimap'); if (!cv || !mapBase) return;
  const g = cv.getContext('2d'), S = cv.width;
  const p = W.player, range = 150, k = S / range;
  const px = p.car ? p.car.x : p.x, pz = p.car ? p.car.z : p.z;
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.clip();
  const bw = 480, wk = bw / 470;
  const sx = (px + 235) * wk - (range / 2) * wk, sz = (pz + 235) * wk - (range / 2) * wk;
  g.drawImage(mapBase, sx, sz, range * wk, range * wk, 0, 0, S, S);
  const MX = x => S / 2 + (x - px) * k, MZ = z => S / 2 + (z - pz) * k;
  // GPS route to the current target.
  if (W.gps) {
    const from = nearestNode(W.graph, px, pz), to = nearestNode(W.graph, W.gps.x, W.gps.z);
    const route = findRoute(W.graph, from, to);
    if (route) {
      g.strokeStyle = '#ffc93f'; g.lineWidth = 3; g.beginPath();
      g.moveTo(S / 2, S / 2);
      for (const ni of route) g.lineTo(MX(W.graph[ni].x), MZ(W.graph[ni].z));
      g.lineTo(MX(W.gps.x), MZ(W.gps.z));
      g.stroke();
    }
    g.fillStyle = '#ffc93f';
    g.beginPath(); g.arc(MX(W.gps.x), MZ(W.gps.z), 5, 0, 7); g.fill();
    g.strokeStyle = '#7a5200'; g.lineWidth = 1.5; g.stroke();
  }
  // Police blips blink red/blue, like the light bars.
  const blink = Math.floor(W.time * 2.2) % 2 === 0;
  for (const car of W.cops) {
    if (dist(px, pz, car.x, car.z) > range * 0.72) continue;
    g.fillStyle = blink ? '#ff3b30' : '#2e7dff';
    g.beginPath(); g.arc(MX(car.x), MZ(car.z), 4, 0, 7); g.fill();
  }
  if (W.heli && W.heli.active) {
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(MX(W.heli.x), MZ(W.heli.z), 3.5, 0, 7); g.fill();
  }
  // The player arrow, turned to the facing.
  const h = p.car ? p.car.h : p.yaw;
  g.translate(S / 2, S / 2); g.rotate(-h + Math.PI);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 2.6); g.lineTo(-5.5, 6); g.closePath(); g.fill();
  g.strokeStyle = '#14406b'; g.lineWidth = 1.6; g.stroke();
  g.restore();
}

function updateHUD(dt) {
  const p = W.player;
  if (!p) return;
  W.clockMin += dt * 1.1;
  el('money').textContent = '$' + Math.floor(W.money).toLocaleString();
  el('clock').textContent = fmtClock();
  const st = stars();
  el('stars').innerHTML = '★★★★★'.slice(0, st) + '<span class="dim">' + '★★★★★'.slice(0, 5 - st) + '</span>';
  el('stars').style.opacity = st > 0 ? '1' : '0.35';
  const rk = rankFor(W.earned);
  el('rankName').textContent = rk.name + (rk.next ? ' → ' + rk.next.name : ' — max');
  el('rankFill').style.width = Math.round(rk.frac * 100) + '%';
  el('healthFill').style.width = clamp(p.hp, 0, 100) + '%';
  el('armorFill').style.width = clamp(p.armor, 0, 100) + '%';

  // Weapon bar: rebuild only when something actually changed.
  const sig = p.weapons.map(w => (w.have ? 1 : 0) + ':' + (w.ammo === Infinity ? 'i' : w.ammo)).join('|') + '#' + p.weapon + (p.car ? 'c' : 'f');
  if (sig !== lastHudSig) {
    lastHudSig = sig;
    const bar = el('weapons');
    bar.innerHTML = '';
    p.weapons.forEach((w, i) => {
      const d = document.createElement('div');
      d.className = 'wslot' + (i === p.weapon ? ' on' : '') + (w.have ? '' : ' locked');
      d.innerHTML = '<b>' + (i + 1) + '</b> ' + w.name + '<span>' + (w.name === 'Fists' ? '—' : w.have ? w.ammo : '🔒') + '</span>';
      bar.appendChild(d);
    });
  }
  el('weapons').style.display = p.car ? 'none' : 'flex';

  // Mission panel.
  const mt = el('missionTitle'), ms = el('missionStep');
  if (W.mission) {
    mt.textContent = '◆ ' + STORY[W.mission.idx].title;
    ms.textContent = W.missionStepLabel || '';
  } else if (W.sideJob) {
    mt.textContent = '◆ ' + SIDE_TEXT.courier.title;
    ms.textContent = W.missionStepLabel || '';
  } else if (W.missionIndex < STORY.length) {
    mt.textContent = '◇ ' + STORY[W.missionIndex].title + ' — see Vera at the marina';
    ms.textContent = STORY[W.missionIndex].brief;
  } else {
    mt.textContent = '◇ Free roam — side work pays at the courier desk & Chop Shop';
    ms.textContent = '';
  }
  if (W.gps) {
    const d = Math.round(dist(p.car ? p.car.x : p.x, p.car ? p.car.z : p.z, W.gps.x, W.gps.z));
    el('missionDist').textContent = d + ' m';
  } else el('missionDist').textContent = '';

  // Police response panel: named units with live distances.
  const panel = el('police');
  const rows = [];
  const px = p.car ? p.car.x : p.x, pz = p.car ? p.car.z : p.z;
  for (const car of W.cops) rows.push([car.unit || 'Unit', Math.round(dist(px, pz, car.x, car.z))]);
  if (W.heli && W.heli.active) rows.push([W.heli.unit, Math.round(dist(px, pz, W.heli.x, W.heli.z))]);
  rows.sort((a, b) => a[1] - b[1]);
  if (rows.length && (W.heat > 0 || W.shot)) {
    panel.style.display = 'block';
    el('policeRows').innerHTML = rows.slice(0, 6).map(r =>
      '<div class="prow"><span>' + r[0] + '</span><b>' + r[1] + ' m</b></div>').join('') +
      (rows.length > 6 ? '<div class="prow"><span>+' + (rows.length - 6) + ' more units</span><b></b></div>' : '');
  } else panel.style.display = 'none';

  // Vehicle panel and radio row.
  const inCar = !!p.car;
  el('vehicle').style.display = inCar ? 'block' : 'none';
  el('radioRow').style.display = inCar ? 'block' : 'none';
  if (inCar) {
    el('vehName').textContent = (p.car.kind === 'police' ? 'CBPD Cruiser' : p.car.kind[0].toUpperCase() + p.car.kind.slice(1)) + (p.car.spiked ? ' — TYRES SHREDDED' : '');
    el('vehSpeed').textContent = Math.round(Math.abs(p.car.speed) * 3.6) + ' km/h';
    el('vehHealth').style.width = clamp(p.car.hp, 0, 100) + '%';
    el('radioStation').textContent = (W.radioOn() ? '♪ ' : '✕ ') + W.stationName();
  }

  // Prompt line: mission prompts win, then car prompts.
  let prompt = W.prompt || '';
  if (!prompt && !p.car) {
    const car = nearestEnterableCar();
    if (car) prompt = 'Press E — take the ' + (car.kind === 'police' ? 'police cruiser' : car.kind);
  }
  if (!prompt && p.car) prompt = 'E exit · R radio · Space handbrake';
  el('prompt').textContent = prompt;

  // Subtitle dialogue.
  const sub = el('subtitle');
  if (W.dialogue && W.dialogue.length) {
    const d = W.dialogue[0];
    sub.style.display = 'block';
    sub.innerHTML = '<b>' + d.who + ':</b> ' + d.text;
  } else sub.style.display = 'none';

  // Bust meter and damage flash.
  el('bustWrap').style.display = W.bust > 0.02 ? 'block' : 'none';
  el('bustFill').style.width = Math.round(W.bust * 100) + '%';
  const f = el('dmg');
  if (f && f.dataset.t) {
    f.dataset.t = String(Math.max(0, parseFloat(f.dataset.t) - dt * 1.4));
    f.style.opacity = f.dataset.t;
  }
  el('crosshair').style.display = (!p.car && (W.aiming || W.firing) && W.started) ? 'block' : 'none';
  drawMinimap();
}
