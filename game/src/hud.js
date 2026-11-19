// hud.js — everything on top of the 3D view: the circular minimap (drawn from
// the same painted ground canvas as the world, so it is the real map), cash,
// wanted stars, health, objectives, banners, toasts, menus and result cards.
"use strict";

let mmCtx = null, toastTimer = 0, bannerTimer = 0, hurtT = 0, lastDistrict = "";

function hudInit() {
  mmCtx = el("minimap").getContext("2d");
  el("btn-new").addEventListener("click", () => { sfxInit(); sfxClick(); startNewGame(); });
  el("btn-continue").addEventListener("click", () => { sfxInit(); sfxClick(); continueGame(); });
  el("btn-resume").addEventListener("click", () => { sfxClick(); togglePause(false); });
  el("btn-restart").addEventListener("click", () => { sfxClick(); restartAtSafehouse(); });
  el("btn-quit").addEventListener("click", () => { sfxClick(); quitToTitle(); });
  el("btn-card").addEventListener("click", () => { sfxClick(); hideCard(); });
  for (const id of ["btn-help1", "btn-help2"]) el(id).addEventListener("click", () => { sfxClick(); el("menu-help").style.display = "flex"; });
  el("btn-help-close").addEventListener("click", () => { sfxClick(); el("menu-help").style.display = "none"; });
  el("btn-mute").addEventListener("click", () => {
    G.muted = !G.muted;
    if (Sfx.master) Sfx.master.gain.value = G.muted ? 0 : 0.55;
    el("btn-mute").textContent = G.muted ? "🔇" : "🔊";
  });
  el("minimap").addEventListener("click", () => { if (G.mode === "play") toggleBigMap(true); });
  el("btn-map").addEventListener("click", () => { sfxClick(); if (G.mode === "play" || G.mode === "map") toggleBigMap(); });
  el("btn-missions").addEventListener("click", () => { sfxClick(); if (G.mode === "play" || G.mode === "missions") toggleMissions(); });
  el("bigmap").addEventListener("click", () => { if (G.mode === "map") toggleBigMap(false); });
  el("btn-missions-close").addEventListener("click", () => { sfxClick(); toggleMissions(false); });
  buildTokoh();
}

// The pause menu's TOKOH panel: the four faces of the Syndicate.
function buildTokoh() {
  const wrap = el("tokoh-list");
  if (!wrap || wrap.children.length) return;
  for (const key of ["rico", "celia", "marco", "don"]) {
    const ch = CHARACTERS[key];
    const fig = document.createElement("div");
    fig.className = "tokoh-item";
    const cv = document.createElement("canvas");
    cv.width = 96; cv.height = 96; cv.className = "tokoh-face";
    fig.appendChild(cv);
    const nm = document.createElement("div"); nm.className = "tokoh-name"; nm.textContent = ch.name; fig.appendChild(nm);
    const rl = document.createElement("div"); rl.className = "tokoh-role"; rl.textContent = ch.role; fig.appendChild(rl);
    wrap.appendChild(fig);
    drawPortrait(cv, key);
  }
}

function showToast(text, dur) {
  const t = el("toast");
  t.textContent = text; t.style.opacity = "1";
  toastTimer = dur || 3.4;
}
function showBanner(title, text, dur) {
  el("banner-title").textContent = title;
  el("banner-text").textContent = text;
  el("banner").style.opacity = "1";
  el("banner").style.transform = "translate(-50%, 0)";
  bannerTimer = dur || 5;
}
function setObjective(text, x, z, timer) {
  const box = el("objective");
  if (!text) { box.style.display = "none"; G.objTimer = null; return; }
  box.style.display = "block";
  el("obj-text").textContent = text;
  if (x !== undefined && x !== null) G.objectivePos = { x, z };
  G.objTimer = (timer === undefined ? null : timer);
}
function setInteract(text) {
  const i = el("interact");
  if (!text) { i.style.display = "none"; return; }
  i.style.display = "block"; i.textContent = text;
}
function setBustUI(v) {
  const w = el("bust-wrap");
  if (v <= 0.02) { w.style.display = "none"; return; }
  w.style.display = "block";
  el("bust-fill").style.width = Math.round(v * 100) + "%";
}
function showHurt() { hurtT = 0.55; }

function updateHUD() {
  el("cash").textContent = fmtCash(G.cash);
  let stars = "";
  for (let i = 0; i < 5; i++) stars += i < G.wanted ? "★" : "☆";
  const st = el("stars");
  st.textContent = stars;
  st.style.color = G.wanted > 0 ? "#ffcf3f" : "rgba(255,255,255,0.35)";
  el("healthfill").style.width = clamp(G.health, 0, 100) + "%";
  el("healthfill").style.background = G.health > 35 ? "#58d06a" : "#e84a3c";
  const wname = { fists: "Fists", bat: "Baseball bat", pipe: "Lead pipe", pistol: "Pistol" }[G.weapon];
  el("weapon").textContent = G.weapon === "pistol" ? wname + " · " + G.ammo : wname;
  const driving = !G.onFoot && G.vehicle;
  el("speedo").style.display = driving ? "block" : "none";
  if (driving) {
    el("speed-val").textContent = Math.round(Math.abs(G.vehicle.speed) * 3.1);
    el("speed-name").textContent = G.vehicle.name + (G.vehicle.kind === "heli" ? " · alt " + Math.round(G.vehicle.alt) + "m" : "");
  }
  if (G.objectivePos) {
    const f = focusPoint();
    el("obj-dist").textContent = Math.round(dist2d(f.x, f.z, G.objectivePos.x, G.objectivePos.z)) + "m";
  } else el("obj-dist").textContent = "";
  if (G.objTimer !== null && G.objTimer !== undefined) {
    const t = Math.max(0, Math.ceil(G.objTimer));
    el("obj-timer").textContent = "⏱ " + Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
  } else el("obj-timer").textContent = "";
  const f = focusPoint();
  const dname = districtAt(f.x, f.z);
  if (dname !== lastDistrict) { lastDistrict = dname; el("district").textContent = dname; }
  refreshTracker(f);
}

// --- the persistent mission tracker ---
let trkCache = "";
function chapterGiverKey() {
  if (G.job) return JOBS[G.job.i].giver;
  if (G.jobIndex < JOBS.length) return JOBS[G.jobIndex].giver;
  return null;
}
function refreshTracker(f) {
  if (G.stage) { el("tracker").style.display = "none"; return; }
  el("tracker").style.display = "block";
  let head, obj, tx = null, tz = null;
  if (G.job) {
    head = "CHAPTER " + (G.job.i + 1) + " — " + JOBS[G.job.i].title;
    obj = el("obj-text").textContent;
    if (G.objectivePos) { tx = G.objectivePos.x; tz = G.objectivePos.z; }
  } else if (G.hustle) {
    head = "SIDE HUSTLE — " + (G.hustle.type === "race" ? "Bay Runner Rematch" : "Special Delivery");
    obj = el("obj-text").textContent;
    if (G.objectivePos) { tx = G.objectivePos.x; tz = G.objectivePos.z; }
  } else if (G.jobIndex < JOBS.length) {
    const def = JOBS[G.jobIndex], key = def.giver, spot = G.contacts[key].spot;
    head = "CHAPTER " + (G.jobIndex + 1) + " — " + def.title;
    obj = "Meet " + giverName(key) + " — " + districtAt(spot.x, spot.z);
    tx = spot.x; tz = spot.z;
  } else {
    head = "STORY COMPLETE — Coral Bay is yours";
    obj = "Free roam: Celia's deliveries & the Bay Runner rematch keep paying";
  }
  const dist = tx !== null ? Math.round(dist2d(f.x, f.z, tx, tz)) + "m" : "";
  const sig = head + "|" + obj + "|" + dist;
  if (sig === trkCache) return;
  trkCache = sig;
  el("trk-chapter").textContent = head;
  el("trk-obj").textContent = obj;
  el("trk-dist").textContent = dist;
}

function drawMinimap() {
  if (!mmCtx || !G.groundCanvas) return;
  const S = 204, ctx = mmCtx, R = 215;
  const f = focusPoint();
  const px = f.x, pz = f.z, scale = (S / 2) / R;
  const src = G.groundCanvas, w2c = src.width / G.citySize, sw = 2 * R * w2c;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, 7); ctx.clip();
  ctx.fillStyle = "#1b6a8c"; ctx.fillRect(0, 0, S, S);
  ctx.drawImage(src, (px + G.citySize / 2) * w2c - sw / 2, (pz + G.citySize / 2) * w2c - sw / 2, sw, sw, 0, 0, S, S);
  function dot(x, z, color, r) {
    const dx = (x - px) * scale, dz = (z - pz) * scale;
    if (dx * dx + dz * dz > (S / 2 - 5) * (S / 2 - 5)) return;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(S / 2 + dx, S / 2 + dz, r, 0, 7); ctx.fill();
  }
  // police blips flash red/blue
  const flashBlue = Math.floor(G.time * 2.4) % 2 === 0;
  for (const c of G.police) dot(c.mesh.position.x, c.mesh.position.z, flashBlue ? "#3f8cff" : "#ff3b30", 4);
  if (typeof policeHeli !== "undefined" && policeHeli) dot(policeHeli.mesh.position.x, policeHeli.mesh.position.z, "#ff3b30", 4);
  // job givers in gold; the next chapter's giver carries its chapter number
  const cgKey = chapterGiverKey();
  for (const key of ["celia", "marco", "don"]) {
    if (contactHasJob(key)) {
      const ct = G.contacts[key];
      dot(ct.spot.x, ct.spot.z, "#ffd94d", 5.5);
      if (key === cgKey && !G.job) {
        const dx = (ct.spot.x - px) * scale, dz = (ct.spot.z - pz) * scale;
        if (dx * dx + dz * dz < (S / 2 - 8) * (S / 2 - 8)) {
          ctx.fillStyle = "#ffd94d"; ctx.beginPath(); ctx.arc(S / 2 + dx, S / 2 + dz, 8, 0, 7); ctx.fill();
          ctx.fillStyle = "#12222e"; ctx.font = "bold 10px Trebuchet MS, sans-serif"; ctx.textAlign = "center";
          ctx.fillText(String(G.jobIndex + 1), S / 2 + dx, S / 2 + dz + 3.5);
        }
      }
    }
  }
  // objective in pulsing teal
  if (G.objectivePos) {
    const pulse = 5 + Math.sin(G.time * 5) * 1.6;
    dot(G.objectivePos.x, G.objectivePos.z, "#2ee6c8", pulse);
  }
  // the player arrow, turned to heading
  const heading = !G.onFoot && G.vehicle ? G.vehicle.mesh.rotation.y : G.player.mesh.rotation.y;
  ctx.translate(S / 2, S / 2); ctx.rotate(Math.PI - heading);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#12303f"; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.4, 6.4); ctx.lineTo(0, 3.4); ctx.lineTo(-5.4, 6.4); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 11px Trebuchet MS, sans-serif"; ctx.textAlign = "center";
  ctx.fillText("N", S / 2, 13);
}

function hudTick(dt) {
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) el("toast").style.opacity = "0"; }
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) { el("banner").style.opacity = "0"; el("banner").style.transform = "translate(-50%, -12px)"; }
  }
  if (hurtT > 0) { hurtT -= dt; el("hurt").style.opacity = String(clamp(hurtT, 0, 0.55)); }
  else el("hurt").style.opacity = "0";
  if (jobMarker && jobMarker.visible) {
    const s = 1 + Math.sin(G.time * 4) * 0.08;
    jobMarker.scale.set(s, 1, s);
  }
}

// --- menus and cards ------------------------------------------------------------
function showTitle() {
  G.mode = "title";
  el("menu-title").style.display = "flex";
  el("menu-pause").style.display = "none";
  el("card").style.display = "none";
  el("hud").style.display = "none";
  const save = loadSave();
  el("btn-continue").style.display = save ? "block" : "none";
  if (save) el("continue-note").textContent = "Saved: " + fmtCash(save.cash) + " · jobs " + save.jobIndex + "/6";
}
function startNewGame() {
  clearSave();
  G.cash = 250; G.jobIndex = 0; G.jobsDone = 0; G.raceBest = 0;
  beginPlay();
  showBanner("Coral Bay Syndicate", "Rico Solano, fixer. Celia is waiting at the marina — follow the gold marker. Build the syndicate, job by job.", 7);
}
function continueGame() {
  const save = loadSave();
  if (save) {
    G.cash = save.cash; G.jobIndex = save.jobIndex; G.jobsDone = save.jobsDone;
    G.raceBest = save.raceBest || 0; G.radioStation = save.radioStation || 0;
  }
  beginPlay();
  showToast(G.jobIndex < JOBS.length ? "Welcome back. Next job: " + JOBS[G.jobIndex].title : "Welcome back, boss. The bay is yours.");
}
function beginPlay() {
  el("menu-title").style.display = "none";
  el("hud").style.display = "block";
  G.mode = "play";
  respawnAtSafehouse();
  G.cash = Math.max(G.cash, 0);
  updateHUD();
}
function togglePause(force) {
  if (G.cutscene) return;
  const show = force !== undefined ? force : G.mode === "play";
  if (show && G.mode === "play") {
    G.mode = "pause";
    el("story-line").textContent = storyLine();
    el("menu-pause").style.display = "flex";
  } else if (!show && G.mode === "pause") {
    G.mode = "play";
    el("menu-pause").style.display = "none";
  }
}
function storyLine() {
  if (G.jobIndex >= JOBS.length) return "Story: complete — CORAL BAY IS YOURS · free-roam hustles stay open";
  return "Story: jobs done " + G.jobsDone + "/6 · next: " + JOBS[G.jobIndex].title + " (" + giverName(JOBS[G.jobIndex].giver) + ")";
}
function restartAtSafehouse() {
  togglePause(false);
  if (G.job) failJobSilent();
  respawnAtSafehouse();
  showToast("Back at the safehouse");
}
function failJobSilent() { G.job = null; G.hustle = null; hideMarker(); setObjective(null); }
function quitToTitle() {
  togglePause(false);
  failJobSilent();
  clearPolice();
  showTitle();
}
function showCard(title, text, btnText) {
  G.mode = "card";
  el("card-title").textContent = title;
  el("card-text").textContent = text;
  el("btn-card").textContent = btnText || "Continue";
  el("card").style.display = "flex";
}
function hideCard() {
  el("card").style.display = "none";
  if (G.mode === "card") G.mode = "play";
}

// --- the full-screen map (M, or click the minimap) ---
function toggleBigMap(force) {
  const show = force !== undefined ? force : G.mode !== "map";
  if (show && G.mode === "play") {
    G.mode = "map";
    el("bigmap").style.display = "flex";
    drawBigMap();
  } else if (!show && G.mode === "map") {
    G.mode = "play";
    el("bigmap").style.display = "none";
  }
}
function drawBigMap() {
  const cv = el("bigmap-canvas");
  if (!cv || !G.groundCanvas) return;
  const ctx = cv.getContext("2d"), S = cv.width, W = G.citySize;
  const w2m = (x) => (x + W / 2) / W * S;
  ctx.clearRect(0, 0, S, S);
  ctx.drawImage(G.groundCanvas, 0, 0, S, S);
  // district names over the painted island
  ctx.textAlign = "center";
  ctx.font = "bold " + Math.round(S * 0.021) + "px Trebuchet MS, sans-serif";
  const labels = [[0, -60, "DOWNTOWN"], [-735, 30, "THE MARINA"], [712, 0, "BEACHFRONT"],
    [-390, -505, "PALMERA HEIGHTS"], [395, 395, "INDUSTRIAL YARDS"], [0, 705, "CORAL BAY AIRPORT"]];
  for (const [x, z, name] of labels) {
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(10,25,35,0.75)";
    ctx.strokeText(name, w2m(x), w2m(z));
    ctx.fillStyle = "#ffe9a3"; ctx.fillText(name, w2m(x), w2m(z));
  }
  function blip(x, z, color, r) {
    // clamp to the sheet: Celia's pier reaches past the painted island edge
    const bx = clamp(w2m(x), r + 2, S - r - 2), bz = clamp(w2m(z), r + 2, S - r - 2);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(bx, bz, r, 0, 7); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(10,25,35,0.8)"; ctx.stroke();
    return [bx, bz];
  }
  const flashBlue = Math.floor(G.time * 2.4) % 2 === 0;
  for (const c of G.police) blip(c.mesh.position.x, c.mesh.position.z, flashBlue ? "#3f8cff" : "#ff3b30", S * 0.008);
  if (typeof policeHeli !== "undefined" && policeHeli) blip(policeHeli.mesh.position.x, policeHeli.mesh.position.z, "#ff3b30", S * 0.008);
  // every story giver, named; the next chapter's giver wears its number
  const cgKey = chapterGiverKey();
  ctx.font = "bold " + Math.round(S * 0.016) + "px Trebuchet MS, sans-serif";
  for (const key of ["celia", "marco", "don"]) {
    const ct = G.contacts[key];
    const isNext = key === cgKey && !G.job;
    const [bx, bz] = blip(ct.spot.x, ct.spot.z, "#ffd94d", isNext ? S * 0.017 : S * 0.011);
    if (isNext) {
      ctx.fillStyle = "#12222e"; ctx.font = "bold " + Math.round(S * 0.02) + "px Trebuchet MS, sans-serif";
      ctx.fillText(String(G.jobIndex + 1), bx, bz + S * 0.007);
      ctx.font = "bold " + Math.round(S * 0.016) + "px Trebuchet MS, sans-serif";
    }
    const nx = clamp(bx, 48, S - 48);
    ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(10,25,35,0.8)";
    ctx.strokeText(giverName(key), nx, bz - S * 0.02);
    ctx.fillStyle = "#ffffff"; ctx.fillText(giverName(key), nx, bz - S * 0.02);
  }
  if (G.objectivePos) {
    const pulse = S * 0.013 + Math.sin(G.time * 5) * S * 0.003;
    blip(G.objectivePos.x, G.objectivePos.z, "#2ee6c8", pulse);
  }
  // Rico's arrow
  const f = focusPoint();
  const heading = !G.onFoot && G.vehicle ? G.vehicle.mesh.rotation.y : G.player.mesh.rotation.y;
  ctx.save();
  ctx.translate(clamp(w2m(f.x), 16, S - 16), clamp(w2m(f.z), 16, S - 16)); ctx.rotate(Math.PI - heading);
  const as = S * 0.016;
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#12303f"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -as); ctx.lineTo(as * 0.68, as * 0.8); ctx.lineTo(0, as * 0.42); ctx.lineTo(-as * 0.68, as * 0.8); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// --- the mission menu (Tab / J) ---
function toggleMissions(force) {
  const show = force !== undefined ? force : G.mode !== "missions";
  if (show && G.mode === "play") {
    buildMissionList();
    G.mode = "missions";
    el("menu-missions").style.display = "flex";
  } else if (!show && G.mode === "missions") {
    G.mode = "play";
    el("menu-missions").style.display = "none";
  }
}
function buildMissionList() {
  const wrap = el("mission-list");
  wrap.innerHTML = "";
  JOBS.forEach((def, i) => {
    const spot = G.contacts[def.giver].spot;
    let status, cls;
    if (i < G.jobIndex) { status = "Selesai ✓"; cls = "done"; }
    else if (G.job && G.job.i === i) { status = "Aktif"; cls = "active"; }
    else if (i === G.jobIndex) { status = "Berikutnya"; cls = "next"; }
    else { status = "Terkunci"; cls = "locked"; }
    const row = document.createElement("div");
    row.className = "mission-row " + cls;
    let html = "<div class='mission-head'><span class='mission-chip'>CHAPTER " + (i + 1) + "</span>" +
      "<span class='mission-title'>" + def.title + "</span>" +
      "<span class='mission-status " + cls + "'>" + status + "</span></div>" +
      "<div class='mission-meta'>" + giverName(def.giver) + " · " + districtAt(spot.x, spot.z) + " · " + fmtCash(def.payout) + "</div>";
    if (cls === "active") html += "<div class='mission-obj'>Tujuan: " + (el("obj-text").textContent || def.brief) + "</div>";
    else if (cls === "next") html += "<div class='mission-obj'>" + def.brief + "</div>";
    row.innerHTML = html;
    wrap.appendChild(row);
  });
  if (G.jobIndex >= JOBS.length) {
    const note = document.createElement("div");
    note.className = "mission-note";
    note.textContent = "Cerita selesai — Coral Bay milikmu. Pekerjaan sampingan tetap buka: antar paket untuk Celia, atau Bay Runner rematch di garis start pantai ($400).";
    wrap.appendChild(note);
  }
}
