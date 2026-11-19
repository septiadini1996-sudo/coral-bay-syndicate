// All sound in Coral Bay Syndicate is synthesised live with WebAudio — no audio
// files. A sawtooth engine that follows speed, a two-tone siren that swells as
// the police close in, noise-burst gunshots, impact thuds, UI chimes, and a
// laid-back tropical loop (Am–F–C–G pads with a soft plucked melody).
export function createAudio() {
  let ctx = null, master = null, muted = false;
  let engineNodes = null, sirenNodes = null, musicTimer = null, beat = 0;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }
  function noiseBuffer() {
    const len = ctx.sampleRate * 0.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
  let sharedNoise = null;

  function burst({ dur = 0.12, freq = 1800, type = 'bandpass', gain = 0.5, q = 0.8 }) {
    if (!ensure()) return;
    if (!sharedNoise) sharedNoise = noiseBuffer();
    const src = ctx.createBufferSource(); src.buffer = sharedNoise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter); filter.connect(g); g.connect(master);
    src.start(); src.stop(ctx.currentTime + dur + 0.02);
  }
  function tone({ freq = 440, dur = 0.15, type = 'sine', gain = 0.2, slide = 0, delay = 0 }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  const audio = {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    get muted() { return muted; },

    shoot(vol = 1) { burst({ dur: 0.11, freq: 1500, gain: 0.4 * vol }); burst({ dur: 0.05, freq: 3400, gain: 0.22 * vol }); },
    punch() { burst({ dur: 0.08, freq: 300, type: 'lowpass', gain: 0.4 }); },
    crash(v) { burst({ dur: 0.28, freq: 160, type: 'lowpass', gain: Math.min(0.8, 0.2 + v * 0.05) }); tone({ freq: 70, dur: 0.2, type: 'sine', gain: 0.3, slide: -30 }); },
    pickup() { tone({ freq: 880, dur: 0.09, type: 'triangle', gain: 0.22 }); tone({ freq: 1320, dur: 0.12, type: 'triangle', gain: 0.2, delay: 0.06 }); },
    chime() { [660, 880, 1100, 1320].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.18, delay: i * 0.07 })); },
    denied() { tone({ freq: 180, dur: 0.16, type: 'square', gain: 0.12 }); },
    honk() { tone({ freq: 370, dur: 0.17, type: 'square', gain: 0.06 }); tone({ freq: 466, dur: 0.17, type: 'square', gain: 0.05 }); },

    setEngine(on, ratio = 0) {
      if (!ensure()) return;
      if (on && !engineNodes) {
        const osc = ctx.createOscillator(); osc.type = 'sawtooth';
        const sub = ctx.createOscillator(); sub.type = 'square';
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 2;
        const g = ctx.createGain(); g.gain.value = 0;
        osc.connect(filter); sub.connect(filter); filter.connect(g); g.connect(master);
        osc.start(); sub.start();
        engineNodes = { osc, sub, filter, g };
      }
      if (engineNodes) {
        const t = ctx.currentTime;
        const rpm = 55 + ratio * 165;
        engineNodes.osc.frequency.setTargetAtTime(rpm, t, 0.06);
        engineNodes.sub.frequency.setTargetAtTime(rpm / 2, t, 0.06);
        engineNodes.filter.frequency.setTargetAtTime(320 + ratio * 1500, t, 0.08);
        engineNodes.g.gain.setTargetAtTime(on ? 0.055 + ratio * 0.05 : 0, t, 0.09);
        if (!on && engineNodes.g.gain.value < 0.002) { /* keep nodes; gain is ~0 */ }
      }
    },
    setSiren(on, dist = 60) {
      if (!ensure()) return;
      if (on && !sirenNodes) {
        const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 820;
        const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.55;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 130;
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
        const g = ctx.createGain(); g.gain.value = 0;
        osc.connect(g); g.connect(master);
        osc.start(); lfo.start();
        sirenNodes = { osc, lfo, g };
      }
      if (sirenNodes) {
        const vol = on ? Math.max(0, 0.085 * (1 - dist / 95)) : 0;
        sirenNodes.g.gain.setTargetAtTime(vol, ctx.currentTime, 0.15);
      }
    },

    startMusic() {
      if (!ensure() || musicTimer) return;
      const roots = [110, 87.3, 130.8, 98];              // A2 F2 C3 G2
      const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 261.6, 329.6], [196, 246.9, 293.7]];
      const melody = [440, 523, 659, 523, 587, 440, 392, 440];
      musicTimer = setInterval(() => {
        if (!ctx || muted) return;
        const bar = Math.floor(beat / 4) % 4;
        if (beat % 4 === 0) {
          tone({ freq: roots[bar], dur: 1.7, type: 'triangle', gain: 0.075 });
          for (const f of chords[bar]) tone({ freq: f, dur: 1.7, type: 'sine', gain: 0.02 });
        }
        if (beat % 2 === 0 && Math.random() < 0.75) {
          tone({ freq: melody[Math.floor(Math.random() * melody.length)] * (Math.random() < 0.2 ? 2 : 1), dur: 0.3, type: 'triangle', gain: 0.045 });
        }
        beat += 1;
      }, 430);
    },
  };
  return audio;
}
