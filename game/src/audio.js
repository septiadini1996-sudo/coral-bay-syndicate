// audio.js — every sound is synthesised live with WebAudio: five invented
// radio stations from a tiny step sequencer, the engine, police sirens that
// swell as units close in, gunshots, crashes and explosions. No audio files.

'use strict';

let AC = null, masterGain = null, noiseBuf = null;
let radioOn = true, stationIdx = 0, seqTimer = null, seqStep = 0;
let engineNodes = null, sirenNodes = null;

const STATIONS = [
  { name: 'Coral FM 91.7', style: 'pads' },
  { name: 'Vibe 98.5', style: 'pluck' },
  { name: 'Neon Coast 104.3', style: 'bass' },
  { name: 'Radio Miramar 88.1', style: 'latin' },
  { name: 'K-BAY Talk 620', style: 'talk' },
];
W.stationName = () => STATIONS[stationIdx].name;
W.radioOn = () => radioOn;

function startAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }
  masterGain = AC.createGain(); masterGain.gain.value = 0.55;
  masterGain.connect(AC.destination);
  const len = AC.sampleRate * 1;
  noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  startSequencer();
}

function note(freq, t, dur, type, vol, dest) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest || masterGain);
  o.start(t); o.stop(t + dur + 0.05);
}

function noiseHit(t, dur, vol, freq, q) {
  const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 0.8;
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(masterGain);
  src.start(t); src.stop(t + dur + 0.05);
}

// A 16-step loop per station; chords are A-minor family, warm and coastal.
const CHORDS = [[110, 164.8, 220, 261.6], [87.3, 130.8, 174.6, 220], [98, 146.8, 196, 246.9], [130.8, 196, 261.6, 329.6]];
const MELODY = [440, 0, 523.3, 0, 659.3, 0, 523.3, 440, 392, 0, 440, 0, 493.9, 0, 392, 0];
const BASSLINE = [55, 0, 55, 55, 0, 55, 0, 65.4, 0, 55, 0, 55, 82.4, 0, 73.4, 0];
const LATIN = [220, 261.6, 329.6, 261.6, 220, 261.6, 329.6, 392, 220, 261.6, 329.6, 261.6, 293.7, 0, 246.9, 0];

function startSequencer() {
  const radioGain = AC.createGain(); radioGain.gain.value = 0.16; radioGain.connect(masterGain);
  W.radioGain = radioGain;
  const stepDur = 0.21;
  seqTimer = setInterval(() => {
    if (!AC || W.paused || !W.started) return;
    const inCar = W.player && W.player.car;
    radioGain.gain.value = radioOn && inCar ? 0.16 : 0.0;
    if (!radioOn || !inCar) return;
    const t = AC.currentTime + 0.06, s = seqStep % 16, bar = Math.floor(seqStep / 16) % 4;
    const style = STATIONS[stationIdx].style;
    if (style === 'pads') {
      if (s === 0) for (const f of CHORDS[bar]) note(f, t, 3.2, 'triangle', 0.05, radioGain);
      if (MELODY[s]) note(MELODY[s] * 0.5, t, 0.5, 'sine', 0.035, radioGain);
    } else if (style === 'pluck') {
      if (MELODY[s]) note(MELODY[s], t, 0.24, 'square', 0.028, radioGain);
      if (s % 4 === 0) note(CHORDS[bar][0] * 2, t, 0.4, 'triangle', 0.04, radioGain);
      if (s % 2 === 0) noiseHit(t, 0.03, 0.012, 6000, 1);
    } else if (style === 'bass') {
      if (BASSLINE[s]) note(BASSLINE[s], t, 0.2, 'sawtooth', 0.075, radioGain);
      if (s === 0) for (const f of CHORDS[bar]) note(f * 2, t, 1.4, 'sawtooth', 0.012, radioGain);
      if (s % 4 === 2) noiseHit(t, 0.05, 0.02, 3000, 1);
    } else if (style === 'latin') {
      if (LATIN[s]) note(LATIN[s], t, 0.18, 'triangle', 0.05, radioGain);
      if (s % 2 === 0) note(110, t, 0.1, 'sine', 0.06, radioGain);
      if (s % 8 === 4) noiseHit(t, 0.08, 0.015, 5000, 2);
    } else { // talk: muffled voice-like burbles and a time pip
      if (s % 2 === 0 && Math.random() < 0.7) note(110 + Math.random() * 60, t, 0.09, 'sawtooth', 0.02, radioGain);
      if (s === 0 && bar === 0) note(880, t, 0.12, 'sine', 0.03, radioGain);
    }
    seqStep++;
  }, stepDur * 1000);
}

function nextStation() {
  stationIdx = (stationIdx + 1) % STATIONS.length;
  seqStep = 0;
  if (W.notify) W.notify('Radio: ' + STATIONS[stationIdx].name);
}
function toggleRadio() {
  radioOn = !radioOn;
  if (W.notify) W.notify(radioOn ? 'Radio on — ' + STATIONS[stationIdx].name : 'Radio off');
}

// --- engine and siren beds ------------------------------------------------------
function startEngineSound() {
  if (!AC || engineNodes) return;
  const o1 = AC.createOscillator(), o2 = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
  o1.type = 'sawtooth'; o2.type = 'square';
  f.type = 'lowpass'; f.frequency.value = 420;
  g.gain.value = 0.0;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(masterGain);
  o1.start(); o2.start();
  engineNodes = { o1, o2, g, f };
}
function stopEngineSound() {
  if (!engineNodes) return;
  try { engineNodes.o1.stop(); engineNodes.o2.stop(); } catch (e) { /* already stopped */ }
  engineNodes = null;
}
W.audioTick = {
  carSound(rpm, on) {
    if (!engineNodes || !AC) return;
    const t = AC.currentTime;
    engineNodes.o1.frequency.setTargetAtTime(46 + rpm * 150, t, 0.06);
    engineNodes.o2.frequency.setTargetAtTime(23 + rpm * 76, t, 0.06);
    engineNodes.g.gain.setTargetAtTime(0.028 + rpm * 0.05 + (on ? 0.012 : 0), t, 0.09);
    engineNodes.f.frequency.setTargetAtTime(320 + rpm * 700, t, 0.1);
  },
};

function updateSirens() {
  if (!AC) return;
  let nearest = Infinity;
  if (W.player) for (const car of W.cops) nearest = Math.min(nearest, dist(car.x, car.z, W.player.x, W.player.z));
  const want = W.heat > 0 && nearest < 85;
  if (want && !sirenNodes) {
    const o = AC.createOscillator(), g = AC.createGain(), lfo = AC.createOscillator(), lg = AC.createGain();
    o.type = 'triangle'; o.frequency.value = 760;
    lfo.frequency.value = 0.55; lg.gain.value = 190;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.value = 0;
    o.connect(g); g.connect(masterGain);
    o.start(); lfo.start();
    sirenNodes = { o, g, lfo };
  }
  if (sirenNodes) {
    const vol = want ? clamp(0.05 * (1 - nearest / 95), 0.004, 0.05) : 0;
    sirenNodes.g.gain.setTargetAtTime(vol, AC.currentTime, 0.2);
    if (!want && vol === 0) {
      try { sirenNodes.o.stop(); sirenNodes.lfo.stop(); } catch (e) { /* done */ }
      sirenNodes = null;
    }
  }
}

// --- one-shot effects --------------------------------------------------------------
function playGunshot(kind) {
  if (!AC || W.paused) return;
  const t = AC.currentTime;
  noiseHit(t, kind === 'Rifle' ? 0.22 : 0.13, 0.22, kind === 'SMG' ? 1500 : 1100, 0.6);
  note(120, t, 0.08, 'square', 0.1);
}
function playDryFire() { if (AC) note(1400, AC.currentTime, 0.04, 'square', 0.05); }
function playCrash(impact) {
  if (!AC) return;
  noiseHit(AC.currentTime, 0.25, clamp(impact * 0.02, 0.05, 0.3), 500, 0.5);
}
function playExplosion() {
  if (!AC) return;
  const t = AC.currentTime;
  noiseHit(t, 0.9, 0.5, 160, 0.4);
  note(58, t, 0.8, 'sine', 0.5);
  note(40, t + 0.05, 0.9, 'sine', 0.4);
}
function playSpikePop() {
  if (!AC) return;
  const t = AC.currentTime;
  noiseHit(t, 0.3, 0.3, 2400, 1);
  noiseHit(t + 0.07, 0.4, 0.2, 900, 1);
}
function playCash() {
  if (!AC) return;
  const t = AC.currentTime;
  note(1318, t, 0.09, 'square', 0.05);
  note(1760, t + 0.07, 0.16, 'square', 0.05);
}
function updateAudio() { updateSirens(); }
