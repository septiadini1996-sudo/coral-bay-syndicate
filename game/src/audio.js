// Coral Bay Syndicate - audio.js
// All sound is synthesized with WebAudio: there are no audio files.
// The radio is a tiny step sequencer; each station has its own scale,
// tempo, waveform and bass pattern, so switching stations is audible
// at once. Effects (gunfire, explosions, pickups, cash) are one-shot
// synthesized blips layered over the music bus.

'use strict';

var AU = {
  ctx: null, musicGain: null, sfxGain: null,
  station: 0, playing: false, step: 0, nextT: 0, timer: null,
};

// Station table: name, DJ tag line, tempo, root note (Hz), scale
// steps in semitones, wave for the lead, and a mood colour for the UI.
var STATIONS = [
  { name: 'Coral FM 98.1', tag: 'Sunshine Pop All Day', bpm: 112, root: 220.0, wave: 'triangle',
    scale: [0, 2, 4, 7, 9, 12, 11, 9], bass: [0, -1, 7, -1, 5, -1, 4, -1] },
  { name: 'Neon Nights 101.4', tag: 'Synthwave After Dark', bpm: 96, root: 196.0, wave: 'sawtooth',
    scale: [0, 3, 5, 7, 10, 12, 10, 7], bass: [0, 0, -1, 0, 3, 3, -1, 5] },
  { name: 'Bay Rock 94.7', tag: 'Classic Coast Rock', bpm: 128, root: 164.8, wave: 'square',
    scale: [0, 4, 7, 9, 7, 4, 2, 4], bass: [0, -1, 0, -1, 7, -1, 5, -1] },
  { name: 'Marina Jazz 88.3', tag: 'Smooth Pier Sessions', bpm: 84, root: 174.6, wave: 'sine',
    scale: [0, 4, 7, 11, 9, 7, 5, 4], bass: [0, -1, -1, 7, -1, -1, 5, -1] },
  { name: 'Syndicate Radio', tag: 'Street Talk & Beats', bpm: 104, root: 146.8, wave: 'triangle',
    scale: [0, 2, 3, 7, 8, 7, 3, 2], bass: [0, -1, 0, 3, -1, 0, -1, 5] },
];

function auInit() {
  if (AU.ctx) return;
  try {
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    AU.ctx = new C();
    AU.musicGain = AU.ctx.createGain(); AU.musicGain.gain.value = 0.16;
    AU.musicGain.connect(AU.ctx.destination);
    AU.sfxGain = AU.ctx.createGain(); AU.sfxGain.gain.value = 0.5;
    AU.sfxGain.connect(AU.ctx.destination);
  } catch (e) { AU.ctx = null; }
}

function auNote(freq, t, dur, wave, gain, dest) {
  var o = AU.ctx.createOscillator(), g = AU.ctx.createGain();
  o.type = wave; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest || AU.musicGain);
  o.start(t); o.stop(t + dur + 0.02);
}

function auStep() {
  if (!AU.ctx || !AU.playing) return;
  var st = STATIONS[AU.station];
  var spb = 60 / st.bpm / 2;                       // eighth notes
  while (AU.nextT < AU.ctx.currentTime + 0.12) {
    var s = AU.step % 8;
    var semi = st.scale[s];
    var f = st.root * Math.pow(2, semi / 12);
    if (AU.step % 2 === 0 || rnd() > 0.4) auNote(f, AU.nextT, spb * 1.8, st.wave, 0.20);
    var b = st.bass[s];
    if (b >= 0) auNote(st.root / 2 * Math.pow(2, b / 12), AU.nextT, spb * 2.2, 'sine', 0.30);
    if (AU.step % 4 === 2) auNoise(AU.nextT, 0.03, 0.05, 6000);   // hat tick
    AU.step++; AU.nextT += spb;
  }
}

function auNoise(t, dur, gain, freq) {
  if (!AU.ctx) return;
  var len = Math.max(1, (AU.ctx.sampleRate * dur) | 0);
  var buf = AU.ctx.createBuffer(1, len, AU.ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = AU.ctx.createBufferSource(); src.buffer = buf;
  var f = AU.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1200;
  var g = AU.ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(AU.sfxGain);
  src.start(t);
}

function radioPlay() {
  auInit();
  if (!AU.ctx) return;
  if (AU.ctx.state === 'suspended') AU.ctx.resume();
  AU.playing = true; AU.step = 0; AU.nextT = AU.ctx.currentTime + 0.05;
  if (AU.timer) clearInterval(AU.timer);
  AU.timer = setInterval(auStep, 40);
}
function radioStop() { AU.playing = false; if (AU.timer) clearInterval(AU.timer); AU.timer = null; }
function radioStation(delta) {
  AU.station = (AU.station + delta + STATIONS.length) % STATIONS.length;
  AU.step = 0;
  if (AU.ctx) AU.nextT = Math.min(AU.nextT, AU.ctx.currentTime + 0.05);
  return STATIONS[AU.station];
}

// One-shot effects ------------------------------------------------
function sfx(kind) {
  if (!AU.ctx) return;
  var t = AU.ctx.currentTime;
  if (kind === 'shot') { auNoise(t, 0.09, 0.5, 900); auNote(140, t, 0.08, 'square', 0.25, AU.sfxGain); }
  else if (kind === 'smg') { auNoise(t, 0.05, 0.35, 1400); }
  else if (kind === 'boom') { auNoise(t, 0.7, 0.9, 220); auNote(55, t, 0.7, 'sine', 0.8, AU.sfxGain); }
  else if (kind === 'cash') { auNote(880, t, 0.09, 'triangle', 0.3, AU.sfxGain); auNote(1318, t + 0.08, 0.14, 'triangle', 0.3, AU.sfxGain); }
  else if (kind === 'pickup') { auNote(520, t, 0.1, 'sine', 0.35, AU.sfxGain); auNote(780, t + 0.09, 0.16, 'sine', 0.35, AU.sfxGain); }
  else if (kind === 'crash') { auNoise(t, 0.25, 0.6, 500); }
  else if (kind === 'step') { auNoise(t, 0.03, 0.06, 700); }
  else if (kind === 'hurt') { auNote(180, t, 0.12, 'sawtooth', 0.3, AU.sfxGain); }
}
