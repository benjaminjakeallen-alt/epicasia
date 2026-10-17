// Tug of Wall — sound (user, Oct 15 2026: "really subtle sound effects for the game and some
// catchy music"), on the shared synth (../shared/synth.js).
//
//   effects  soft and short: sine/triangle tones and filtered noise, well under the music
//   music    a looping tune on the pentatonic scale (it sounds a little like East Asia):
//            a flute-ish lead with a hook, a plucked koto-style arpeggio, a round bass,
//            a soft kick, clap and shaker. Each stretch has its own key and speed.

import { setup, audio, tone, noise, pluck, lead, drum, mtof, sequencer, duck, isMuted, isMusicOn, setMuted, setMusic, buses, ctx } from '../shared/synth.js';

setup('chaingang', 0.34);
export { audio, duck, isMuted, isMusicOn, setMuted, setMusic };

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
  clear: () => { const a = ctx(); if (!a) return; const t = a.currentTime; [74, 76, 78, 81, 83, 86].forEach((m, i) => pluck(mtof(m), t + i * 0.09, 0.07, buses().sfx)); },
  tap: () => tone(880, 0.05, { vol: 0.012 }),
  emote: () => { tone(1175, 0.08, { vol: 0.014 }); tone(1568, 0.12, { vol: 0.012, delay: 0.06 }); },
  // a watchtower's fireworks: a soft thump far off, then a crackle
  boom: () => { tone(90, 0.35, { vol: 0.03, slideTo: 50 }); noise(0.5, { vol: 0.012, type: 'highpass', freq: 3500, delay: 0.08 }); },
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
const STYLE = [[0, 108, 0], [3, 116, 1], [-2, 124, 2], [5, 120, 2]]; // (the 4th, at night: G, a touch slower than Storm Peak)
let level = 0;
function playStep(step, t, sx) {
  const [tr, , drive] = STYLE[level] || STYLE[0];
  const s = step % 16, bar = Math.floor(step / 16), chord = CHORDS[bar % 4]; // (sx: seconds per 16th)
  // drums: kick on 1 and 3 (and a push into 3 when it drives), clap on 2 and 4, a shaker on the off 8ths
  if (s === 0 || s === 8 || (drive && s === 6) || (drive > 1 && s === 14)) drum.kick(t);
  if (s === 4 || s === 12) drum.clap(t);
  if (s % 4 === 2 || (drive && s % 2 === 1)) drum.hat(t, s % 4 === 2 ? 0.07 : 0.035);
  // bass: root on 1, the octave bouncing on the & of 2 and 4
  if (s === 0 || s === 6 || s === 10 || s === 14) {
    const m = chord[0] + tr - 12 + (s === 6 || s === 14 ? 12 : 0);
    tone(mtof(m), sx * (s === 0 ? 5 : 2), { type: 'triangle', vol: 0.22, lp: 600, bus: buses().music, t, attack: 0.008 });
  }
  // the koto arpeggio, an 8th apart, up and back
  if (s % 2 === 0) {
    const order = [1, 2, 3, 2, 1, 2, 3, 2], m = chord[order[s / 2]] + tr + 12;
    pluck(mtof(m), t, 0.07 + (s === 0 ? 0.03 : 0));
  }
  // the hook, in the first 8 of every 16 bars
  const phrase = bar % 16;
  if (phrase < 8) for (const [at, m, len] of HOOK[phrase]) if (at === s) lead(mtof(m + tr), t, len * sx * 0.95, 0.12);
}
const seq = sequencer({ step: playStep, bpm: () => (STYLE[level] || STYLE[0])[1] });
/** Start the music for a stretch (again from the top when the stretch changes), or stop it. */
export function music(on, lv = 0) { level = lv; seq.play(on, lv); }
export const musicState = () => Object.assign(seq.state(), { level });
