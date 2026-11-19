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
  // job givers in gold
  for (const key of ["celia", "marco", "don"]) {
    if (contactHasJob(key)) {
      const ct = G.contacts[key];
      dot(ct.spot.x, ct.spot.z, "#ffd94d", 5.5);
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
