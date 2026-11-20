"use strict";
const CHARACTERS = {
rico: { name: "Rico Solano", role: "The fixer — the main character of this story", skin: "#d99e63", hair: "#1c1410", hat: "fedora", shades: true, chain: true, shirt: "#f26d5b", print: true },
celia: { name: "Celia", role: "Marina contact — first job & the beach race", skin: "#f2c09a", hair: "#4a2a12", hat: null, shades: false, chain: false, shirt: "#ff8fab", print: true, longHair: true },
marco: { name: "Marco", role: "Keeps the books & the downtown warehouse", skin: "#a96f3f", hair: "#14100c", hat: "fedora", shades: true, chain: true, shirt: "#2e4053", print: false },
don: { name: "Don Falso", role: "Syndicate boss in Palmera Heights", skin: "#ffd9b3", hair: "#5a4632", hat: "panama", shades: true, chain: true, shirt: "#e8e4da", print: false },
};
const portraitCache = {};
function portraitCanvas(key) {
if (portraitCache[key]) return portraitCache[key];
const s = CHARACTERS[key];
const cv = CE("canvas"); cv.width = 96; cv.height = 96;
const c = cv.getContext("2d");
const sky = c.createLinearGradient(0, 0, 0, 96);
sky.addColorStop(0, "#ffb37a"); sky.addColorStop(1, "#7a4a6e");
c.fillStyle = sky; c.fillRect(0, 0, 96, 96);
c.fillStyle = "rgba(255,233,163,0.85)"; c.beginPath(); c.arc(80, 16, 8, 0, 7); c.fill();
c.fillStyle = s.shirt; c.beginPath(); c.moveTo(14, 96); c.quadraticCurveTo(48, 62, 82, 96); c.closePath(); c.fill();
if (s.print) { c.fillStyle = "rgba(255,255,255,0.5)"; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(24 + (i * 37) % 52, 80 + (i * 13) % 14, 2.4, 0, 7); c.fill(); } }
if (s.chain) { c.strokeStyle = "#ffd94d"; c.lineWidth = 3.4; c.beginPath(); c.arc(48, 74, 13, 0.25, M.PI - 0.25); c.stroke(); }
c.fillStyle = s.skin; c.fillRect(43, 56, 10, 12);
if (s.longHair) { c.fillStyle = s.hair; c.fillRect(24, 18, 48, 52); }
c.fillStyle = s.skin; c.beginPath(); c.ellipse(48, 42, 17, 20, 0, 0, 7); c.fill();
if (!s.longHair) { c.fillStyle = s.hair; c.beginPath(); c.ellipse(48, 25, 17.5, 8, 0, M.PI, 7); c.fill(); }
else { c.fillStyle = s.hair; c.beginPath(); c.ellipse(48, 24, 18, 7.5, 0, M.PI, 7); c.fill(); }
if (s.shades) {
c.fillStyle = "#101418"; c.fillRect(29, 38, 38, 9);
c.fillRect(31, 39.5, 14, 6); c.fillRect(51, 39.5, 14, 6);
c.fillStyle = "rgba(160,220,255,0.5)"; c.fillRect(33, 40, 5, 2.4); c.fillRect(53, 40, 5, 2.4);
} else {
c.fillStyle = "#1c1410";
c.beginPath(); c.arc(41, 41, 2.1, 0, 7); c.fill();
c.beginPath(); c.arc(55, 41, 2.1, 0, 7); c.fill();
c.strokeStyle = "rgba(90,40,30,0.8)"; c.lineWidth = 1.6;
c.beginPath(); c.arc(48, 52, 6, 0.3, M.PI - 0.3); c.stroke();
}
if (s.hat) {
c.fillStyle = s.hat === "panama" ? "#f2e3c2" : "#3a2e22";
c.fillRect(22, 19, 52, 5.5);
c.beginPath(); c.ellipse(48, 15, 12.5, 8.5, 0, M.PI, 7); c.fill();
c.fillStyle = s.hat === "panama" ? "#c93a2e" : "#14100c"; c.fillRect(35.5, 17.5, 25, 3.4);
}
portraitCache[key] = cv;
return cv;
}
function dPor(canvas, key) {
const ctx = canvas.getContext("2d");
ctx.clearRect(0, 0, canvas.width, canvas.height);
ctx.drawImage(portraitCanvas(key), 0, 0, canvas.width, canvas.height);
}
const CUTSCENES = [
[
{ who: "celia", text: "Rico! You're finally back in Coral Bay. It's been so long, darling." },
{ who: "rico", text: "I came home with nothing, Celia. This city owes me an explanation." },
{ who: "celia", text: "Start small: drive me to the Starfish Club before the doors open." },
{ who: "rico", text: "Get in. Tonight, the wheel of fate spins again." },
],
[
{ who: "marco", text: "Rico, listen. My ledger was stolen — the syndicate's money vanished with it." },
{ who: "rico", text: "How much is gone, Marco?" },
{ who: "marco", text: "Enough to put us at the bottom of the bay. Three cases, in the downtown alleys." },
{ who: "rico", text: "Easy. Those cases will be back before dawn." },
],
[
{ who: "marco", text: "You found them? Good. Now we need muscle, not just paper." },
{ who: "rico", text: "The Dune Crusher in the industrial yard?" },
{ who: "marco", text: "That's the one. Take it, bring it to my lockup. If the cops ask, you don't know me." },
{ who: "rico", text: "I never know anybody, Marco." },
],
[
{ who: "celia", text: "Don Falso is starting to hear your name, Rico. That could be good — or very bad." },
{ who: "rico", text: "How do I make it good?" },
{ who: "celia", text: "Win this beach run. Six checkpoints, one clock. The whole bay is watching." },
{ who: "rico", text: "Then let's give them a show." },
],
[
{ who: "don", text: "So you're Rico Solano. A small name with a big echo." },
{ who: "rico", text: "I came here to work, Don. Not for small talk." },
{ who: "don", text: "Good. The helicopter at the airport — bring it to the marina helipad. The cops will object." },
{ who: "rico", text: "Their objections aren't my problem. Consider it done." },
],
[
{ who: "don", text: "One last job, Rico. After this, you're family — or a memory." },
{ who: "rico", text: "Family, then. What's the target?" },
{ who: "don", text: "Tribute from three spots across this city. Then get home — alive — while everyone hunts you." },
{ who: "rico", text: "Coral Bay will learn one name tonight." },
],
[
{ who: "don", text: "You did it. Full tribute, and you're still breathing. A rare thing." },
{ who: "rico", text: "I told you my work would get done, Don." },
{ who: "don", text: "From tonight you're no errand boy. You're my partner, Rico Solano." },
{ who: "rico", text: "Coral Bay... you're finally mine." },
],
];
const CUT_LINE_SECONDS = 2.9;
function csGiverPerson(cs) { return G.ct[cs.giverKey].person; }
function sCs(idx, onDone) {
const giverKey = idx < JOBS.length ? JOBS[idx].giver : "don";
const gp = G.ct[giverKey].person.mesh.position;
const pp = G.pl.mesh.position;
let dx = pp.x - gp.x, dz = pp.z - gp.z;
const dl = M.sqrt(dx * dx + dz * dz) || 1; dx /= dl; dz /= dl;
G.pl.mesh.position.set(gp.x + dx * 2.6, 0, gp.z + dz * 2.6);
G.pl.mesh.rotation.y = M.atan2(-dx, -dz);
G.ct[giverKey].person.mesh.rotation.y = M.atan2(dx, dz);
G.cs = { idx, lines: CUTSCENES[idx], line: 0, t: 0, giverKey, onDone: onDone || null };
G.gP = null;
if (G.pl.nP) G.pl.nP.visible = false;
sInt(null);
csShowLine();
sfxSting("start");
}
function csShowLine() {
const cs = G.cs; if (!cs) return;
const line = cs.lines[cs.line];
dPor(el("sub-face"), line.who);
el("sub-name").textContent = CHARACTERS[line.who].name;
el("sub-text").textContent = line.text;
el("subtitle").style.display = "flex";
}
function csCameraPose(cs) {
const a = G.pl.mesh.position, b = csGiverPerson(cs).mesh.position;
const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
let fx = b.x - a.x, fz = b.z - a.z;
const fl = M.sqrt(fx * fx + fz * fz) || 1; fx /= fl; fz /= fl;
const shot = cs.line % 3;
if (shot === 0) return { pos: [mx - fz * 5.2, 2.1, mz + fx * 5.2], look: [mx, 1.45, mz] };
if (shot === 1) return { pos: [a.x - fx * 4.2 - fz * 1.35, 1.78, a.z - fz * 4.2 + fx * 1.35], look: [b.x, 1.5, b.z] };
return { pos: [b.x + fx * 4.2 + fz * 1.35, 1.78, b.z + fz * 4.2 - fx * 1.35], look: [a.x, 1.5, a.z] };
}
function csApplyCamera(cs, dt) {
const pose = csCameraPose(cs);
const k = dt ? zm(dt * 2.4, 0, 1) : 1;
G.cm.position.x += (pose.pos[0] - G.cm.position.x) * k;
G.cm.position.y += (pose.pos[1] - G.cm.position.y) * k;
G.cm.position.z += (pose.pos[2] - G.cm.position.z) * k;
G.cm.lookAt(pose.look[0], pose.look[1], pose.look[2]);
}
function uCs(dt) {
const cs = G.cs; if (!cs) return;
cs.t += dt;
aPrs(G.pl, 0, dt);
if (cs.t >= CUT_LINE_SECONDS) {
cs.t = 0; cs.line++;
if (cs.line >= cs.lines.length) { finishCutscene(); return; }
csShowLine();
}
csApplyCamera(cs, dt);
}
function finishCutscene() {
if (!G.cs) return;
const cb = G.cs.onDone;
G.cs = null;
el("subtitle").style.display = "none";
if (G.pl.nP && G.oF) G.pl.nP.visible = true;
if (cb) cb();
}
function skCs() { finishCutscene(); }
