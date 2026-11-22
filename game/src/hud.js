// hud.js — everything drawn over the 3D world: the mission panel with its
// step and live distance, the police response panel naming every unit and
// its distance, money, the clock, wanted stars, the minimap (pre-rendered
// base, GPS route, flashing police blips, the player's arrow), the weapon
// bar, vehicle status, the radio row, prompts, subtitles, the bust meter,
// and the start, pause, busted and wasted screens.
(function () {
  'use strict';

  const CBS = (window.CBS = window.CBS || {});
  const U = CBS.util;

  const $ = (id) => document.getElementById(id);
  let els = null;
  let mapBase = null;
  let mapScale = null;
  const subQueue = [];
  let subUntil = 0;
  let subTimer = null;

  function init(city) {
    els = {
      hud: $('hud'), missionTitle: $('mission-title'), missionStep: $('mission-step'),
      missionDist: $('mission-dist'), missionTimer: $('mission-timer'),
      policePanel: $('police-panel'), policeRows: $('police-rows'),
      money: $('money'), clock: $('clock'), wanted: $('wanted'),
      minimap: $('minimap'), rankName: $('rank-name'), rankFill: $('rank-fill'),
      vehicle: $('vehicle-panel'), vehicleName: $('vehicle-name'),
      vehicleSpeed: $('vehicle-speed'), vehicleFill: $('vehicle-fill'),
      vehicleTyres: $('vehicle-tyres'),
      weapons: $('weapon-bar'), prompt: $('prompt'), subtitle: $('subtitle'),
      bustWrap: $('bust-wrap'), bustFill: $('bust-fill'),
      healthFill: $('health-fill'), armourFill: $('armour-fill'),
      radio: $('radio-row'), radioName: $('radio-name'),
      flash: $('flash-money'),
      start: $('start-screen'), pause: $('pause-screen'), end: $('end-screen'),
      endTitle: $('end-title'), endText: $('end-text'),
    };
    // Pre-render the minimap base once: the whole bay at a glance.
    mapBase = document.createElement('canvas');
    mapBase.width = 512;
    mapBase.height = 430;
    mapScale = CBS.city.drawMinimapBase(mapBase.getContext('2d'), 512, 430);
  }

  function subtitle(text) {
    subQueue.push(text);
  }

  function pumpSubtitles(now) {
    if (!els) return;
    if (now > subUntil && subQueue.length) {
      els.subtitle.textContent = subQueue.shift();
      els.subtitle.style.opacity = '1';
      subUntil = now + 4200;
      if (subTimer) clearTimeout(subTimer);
      subTimer = setTimeout(() => {
        if (els) els.subtitle.style.opacity = '0';
      }, 4200);
    }
  }

  let flashUntil = 0;
  function flashMoney(n) {
    els.flash.textContent = '+ ' + U.fmtMoney(n);
    els.flash.style.opacity = '1';
    flashUntil = performance.now() + 2400;
  }

  function drawMinimap(s) {
    const cv = els.minimap;
    const g = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    g.drawImage(mapBase, 0, 0, W, H);
    const px = (x) => ((x - CBS.city.MAP.minX) / (CBS.city.MAP.maxX - CBS.city.MAP.minX)) * W;
    const pz = (z) => ((z - CBS.city.MAP.minZ) / (CBS.city.MAP.maxZ - CBS.city.MAP.minZ)) * H;
    // GPS route: the gold thread through the bay.
    if (s.route && s.route.length > 1) {
      g.strokeStyle = '#ffc93c';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(px(s.player.x), pz(s.player.z));
      for (const p of s.route) g.lineTo(px(p.x), pz(p.z));
      g.stroke();
    }
    // Mission target: a pulsing gold ring.
    if (s.target) {
      const r = 5 + Math.sin(performance.now() * 0.006) * 1.6;
      g.strokeStyle = '#ffc93c';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(px(s.target.x), pz(s.target.z), r, 0, 6.29);
      g.stroke();
    }
    // Police blips flash red and blue, like the light bars they carry.
    const phase = Math.floor(performance.now() / 280) % 2;
    for (const b of s.blips || []) {
      g.fillStyle = b.kind === 'air' ? '#ffd24a' : phase ? '#ff3b30' : '#3b82f6';
      g.beginPath();
      g.arc(px(b.x), pz(b.z), b.kind === 'air' ? 3.6 : 3, 0, 6.29);
      g.fill();
    }
    // The player: a white arrow on the heading.
    g.save();
    g.translate(px(s.player.x), pz(s.player.z));
    g.rotate(headingAngle(s.player.heading));
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4, 5);
    g.lineTo(0, 2.6);
    g.lineTo(-4, 5);
    g.closePath();
    g.fill();
    g.restore();
  }

  // Minimap north is -z; a heading of 0 faces +z (down-map), PI faces north.
  function headingAngle(h) {
    return Math.PI - h;
  }

  function update(s) {
    if (!els) return;
    pumpSubtitles(performance.now());
    if (performance.now() > flashUntil) els.flash.style.opacity = '0';
    els.money.textContent = U.fmtMoney(s.money);
    els.clock.textContent = U.fmtClock(s.clockMin);
    // Wanted stars.
    let starsHtml = '';
    for (let i = 0; i < 5; i++) {
      starsHtml += '<span class="star' + (i < s.stars ? ' on' : '') + '">★</span>';
    }
    if (els.wanted._last !== starsHtml) {
      els.wanted.innerHTML = starsHtml;
      els.wanted._last = starsHtml;
    }
    els.wanted.style.opacity = s.stars > 0 ? '1' : '0.25';
    // Mission panel.
    if (s.mission) {
      els.missionTitle.textContent = s.mission.title;
      els.missionStep.textContent = s.mission.stepLabel;
      els.missionDist.textContent = s.mission.stepDist ? s.mission.stepDist + ' m' : '';
      els.missionTimer.textContent = s.mission.timed != null ? '⏱ ' + s.mission.timed + 's' : '';
      els.missionTimer.style.display = s.mission.timed != null ? 'inline' : 'none';
    }
    // Police response panel: only when the bay is answering.
    if (s.policeUnits && s.policeUnits.length) {
      els.policePanel.style.display = 'block';
      els.policeRows.innerHTML = s.policeUnits
        .map((u) => '<div class="prow"><span>' + u.name + '</span><b>' + Math.round(u.dist) + ' m</b></div>')
        .join('');
    } else {
      els.policePanel.style.display = 'none';
    }
    // Rank.
    const r = CBS.story.rank();
    els.rankName.textContent = r.name;
    els.rankFill.style.width = Math.round(r.progress * 100) + '%';
    // Vehicle panel vs weapon bar.
    els.vehicle.style.display = s.inCar ? 'block' : 'none';
    els.weapons.style.display = s.inCar ? 'none' : 'flex';
    if (s.inCar) {
      els.vehicleName.textContent = s.carName;
      els.vehicleSpeed.textContent = Math.round(s.speedKmh) + ' km/h';
      els.vehicleFill.style.width = Math.max(0, Math.round(s.carHealth)) + '%';
      els.vehicleFill.style.background = s.carHealth > 45 ? '#57d977' : s.carHealth > 20 ? '#ffb02e' : '#ff5040';
      els.vehicleTyres.style.display = s.tyres ? 'block' : 'none';
    } else if (s.weapon) {
      for (const slot of els.weapons.children) {
        const w = slot.dataset.weapon;
        slot.classList.toggle('active', w === s.weapon.id);
        const ammoEl = slot.querySelector('.ammo');
        if (ammoEl) ammoEl.textContent = w === 'fists' ? '—' : s.ammo[w] !== undefined ? s.ammo[w] : '';
      }
    }
    // Radio row.
    els.radio.style.display = s.inCar ? 'block' : 'none';
    if (s.inCar) els.radioName.textContent = s.stationName;
    // Health, armour, bust.
    els.healthFill.style.width = U.clamp(s.health, 0, 100) + '%';
    els.armourFill.style.width = U.clamp(s.armour, 0, 100) + '%';
    els.bustWrap.style.display = s.bust > 0.02 ? 'block' : 'none';
    els.bustFill.style.width = Math.round(s.bust * 100) + '%';
    // Prompt.
    if (els.prompt._last !== s.prompt) {
      els.prompt.textContent = s.prompt || '';
      els.prompt.style.opacity = s.prompt ? '1' : '0';
      els.prompt._last = s.prompt;
    }
    drawMinimap(s);
  }

  function showStart() { els.start.style.display = 'flex'; }
  function hideStart() { els.start.style.display = 'none'; els.hud.style.display = 'block'; }
  function showPause(on) { els.pause.style.display = on ? 'flex' : 'none'; }
  function showEnd(kind, text) {
    els.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    els.endTitle.style.color = kind === 'busted' ? '#6ea8ff' : '#ff5040';
    els.endText.textContent = text;
    els.end.style.display = 'flex';
  }
  function hideEnd() { els.end.style.display = 'none'; }

  CBS.hud = { init, update, subtitle, flashMoney, showStart, hideStart, showPause, showEnd, hideEnd };
})();
