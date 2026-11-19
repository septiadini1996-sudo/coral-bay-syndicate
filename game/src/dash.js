// dash.js — everything the player reads: the HUD (money, health,
// wanted stars, objective card, speedometer, interaction prompt, bust
// meter), the canvas minimap with its pre-rendered city, the 3D
// objective beacon, and the menu / pause / end screens. DOM lives in
// index.html; this module wires and refreshes it.

import { G, AVENUES, BLOCK_CENTRES } from './state.js';

const el = (id) => document.getElementById(id);
let ui = null;
let mapBase = null;

export function initDash(THREE, scene) {
  ui = {
    money: el('ui-money'), hp: el('ui-hp'), stars: el('ui-stars'),
    card: el('ui-card'), cardTitle: el('ui-card-title'), cardText: el('ui-card-text'),
    cardDist: el('ui-card-dist'), prompt: el('ui-prompt'),
    speedo: el('ui-speedo'), speedVal: el('ui-speed-val'), carName: el('ui-car-name'),
    notice: el('ui-notice'), bust: el('ui-bust'), bustFill: el('ui-bust-fill'),
    map: el('ui-map'), screens: {
      menu: el('scr-menu'), pause: el('scr-pause'), over: el('scr-over'),
    },
    overTitle: el('over-title'), overSub: el('over-sub'),
    menuMoney: el('menu-money'),
  };
  // objective beacon: a soft pillar of gold light at the target
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.6, 42, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffc94d, transparent: true, opacity: 0.30,
      side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    }));
  beacon.visible = false;
  scene.add(beacon);
  ui.beacon = beacon;
  prerenderMap();
  return ui;
}

function prerenderMap() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 360;
  const ctx = cv.getContext('2d');
  const S = 360 / 340, ox = 180, oz = 180;
  const X = (x) => ox + x * S, Z = (z) => oz + z * S;
  ctx.fillStyle = '#1d7186'; ctx.fillRect(0, 0, 360, 360);
  ctx.fillStyle = '#e9d09c';
  ctx.fillRect(X(-156), Z(-156), 352 * S, 312 * S);
  ctx.fillStyle = '#8f9599';
  ctx.fillRect(X(-140), Z(-140), 280 * S, 280 * S);
  ctx.fillStyle = '#79a85b';
  for (const cx of BLOCK_CENTRES) for (const cz of BLOCK_CENTRES) {
    if (cz === -96 || (cx === 0 && cz === 48)) ctx.fillRect(X(cx - 15), Z(cz - 15), 30 * S, 30 * S);
  }
  ctx.strokeStyle = '#33373b'; ctx.lineWidth = 12 * S;
  for (const a of AVENUES) {
    ctx.beginPath(); ctx.moveTo(X(a), Z(-140)); ctx.lineTo(X(a), Z(140)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(-140), Z(a)); ctx.lineTo(X(140), Z(a)); ctx.stroke();
  }
  mapBase = cv;
}

function drawMap() {
  const cv = ui.map;
  const ctx = cv.getContext('2d');
  const S = cv.width / 340, ox = cv.width / 2, oz = cv.height / 2;
  const X = (x) => ox + x * S, Z = (z) => oz + z * S;
  ctx.drawImage(mapBase, 0, 0, cv.width, cv.height);
  const hp = G.driveCar ? G.driveCar.g.position : G.hero.g.position;
  // objective: a pulsing gold ring
  if (G.objective) {
    const pulse = 4 + Math.sin(G.wall * 5) * 1.4;
    ctx.strokeStyle = '#ffc94d'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(X(G.objective.x), Z(G.objective.z), pulse + 3, 0, 6.29); ctx.stroke();
    ctx.fillStyle = '#ffc94d';
    ctx.beginPath(); ctx.arc(X(G.objective.x), Z(G.objective.z), 3, 0, 6.29); ctx.fill();
  }
  // police: alternating red/blue dots
  for (const cop of G.cops) {
    ctx.fillStyle = (G.wall * 2 + cop.car.id) % 2 < 1 ? '#ff4040' : '#4080ff';
    ctx.beginPath(); ctx.arc(X(cop.car.g.position.x), Z(cop.car.g.position.z), 3.2, 0, 6.29); ctx.fill();
  }
  // the player: a white arrow on the facing
  const head = G.driveCar ? G.driveCar.head : G.hero.g.rotation.y;
  ctx.save();
  ctx.translate(X(hp.x), Z(hp.z));
  ctx.rotate(Math.atan2(Math.sin(head), -Math.cos(head)));
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(-4.4, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

export function showScreen(name) {
  for (const [k, s] of Object.entries(ui.screens)) {
    s.style.display = k === name ? 'flex' : 'none';
  }
  if (name === 'over') {
    ui.overTitle.textContent = G.overWhy === 'busted' ? 'BUSTED' : 'WASTED';
    ui.overTitle.style.color = G.overWhy === 'busted' ? '#7fb2ff' : '#ff5a5a';
    ui.overSub.textContent = G.overWhy === 'busted'
      ? 'The Coral Bay PD impounds your ride and fines you $150.'
      : 'You wake up at Coral Bay General. The bill is $150.';
  }
  if (name === 'menu' && ui.menuMoney) {
    ui.menuMoney.textContent = `Banked: $${G.save.money} · Jobs done: ${G.save.jobsDone}`;
  }
}

export function updateDash() {
  if (!ui) return;
  ui.money.textContent = `$${G.save.money}`;
  ui.hp.style.width = `${Math.max(0, G.hero.hp)}%`;
  ui.hp.style.background = G.hero.hp > 30 ? '#7ddb6a' : '#ff5a5a';
  const st = G.wanted.stars;
  ui.stars.textContent = '★★★★★'.slice(0, st) + '☆☆☆☆☆'.slice(0, 5 - st);
  ui.stars.style.opacity = st > 0 ? 1 : 0.25;
  const ob = G.objective;
  if (ob) {
    ui.card.style.display = 'block';
    ui.cardTitle.textContent = ob.title;
    ui.cardText.textContent = ob.text;
    const dist = ob.dist !== undefined ? `${Math.round(ob.dist)} m` : '';
    const timer = ob.timer !== null && ob.timer !== undefined
      ? ` · ${Math.floor(ob.timer / 60)}:${String(Math.floor(ob.timer % 60)).padStart(2, '0')}` : '';
    ui.cardDist.textContent = dist + timer;
    ui.beacon.visible = true;
    ui.beacon.position.set(ob.x, 21, ob.z);
    ui.beacon.material.opacity = 0.22 + Math.sin(G.wall * 4) * 0.08;
  } else {
    ui.card.style.display = 'none';
    ui.beacon.visible = false;
  }
  ui.prompt.textContent = G.prompt || '';
  if (G.driveCar) {
    ui.speedo.style.display = 'block';
    ui.speedVal.textContent = `${Math.round(Math.abs(G.driveCar.speed) * 3.6)}`;
    ui.carName.textContent = G.driveCar.marked ? 'Comet GT — HOT' : '';
  } else {
    ui.speedo.style.display = 'none';
  }
  if (G.notice && G.time < G.noticeT) {
    ui.notice.style.display = 'block';
    ui.notice.innerHTML = G.notice.replace(/\n/g, '<br>');
  } else ui.notice.style.display = 'none';
  if (G.bust > 0.02 && G.wanted.stars > 0) {
    ui.bust.style.display = 'block';
    ui.bustFill.style.width = `${G.bust * 100}%`;
  } else ui.bust.style.display = 'none';
  drawMap();
}
