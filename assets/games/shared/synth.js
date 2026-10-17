// Shared by the arcade games (each bundles its own copy): a tiny Web Audio synth — soft
// effects and a music sequencer, all made in the browser, nothing to download.
//
//   master → compressor → speakers; an effects bus and a music bus (the music bus has a
//   duck for the pause menu and a low-pass "muffle", e.g. underground).
//   Music is a step function (16ths) scheduled ~0.18 s ahead on the audio clock, so it
//   never stutters; its tempo can change from one step to the next.

let AC = null, master = null, sfxBus = null, musicBus = null, musicDuck = null, muffle = null;
let muted = false, musicOn = true, quiet = false, keyPrefix = 'game';
let musicLevel = 0.34;

/** Where this game keeps its sound switches, and how loud its music sits. */
export function setup(prefix, level) {
  keyPrefix = prefix; if (level) musicLevel = level;
  try { muted = localStorage.getItem(prefix + '.muted') === '1'; musicOn = localStorage.getItem(prefix + '.music') !== '0'; } catch { /* storage off (sandboxed) */ }
}
/** The audio graph, made on the first tap (browsers only start sound from one). */
export function audio() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
      master = AC.createGain(); master.connect(comp); comp.connect(AC.destination);
      sfxBus = AC.createGain(); sfxBus.gain.value = 2.2; sfxBus.connect(master); // (each effect is written quiet; this sets them all just under the music)
      musicDuck = AC.createGain(); musicDuck.connect(master);
      muffle = AC.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.connect(musicDuck);
      musicBus = AC.createGain(); musicBus.gain.value = musicLevel; musicBus.connect(muffle);
    } catch { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
  if (master) master.gain.value = muted ? 0 : 1;
  return AC;
}
export const ctx = () => AC;
export const buses = () => ({ sfx: sfxBus, music: musicBus });
export const isMuted = () => muted;
export const isMusicOn = () => musicOn;
export function setMuted(on) { muted = on; try { localStorage.setItem(keyPrefix + '.muted', on ? '1' : '0'); } catch { /* ok */ } audio(); }
export function setMusic(on) { musicOn = on; try { localStorage.setItem(keyPrefix + '.music', on ? '1' : '0'); } catch { /* ok */ } audio(); }
/** Silence without remembering it (a headless simulation). */
export function setQuiet(on) { quiet = on; }
const silent = () => !AC || muted || quiet;
/** Quieter under the pause menu. */
export function duck(on) { if (musicDuck) musicDuck.gain.setTargetAtTime(on ? 0.3 : 1, AC.currentTime, 0.15); }
/** Muffle the music (as if through a wall — `freq` is how much), or not. */
export function muffled(on, freq = 650) { if (muffle) muffle.frequency.setTargetAtTime(on ? freq : 20000, AC.currentTime, 0.2); }

// ---- building blocks ------------------------------------------------------------------------
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export function env(g, t0, vol, attack, decay) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}
export function tone(f, d, { type = 'sine', vol = 0.04, slideTo = 0, delay = 0, attack = 0.005, bus, lp = 0, t } = {}) {
  if (silent()) return;
  const t0 = t !== undefined ? t : AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + d);
  env(g, t0, vol, attack, d);
  let out = g;
  if (lp) { const f2 = AC.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp; g.connect(f2); out = f2; }
  o.connect(g); out.connect(bus || sfxBus); o.start(t0); o.stop(t0 + attack + d + 0.05);
}
let noiseBuf = null;
export function noise(d, { vol = 0.05, type = 'lowpass', freq = 800, q = 0.7, sweepTo = 0, delay = 0, attack = 0.003, bus, t } = {}) {
  if (silent()) return;
  if (!noiseBuf) {
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const t0 = t !== undefined ? t : AC.currentTime + delay, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + d);
  env(g, t0, vol, attack, d);
  src.connect(f); f.connect(g); g.connect(bus || sfxBus); src.start(t0, Math.random() * 0.5); src.stop(t0 + attack + d + 0.05);
}
/** A plucked string, a little like a koto: a bright attack that mellows fast. */
export function pluck(f, t, vol, bus, decay = 0.6) {
  if (silent()) return;
  const o = AC.createOscillator(), o2 = AC.createOscillator(), g = AC.createGain(), lp = AC.createBiquadFilter(), g2 = AC.createGain();
  o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.003;
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 7, t); lp.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.35);
  g2.gain.value = 0.35;
  env(g, t, vol, 0.004, decay);
  o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(bus || musicBus);
  o.start(t); o2.start(t); o.stop(t + decay + 0.1); o2.stop(t + decay + 0.1);
}
/** A held synth note: `type` oscillators (detuned a hair), a filter that opens and closes, a slow vibrato. */
export function lead(f, t, len, vol, { type = 'sine', detune = 0, cutoff = 0, vibrato = 0.008, breath = 0.25, bus } = {}) {
  if (silent()) return;
  const g = AC.createGain(), vib = AC.createOscillator(), vg = AC.createGain(), oscs = [];
  vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * vibrato, t + Math.min(0.25, len));
  vib.connect(vg);
  for (const dt of detune ? [-detune, detune] : [0]) {
    const o = AC.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = dt; vg.connect(o.frequency); oscs.push(o);
  }
  let into = g;
  if (cutoff) { const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(cutoff * 1.8, t); lp.frequency.exponentialRampToValueAtTime(cutoff, t + 0.12); lp.connect(g); into = lp; }
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.setValueAtTime(vol, t + Math.max(0.03, len - 0.05)); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.1);
  g.connect(bus || musicBus);
  for (const o of oscs) { o.connect(into); o.start(t); o.stop(t + len + 0.15); }
  vib.start(t); vib.stop(t + len + 0.15);
  if (breath) noise(Math.min(0.1, len), { vol: vol * breath, type: 'bandpass', freq: f * 2, q: 2, bus: bus || musicBus, t });
}
/** Drums for a song: a soft kick, a clap, a closed and an open hat. */
export const drum = {
  kick(t, vol = 0.5) {
    if (silent()) return;
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    env(g, t, vol, 0.002, 0.18); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.25);
  },
  clap(t, vol = 0.16) { noise(0.12, { vol, type: 'bandpass', freq: 1500, q: 0.8, bus: musicBus, t }); },
  hat(t, vol = 0.06) { noise(0.035, { vol, type: 'highpass', freq: 7000, bus: musicBus, t }); },
  open(t, vol = 0.05) { noise(0.16, { vol, type: 'highpass', freq: 6500, bus: musicBus, t }); },
};

// ---- the sequencer --------------------------------------------------------------------------
/** Plays `song.step(step, time, secondsPer16th)` for as long as it's on, at `song.bpm()` (asked
 *  every step, so the tempo can follow the game). */
export function sequencer(song) {
  const M = { on: false, step: 0, next: 0, timer: null, key: null };
  function schedule() {
    if (!AC || !M.on || silent() || !musicOn) { if (AC) M.next = AC.currentTime + 0.05; return; }
    if (M.next < AC.currentTime) M.next = AC.currentTime + 0.05; // (back from a pause or a hidden page: no catch-up burst)
    while (M.next < AC.currentTime + 0.18) {
      const sx = 60 / song.bpm() / 4;
      song.step(M.step, M.next, sx);
      M.step++; M.next += sx;
    }
  }
  return {
    /** Start (from the top when `key` changes — a new stretch, a new run) or stop. */
    play(on, key) {
      if (on && (!M.on || M.key !== key)) { M.step = 0; if (AC) M.next = AC.currentTime + 0.1; }
      M.on = on; M.key = key;
      if (!M.timer) M.timer = setInterval(schedule, 40);
    },
    state: () => ({ on: M.on && musicOn && !muted && !quiet, step: M.step, bpm: Math.round(song.bpm()), ctx: AC ? AC.state : 'none' }),
  };
}
