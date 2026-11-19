// sound.js — every sound is synthesized with WebAudio; the game ships no
// audio files. One lazy AudioContext, a master gain, and small voices:
// engine loop, sirens, horns, gunfire, rain and harbour ambience.
import { clamp } from './defs.js';

let ctx = null;
let master = null;
let engineOsc = null, engineSub = null, engineGain = null, engineFilter = null;
let sirenOsc = null, sirenGain = null;
let rainGain = null, ambGain = null;

function noiseBuffer(seconds) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  return buf;
}
let sharedNoise = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  sharedNoise = noiseBuffer(2);
  // Engine voice: two detuned oscillators through a lowpass, gain driven
  // by speed each frame from updateAudio().
  engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
  engineSub = ctx.createOscillator(); engineSub.type = 'square';
  engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
  engineGain = ctx.createGain(); engineGain.gain.value = 0;
  engineOsc.connect(engineFilter); engineSub.connect(engineFilter);
  engineFilter.connect(engineGain); engineGain.connect(master);
  engineOsc.start(); engineSub.start();
  // Siren voice: a triangle whose frequency updateAudio() wails.
  sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 700;
  sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain); sirenGain.connect(master);
  sirenOsc.start();
  // Rain: looped filtered noise, gain follows the wetness.
  const rain = ctx.createBufferSource(); rain.buffer = sharedNoise; rain.loop = true;
  const rainFilter = ctx.createBiquadFilter(); rainFilter.type = 'bandpass'; rainFilter.frequency.value = 1800; rainFilter.Q.value = 0.4;
  rainGain = ctx.createGain(); rainGain.gain.value = 0;
  rain.connect(rainFilter); rainFilter.connect(rainGain); rainGain.connect(master);
  rain.start();
  // Harbour ambience: very soft low noise (distant surf), always on.
  const amb = ctx.createBufferSource(); amb.buffer = sharedNoise; amb.loop = true; amb.playbackRate.value = 0.3;
  const ambFilter = ctx.createBiquadFilter(); ambFilter.type = 'lowpass'; ambFilter.frequency.value = 240;
  ambGain = ctx.createGain(); ambGain.gain.value = 0.016;
  amb.connect(ambFilter); ambFilter.connect(ambGain); ambGain.connect(master);
  amb.start();
}

function blip(freqA, freqB, dur, type, vol, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freqA, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noiseHit(dur, filterFreq, type, vol, rate = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = sharedNoise; src.playbackRate.value = rate;
  src.playbackRate.setValueAtTime(rate, t);
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random()); src.stop(t + dur + 0.02);
}

export const sfx = {
  shot() { noiseHit(0.16, 2600, 'highpass', 0.5); blip(220, 60, 0.1, 'square', 0.25); },
  punch() { noiseHit(0.08, 500, 'lowpass', 0.4); blip(120, 50, 0.08, 'sine', 0.3); },
  crash(v = 1) { noiseHit(0.3, 900, 'lowpass', 0.45 * clamp(v, 0.2, 1)); blip(90, 40, 0.25, 'sawtooth', 0.2 * v); },
  horn() { blip(370, 350, 0.28, 'square', 0.12); blip(466, 440, 0.28, 'square', 0.08); },
  ding() { blip(1320, 1320, 0.12, 'sine', 0.22); blip(1760, 1760, 0.22, 'sine', 0.18, 0.09); },
  busted() { blip(392, 392, 0.2, 'triangle', 0.25); blip(311, 311, 0.2, 'triangle', 0.25, 0.2); blip(233, 220, 0.5, 'triangle', 0.25, 0.4); },
  unlock() { blip(660, 660, 0.09, 'sine', 0.2); blip(880, 880, 0.09, 'sine', 0.2, 0.09); blip(1100, 1100, 0.16, 'sine', 0.2, 0.18); },
  step() { noiseHit(0.05, 700, 'lowpass', 0.05, 0.7); },
  splash() { noiseHit(0.4, 1200, 'bandpass', 0.2, 0.6); },
};

// Called every frame with the live situation; all smoothing happens here so
// callers stay dumb. speed01: player's car speed fraction; siren01: nearest
// police pressure 0..1; wet: current road wetness.
export function updateAudio(speed01, inCar, siren01, wet, t) {
  if (!ctx) return;
  const eg = inCar ? 0.05 + speed01 * 0.10 : 0;
  engineGain.gain.setTargetAtTime(eg, ctx.currentTime, 0.08);
  const rpm = 55 + speed01 * 165;
  engineOsc.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.05);
  engineSub.frequency.setTargetAtTime(rpm * 0.5, ctx.currentTime, 0.05);
  engineFilter.frequency.setTargetAtTime(320 + speed01 * 1500, ctx.currentTime, 0.1);
  sirenGain.gain.setTargetAtTime(siren01 * 0.055, ctx.currentTime, 0.2);
  sirenOsc.frequency.setTargetAtTime(700 + Math.sin(t * 5.2) * 190, ctx.currentTime, 0.03);
  rainGain.gain.setTargetAtTime(wet * 0.11, ctx.currentTime, 0.4);
}
