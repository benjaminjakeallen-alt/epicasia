// Chain Gang Dynasty — sound, all made in the browser (Web Audio), nothing to download.
// User, Oct 15 2026: "really subtle sound effects for the game and some catchy music".
//
//   effects  soft and short: sine/triangle tones and filtered noise, well under the music
//   music    a looping tune on the pentatonic scale (it sounds a little like East Asia):
//            a flute-ish lead with a hook, a plucked koto-style arpeggio, a round bass,
//            a soft kick, clap and shaker. Each stretch has its own key and speed.
//            Scheduled a moment ahead on the audio clock, so it never stutters.

let AC = null, master = null, sfxBus = null, musicBus = null, musicDuck = null;
let muted = false, musicOn = true;
try { muted = localStorage.getItem('chaingang.muted') === '1'; musicOn = localStorage.getItem('chaingang.music') !== '0'; } catch { /* storage off (sandboxed) */ }

const MUSIC_LEVEL = 0.34;
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
      musicBus = AC.createGain(); musicBus.gain.value = MUSIC_LEVEL; musicBus.connect(musicDuck);
    } catch { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
  if (master) master.gain.value = muted ? 0 : 1;
  return AC;
}
export const isMuted = () => muted;
export const isMusicOn = () => musicOn;
export function setMuted(on) {
  muted = on; try { localStorage.setItem('chaingang.muted', on ? '1' : '0'); } catch { /* ok */ }
  audio();
}
export function setMusic(on) {
  musicOn = on; try { localStorage.setItem('chaingang.music', on ? '1' : '0'); } catch { /* ok */ }
  audio();
}
/** Quieter under the pause menu. */
export function duck(on) {
  if (!musicDuck) return;
  musicDuck.gain.setTargetAtTime(on ? 0.3 : 1, AC.currentTime, 0.15);
}

// ---- building blocks ------------------------------------------------------------------------
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function env(g, t0, vol, attack, decay) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}
function tone(f, d, { type = 'sine', vol = 0.04, slideTo = 0, delay = 0, attack = 0.005, bus = sfxBus, lp = 0, t } = {}) {
  if (!AC || muted) return;
  const t0 = t !== undefined ? t : AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + d);
  env(g, t0, vol, attack, d);
  let out = g;
  if (lp) { const f2 = AC.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp; g.connect(f2); out = f2; }
  o.connect(g); out.connect(bus); o.start(t0); o.stop(t0 + attack + d + 0.05);
}
let noiseBuf = null;
function noise(d, { vol = 0.05, type = 'lowpass', freq = 800, q = 0.7, sweepTo = 0, delay = 0, attack = 0.003, bus = sfxBus, t } = {}) {
  if (!AC || muted) return;
  if (!noiseBuf) {
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const t0 = t !== undefined ? t : AC.currentTime + delay, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + d);
  env(g, t0, vol, attack, d);
  src.connect(f); f.connect(g); g.connect(bus); src.start(t0, Math.random() * 0.5); src.stop(t0 + attack + d + 0.05);
}
/** A plucked string, a little like a koto: a bright attack that mellows fast. */
function pluck(f, t, vol, bus = musicBus) {
  const o = AC.createOscillator(), o2 = AC.createOscillator(), g = AC.createGain(), lp = AC.createBiquadFilter();
  o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.003;
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 7, t); lp.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.35);
  const g2 = AC.createGain(); g2.gain.value = 0.35;
  env(g, t, vol, 0.004, 0.6);
  o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(bus);
  o.start(t); o2.start(t); o.stop(t + 0.7); o2.stop(t + 0.7);
}
/** A soft flute-ish lead: sine with a breath of noise and a slow vibrato. */
function flute(f, t, len, vol) {
  const o = AC.createOscillator(), g = AC.createGain(), vib = AC.createOscillator(), vg = AC.createGain();
  o.type = 'sine'; o.frequency.value = f;
  vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.008, t + Math.min(0.25, len));
  vib.connect(vg); vg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.03);
  g.gain.setValueAtTime(vol, t + Math.max(0.04, len - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.12);
  o.connect(g); g.connect(musicBus);
  o.start(t); vib.start(t); o.stop(t + len + 0.2); vib.stop(t + len + 0.2);
  noise(Math.min(0.12, len), { vol: vol * 0.25, type: 'bandpass', freq: f * 2, q: 2, bus: musicBus, t });
}

// ---- effects (each one quiet and short) -------------------------------------------------------
export const SFX = {
  step: (k) => noise(0.05, { vol: 0.014, freq: k % 2 ? 520 : 440 }),
  jump: () => { noise(0.12, { vol: 0.03, type: 'bandpass', freq: 500, sweepTo: 1600, q: 1.2 }); tone(300, 0.1, { vol: 0.014, slideTo: 460 }); },
  land: () => { tone(150, 0.09, { vol: 0.035, slideTo: 70 }); noise(0.05, { vol: 0.025, freq: 380 }); },
  grab: () => { tone(190, 0.1, { type: 'triangle', vol: 0.02, slideTo: 170, lp: 700 }); noise(0.06, { vol: 0.02, freq: 900 }); },
  creak: () => { tone(230, 0.16, { type: 'triangle', vol: 0.012, slideTo: 205, lp: 900, attack: 0.03 }); tone(345, 0.12, { type: 'sine', vol: 0.006, slideTo: 330, delay: 0.04 }); },
  boing: () => { tone(180, 0.32, { vol: 0.05, slideTo: 620 }); noise(0.3, { vol: 0.03, type: 'bandpass', freq: 700, sweepTo: 3000, q: 1 }); },
  crumble: () => { noise(0.55, { vol: 0.06, freq: 300, sweepTo: 120 }); tone(90, 0.4, { vol: 0.025, slideTo: 50 }); },
  whoops: () => { tone(720, 0.6, { vol: 0.035, slideTo: 240, attack: 0.02 }); noise(0.6, { vol: 0.02, type: 'bandpass', freq: 1200, sweepTo: 300, q: 1 }); },
  checkpoint: () => { [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, 0.9, { vol: 0.02, delay: i * 0.08, attack: 0.003 })); },
  zip: () => noise(0.7, { vol: 0.03, type: 'bandpass', freq: 900, sweepTo: 2600, q: 1.5 }),
  knock: () => { tone(120, 0.12, { vol: 0.06, slideTo: 60 }); noise(0.08, { vol: 0.035, freq: 1200 }); },
  scramble: () => noise(0.05, { vol: 0.015, freq: 1400 }),
  gong: () => { tone(110, 2.4, { vol: 0.09, slideTo: 104 }); tone(166, 2, { vol: 0.04 }); tone(247, 1.4, { vol: 0.025 }); noise(0.3, { vol: 0.02, freq: 900 }); },
  clear: () => { if (!AC || muted) return; const t = AC.currentTime; [74, 76, 78, 81, 83, 86].forEach((m, i) => pluck(mtof(m), t + i * 0.09, 0.07, sfxBus)); },
  tap: () => tone(880, 0.05, { vol: 0.012 }),
};

// ---- music --------------------------------------------------------------------------------
// D major pentatonic (D E F# A B), I – vi – IV – V. The hook: 8 bars of melody, then 8
// bars where only the arpeggio and rhythm play, so it doesn't wear on you.
const CHORDS = [[50, 54, 57, 62], [47, 50, 54, 59], [43, 47, 50, 55], [45, 49, 52, 57]]; // D, Bm, G, A (bass + three)
// [step (16ths), midi, length in 16ths] per bar
const HOOK = [
  [[0, 69, 2], [2, 71, 2], [4, 74, 4], [8, 71, 2], [10, 69, 2], [12, 66, 4]],
  [[0, 64, 2], [2, 66, 2], [4, 69, 6], [10, 66, 2], [12, 64, 2], [14, 62, 2]],
  [[0, 62, 2], [2, 64, 2], [4, 71, 4], [8, 69, 2], [10, 71, 2], [12, 74, 4]],
  [[0, 76, 4], [4, 74, 2], [6, 71, 2], [8, 69, 8]],
  [[0, 69, 2], [2, 71, 2], [4, 74, 4], [8, 76, 2], [10, 74, 2], [12, 71, 4]],
  [[0, 69, 3], [3, 66, 3], [6, 64, 2], [8, 66, 4], [12, 69, 4]],
  [[0, 71, 2], [2, 74, 2], [4, 76, 4], [8, 78, 2], [10, 76, 2], [12, 74, 4]],
  [[0, 76, 2], [2, 74, 2], [4, 71, 4], [8, 69, 6], [14, 66, 2]],
];
// stretch → [semitones up, beats a minute, extra drive (more hats/kicks)]
const STYLE = [[0, 108, 0], [3, 116, 1], [-2, 124, 2]];
const M = { on: false, level: 0, step: 0, next: 0, bars: 0, timer: null };
function playStep(step, t, spb) {
  const [tr, , drive] = STYLE[M.level] || STYLE[0];
  const s = step % 16, bar = Math.floor(step / 16), chord = CHORDS[bar % 4], sx = spb / 4; // seconds per 16th
  // drums: kick on 1 and 3 (and a push into 3 when it drives), clap on 2 and 4, a shaker on the off 8ths
  if (s === 0 || s === 8 || (drive && s === 6) || (drive > 1 && s === 14)) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    env(g, t, 0.5, 0.002, 0.18); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.25);
  }
  if (s === 4 || s === 12) noise(0.12, { vol: 0.16, type: 'bandpass', freq: 1500, q: 0.8, bus: musicBus, t });
  if (s % 4 === 2 || (drive && s % 2 === 1)) noise(0.035, { vol: s % 4 === 2 ? 0.07 : 0.035, type: 'highpass', freq: 7000, bus: musicBus, t });
  // bass: root on 1, the octave bouncing on the & of 2 and 4
  if (s === 0 || s === 6 || s === 10 || s === 14) {
    const m = chord[0] + tr - 12 + (s === 6 || s === 14 ? 12 : 0);
    tone(mtof(m), sx * (s === 0 ? 5 : 2), { type: 'triangle', vol: 0.22, lp: 600, bus: musicBus, t, attack: 0.008 });
  }
  // the koto arpeggio, an 8th apart, up and back
  if (s % 2 === 0) {
    const order = [1, 2, 3, 2, 1, 2, 3, 2], m = chord[order[s / 2]] + tr + 12;
    pluck(mtof(m), t, 0.07 + (s === 0 ? 0.03 : 0));
  }
  // the hook, in the first 8 of every 16 bars
  const phrase = bar % 16;
  if (phrase < 8) for (const [at, m, len] of HOOK[phrase]) if (at === s) flute(mtof(m + tr), t, len * sx * 0.95, 0.12);
}
function schedule() {
  if (!AC || !M.on || muted || !musicOn) { if (AC) M.next = AC.currentTime + 0.05; return; }
  const spb = 60 / (STYLE[M.level] || STYLE[0])[1];
  if (M.next < AC.currentTime) M.next = AC.currentTime + 0.05; // (back from a pause or a hidden page: no catch-up burst)
  while (M.next < AC.currentTime + 0.18) {
    playStep(M.step, M.next, spb);
    M.step++; M.next += spb / 4;
  }
}
/** Start the music for a stretch (again from the top when the stretch changes), or stop it. */
export function music(on, level = 0) {
  if (on && (!M.on || M.level !== level)) { M.step = 0; if (AC) M.next = AC.currentTime + 0.1; }
  M.on = on; M.level = level;
  if (!M.timer) M.timer = setInterval(schedule, 40);
}
export const musicState = () => ({ on: M.on && musicOn && !muted, level: M.level, step: M.step, ctx: AC ? AC.state : 'none' });
