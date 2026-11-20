"use strict";
function sW(n) {
n = zm(M.round(n), 0, 5);
if (n === G.wn) { uHud(); return; }
G.wn = n; G.wC = 0;
if (n > 0) sToa("Wanted level " + n + " — the CBPD is rolling");
uHud();
}
function addCrime(n) {
if (G.md !== "play" && !G.sg) return;
if (n <= 0) { if (G.wn === 0) sW(1); G.wC = 0; return; }
sW(M.min(5, G.wn + n));
G.wC = 0;
}
function dmgP(amt, floor5) {
if (amt <= 0) return;
const ab = M.min(G.ar, amt);
G.ar -= ab; amt -= ab;
if (amt > 0) G.hp = floor5 ? M.max(5, G.hp - amt) : G.hp - amt;
sHrt(); uHud();
}
function rmVeh(v) {
G.sc.remove(v.mesh);
for (const arr of [G.vs, G.tf, G.po]) {
const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1);
}
if (G.vh === v) { G.vh = null; G.oF = true; G.pl.mesh.visible = true; }
}
function sIc(nearX, nearZ) {
const a = rand(0, M.PI * 2), d = rand(105, 150);
let x = zm(nearX + M.cos(a) * d, -820, 820), z = zm(nearZ + M.sin(a) * d, -820, 820);
x = M.round(x / 160) * 160;
const v = spV("interceptor", x, z, rand(0, 6.28), 0x30343a, "police");
G.po.push(v);
return v;
}
let rb = { cars: [], cooldown: 3, active: false };
function uRb(dt) {
rb.cooldown -= dt;
if (rb.active) {
rb.t -= dt;
const pp = fPt();
const dBlock = d3(pp.x, pp.z, rb.x, rb.z);
const past = rb.cars.length && (dBlock < 14 || dBlock > 280);
if (rb.t <= 0 || past) {
for (const c of rb.cars) rmVeh(c);
rb.cars = []; rb.active = false; rb.cooldown = 22;
}
return;
}
if (G.wn < 3 || G.oF || !G.vh || M.abs(G.vh.speed) < 11 || rb.cooldown > 0) return;
const m = G.vh.mesh;
const fx = M.sin(m.rotation.y), fz = M.cos(m.rotation.y);
let bx = m.position.x + fx * 100, bz = m.position.z + fz * 100;
if (M.abs(fx) > M.abs(fz)) bz = M.round(bz / 160) * 160; else bx = M.round(bx / 160) * 160;
bx = zm(bx, -700, 700); bz = zm(bz, -700, 700);
const across = M.atan2(fx, fz) + M.PI / 2;
for (const off of [-4.5, 4.5]) {
const c = spV("interceptor", bx + M.sin(across) * off, bz + M.cos(across) * off, across, 0x30343a, "roadblock");
c.roadblock = true;
rb.cars.push(c);
}
rb.x = bx; rb.z = bz; rb.t = 30; rb.active = true;
sToa("Roadblock ahead!");
}
function fPt() {
if (!G.oF && G.vh) return G.vh.mesh.position;
return G.pl.mesh.position;
}
let pHeli = null, hLit = null, heliCone = null;
function ePH() {
if (pHeli || G.sN) return;
const pp = fPt();
pHeli = spV("heli", pp.x + 60, pp.z + 60, 0, 0x30343a, "police");
pHeli.alt = 44; pHeli.mesh.position.y = 44;
hLit = new T3.SpotLight(0xfff2cc, 900, 190, 0.36, 0.45, 1.4);
G.sc.add(hLit); G.sc.add(hLit.target);
const coneGeo = new CN(13, 46, 18, 1, true);
coneGeo.translate(0, -23, 0);
heliCone = new MS(coneGeo, new MB({
color: 0xfff2cc, transparent: true, opacity: 0.14, side: DS, depthWrite: false,
}));
G.sc.add(heliCone);
}
function dPH() {
if (!pHeli) return;
rmVeh(pHeli); pHeli = null;
if (hLit) { G.sc.remove(hLit); G.sc.remove(hLit.target); hLit = null; }
if (heliCone) { G.sc.remove(heliCone); heliCone = null; }
}
function uPH(dt) {
if (G.wn >= 4) ePH(); else if (pHeli && G.wn === 0) dPH();
if (!pHeli) return;
const pp = fPt();
const m = pHeli.mesh;
pHeli.rotorSpin += dt * 30;
if (m.userData.rotor) m.userData.rotor.rotation.y = pHeli.rotorSpin * 3;
const tx = pp.x + M.sin(G.tm * 0.4) * 16, tz = pp.z + M.cos(G.tm * 0.33) * 16;
m.position.x = lerp(m.position.x, tx, zm(dt * 1.6, 0, 1));
m.position.z = lerp(m.position.z, tz, zm(dt * 1.6, 0, 1));
m.position.y = lerp(m.position.y, 44, dt);
m.rotation.y = M.atan2(pp.x - m.position.x, pp.z - m.position.z);
hLit.position.set(m.position.x, m.position.y - 1, m.position.z);
hLit.target.position.set(pp.x, 0, pp.z);
heliCone.position.set(m.position.x, m.position.y - 1, m.position.z);
}
function uPol(dt) {
const pp = fPt();
G.wC += dt;
if (G.wn > 0 && G.wn <= 2 && G.wC > 30) sW(G.wn - 1);
const wantedCount = [0, 1, 2, 3, 4, 5][G.wn];
if (G.md === "play") {
while (G.po.length < wantedCount) sIc(pp.x, pp.z);
while (G.po.length > wantedCount) rmVeh(G.po[G.po.length - 1]);
}
const flash = M.floor(G.tm * 2.4) % 2 === 0;
for (const c of G.po) {
if (!c.alive) continue;
const bar = c.mesh.userData.lightBar;
if (bar) { bar.children[0].visible = flash; bar.children[1].visible = !flash; }
const m = c.mesh;
const d = d3(m.position.x, m.position.z, pp.x, pp.z);
if (d > 640) {
const a = rand(0, M.PI * 2);
m.position.set(zm(pp.x + M.cos(a) * 130, -820, 820), 0, zm(pp.z + M.sin(a) * 130, -820, 820));
continue;
}
const targetSpeed = G.oF ? 15 : 47;
const dx = pp.x - m.position.x, dz = pp.z - m.position.z;
const want = M.atan2(dx, dz);
const diff = aWp(want - m.rotation.y);
const input = {
up: d > 6 && M.abs(diff) < 1.25, down: d < 5 && M.abs(v_angDiff(m, pp)) > 2.4,
left: diff > 0.05, right: diff < -0.05, brake: d < 7 && G.oF,
};
if (M.abs(c.speed) > targetSpeed) input.up = false;
dVeh(c, dt, input);
if (G.oF && d < 2.4 && M.abs(c.speed) > 5) {
dmgP(11); G.pl.mesh.position.x += M.sin(m.rotation.y) * 3;
G.pl.mesh.position.z += M.cos(m.rotation.y) * 3;
sHrt(); sfxCrash(8);
}
}
uRb(dt);
uPH(dt);
uBus(dt);
}
function v_angDiff(m, pp) { return aWp(M.atan2(pp.x - m.position.x, pp.z - m.position.z) - m.rotation.y); }
function uBus(dt) {
if (G.md !== "play" || G.wn === 0) { G.bM = M.max(0, G.bM - dt * 0.5); sBUI(G.bM); return; }
const pp = fPt();
let near = false;
for (const c of G.po) {
if (d3(c.mesh.position.x, c.mesh.position.z, pp.x, pp.z) < 8.5) { near = true; break; }
}
const slow = G.oF ? (G.pl.speed || 0) < 2.2 : M.abs(G.vh.speed) < 1.6;
if (near && slow) G.bM += dt / 2.8;
else G.bM = M.max(0, G.bM - dt * 0.35);
sBUI(G.bM);
if (G.bM >= 1) dBus();
}
function cPol() {
while (G.po.length) rmVeh(G.po[0]);
for (const c of rb.cars) rmVeh(c);
rb.cars = []; rb.active = false;
dPH();
}
function rspH() {
if (G.vh) { G.vh.driver = null; G.vh = null; }
G.oF = true; poseS(false);
G.pl.mesh.visible = true;
G.pl.mesh.position.set(SP.sH.x, 0, SP.sH.z);
G.pl.y = 0; G.pl.vy = 0;
G.hp = 100; G.ar = 0; G.bM = 0;
cPol(); sW(0);
}
function dBus() {
G.bM = 0;
const fine = M.min(G.ca, M.max(50, M.round(G.ca * 0.12)));
G.ca -= fine;
rspH();
sfxSting("bad");
sCrd("BUSTED", "The CBPD cuffed Rico and relieved him of " + fCsh(fine) + ". He walks out of the station at dawn, back at the safehouse.", "Keep rolling");
sV(); uHud();
}
function dWas() {
const fine = M.min(G.ca, M.max(40, M.round(G.ca * 0.1)));
G.ca -= fine;
rspH();
sfxSting("bad");
sCrd("WASTED", "Rico wakes up outside Coral Bay General, " + fCsh(fine) + " lighter. The bay keeps turning.", "Keep rolling");
sV(); uHud();
}
function cHl(dt) {
if (G.hp <= 0 && G.md === "play") { G.hp = 0; dWas(); return; }
if (G.hp < 100 && G.md === "play") { G.hp = M.min(100, G.hp + dt * 1.1); uHud(); }
}
