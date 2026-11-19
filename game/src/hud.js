// hud.js — everything drawn over the canvas: the pre-rendered real map
// minimap, wanted stars, cash, objective line, the context prompt, dialogs,
// toasts, the busted meter and the menu/pause/busted screens. The prompt and
// the E key share one resolver, so the game can never promise an action that
// is not actually there.
import { G, clamp, d2 } from './defs.js';
import { paintGround } from './city.js';
import { playerPos, enterVehicle, exitVehicle } from './folks.js';
import { currentInteract } from './story.js';
import { crime } from './cops.js';

const el = {};
let mapBase = null, mapCtx = null;
let toastT = 0;

export function initHud() {
  for (const id of ['map', 'stars', 'cash', 'objective', 'prompt', 'dialog', 'dlgWho', 'dlgText', 'toast', 'cross', 'bustWrap', 'bustFill', 'menu', 'pauseScr', 'bustedScr', 'bustedFine', 'continueBtn', 'vig'])
    el[id] = document.getElementById(id);
  mapCtx = el.map.getContext('2d');
  mapBase = document.createElement('canvas');
  mapBase.width = mapBase.height = 512;
  paintGround(mapBase.getContext('2d'), 512);
  G.hooks.toast = (msg) => {
    el.toast.textContent = msg;
    el.toast.style.opacity = '1';
    toastT = 3.4;
  };
}

// The one interaction resolver: prompt text and the E key both come from
// here, in priority order — dialog, exit vehicle, enter vehicle, story/job.
export function resolveInteract() {
  const story = currentInteract();
  if (G.dialog) return story;
  const P = G.player;
  if (P.vehicle) return { label: `Exit the ${P.vehicle.stats.label}`, act: () => exitVehicle() };
  const pp = playerPos();
  let best = null, bestD = 3.6;
  for (const v of G.vehicles) {
    if (v.driver === 'cop' || v.dead) continue;
    const dd = d2(pp.x, pp.z, v.group.position.x, v.group.position.z) - v.radius;
    if (dd < bestD) { bestD = dd; best = v; }
  }
  if (best) {
    const v = best;
    return {
      label: v.everStolen ? `Drive the ${v.stats.label}` : `Steal the ${v.stats.label}`,
      act: () => {
        const firstTake = !v.everStolen;
        enterVehicle(v);
        v.everStolen = true;
        G.stats.stolen++;
        if (firstTake) crime.steal(v);
      },
    };
  }
  return story;
}

function drawMap() {
  const pp = playerPos();
  const S = 176, R = 62; // canvas px, view half-range in metres
  const cx = (pp.x + 256), cy = (pp.z + 256); // base canvas is 512 over [-256,256]
  mapCtx.clearRect(0, 0, S, S);
  mapCtx.drawImage(mapBase, cx - R, cy - R, R * 2, R * 2, 0, 0, S, S);
  const px = (wx) => S / 2 + (wx - pp.x) * (S / (R * 2));
  const pz = (wz) => S / 2 + (wz - pp.z) * (S / (R * 2));
  // Other traffic: pale dots. Police: flashing blue/red.
  for (const v of G.vehicles) {
    const x = px(v.group.position.x), y = pz(v.group.position.z);
    if (x < -4 || y < -4 || x > S + 4 || y > S + 4) continue;
    if (v.driver === 'cop' || v.type === 'police') {
      mapCtx.fillStyle = (G.time * 5 + v.id) % 2 < 1 ? '#3b82f6' : '#ef4444';
      mapCtx.fillRect(x - 2.5, y - 2.5, 5, 5);
    } else if (v.driver !== 'player') {
      mapCtx.fillStyle = 'rgba(255,255,255,0.75)';
      mapCtx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }
  // Objective: pulsing gold diamond (clamped to the rim when far).
  if (G.objective) {
    let x = px(G.objective.x), y = pz(G.objective.z);
    const dx = x - S / 2, dy = y - S / 2, m = Math.hypot(dx, dy), max = S / 2 - 9;
    if (m > max) { x = S / 2 + (dx / m) * max; y = S / 2 + (dy / m) * max; }
    const s = 5 + Math.sin(G.time * 5) * 1.4;
    mapCtx.fillStyle = '#ffc93c';
    mapCtx.beginPath();
    mapCtx.moveTo(x, y - s); mapCtx.lineTo(x + s, y); mapCtx.lineTo(x, y + s); mapCtx.lineTo(x - s, y);
    mapCtx.closePath(); mapCtx.fill();
  }
  // Player arrow.
  const h = G.player.vehicle ? G.player.vehicle.heading : G.player.heading;
  const fx = Math.sin(h), fz = Math.cos(h);
  mapCtx.fillStyle = '#ffffff';
  mapCtx.strokeStyle = '#12303f'; mapCtx.lineWidth = 1.5;
  mapCtx.beginPath();
  mapCtx.moveTo(S / 2 + fx * 8, S / 2 + fz * 8);
  mapCtx.lineTo(S / 2 - fz * 5 - fx * 4, S / 2 + fx * 5 - fz * 4);
  mapCtx.lineTo(S / 2 + fz * 5 - fx * 4, S / 2 - fx * 5 - fz * 4);
  mapCtx.closePath(); mapCtx.fill(); mapCtx.stroke();
}

export function updateHud() {
  drawMap();
  el.stars.textContent = G.wanted > 0 ? '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted) : '';
  el.stars.style.color = G.wanted >= 4 ? '#ff5147' : '#ffc93c';
  el.cash.textContent = '$' + G.cash.toLocaleString('en-US');
  if (G.objective) {
    const pp = playerPos();
    const dist = Math.round(d2(pp.x, pp.z, G.objective.x, G.objective.z));
    el.objective.textContent = `${G.objective.label} · ${dist}m`;
    el.objective.style.opacity = '1';
  } else el.objective.style.opacity = '0';
  const it = G.mode === 'play' || G.mode === 'dialog' ? resolveInteract() : null;
  if (it && !G.dialog) { el.prompt.textContent = `E — ${it.label}`; el.prompt.style.opacity = '1'; }
  else if (G.dialog) { el.prompt.textContent = 'E — Continue'; el.prompt.style.opacity = '1'; }
  else el.prompt.style.opacity = '0';
  if (G.dialog) {
    const line = G.dialog.lines[G.dialog.idx];
    el.dialog.style.display = 'block';
    el.dlgWho.textContent = line.who;
    el.dlgText.textContent = line.text;
  } else el.dialog.style.display = 'none';
  el.cross.style.opacity = G.armed && G.mode === 'play' && !G.player.vehicle ? '1' : '0';
  const bm = G.bustMeter ?? 0;
  el.bustWrap.style.opacity = bm > 0.05 ? '1' : '0';
  el.bustFill.style.width = `${clamp(bm / 2.1 * 100, 0, 100)}%`;
  if (toastT > 0) { toastT -= G.dt; if (toastT <= 0) el.toast.style.opacity = '0'; }
  el.vig.style.opacity = G.wanted >= 3 && G.mode === 'play' ? String(0.25 + Math.sin(G.time * 4) * 0.08) : '0';
}

export function showScreen(name) {
  el.menu.style.display = name === 'menu' ? 'flex' : 'none';
  el.pauseScr.style.display = name === 'pause' ? 'flex' : 'none';
  el.bustedScr.style.display = name === 'busted' ? 'flex' : 'none';
  if (name === 'busted') el.bustedFine.textContent = `Fine paid: $${G.bustedFine ?? 0}. Your wheels were impounded — Celia sends her regards.`;
  if (name === 'menu') el.continueBtn.style.display = G.hasSave ? 'block' : 'none';
}
export function hudEls() { return el; }
