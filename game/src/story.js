// story.js — character portraits drawn in code, and short in-engine
// cutscenes with Indonesian subtitles at every chapter opening (and at the
// finale's end). Faces are painted on canvases from the 3D style specs.
"use strict";

const CHARACTERS = {
  rico: { name: "Rico Solano", role: "Sang fixer — tokoh utama cerita ini", skin: "#d99e63", hair: "#1c1410", hat: "fedora", shades: true, chain: true, shirt: "#f26d5b", print: true },
  celia: { name: "Celia", role: "Kontak marina — pekerjaan pertama & balapan pantai", skin: "#f2c09a", hair: "#4a2a12", hat: null, shades: false, chain: false, shirt: "#ff8fab", print: true, longHair: true },
  marco: { name: "Marco", role: "Pengurus buku & gudang downtown", skin: "#a96f3f", hair: "#14100c", hat: "fedora", shades: true, chain: true, shirt: "#2e4053", print: false },
  don: { name: "Don Falso", role: "Bos sindikat di Palmera Heights", skin: "#ffd9b3", hair: "#5a4632", hat: "panama", shades: true, chain: true, shirt: "#e8e4da", print: false },
};

// One painted face per character, reused by subtitles and the TOKOH panel.
const portraitCache = {};
function portraitCanvas(key) {
  if (portraitCache[key]) return portraitCache[key];
  const s = CHARACTERS[key];
  const cv = document.createElement("canvas"); cv.width = 96; cv.height = 96;
  const c = cv.getContext("2d");
  const sky = c.createLinearGradient(0, 0, 0, 96);
  sky.addColorStop(0, "#ffb37a"); sky.addColorStop(1, "#7a4a6e");
  c.fillStyle = sky; c.fillRect(0, 0, 96, 96);
  c.fillStyle = "rgba(255,233,163,0.85)"; c.beginPath(); c.arc(80, 16, 8, 0, 7); c.fill();
  // shoulders and shirt
  c.fillStyle = s.shirt; c.beginPath(); c.moveTo(14, 96); c.quadraticCurveTo(48, 62, 82, 96); c.closePath(); c.fill();
  if (s.print) { c.fillStyle = "rgba(255,255,255,0.5)"; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(24 + (i * 37) % 52, 80 + (i * 13) % 14, 2.4, 0, 7); c.fill(); } }
  if (s.chain) { c.strokeStyle = "#ffd94d"; c.lineWidth = 3.4; c.beginPath(); c.arc(48, 74, 13, 0.25, Math.PI - 0.25); c.stroke(); }
  c.fillStyle = s.skin; c.fillRect(43, 56, 10, 12); // neck
  if (s.longHair) { c.fillStyle = s.hair; c.fillRect(24, 18, 48, 52); }
  c.fillStyle = s.skin; c.beginPath(); c.ellipse(48, 42, 17, 20, 0, 0, 7); c.fill(); // face
  if (!s.longHair) { c.fillStyle = s.hair; c.beginPath(); c.ellipse(48, 25, 17.5, 8, 0, Math.PI, 7); c.fill(); }
  else { c.fillStyle = s.hair; c.beginPath(); c.ellipse(48, 24, 18, 7.5, 0, Math.PI, 7); c.fill(); }
  if (s.shades) {
    c.fillStyle = "#101418"; c.fillRect(29, 38, 38, 9);
    c.fillRect(31, 39.5, 14, 6); c.fillRect(51, 39.5, 14, 6);
    c.fillStyle = "rgba(160,220,255,0.5)"; c.fillRect(33, 40, 5, 2.4); c.fillRect(53, 40, 5, 2.4);
  } else {
    c.fillStyle = "#1c1410";
    c.beginPath(); c.arc(41, 41, 2.1, 0, 7); c.fill();
    c.beginPath(); c.arc(55, 41, 2.1, 0, 7); c.fill();
    c.strokeStyle = "rgba(90,40,30,0.8)"; c.lineWidth = 1.6;
    c.beginPath(); c.arc(48, 52, 6, 0.3, Math.PI - 0.3); c.stroke();
  }
  if (s.hat) {
    c.fillStyle = s.hat === "panama" ? "#f2e3c2" : "#3a2e22";
    c.fillRect(22, 19, 52, 5.5);
    c.beginPath(); c.ellipse(48, 15, 12.5, 8.5, 0, Math.PI, 7); c.fill();
    c.fillStyle = s.hat === "panama" ? "#c93a2e" : "#14100c"; c.fillRect(35.5, 17.5, 25, 3.4);
  }
  portraitCache[key] = cv;
  return cv;
}
function drawPortrait(canvas, key) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(portraitCanvas(key), 0, 0, canvas.width, canvas.height);
}

// --- the story, in Indonesian. Index 6 is the finale's closing scene. -------
const CUTSCENES = [
  [ // 1 — Opening Night (Celia)
    { who: "celia", text: "Rico! Akhirnya kau kembali ke Coral Bay. Lama sekali, sayang." },
    { who: "rico", text: "Aku pulang tanpa apa-apa, Celia. Kota ini berutang penjelasan padaku." },
    { who: "celia", text: "Mulai dari yang kecil: antarkan aku ke Starfish Club sebelum pintu dibuka." },
    { who: "rico", text: "Naiklah. Malam ini, roda nasib kita berputar lagi." },
  ],
  [ // 2 — Paper Trail (Marco)
    { who: "marco", text: "Rico, dengar. Buku besarku dicuri — uang sindikat ikut lenyap di dalamnya." },
    { who: "rico", text: "Berapa banyak yang hilang, Marco?" },
    { who: "marco", text: "Cukup untuk membuat kita tidur di dasar teluk. Tiga koper, di gang-gang downtown." },
    { who: "rico", text: "Tenang. Koper-koper itu kembali sebelum fajar." },
  ],
  [ // 3 — Hot Metal (Marco)
    { who: "marco", text: "Kau menemukannya? Bagus. Sekarang kita butuh otot, bukan sekadar kertas." },
    { who: "rico", text: "Dune Crusher di halaman industri itu?" },
    { who: "marco", text: "Itu dia. Ambil, bawa ke gudangku. Kalau polisi bertanya, kau tidak kenal aku." },
    { who: "rico", text: "Aku tidak pernah kenal siapa-siapa, Marco." },
  ],
  [ // 4 — Bay Runner (Celia)
    { who: "celia", text: "Don Falso mulai mendengar namamu, Rico. Itu bisa bagus — atau sangat buruk." },
    { who: "rico", text: "Bagaimana cara membuatnya jadi bagus?" },
    { who: "celia", text: "Menangkan lari pantai ini. Enam pos, satu catatan waktu. Seluruh teluk menonton." },
    { who: "rico", text: "Kalau begitu, beri mereka pertunjukan." },
  ],
  [ // 5 — Sky High (Don Falso)
    { who: "don", text: "Jadi kau Rico Solano. Nama kecil, gema yang besar." },
    { who: "rico", text: "Aku datang untuk bekerja, Don. Bukan untuk basa-basi." },
    { who: "don", text: "Bagus. Helikopter di bandara — bawa ke helipad marina. Polisi pasti keberatan." },
    { who: "rico", text: "Keberatan mereka bukan urusanku. Anggap selesai." },
  ],
  [ // 6 — The Syndicate (Don Falso)
    { who: "don", text: "Satu pekerjaan terakhir, Rico. Setelah ini, kau keluarga — atau kenangan." },
    { who: "rico", text: "Keluarga, kalau begitu. Apa targetnya?" },
    { who: "don", text: "Setoran dari tiga titik di kota ini. Lalu pulang — hidup — selagi semua memburumu." },
    { who: "rico", text: "Coral Bay akan belajar satu nama malam ini." },
  ],
  [ // finale — after The Syndicate, at the safehouse
    { who: "don", text: "Kau berhasil. Setoran penuh, dan kau masih bernapas. Jarang sekali." },
    { who: "rico", text: "Aku bilang pekerjaanku akan selesai, Don." },
    { who: "don", text: "Mulai malam ini kau bukan orang suruhan lagi. Kau mitrku, Rico Solano." },
    { who: "rico", text: "Coral Bay... akhirnya kau milikku." },
  ],
];
const CUT_LINE_SECONDS = 2.9;

function csGiverPerson(cs) { return G.contacts[cs.giverKey].person; }
function startCutscene(idx, onDone) {
  const giverKey = idx < JOBS.length ? JOBS[idx].giver : "don";
  const gp = G.contacts[giverKey].person.mesh.position;
  const pp = G.player.mesh.position;
  let dx = pp.x - gp.x, dz = pp.z - gp.z;
  const dl = Math.sqrt(dx * dx + dz * dz) || 1; dx /= dl; dz /= dl;
  // Rico steps in close and the two face each other for the talk
  G.player.mesh.position.set(gp.x + dx * 2.6, 0, gp.z + dz * 2.6);
  G.player.mesh.rotation.y = Math.atan2(-dx, -dz);
  G.contacts[giverKey].person.mesh.rotation.y = Math.atan2(dx, dz);
  G.cutscene = { idx, lines: CUTSCENES[idx], line: 0, t: 0, giverKey, onDone: onDone || null };
  G.giverPrompt = null;
  if (G.player.namePlate) G.player.namePlate.visible = false;
  setInteract(null);
  csShowLine();
  sfxSting("start");
}
function csShowLine() {
  const cs = G.cutscene; if (!cs) return;
  const line = cs.lines[cs.line];
  drawPortrait(el("sub-face"), line.who);
  el("sub-name").textContent = CHARACTERS[line.who].name;
  el("sub-text").textContent = line.text;
  el("subtitle").style.display = "flex";
}
// Camera for the current line: a wide two-shot, then over each shoulder.
function csCameraPose(cs) {
  const a = G.player.mesh.position, b = csGiverPerson(cs).mesh.position;
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  let fx = b.x - a.x, fz = b.z - a.z;
  const fl = Math.sqrt(fx * fx + fz * fz) || 1; fx /= fl; fz /= fl;
  const shot = cs.line % 3;
  if (shot === 0) return { pos: [mx - fz * 5.2, 2.1, mz + fx * 5.2], look: [mx, 1.45, mz] };
  if (shot === 1) return { pos: [a.x - fx * 4.2 - fz * 1.35, 1.78, a.z - fz * 4.2 + fx * 1.35], look: [b.x, 1.5, b.z] };
  return { pos: [b.x + fx * 4.2 + fz * 1.35, 1.78, b.z + fz * 4.2 - fx * 1.35], look: [a.x, 1.5, a.z] };
}
function csApplyCamera(cs, dt) {
  const pose = csCameraPose(cs);
  const k = dt ? clamp(dt * 2.4, 0, 1) : 1;
  G.camera.position.x += (pose.pos[0] - G.camera.position.x) * k;
  G.camera.position.y += (pose.pos[1] - G.camera.position.y) * k;
  G.camera.position.z += (pose.pos[2] - G.camera.position.z) * k;
  G.camera.lookAt(pose.look[0], pose.look[1], pose.look[2]);
}
function updateCutscene(dt) {
  const cs = G.cutscene; if (!cs) return;
  cs.t += dt;
  animatePerson(G.player, 0, dt);
  if (cs.t >= CUT_LINE_SECONDS) {
    cs.t = 0; cs.line++;
    if (cs.line >= cs.lines.length) { finishCutscene(); return; }
    csShowLine();
  }
  csApplyCamera(cs, dt);
}
function finishCutscene() {
  if (!G.cutscene) return;
  const cb = G.cutscene.onDone;
  G.cutscene = null;
  el("subtitle").style.display = "none";
  if (G.player.namePlate && G.onFoot) G.player.namePlate.visible = true;
  if (cb) cb();
}
function skipCutscene() { finishCutscene(); }
