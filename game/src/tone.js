// tone.js — all sound is synthesised WebAudio, no audio files. A lazy
// AudioContext wakes on the first menu click; continuous voices (engine,
// siren) are steered once per frame from game state, one-shot voices
// (gunshot, horn, chime, crash) are built, played and dropped.

import { clamp } from './base.js';
import { G } from './state.js';

class Tone {
  constructor() {
    this.ctx = null; this.master = null;
    this.eng = null; this.sir = null;
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(ctx.destination);
      // engine voice: saw + sub square through a lowpass
      const eg = ctx.createGain(); eg.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 28;
      const og = ctx.createGain(); og.gain.value = 0.5;
      o1.connect(lp); o2.connect(og); og.connect(lp); lp.connect(eg); eg.connect(this.master);
      o1.start(); o2.start();
      this.eng = { eg, lp, o1, o2 };
      // siren voice: triangle whose pitch the frame update wobbles
      const sg = ctx.createGain(); sg.gain.value = 0;
      const so = ctx.createOscillator(); so.type = 'triangle'; so.frequency.value = 800;
      so.connect(sg); sg.connect(this.master); so.start();
      this.sir = { sg, so };
    } catch { /* no audio in this browser: the game plays silently */ }
  }
  blip(freq, dur = 0.12, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, freqFrom, freqTo, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(freqFrom, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), t + dur);
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  shot() { this.noise(0.16, 3200, 240, 0.5); this.blip(120, 0.1, 'square', 0.25); }
  crash(strength) { this.noise(0.28, 900, 120, clamp(strength / 26, 0.1, 0.6)); }
  honk() { this.blip(349, 0.3, 'square', 0.10); this.blip(440, 0.3, 'square', 0.10); }
  pickup() { this.blip(660, 0.09, 'sine', 0.22); this.blip(990, 0.12, 'sine', 0.22, 0.07); }
  fanfare() { [392, 523, 659, 784].forEach((f, i) => this.blip(f, 0.22, 'triangle', 0.22, i * 0.09)); }
  denied() { this.blip(160, 0.18, 'square', 0.15); }
  update(dt) {
    if (!this.ctx || !this.eng) return;
    const t = this.ctx.currentTime;
    const car = G.driveCar;
    if (car && G.mode === 'play') {
      const ratio = Math.abs(car.speed) / car.maxSpeed;
      const rpm = 52 + ratio * 165 + (G.keys.KeyW ? 14 : 0);
      this.eng.o1.frequency.setTargetAtTime(rpm, t, 0.05);
      this.eng.o2.frequency.setTargetAtTime(rpm / 2, t, 0.05);
      this.eng.lp.frequency.setTargetAtTime(320 + ratio * 950, t, 0.08);
      this.eng.eg.gain.setTargetAtTime(0.05 + ratio * 0.075, t, 0.09);
    } else {
      this.eng.eg.gain.setTargetAtTime(0, t, 0.1);
    }
    // siren loudness follows the nearest active police car
    let near = 1e9;
    for (const c of G.cops) {
      if (c.car.dead) continue;
      const dx = c.car.g.position.x - heroX(), dz = c.car.g.position.z - heroZ();
      near = Math.min(near, Math.hypot(dx, dz));
    }
    if (G.wanted.stars > 0 && near < 70 && G.mode === 'play') {
      this.sir.so.frequency.setTargetAtTime(760 + Math.sin(G.wall * 5.2) * 190, t, 0.03);
      this.sir.sg.gain.setTargetAtTime(clamp(0.055 * (1 - near / 75), 0.004, 0.05), t, 0.1);
    } else {
      this.sir.sg.gain.setTargetAtTime(0, t, 0.12);
    }
  }
}

function heroX() { return (G.driveCar ? G.driveCar.g.position.x : G.hero ? G.hero.g.position.x : 0); }
function heroZ() { return (G.driveCar ? G.driveCar.g.position.z : G.hero ? G.hero.g.position.z : 0); }

export const snd = new Tone();
