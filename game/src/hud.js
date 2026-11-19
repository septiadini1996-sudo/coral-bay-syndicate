// The HUD for Coral Bay Syndicate: money, health, wanted stars, the mission
// objective card, timers, prompts, toasts and banners — plus the circular
// minimap, painted each frame on a 2D canvas over a pre-rendered street map:
// roads and water static, the player, police, traffic and the objective live.
import { STREET_LINES, BLOCK_CENTERS, WATER_Z, LANDMARKS } from './city.js';

const $ = (id) => document.getElementById(id);

export function createHUD() {
  const els = {
    hud: $('hud'), money: $('money'), health: $('healthbar'), wanted: $('wanted'),
    objective: $('objective'), objTitle: document.querySelector('#objective .obj-title'),
    objText: document.querySelector('#objective .obj-text'), objDist: document.querySelector('#objective .obj-dist'),
    timer: $('timer'), prompt: $('prompt'), toast: $('toast'), banner: $('banner'),
    vehiclebox: $('vehiclebox'), vehiclename: $('vehiclename'), speed: $('speed'),
    vignette: $('vignette'), crosshair: $('crosshair'),
    minimap: $('minimap').getContext('2d'),
  };
  let toastTimer = 0, bannerTimer = 0, lastStars = -1;

  // Pre-render the static map once: sea, sand, blocks, roads.
  const mapBase = document.createElement('canvas');
  mapBase.width = mapBase.height = 188;
  const S = 188 / 470; // world units -> px
  const px = (x) => 94 + x * S, pz = (z) => 94 + z * S;
  {
    const g = mapBase.getContext('2d');
    g.fillStyle = '#1d6f8c'; g.fillRect(0, 0, 188, 188);
    g.fillStyle = '#8f9a7d'; g.fillRect(0, 0, 188, pz(WATER_Z - 4));
    g.fillStyle = '#eed49e'; g.fillRect(0, pz(196), 188, pz(228) - pz(196));
    g.fillStyle = '#7c8a68';
    for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) g.fillRect(px(bx - 21), pz(bz - 21), 42 * S, 42 * S);
    g.strokeStyle = '#3d4148'; g.lineWidth = 15 * S; g.lineCap = 'round';
    for (const l of STREET_LINES) {
      g.beginPath(); g.moveTo(px(l), 0); g.lineTo(px(l), 188); g.stroke();
      g.beginPath(); g.moveTo(0, pz(l)); g.lineTo(188, pz(l)); g.stroke();
    }
    g.fillStyle = '#59c2b8';
    g.fillRect(px(LANDMARKS.hospital.x) - 3, pz(LANDMARKS.hospital.z) - 3, 6, 6);
  }

  const hud = {
    els,
    show() { els.hud.classList.remove('hidden'); },
    hide() { els.hud.classList.add('hidden'); },
    setMoney(n) { els.money.textContent = '$' + Math.max(0, Math.floor(n)).toLocaleString('en-US'); },
    setHealth(n) { els.health.style.width = Math.max(0, n) + '%'; },
    setWanted(stars) {
      if (stars === lastStars) return;
      lastStars = stars;
      let html = '';
      for (let i = 0; i < 5; i++) html += `<span class="${i < stars ? '' : 'off'}">★</span>`;
      els.wanted.innerHTML = html;
    },
    setObjective(title, text, dist) {
      if (!title) { els.objective.classList.add('hidden'); return; }
      els.objective.classList.remove('hidden');
      els.objTitle.textContent = title;
      els.objText.textContent = text;
      els.objDist.textContent = dist === null || dist === undefined ? '' : `${Math.round(dist)} m`;
    },
    setTimer(sec) {
      if (sec === null || sec === undefined) { els.timer.classList.add('hidden'); return; }
      els.timer.classList.remove('hidden');
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      els.timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
      els.timer.style.color = sec < 12 ? '#ff8080' : '#aef3ff';
    },
    prompt(key, text) {
      if (!text) { els.prompt.classList.add('hidden'); return; }
      els.prompt.classList.remove('hidden');
      els.prompt.innerHTML = key ? `<b>${key}</b>${text}` : text;
    },
    toast(msg, secs = 3.4) {
      els.toast.textContent = msg;
      els.toast.style.opacity = 1;
      toastTimer = secs;
    },
    banner(big, sub, secs = 2.6) {
      els.banner.querySelector('.big').textContent = big;
      els.banner.querySelector('.sub').textContent = sub ?? '';
      els.banner.style.opacity = 1;
      bannerTimer = secs;
    },
    setVehicle(name, kmh) {
      if (!name) { els.vehiclebox.classList.add('hidden'); return; }
      els.vehiclebox.classList.remove('hidden');
      els.vehiclename.textContent = name;
      els.speed.innerHTML = `${Math.round(kmh)} <small>KM/H</small>`;
    },
    damageFlash(strength) {
      els.vignette.style.boxShadow = `inset 0 0 140px rgba(255,0,40,${strength})`;
      setTimeout(() => { els.vignette.style.boxShadow = 'inset 0 0 140px rgba(255,0,40,0)'; }, 130);
    },
    update(dt) {
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) els.toast.style.opacity = 0; }
      if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) els.banner.style.opacity = 0; }
    },
    drawMinimap(G) {
      const g = els.minimap;
      g.clearRect(0, 0, 188, 188);
      g.drawImage(mapBase, 0, 0);
      const dot = (x, z, color, r) => {
        const dx = px(x), dy = pz(z);
        if (dx < -4 || dx > 192 || dy < -4 || dy > 192) return;
        g.fillStyle = color; g.beginPath(); g.arc(dx, dy, r, 0, 7); g.fill();
      };
      for (const v of G.traffic.cars) if (v.driver === 'traffic') dot(v.group.position.x, v.group.position.z, 'rgba(230,230,230,0.8)', 2);
      const o = G.missions.objective;
      if (o) {
        const pulse = 3.4 + Math.sin(G.time * 5) * 1.1;
        dot(o.x, o.z, '#ffd23e', pulse);
        g.strokeStyle = '#ffd23e'; g.beginPath(); g.arc(px(o.x), pz(o.z), pulse + 2.5, 0, 7); g.stroke();
      }
      const flash = Math.floor(G.time * 4) % 2 === 0;
      for (const u of G.police.units) dot(u.vehicle.x, u.vehicle.z, flash ? '#3e8eff' : '#ff4040', 3);
      // The player: a white arrow headed the way they face (canvas y is world z,
      // so the canvas rotation is the negative of the world heading).
      const a = G.player.mode === 'car' ? G.player.car.heading : G.player.heading;
      g.save();
      g.translate(px(G.player.x), pz(G.player.z));
      g.rotate(-a);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(0, 6); g.lineTo(-4, -4.6); g.lineTo(0, -2.4); g.lineTo(4, -4.6); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.65)'; g.stroke();
      g.restore();
    },
  };
  return hud;
}
