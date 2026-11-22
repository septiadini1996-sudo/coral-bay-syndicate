// audio.js — every sound in Coral Bay is synthesized live with WebAudio:
// five radio stations (a sunny pop loop, a synthwave cruise, a jazz trio, a
// talk station and a rock station), the engine, police sirens that swell as
// units close in, the helicopter's rotor wash, gunshots, spikes and booms.
// Nothing is a file; the AudioContext wakes on the player's first input.
(function () {
  'use strict';

  const CBS = (window.CBS = window.CBS || {});
  const U = CBS.util;

  let ctx = null;
  let master = null;
  let radioGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let heliGain = null;
  let noiseBuf = null;
  let muted = false;

  const STATIONS = [
    { name: 'Coral FM 98.2', kind: 'pop', bpm: 104, root: 262, scale: [0, 2, 4, 7, 9], wave: 'triangle' },
    { name: 'Baywave 101.7', kind: 'wave', bpm: 92, root: 220, scale: [0, 3, 5, 7, 10], wave: 'sawtooth' },
    { name: 'Palmetto Jazz 88.9', kind: 'jazz', bpm: 76, root: 196, scale: [0, 4, 7, 11, 14], wave: 'sine' },
    { name: 'Anchor Talk 640', kind: 'talk', bpm: 60, root: 110, scale: [0], wave: 'sine' },
    { name: 'Kestrel Rock 105.3', kind: 'rock', bpm: 122, root: 165, scale: [0, 3, 5, 7, 10], wave: 'square' },
  ];
  let stationIndex = -1; // -1 = radio off
  let seqStep = 0;
  let nextStepTime = 0;
  let melodyWalk = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    radioGain = ctx.createGain();
    radioGain.gain.value = 0.0;
    radioGain.connect(master);
    // Shared noise buffer for drums, rotors and bursts.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // Engine: a detuned saw pair through a lowpass, gain driven by speed.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();
    // Siren: one oscillator whose frequency the tick wobbles.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    // Helicopter: looped noise through a bandpass, chopped in the tick.
    const heliSrc = ctx.createBufferSource();
    heliSrc.buffer = noiseBuf;
    heliSrc.loop = true;
    const heliFilter = ctx.createBiquadFilter();
    heliFilter.type = 'bandpass';
    heliFilter.frequency.value = 300;
    heliFilter.Q.value = 0.8;
    heliGain = ctx.createGain();
    heliGain.gain.value = 0;
    heliSrc.connect(heliFilter).connect(heliGain).connect(master);
    heliSrc.start();
    nextStepTime = ctx.currentTime + 0.1;
    return true;
  }

  function tone(freq, t, dur, type, vol, dest, slideTo) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest || master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noiseHit(t, dur, vol, filterFreq, type) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // The radio sequencer: 8th-note steps, each station with its own habits.
  function scheduleStep(step, t) {
    const st = STATIONS[stationIndex];
    if (!st) return;
    const spb = 60 / st.bpm / 2;
    const bar = Math.floor(step / 8) % 4;
    const roots = [1, 0.75, 1.335, 0.89]; // I, vi-ish, IV-ish, V-ish drift
    const rootF = st.root * roots[bar];
    if (st.kind === 'talk') {
      // Muffled studio murmur: a low warble and the odd paper shuffle.
      if (step % 4 === 0) tone(90 + Math.random() * 40, t, spb * 2.6, 'sine', 0.05, radioGain);
      if (Math.random() < 0.12) noiseHit(t, 0.08, 0.02, 1800, 'bandpass');
      return;
    }
    // Bass on the beat (and driving 8ths for wave/rock).
    if (step % 2 === 0 || st.kind === 'wave' || st.kind === 'rock') {
      tone(rootF / 2, t, spb * 0.95, st.kind === 'jazz' ? 'sine' : 'triangle', 0.11, radioGain);
    }
    // Drums: kick on quarters, hat on off-8ths, snare noise on 2 and 4.
    if (st.kind !== 'jazz' && step % 4 === 0) noiseHit(t, 0.1, 0.10, 300);
    if (step % 2 === 1) noiseHit(t, 0.03, 0.03, 7000, 'highpass');
    if (st.kind === 'rock' && step % 8 === 4) noiseHit(t, 0.12, 0.07, 1600, 'bandpass');
    // Melody: a lazy random walk on the station's scale.
    const density = st.kind === 'jazz' ? 0.3 : 0.55;
    if (Math.random() < density) {
      melodyWalk = U.clamp(melodyWalk + Math.floor(U.rand(-2, 3)), 0, st.scale.length + 3);
      const deg = st.scale[melodyWalk % st.scale.length];
      const oct = melodyWalk >= st.scale.length ? 2 : 1;
      const f = rootF * Math.pow(2, deg / 12) * oct;
      tone(f, t, spb * (st.kind === 'jazz' ? 1.8 : 1.1), st.wave, st.kind === 'wave' ? 0.045 : 0.07, radioGain);
    }
    // A soft chord pad at the top of each bar for pop and wave.
    if ((st.kind === 'pop' || st.kind === 'wave') && step % 8 === 0) {
      for (const deg of [0, 4, 7]) {
        tone(rootF * Math.pow(2, deg / 12), t, spb * 7, 'sine', 0.028, radioGain);
      }
    }
  }

  function tick(dt, driving) {
    if (!ctx) return;
    const now = ctx.currentTime;
    // Radio only sings from a car seat.
    const targetRadio = driving && stationIndex >= 0 ? 0.5 : 0.0;
    radioGain.gain.value = U.lerp(radioGain.gain.value, targetRadio, dt * 4);
    if (stationIndex >= 0) {
      const st = STATIONS[stationIndex];
      const spb = 60 / st.bpm / 2;
      while (nextStepTime < now + 0.14) {
        scheduleStep(seqStep, nextStepTime);
        nextStepTime += spb;
        seqStep++;
      }
    }
    // Siren wail.
    if (sirenGain) {
      const wail = 780 + Math.sin(now * 2.4) * 160;
      sirenOsc.frequency.value = wail;
    }
    // Rotor chop.
    if (heliGain && heliGain.gain.value > 0.003) {
      heliGain.gain.value *= 0.86 + 0.28 * Math.abs(Math.sin(now * 21));
    }
  }

  function setEngine(on, speedRatio, rpm) {
    if (!ctx) return;
    engineGain.gain.value = U.lerp(engineGain.gain.value, on ? 0.05 + speedRatio * 0.05 : 0, 0.2);
    engineOsc.frequency.value = 55 + rpm * 130 + speedRatio * 40;
  }

  let sirenLevel = 0;
  function sirenNear(v) { sirenLevel = Math.max(sirenLevel, v); }
  function heliNear(v) {
    if (ctx && heliGain) heliGain.gain.value = U.lerp(heliGain.gain.value, v * 0.14, 0.1);
  }

  function applyLevels(dt) {
    if (!ctx) return;
    sirenGain.gain.value = U.lerp(sirenGain.gain.value, sirenLevel * 0.055, dt * 5);
    sirenLevel = Math.max(0, sirenLevel - dt * 1.4);
  }

  function shot(mine) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    noiseHit(t, 0.13, mine ? 0.30 : 0.13, 2600);
    tone(mine ? 190 : 150, t, 0.09, 'square', mine ? 0.16 : 0.07, master, 60);
  }

  function explosion() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    noiseHit(t, 0.9, 0.5, 220);
    tone(120, t, 0.7, 'sine', 0.4, master, 34);
  }

  function spike() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    tone(2400, t, 0.28, 'square', 0.08, master, 300);
    noiseHit(t, 0.3, 0.16, 3200, 'highpass');
  }

  function blip(freq) {
    if (!ensure()) return;
    tone(freq || 760, ctx.currentTime, 0.12, 'sine', 0.10, master);
  }

  function cycleStation() {
    if (!ensure()) return -1;
    stationIndex++;
    if (stationIndex >= STATIONS.length) stationIndex = -1;
    seqStep = 0;
    nextStepTime = ctx.currentTime + 0.06;
    return stationIndex;
  }

  CBS.audio = {
    ensure, tick, applyLevels, setEngine, sirenNear, heliNear,
    shot, explosion, spike, blip, cycleStation, STATIONS,
    get stationIndex() { return stationIndex; },
    get stationName() { return stationIndex >= 0 ? STATIONS[stationIndex].name : 'Off'; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.8;
      return muted;
    },
  };
})();
