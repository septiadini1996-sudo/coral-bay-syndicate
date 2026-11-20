"use strict";
let mmCtx = null, toastTimer = 0, bannerTimer = 0, hurtT = 0, lastDistrict = "", wbCache = "", rkCache = -1, rToastTimer = 0;
function clk(id, fn, init) { el(id).addEventListener("click", () => { if (init) sfxInit(); sfxClick(); fn(); }); }
function hInit() {
	mmCtx = el("minimap").getContext("2d");
	clk("btn-new", sNG, 1);
	clk("btn-continue", cGam, 1);
	clk("btn-resume", () => tPau(false));
	clk("btn-restart", rSH);
	clk("btn-quit", qTit);
	clk("btn-card", hCrd);
	for (const id of ["btn-help1", "btn-help2"]) clk(id, () => { el("menu-help").style.display = "flex"; });
	clk("btn-help-close", () => { el("menu-help").style.display = "none"; });
	el("btn-mute").addEventListener("click", () => {
	G.mu = !G.mu;
	if (Sfx.master) Sfx.master.gain.value = G.mu ? 0 : 0.55;
	el("btn-mute").textContent = G.mu ? "🔇" : "🔊";
	});
	el("minimap").addEventListener("click", () => { if (G.md === "play") tMap(true); });
	clk("btn-map", () => { if (G.md === "play" || G.md === "map") tMap(); });
	clk("btn-missions", () => { if (G.md === "play" || G.md === "missions") tMis(); });
	el("bigmap-canvas").addEventListener("click", bMC);
	el("bigmap").addEventListener("click", (e) => { if (e.target === el("bigmap") && G.md === "map") tMap(false); });
	clk("btn-follow", () => { sTrk(null); fRt(); dBM(); });
	clk("btn-missions-close", () => tMis(false));
	bTk();
}
function bTk() {
	const wrap = el("tokoh-list");
	if (!wrap || wrap.children.length) return;
	for (const key of ["rico", "celia", "marco", "don"]) {
	const ch = CHARACTERS[key];
	const fig = CE("div");
	fig.className = "tokoh-item";
	const cv = CE("canvas");
	cv.width = 96; cv.height = 96; cv.className = "tokoh-face";
	fig.appendChild(cv);
	const nm = CE("div"); nm.className = "tokoh-name"; nm.textContent = ch.name; fig.appendChild(nm);
	const rl = CE("div"); rl.className = "tokoh-role"; rl.textContent = ch.role; fig.appendChild(rl);
	wrap.appendChild(fig);
	dPor(cv, key);
	}
}
function sToa(text, dur) {
	const t = el("toast");
	t.textContent = text; t.style.opacity = "1";
	toastTimer = dur || 3.4;
}
function radioToast(name) {
	const t = el("rtoast");
	t.textContent = "♪ RADIO · " + name;
	t.style.opacity = "1";
	rToastTimer = 2.5;
}
function radioLine() {
	return G.rO ? "RADIO · " + RST[G.rS % RST.length].name : "RADIO · OFF — Q turns it on";
}
function sBan(title, text, dur) {
	el("banner-title").textContent = title;
	el("banner-text").textContent = text;
	el("banner").style.opacity = "1";
	el("banner").style.transform = "translate(-50%, 0)";
	bannerTimer = dur || 5;
}
function sObj(text, x, z, timer) {
	const box = el("objective");
	if (!text) { box.style.display = "none"; G.oT = null; return; }
	box.style.display = "block";
	el("obj-text").textContent = text;
	if (x !== undefined && x !== null) G.oP = { x, z };
	G.oT = (timer === undefined ? null : timer);
}
function sInt(text) {
	const i = el("interact");
	if (!text) { i.style.display = "none"; return; }
	i.style.display = "block"; i.textContent = text;
}
function sBUI(v) {
	const w = el("bust-wrap");
	if (v <= 0.02) { w.style.display = "none"; return; }
	w.style.display = "block";
	el("bust-fill").style.width = M.round(v * 100) + "%";
}
function sHrt() { hurtT = 0.55; }
function uHud() {
	el("cash").textContent = fCsh(G.ca);
	let stars = "";
	for (let i = 0; i < 5; i++) stars += i < G.wn ? "★" : "☆";
	const st = el("stars");
	st.textContent = stars;
	st.style.color = G.wn > 0 ? "#ffcf3f" : "rgba(255,255,255,0.35)";
	el("healthfill").style.width = zm(G.hp, 0, 100) + "%";
	el("healthfill").style.background = G.hp > 35 ? "#58d06a" : "#e84a3c";
	el("crosshair").style.display = isGun(G.wp) && G.oF && G.md === "play" ? "block" : "none";
	if (G.gU) { G.gU.visible = isGun(G.wp) && G.oF; G.gU.scale.z = G.wp === "smg" ? 1.45 : 1; }
	updPanels();
	const tp = G.tk || G.oP;
	if (tp) {
	const f = fPt();
	el("obj-dist").textContent = M.round(d3(f.x, f.z, tp.x, tp.z)) + "m";
	} else el("obj-dist").textContent = "";
	if (G.oT !== null && G.oT !== undefined) {
	const t = M.max(0, M.ceil(G.oT));
	el("obj-timer").textContent = "⏱ " + M.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
	} else el("obj-timer").textContent = "";
	const f = fPt();
	const dname = dAt(f.x, f.z);
	if (dname !== lastDistrict) { lastDistrict = dname; el("district").textContent = dname; }
	rTrk(f);
}
const RANK_NAMES = ["Outsider", "Runner", "Earner", "Fixer", "Lieutenant", "Captain", "Kingpin"];
function setSlot(id, eq, owned) {
	el(id).className = "wslot" + (eq ? " eq" : "") + (owned ? "" : " dim");
}
function updPanels() {
	const wSig = G.wp + "|" + (G.gn.pistol ? 1 : 0) + (G.gn.smg ? 1 : 0) + "|" + G.ammoP + "|" + G.ammoS;
	if (wSig !== wbCache) {
	wbCache = wSig;
	setSlot("ws-fists", !isGun(G.wp), true);
	setSlot("ws-pistol", G.wp === "pistol", G.gn.pistol);
	setSlot("ws-smg", G.wp === "smg", G.gn.smg);
	el("wa-pistol").textContent = G.ammoP;
	el("wa-smg").textContent = G.ammoS;
	}
	const driving = !G.oF && G.vh;
	el("vehpanel").style.display = driving ? "block" : "none";
	if (driving) {
	el("veh-speed").textContent = M.round(M.abs(G.vh.speed) * 3.1);
	el("veh-name").textContent = G.vh.name + (G.vh.kind === "heli" ? " · alt " + M.round(G.vh.alt) + "m" : "");
	const cond = M.max(0, M.round(G.vh.health));
	el("veh-cond").textContent = cond + "%";
	const cf = el("veh-condfill");
	cf.style.width = cond + "%";
	cf.style.background = cond > 50 ? "#58d06a" : cond > 25 ? "#f2a93d" : "#e84a3c";
	el("veh-radio").textContent = radioLine();
	}
	const showPol = G.wn > 0;
	el("policepanel").style.display = showPol ? "block" : "none";
	if (showPol) {
	const f = fPt();
	let units = 0, near = 1e9;
	for (const c of G.po) {
	if (!c.alive) continue;
	units++;
	const d = d3(c.mesh.position.x, c.mesh.position.z, f.x, f.z);
	if (d < near) near = d;
	}
	if (typeof pHeli !== "undefined" && pHeli) {
	units++;
	const d = d3(pHeli.mesh.position.x, pHeli.mesh.position.z, f.x, f.z);
	if (d < near) near = d;
	}
	const pursuit = units > 0 && near <= 55;
	el("pol-state").textContent = pursuit ? "PURSUIT" : "SEARCHING";
	el("pol-dot").style.color = pursuit ? "#ff5a4d" : "#ffd94d";
	el("pol-info").textContent = units + (units === 1 ? " unit" : " units") + " · nearest " + (near < 1e8 ? M.round(near) + "m" : "—");
	}
	if (G.jD !== rkCache) {
	rkCache = G.jD;
	const r = zm(G.jD, 0, 6);
	el("rank-name").textContent = RANK_NAMES[r];
	el("rank-fill").style.width = M.round(r / 6 * 100) + "%";
	el("rank-sub").textContent = r >= 6 ? "Top rank — the bay is yours" : "Syndicate rank · " + r + "/6 jobs done";
	}
}
let trkCache = "";
function cgK() {
	if (G.job) return JOBS[G.job.i].giver;
	if (G.ji < JOBS.length) return JOBS[G.ji].giver;
	return null;
}
function rTrk(f) {
	if (G.sg) { el("tracker").style.display = "none"; return; }
	el("tracker").style.display = "block";
	let head, obj, tx = null, tz = null;
	if (G.job) {
	head = "CHAPTER " + (G.job.i + 1) + " — " + JOBS[G.job.i].title;
	obj = el("obj-text").textContent;
	if (G.oP) { tx = G.oP.x; tz = G.oP.z; }
	} else if (G.hu) {
	head = "SIDE HUSTLE — " + (G.hu.type === "race" ? "Bay Runner Rematch" : "Special Delivery");
	obj = el("obj-text").textContent;
	if (G.oP) { tx = G.oP.x; tz = G.oP.z; }
	} else if (G.ji < JOBS.length) {
	const def = JOBS[G.ji], key = def.giver, spot = G.ct[key].spot;
	head = "CHAPTER " + (G.ji + 1) + " — " + def.title;
	obj = "Meet " + gNam(key) + " — " + dAt(spot.x, spot.z);
	tx = spot.x; tz = spot.z;
	} else {
	head = "STORY COMPLETE — Coral Bay is yours";
	obj = "Free roam: Celia's deliveries & the Bay Runner rematch keep paying";
	}
	let dist = tx !== null ? M.round(d3(f.x, f.z, tx, tz)) + "m" : "";
	if (G.tk) { obj = "Tracking: " + G.tk.name; dist = M.round(d3(f.x, f.z, G.tk.x, G.tk.z)) + "m"; }
	let stepTxt = "";
	if (G.job) {
	const ji = G.job.i, js = G.job.step;
	if (ji === 3 && js === 1) stepTxt = "CHECKPOINT " + M.min((G.job.data.cp || 0) + 1, 6) + "/6";
	else if (ji === 1 || ji === 5) stepTxt = "STEP " + (js >= 2 ? 2 : 1) + "/2";
	else stepTxt = "STEP " + (js + 1) + "/2";
	} else if (G.hu && G.hu.type === "race") {
	stepTxt = "CHECKPOINT " + M.min(G.hu.cp + 1, 6) + "/6";
	}
	const sig = head + "|" + obj + "|" + dist + "|" + stepTxt;
	if (sig === trkCache) return;
	trkCache = sig;
	el("trk-chapter").textContent = head;
	el("trk-obj").textContent = obj;
	el("trk-dist").textContent = dist;
	el("trk-step").textContent = stepTxt;
}
function dMM() {
	if (!mmCtx || !G.gC) return;
	const S = 204, ctx = mmCtx, R = 215;
	const f = fPt();
	const px = f.x, pz = f.z, scale = (S / 2) / R;
	const src = G.gC, w2c = src.width / G.cS, sw = 2 * R * w2c;
	ctx.clearRect(0, 0, S, S);
	ctx.save();
	ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, 7); ctx.clip();
	ctx.fillStyle = "#1b6a8c"; ctx.fillRect(0, 0, S, S);
	ctx.drawImage(src, (px + G.cS / 2) * w2c - sw / 2, (pz + G.cS / 2) * w2c - sw / 2, sw, sw, 0, 0, S, S);
	if (rPts && rPts.length > 1) {
	ctx.lineJoin = "round";
	for (const pass of [[5.5, "rgba(8,24,34,.6)"], [3, "#ffd94d"]]) {
	ctx.strokeStyle = pass[1]; ctx.lineWidth = pass[0]; ctx.beginPath();
	let pen = false;
	for (const p of rPts) {
	const dx = (p[0] - px) * scale, dz = (p[1] - pz) * scale;
	if (dx * dx + dz * dz > 16900) { pen = false; continue; }
	if (pen) ctx.lineTo(S / 2 + dx, S / 2 + dz); else { ctx.moveTo(S / 2 + dx, S / 2 + dz); pen = true; }
	}
	ctx.stroke();
	}
	}
	function dot(x, z, color, r) {
	const dx = (x - px) * scale, dz = (z - pz) * scale;
	if (dx * dx + dz * dz > (S / 2 - 5) * (S / 2 - 5)) return;
	ctx.fillStyle = color; ctx.beginPath(); ctx.arc(S / 2 + dx, S / 2 + dz, r, 0, 7); ctx.fill();
	}
	const flashBlue = M.floor(G.tm * 2.4) % 2 === 0;
	for (const c of G.po) dot(c.mesh.position.x, c.mesh.position.z, flashBlue ? "#3f8cff" : "#ff3b30", 4);
	if (typeof pHeli !== "undefined" && pHeli) dot(pHeli.mesh.position.x, pHeli.mesh.position.z, "#ff3b30", 4);
	const cgKey = cgK();
	for (const key of ["celia", "marco", "don"]) {
	if (cHJ(key)) {
	const ct = G.ct[key];
	dot(ct.spot.x, ct.spot.z, "#ffd94d", 5.5);
	if (key === cgKey && !G.job) {
	const dx = (ct.spot.x - px) * scale, dz = (ct.spot.z - pz) * scale;
	if (dx * dx + dz * dz < (S / 2 - 8) * (S / 2 - 8)) {
	ctx.fillStyle = "#ffd94d"; ctx.beginPath(); ctx.arc(S / 2 + dx, S / 2 + dz, 8, 0, 7); ctx.fill();
	ctx.fillStyle = "#12222e"; ctx.font = "bold 10px Trebuchet MS, sans-serif"; ctx.textAlign = "center";
	ctx.fillText(String(G.ji + 1), S / 2 + dx, S / 2 + dz + 3.5);
	}
	}
	}
	}
	if (G.oP) {
	const pulse = 5 + M.sin(G.tm * 5) * 1.6;
	dot(G.oP.x, G.oP.z, "#2ee6c8", pulse);
	}
	const heading = !G.oF && G.vh ? G.vh.mesh.rotation.y : G.pl.mesh.rotation.y;
	ctx.translate(S / 2, S / 2); ctx.rotate(M.PI - heading);
	ctx.fillStyle = "#ffffff";
	ctx.strokeStyle = "#12303f"; ctx.lineWidth = 1.6;
	ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.4, 6.4); ctx.lineTo(0, 3.4); ctx.lineTo(-5.4, 6.4); ctx.closePath();
	ctx.fill(); ctx.stroke();
	ctx.restore();
	ctx.fillStyle = "rgba(255,255,255,0.9)";
	ctx.font = "bold 11px Trebuchet MS, sans-serif"; ctx.textAlign = "center";
	ctx.fillText("N", S / 2, 13);
}
function hTk(dt) {
	if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) el("toast").style.opacity = "0"; }
	if (rToastTimer > 0) { rToastTimer -= dt; if (rToastTimer <= 0) el("rtoast").style.opacity = "0"; }
	if (bannerTimer > 0) {
	bannerTimer -= dt;
	if (bannerTimer <= 0) { el("banner").style.opacity = "0"; el("banner").style.transform = "translate(-50%, -12px)"; }
	}
	if (hurtT > 0) { hurtT -= dt; el("hurt").style.opacity = String(zm(hurtT, 0, 0.55)); }
	else el("hurt").style.opacity = "0";
	if (jMrk && jMrk.visible) {
	const s = 1 + M.sin(G.tm * 4) * 0.08;
	jMrk.scale.set(s, 1, s);
	}
	rTk(dt);
}
function sTit() {
	G.md = "title";
	el("menu-title").style.display = "flex";
	el("menu-pause").style.display = "none";
	el("card").style.display = "none";
	el("hud").style.display = "none";
	const save = lSav();
	el("btn-continue").style.display = save ? "block" : "none";
	if (save) el("continue-note").textContent = "Saved: " + fCsh(save.cash) + " · jobs " + save.jobIndex + "/6";
}
function sNG() {
	cSav();
	G.ca = 250; G.ji = 0; G.jD = 0; G.rB = 0;
	G.gn = { pistol: false, smg: false }; G.ammoP = 0; G.ammoS = 0; G.wp = "fists";
	bPlay();
	sBan("Coral Bay Syndicate", "Rico Solano, fixer. Celia is waiting at the marina — follow the gold marker. Build the syndicate, job by job.", 7);
}
function cGam() {
	const save = lSav();
	if (save) {
	G.ca = save.cash; G.ji = save.jobIndex; G.jD = save.jobsDone;
	G.rB = save.raceBest || 0; G.rS = save.radioStation || 0;
	if (save.guns) { G.gn = save.guns; G.ammoP = save.ammoP || 0; G.ammoS = save.ammoS || 0; }
	}
	bPlay();
	sToa(G.ji < JOBS.length ? "Welcome back. Next job: " + JOBS[G.ji].title : "Welcome back, boss. The bay is yours.");
}
function bPlay() {
	el("menu-title").style.display = "none";
	el("hud").style.display = "block";
	G.md = "play";
	rspH();
	G.ca = M.max(G.ca, 0);
	uHud();
}
function tPau(force) {
	if (G.cs) return;
	const show = force !== undefined ? force : G.md === "play";
	if (show && G.md === "play") {
	G.md = "pause";
	el("story-line").textContent = sLn();
	el("menu-pause").style.display = "flex";
	} else if (!show && G.md === "pause") {
	G.md = "play";
	el("menu-pause").style.display = "none";
	}
}
function sLn() {
	if (G.ji >= JOBS.length) return "Story: complete — CORAL BAY IS YOURS · free-roam hustles stay open";
	return "Story: jobs done " + G.jD + "/6 · next: " + JOBS[G.ji].title + " (" + gNam(JOBS[G.ji].giver) + ")";
}
function rSH() {
	tPau(false);
	if (G.job) fJbS();
	rspH();
	sToa("Back at the safehouse");
}
function fJbS() { G.job = null; G.hu = null; hMrk(); sObj(null); }
function qTit() {
	tPau(false);
	fJbS();
	cPol();
	sTit();
}
function sCrd(title, text, btnText) {
	G.md = "card";
	el("card-title").textContent = title;
	el("card-text").textContent = text;
	el("btn-card").textContent = btnText || "Continue";
	el("card").style.display = "flex";
}
function hCrd() {
	el("card").style.display = "none";
	if (G.md === "card") G.md = "play";
}
function tMap(force) {
	const show = force !== undefined ? force : G.md !== "map";
	if (show && G.md === "play") {
	G.md = "map";
	el("bigmap").style.display = "flex";
	dBM();
	} else if (!show && G.md === "map") {
	G.md = "play";
	el("bigmap").style.display = "none";
	}
}
function dBM() {
	const cv = el("bigmap-canvas");
	if (!cv || !G.gC) return;
	const ctx = cv.getContext("2d"), S = cv.width, W = G.cS;
	const w2m = (x) => (x + W / 2) / W * S;
	ctx.clearRect(0, 0, S, S);
	ctx.drawImage(G.gC, 0, 0, S, S);
	if (rPts && rPts.length > 1) {
	ctx.lineJoin = "round";
	for (const pass of [[11, "rgba(255,217,77,.3)"], [5, "#ffd94d"]]) {
	ctx.strokeStyle = pass[1]; ctx.lineWidth = pass[0]; ctx.beginPath();
	rPts.forEach((p, i) => { if (i) ctx.lineTo(w2m(p[0]), w2m(p[1])); else ctx.moveTo(w2m(p[0]), w2m(p[1])); });
	ctx.stroke();
	}
	}
	ctx.textAlign = "center";
	ctx.font = "bold " + M.round(S * 0.021) + "px Trebuchet MS, sans-serif";
	const labels = [[0, -60, "DOWNTOWN"], [-735, 30, "THE MARINA"], [712, 0, "BEACHFRONT"],
	[-390, -505, "PALMERA HEIGHTS"], [395, 395, "INDUSTRIAL YARDS"], [0, 705, "CORAL BAY AIRPORT"]];
	for (const [x, z, name] of labels) {
	ctx.lineWidth = 4; ctx.strokeStyle = "rgba(10,25,35,0.75)";
	ctx.strokeText(name, w2m(x), w2m(z));
	ctx.fillStyle = "#ffe9a3"; ctx.fillText(name, w2m(x), w2m(z));
	}
	function blip(x, z, color, r) {
	const bx = zm(w2m(x), r + 2, S - r - 2), bz = zm(w2m(z), r + 2, S - r - 2);
	ctx.fillStyle = color; ctx.beginPath(); ctx.arc(bx, bz, r, 0, 7); ctx.fill();
	ctx.lineWidth = 2; ctx.strokeStyle = "rgba(10,25,35,0.8)"; ctx.stroke();
	return [bx, bz];
	}
	const flashBlue = M.floor(G.tm * 2.4) % 2 === 0;
	for (const c of G.po) blip(c.mesh.position.x, c.mesh.position.z, flashBlue ? "#3f8cff" : "#ff3b30", S * 0.008);
	if (typeof pHeli !== "undefined" && pHeli) blip(pHeli.mesh.position.x, pHeli.mesh.position.z, "#ff3b30", S * 0.008);
	const cgKey = cgK();
	ctx.font = "bold " + M.round(S * 0.016) + "px Trebuchet MS, sans-serif";
	for (const key of ["celia", "marco", "don"]) {
	const ct = G.ct[key];
	const isNext = key === cgKey && !G.job;
	const [bx, bz] = blip(ct.spot.x, ct.spot.z, "#ffd94d", isNext ? S * 0.017 : S * 0.011);
	if (isNext) {
	ctx.fillStyle = "#12222e"; ctx.font = "bold " + M.round(S * 0.02) + "px Trebuchet MS, sans-serif";
	ctx.fillText(String(G.ji + 1), bx, bz + S * 0.007);
	ctx.font = "bold " + M.round(S * 0.016) + "px Trebuchet MS, sans-serif";
	}
	if (G.tk && G.tk.key === key) {
	ctx.lineWidth = 3; ctx.strokeStyle = "#2ee6c8";
	ctx.beginPath(); ctx.arc(bx, bz, S * 0.024, 0, 7); ctx.stroke();
	}
	const nx = zm(bx, 48, S - 48);
	ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(10,25,35,0.8)";
	ctx.strokeText(gNam(key), nx, bz - S * 0.02);
	ctx.fillStyle = "#ffffff"; ctx.fillText(gNam(key), nx, bz - S * 0.02);
	}
	el("btn-follow").style.display = G.tk ? "inline-block" : "none";
	if (G.tk) {
	ctx.font = "bold " + M.round(S * 0.019) + "px Trebuchet MS, sans-serif"; ctx.textAlign = "left";
	const label = "Tracking: " + G.tk.name;
	ctx.lineWidth = 4; ctx.strokeStyle = "rgba(10,25,35,0.85)";
	ctx.strokeText(label, 14, 28); ctx.fillStyle = "#2ee6c8"; ctx.fillText(label, 14, 28);
	}
	if (G.oP) {
	const pulse = S * 0.013 + M.sin(G.tm * 5) * S * 0.003;
	blip(G.oP.x, G.oP.z, "#2ee6c8", pulse);
	}
	const f = fPt();
	const heading = !G.oF && G.vh ? G.vh.mesh.rotation.y : G.pl.mesh.rotation.y;
	ctx.save();
	ctx.translate(zm(w2m(f.x), 16, S - 16), zm(w2m(f.z), 16, S - 16)); ctx.rotate(M.PI - heading);
	const as = S * 0.016;
	ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#12303f"; ctx.lineWidth = 2;
	ctx.beginPath(); ctx.moveTo(0, -as); ctx.lineTo(as * 0.68, as * 0.8); ctx.lineTo(0, as * 0.42); ctx.lineTo(-as * 0.68, as * 0.8); ctx.closePath();
	ctx.fill(); ctx.stroke();
	ctx.restore();
}
function tMis(force) {
	const show = force !== undefined ? force : G.md !== "missions";
	if (show && G.md === "play") {
	bML();
	G.md = "missions";
	el("menu-missions").style.display = "flex";
	} else if (!show && G.md === "missions") {
	G.md = "play";
	el("menu-missions").style.display = "none";
	}
}
function bML() {
	const wrap = el("mission-list");
	wrap.innerHTML = "";
	JOBS.forEach((def, i) => {
	const spot = G.ct[def.giver].spot;
	let status, cls;
	if (i < G.ji) { status = "Done ✓"; cls = "done"; }
	else if (G.job && G.job.i === i) { status = "Active"; cls = "active"; }
	else if (i === G.ji) { status = "Next"; cls = "next"; }
	else { status = "Locked"; cls = "locked"; }
	const row = CE("div");
	row.className = "mission-row " + cls;
	let html = "<div class='mission-head'><span class='mission-chip'>CHAPTER " + (i + 1) + "</span>" +
			"<span class='mission-title'>" + def.title + "</span>" +
			"<span class='mission-status " + cls + "'>" + status + "</span></div>" +
			"<div class='mission-meta'>" + gNam(def.giver) + " · " + dAt(spot.x, spot.z) + " · " + fCsh(def.payout) + "</div>";
	if (cls === "active") html += "<div class='mission-obj'>Objective: " + (el("obj-text").textContent || def.brief) + "</div>";
	else if (cls === "next") html += "<div class='mission-obj'>" + def.brief + "</div>";
	row.innerHTML = html;
	if (cls === "active" || cls === "next") {
	const btn = CE("button");
	btn.className = "mission-track"; btn.textContent = "🧭 Track";
	btn.addEventListener("click", () => {
	if (cls === "active" && G.oP) sTrk({ x: G.oP.x, z: G.oP.z, name: "Objective — " + def.title });
	else sTrk({ x: spot.x, z: spot.z, name: gNam(def.giver) + " — " + dAt(spot.x, spot.z), key: def.giver });
	fRt();
	tMis(false);
	if (G.tk) sToa("Tracking: " + G.tk.name);
	});
	row.appendChild(btn);
	}
	wrap.appendChild(row);
	});
	if (G.ji >= JOBS.length) {
	const note = CE("div");
	note.className = "mission-note";
	note.textContent = "Story complete — Coral Bay is yours. Side work stays open: run packages for Celia, or the Bay Runner rematch at the beach start line ($400).";
	wrap.appendChild(note);
	}
}
let rPts = null, routeSig = "", routeClock = 0, routeWp = 1, rMsh = null, routeMat = null, navEl = null;
function sTrk(t) { G.tk = t; routeSig = ""; }
function tTg() {
	if (G.tk) return G.tk;
	if ((G.job || G.hu) && G.oP) return G.oP;
	if (G.ji < JOBS.length) return G.ct[JOBS[G.ji].giver].spot;
	return null;
}
function cRt(sx, sz, tx, tz) {
	const L = RL, n = L.length, NI = n * n;
	const P = [], ADJ = {};
	for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) P.push([L[i], L[j]]);
	const link = (a, b, w) => { (ADJ[a] || (ADJ[a] = [])).push([b, w]); (ADJ[b] || (ADJ[b] = [])).push([a, w]); };
	function addEnd(px, pz) {
	const self = P.length; P.push([px, pz]);
	let fi = 0, fj = 0;
	for (let i = 0; i < n; i++) {
	if (M.abs(L[i] - px) < M.abs(L[fi] - px)) fi = i;
	if (M.abs(L[i] - pz) < M.abs(L[fj] - pz)) fj = i;
	}
	const v = P.length; P.push([L[fi], pz]);
	link(self, v, M.abs(px - L[fi]));
	let j = 0; while (j < n - 2 && L[j + 1] < pz) j++;
	link(v, fi * n + j, M.abs(pz - L[j])); link(v, fi * n + j + 1, M.abs(pz - L[j + 1]));
	const hx = zm(px, -840, 840), h = P.length; P.push([hx, L[fj]]);
	link(self, h, M.hypot(px - hx, pz - L[fj]));
	let k = 0; while (k < n - 2 && L[k + 1] < hx) k++;
	link(h, k * n + fj, M.abs(hx - L[k])); link(h, (k + 1) * n + fj, M.abs(hx - L[k + 1]));
	return self;
	}
	const S = addEnd(sx, sz), D = addEnd(tx, tz), N = P.length;
	const dist = new Array(N).fill(1e18), prev = new Array(N).fill(-1), done = new Array(N).fill(false);
	dist[S] = 0;
	for (let it = 0; it < N; it++) {
	let u = -1, best = 1e18;
	for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
	if (u < 0 || u === D) break;
	done[u] = true;
	const relax = (w, wt) => { if (dist[u] + wt < dist[w]) { dist[w] = dist[u] + wt; prev[w] = u; } };
	if (u < NI) {
	const i = (u / n) | 0, j = u % n;
	if (i > 0) relax(u - n, 160); if (i < n - 1) relax(u + n, 160);
	if (j > 0) relax(u - 1, 160); if (j < n - 1) relax(u + 1, 160);
	}
	if (ADJ[u]) for (const e of ADJ[u]) relax(e[0], e[1]);
	}
	if (prev[D] < 0) return null;
	const path = [];
	for (let u = D; u >= 0; u = prev[u]) path.push(P[u]);
	path.reverse();
	const out = [];
	for (let i = 0; i < path.length; i++) {
	if (i) {
	const a = path[i - 1], b = path[i], d = d3(a[0], a[1], b[0], b[1]), steps = M.floor(d / 40);
	for (let s = 1; s <= steps; s++) out.push([a[0] + (b[0] - a[0]) * s / (steps + 1), a[1] + (b[1] - a[1]) * s / (steps + 1)]);
	}
	out.push(path[i]);
	}
	return out;
}
function bRb() {
	if (rMsh) { G.sc.remove(rMsh); rMsh.geometry.dispose(); rMsh = null; }
	if (!rPts || rPts.length < 2) return;
	if (!routeMat) routeMat = BM(0xffd94d, { transparent: true, opacity: 0.5, depthWrite: false });
	const pos = [];
	for (let i = 0; i < rPts.length - 1; i++) {
	const a = rPts[i], b = rPts[i + 1];
	let dx = b[0] - a[0], dz = b[1] - a[1];
	const len = M.hypot(dx, dz) || 1; dx /= len; dz /= len;
	const px = -dz * 1.15, pz = dx * 1.15, y = 0.22;
	pos.push(a[0] + px, y, a[1] + pz, a[0] - px, y, a[1] - pz, b[0] + px, y, b[1] + pz,
	a[0] - px, y, a[1] - pz, b[0] - px, y, b[1] - pz, b[0] + px, y, b[1] + pz);
	}
	const geo = new BF();
	geo.setAttribute("position", new T3.Float32BufferAttribute(pos, 3));
	rMsh = new MS(geo, routeMat);
	rMsh.renderOrder = 2;
	rMsh.visible = false;
	G.sc.add(rMsh);
}
function rTk(dt) {
	if (!navEl) navEl = el("navarrow");
	const active = !G.sg && rPts && rPts.length > 1 && G.md === "play" && !G.cs;
	if (rMsh) {
	rMsh.visible = !!active;
	if (active) routeMat.opacity = 0.42 + M.sin(G.tm * 4) * 0.13;
	}
	if (active) {
	const f = fPt();
	while (routeWp < rPts.length - 1 && d3(f.x, f.z, rPts[routeWp][0], rPts[routeWp][1]) < 16) routeWp++;
	const wp = rPts[routeWp];
	const a = M.atan2(wp[0] - f.x, wp[1] - f.z);
	navEl.style.display = "block";
	navEl.style.transform = "rotate(" + M.round((G.yW - a) * 57.2958) + "deg)";
	} else navEl.style.display = "none";
	if (G.md !== "play" || G.cs || G.sg) return;
	const f = fPt();
	if (G.tk && d3(f.x, f.z, G.tk.x, G.tk.z) < 15) {
	sToa("Arrived: " + G.tk.name);
	sTrk(null);
	}
	routeClock += dt;
	if (routeClock < 0.3) return;
	routeClock = 0;
	const t = tTg();
	if (!t) { if (rPts) { rPts = null; bRb(); } routeSig = ""; return; }
	const sig = t.x + "," + t.z;
	let redo = sig !== routeSig;
	if (!redo && rPts) {
	if (d3(f.x, f.z, rPts[0][0], rPts[0][1]) > 30) redo = true;
	else {
	let md = 1e9;
	for (const p of rPts) md = M.min(md, d3(f.x, f.z, p[0], p[1]));
	if (md > 40) redo = true;
	}
	}
	if (redo) fRt();
}
function fRt() {
	const t = tTg(), f = fPt();
	routeSig = t ? t.x + "," + t.z : "";
	rPts = t ? cRt(f.x, f.z, t.x, t.z) : null;
	routeWp = 1;
	bRb();
}
function bMC(e) {
	if (G.md !== "map") return;
	const cv = el("bigmap-canvas"), r = cv.getBoundingClientRect(), S = cv.width;
	const cx = e.offsetX / r.width * S, cy = e.offsetY / r.height * S;
	const w2m = (v) => (v + G.cS / 2) / G.cS * S;
	const hit = (x, z, rad) => M.hypot(cx - zm(w2m(x), rad + 2, S - rad - 2), cy - zm(w2m(z), rad + 2, S - rad - 2)) < 30;
	const cg = cgK();
	for (const key of ["celia", "marco", "don"]) {
	const ct = G.ct[key];
	if (hit(ct.spot.x, ct.spot.z, key === cg && !G.job ? S * 0.017 : S * 0.011)) {
	if (G.tk && G.tk.key === key) sTrk(null);
	else sTrk({ x: ct.spot.x, z: ct.spot.z, name: gNam(key) + " — " + dAt(ct.spot.x, ct.spot.z), key });
	sfxClick(); fRt(); dBM();
	return;
	}
	}
	if (G.oP && hit(G.oP.x, G.oP.z, S * 0.013)) {
	sTrk(null); sfxClick(); fRt(); dBM();
	return;
	}
	tMap(false);
}
