
"use strict";

const Sfx = {
	ctx: null, master: null, engineOsc: null, engineOsc2: null, engineGain: null, engineFilter: null,
	sirenOsc: null, sirenGain: null, sirenLfo: null,
	rainSrc: null, rainGain: null,
	radioGain: null, radioStep: 0, radioNext: 0,
};

function sfxInit() {
	if (Sfx.ctx) { if (Sfx.ctx.state === "suspended") Sfx.ctx.resume(); return; }
	const AC = window.AudioContext || window.webkitAudioContext;
	if (!AC) return;
	const ctx = new AC();
	Sfx.ctx = ctx;
	Sfx.master = ctx.createGain();
	Sfx.master.gain.value = G.muted ? 0 : 0.55;
	Sfx.master.connect(ctx.destination);

	Sfx.engineOsc = ctx.createOscillator(); Sfx.engineOsc.type = "sawtooth";
	Sfx.engineOsc2 = ctx.createOscillator(); Sfx.engineOsc2.type = "square";
	Sfx.engineFilter = ctx.createBiquadFilter(); Sfx.engineFilter.type = "lowpass";
	Sfx.engineFilter.frequency.value = 400; Sfx.engineFilter.Q.value = 2;
	Sfx.engineGain = ctx.createGain(); Sfx.engineGain.gain.value = 0;
	Sfx.engineOsc.connect(Sfx.engineFilter); Sfx.engineOsc2.connect(Sfx.engineFilter);
	Sfx.engineFilter.connect(Sfx.engineGain); Sfx.engineGain.connect(Sfx.master);
	Sfx.engineOsc.start(); Sfx.engineOsc2.start();

	Sfx.sirenOsc = ctx.createOscillator(); Sfx.sirenOsc.type = "triangle";
	Sfx.sirenLfo = ctx.createOscillator(); Sfx.sirenLfo.type = "sine"; Sfx.sirenLfo.frequency.value = 0.55;
	const lfoGain = ctx.createGain(); lfoGain.gain.value = 260;
	Sfx.sirenLfo.connect(lfoGain); lfoGain.connect(Sfx.sirenOsc.frequency);
	Sfx.sirenGain = ctx.createGain(); Sfx.sirenGain.gain.value = 0;
	Sfx.sirenOsc.connect(Sfx.sirenGain); Sfx.sirenGain.connect(Sfx.master);
	Sfx.sirenOsc.frequency.value = 950; Sfx.sirenOsc.start(); Sfx.sirenLfo.start();

	const len = ctx.sampleRate * 2;
	const buf = ctx.createBuffer(1, len, ctx.sampleRate);
	const data = buf.getChannelData(0);
	for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
	Sfx.rainSrc = ctx.createBufferSource(); Sfx.rainSrc.buffer = buf; Sfx.rainSrc.loop = true;
	const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1600; bp.Q.value = 0.4;
	Sfx.rainGain = ctx.createGain(); Sfx.rainGain.gain.value = 0;
	Sfx.rainSrc.connect(bp); bp.connect(Sfx.rainGain); Sfx.rainGain.connect(Sfx.master);
	Sfx.rainSrc.start();

	Sfx.radioGain = ctx.createGain(); Sfx.radioGain.gain.value = 0;
	Sfx.radioGain.connect(Sfx.master);
}

function sfxTone(freq, dur, type, vol, slideTo, delay) {
	if (!Sfx.ctx) return;
	const ctx = Sfx.ctx, t0 = ctx.currentTime + (delay || 0);
	const o = ctx.createOscillator(), g = ctx.createGain();
	o.type = type || "sine"; o.frequency.setValueAtTime(freq, t0);
	if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
	g.gain.setValueAtTime(0, t0);
	g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
	g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
	o.connect(g); g.connect(Sfx.master);
	o.start(t0); o.stop(t0 + dur + 0.05);
}
function sfxNoise(dur, vol, freq, delay) {
	if (!Sfx.ctx) return;
	const ctx = Sfx.ctx, t0 = ctx.currentTime + (delay || 0);
	const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
	const buf = ctx.createBuffer(1, len, ctx.sampleRate);
	const d = buf.getChannelData(0);
	for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
	const src = ctx.createBufferSource(); src.buffer = buf;
	const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 1200;
	const g = ctx.createGain(); g.gain.value = vol;
	src.connect(f); f.connect(g); g.connect(Sfx.master);
	src.start(t0);
}

function sfxClick() { sfxTone(660, 0.07, "square", 0.12); }
function sfxPickup() { sfxTone(880, 0.09, "sine", 0.2); sfxTone(1320, 0.14, "sine", 0.2, 0, 0.07); }
function sfxCash() { sfxTone(990, 0.08, "triangle", 0.22); sfxTone(1320, 0.1, "triangle", 0.22, 0, 0.06); sfxTone(1760, 0.16, "triangle", 0.2, 0, 0.12); }
function sfxPunch() { sfxNoise(0.09, 0.3, 500); sfxTone(120, 0.1, "sine", 0.3, 55); }
function sfxShot() { sfxNoise(0.14, 0.4, 3200); sfxTone(220, 0.12, "square", 0.18, 60); }
function sfxCrash(strength) { sfxNoise(0.25, clamp(0.1 + strength * 0.02, 0.1, 0.45), 700); sfxTone(90, 0.2, "sine", 0.25, 40); }
function sfxSting(kind) {
	if (kind === "good") { [523, 659, 784, 1046].forEach((f, i) => sfxTone(f, 0.22, "triangle", 0.2, 0, i * 0.09)); }
	else if (kind === "bad") { [392, 330, 262, 196].forEach((f, i) => sfxTone(f, 0.25, "triangle", 0.2, 0, i * 0.1)); }
	else { sfxTone(740, 0.12, "sine", 0.18); sfxTone(988, 0.18, "sine", 0.18, 0, 0.09); }
}

const RST = [
	{ name: "Coral FM — synthwave", wave: "sawtooth", base: 110, scale: [0, 3, 5, 7, 10, 12, 10, 7], tempo: 0.21 },
	{ name: "Marina Gold — oldies", wave: "triangle", base: 196, scale: [0, 4, 7, 12, 7, 4, 2, 0], tempo: 0.26 },
	{ name: "Palmera Nights — jazz", wave: "sine", base: 147, scale: [0, 7, 10, 14, 12, 10, 7, 5], tempo: 0.3 },
	{ name: "Syndicate Talk — static", wave: "square", base: 82, scale: [0, 0, 12, 0, 3, 0, 10, 0], tempo: 0.17 },
];
function sfxRadioNote() {
	const st = RST[G.radioStation % RST.length];
	const semi = st.scale[Sfx.radioStep % st.scale.length];
	const freq = st.base * Math.pow(2, semi / 12);
	if (!Sfx.ctx) return;
	const ctx = Sfx.ctx, t0 = ctx.currentTime;
	const o = ctx.createOscillator(), g = ctx.createGain();
	o.type = st.wave; o.frequency.value = freq;
	g.gain.setValueAtTime(0.14, t0);
	g.gain.exponentialRampToValueAtTime(0.001, t0 + st.tempo * 0.95);
	o.connect(g); g.connect(Sfx.radioGain);
	o.start(t0); o.stop(t0 + st.tempo);
	Sfx.radioStep++;
}

function sfxUpdate(dt) {
	if (!Sfx.ctx) return;
	const ctx = Sfx.ctx, now = ctx.currentTime;
	let engineLevel = 0, engineFreq = 55;
	if (!G.onFoot && G.vehicle && G.mode === "play") {
		const sp = Math.abs(G.vehicle.speed || 0);
		engineLevel = G.vehicle.kind === "heli" ? 0.05 : 0.075;
		engineFreq = 50 + sp * 3.4 + (G.keys["KeyW"] ? 14 : 0);
	}
	Sfx.engineGain.gain.setTargetAtTime(engineLevel, now, 0.09);
	Sfx.engineOsc.frequency.setTargetAtTime(engineFreq, now, 0.06);
	Sfx.engineOsc2.frequency.setTargetAtTime(engineFreq * 0.5 + 3, now, 0.06);
	Sfx.engineFilter.frequency.setTargetAtTime(300 + engineFreq * 5, now, 0.1);

	let sirenLevel = 0;
	if (G.wanted > 0 && G.player) {
		let nearest = 1e9;
		for (const c of G.police) {
			const d = dist2d(c.mesh.position.x, c.mesh.position.z, G.player.mesh.position.x, G.player.mesh.position.z);
			if (d < nearest) nearest = d;
		}
		if (nearest < 90) sirenLevel = clamp(0.16 * (1 - nearest / 110), 0.02, 0.16);
	}
	Sfx.sirenGain.gain.setTargetAtTime(sirenLevel, now, 0.2);
	Sfx.rainGain.gain.setTargetAtTime(G.weather === "rain" ? 0.12 : 0, now, 0.4);

	const radioWanted = G.radioOn && !G.onFoot && G.vehicle && G.vehicle.kind !== "bicycle" && G.mode === "play";
	Sfx.radioGain.gain.setTargetAtTime(radioWanted ? 0.5 : 0, now, 0.15);
	if (radioWanted && now >= Sfx.radioNext) {
		sfxRadioNote();
		Sfx.radioNext = now + RST[G.radioStation % RST.length].tempo;
	}
}
