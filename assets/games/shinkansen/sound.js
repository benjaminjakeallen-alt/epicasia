// Shinkansen Dash — sound, on the shared synth (../shared/synth.js). User, Oct 15 2026:
// "a really catchy song that speeds up as the time you pass Kyoto speeds the player up.
// It also needs subtle sound effects."
//
//   music    an upbeat J-pop / eurobeat run: four-on-the-floor kick, offbeat open hats, a
//            bouncing octave bass, bright chord stabs, and a hook on a soft square lead over
//            Am–F–C–G (8 bars of hook, then 8 bars of a plucked "train" arpeggio). It follows
//            the train: a little quicker as the first lap speeds up, then every time you pass
//            Kyoto it jumps up a gear — 8 bpm faster and a key higher (the old pop key change).
//            Underground (the sewer) it's muffled, as if heard through the street.
//   effects  soft and short, under the music.

import { setup, audio, ctx, buses, tone, noise, pluck, lead, drum, mtof, sequencer, duck, muffled, isMuted, isMusicOn, setMuted, setMusic, setQuiet } from '../shared/synth.js';

setup('shinkansen', 0.3);
export { audio, duck, muffled, isMuted, isMusicOn, setMuted, setMusic, setQuiet };

export const SFX = {
  jump: () => { noise(0.12, { vol: 0.028, type: 'bandpass', freq: 600, sweepTo: 1900, q: 1.2 }); tone(330, 0.1, { vol: 0.014, slideTo: 520 }); },
  slide: () => noise(0.22, { vol: 0.03, type: 'bandpass', freq: 1800, sweepTo: 700, q: 0.9 }),
  hop: () => noise(0.09, { vol: 0.025, type: 'bandpass', freq: 900, sweepTo: 2400, q: 1.1 }),
  coin: () => { tone(1568, 0.16, { vol: 0.016 }); tone(2093, 0.22, { vol: 0.012, delay: 0.05 }); },
  neko: () => [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, 0.5, { vol: 0.016, delay: i * 0.06 })),
  crash: () => { tone(140, 0.3, { vol: 0.07, slideTo: 55 }); noise(0.35, { vol: 0.05, freq: 700, sweepTo: 200 }); },
  shield: () => { noise(0.25, { vol: 0.03, type: 'bandpass', freq: 2400, sweepTo: 800, q: 1 }); tone(880, 0.3, { vol: 0.02, slideTo: 440 }); },
  horn: () => { tone(330, 0.55, { type: 'triangle', vol: 0.02, lp: 1200, attack: 0.04 }); tone(415, 0.55, { type: 'triangle', vol: 0.017, lp: 1200, attack: 0.04 }); },
  chime: () => [659, 831, 988, 1319].forEach((f, i) => tone(f, 0.6, { vol: 0.016, delay: i * 0.12 })),
  count: (hi) => tone(hi ? 1046.5 : 523, hi ? 0.4 : 0.16, { vol: 0.03 }),
  sewer: () => { tone(520, 0.5, { vol: 0.03, slideTo: 110 }); noise(0.45, { vol: 0.04, freq: 500, delay: 0.12 }); },
  pipe: () => [392, 330, 262, 196, 131].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.025, delay: i * 0.07 })),
  spring: () => { tone(260, 0.24, { type: 'triangle', vol: 0.035, slideTo: 1000 }); },
  locked: () => { tone(260, 0.1, { type: 'triangle', vol: 0.025 }); tone(196, 0.16, { type: 'triangle', vol: 0.025, delay: 0.09 }); },
  star: () => noise(0.08, { vol: 0.025, type: 'bandpass', freq: 4500, sweepTo: 7000, q: 2 }),
  thunk: () => { tone(300, 0.08, { vol: 0.03, slideTo: 140 }); noise(0.06, { vol: 0.025, freq: 1500 }); },
  wag: () => tone(700, 0.08, { type: 'triangle', vol: 0.015, slideTo: 500 }), // (the tanuki tail)
  // Mei: a sparkly little run up for the charm, a bubble pop for each thing it clears
  charm: () => [1318.5, 1568, 1975.5, 2637].forEach((f, i) => tone(f, 0.35, { vol: 0.016, delay: i * 0.045 })),
  pop: () => { tone(900, 0.06, { vol: 0.03, slideTo: 1700 }); noise(0.04, { vol: 0.015, type: 'highpass', freq: 3000 }); },
  // past Kyoto: up a gear
  lap: () => { const a = ctx(); if (!a) return; const t = a.currentTime; [72, 76, 79, 84, 88].forEach((m, i) => pluck(mtof(m), t + i * 0.07, 0.03, buses().sfx)); },
};

// ---- the song ------------------------------------------------------------------------------
// Am – F – C – G: [bass root, three chord tones]
const CHORDS = [[45, 57, 60, 64], [41, 57, 60, 65], [48, 55, 60, 64], [43, 55, 59, 62]];
// the hook: [step (16ths), midi, length in 16ths] per bar
const HOOK = [
  [[0, 76, 2], [2, 76, 2], [4, 74, 2], [6, 72, 2], [8, 74, 4], [12, 76, 4]],
  [[0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 72, 4], [10, 69, 2], [12, 72, 4]],
  [[0, 72, 2], [2, 74, 2], [4, 76, 4], [8, 79, 4], [12, 76, 2], [14, 74, 2]],
  [[0, 74, 6], [6, 71, 2], [8, 74, 4], [12, 79, 4]],
  [[0, 76, 2], [2, 76, 2], [4, 74, 2], [6, 72, 2], [8, 74, 4], [12, 76, 4]],
  [[0, 77, 2], [2, 79, 2], [4, 81, 4], [8, 79, 2], [10, 77, 2], [12, 76, 4]],
  [[0, 76, 2], [2, 74, 2], [4, 72, 4], [8, 74, 2], [10, 76, 2], [12, 79, 4]],
  [[0, 79, 4], [4, 77, 2], [6, 76, 2], [8, 74, 8]],
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3]; // the "train" arpeggio, through the chord and an octave up
const song = { lap: 0, speed: 15 };
/** Beats a minute: 124 → 132 through the first lap as the train speeds up, then 8 more each lap. */
export function bpmFor(lap, speed) {
  return lap === 0 ? 124 + 8 * Math.max(0, Math.min(1, (speed - 15) / 17)) : Math.min(180, 132 + 8 * lap);
}
function playStep(step, t, sx) {
  const tr = Math.min(5, song.lap); // a key higher each lap (up to five)
  const s = step % 16, bar = Math.floor(step / 16), chord = CHORDS[bar % 4], phrase = bar % 16;
  // drums
  if (s % 4 === 0) drum.kick(t, 0.48);
  if (s === 4 || s === 12) drum.clap(t, 0.13);
  if (s % 4 === 2) drum.open(t, 0.045);
  else drum.hat(t, s % 2 ? 0.02 : 0.035);
  if (s === 14 || s === 15) drum.hat(t, 0.03); // (a clickety-clack before the bar comes round)
  // bass: the octave bounce
  if (s % 2 === 0) tone(mtof(chord[0] + tr + (s % 4 === 2 ? 12 : 0)), sx * 1.6, { type: 'sawtooth', vol: 0.09, lp: 700, bus: buses().music, t, attack: 0.004 });
  // chord stabs on the offbeats
  if (s % 4 === 2) for (let k = 1; k < 4; k++) pluck(mtof(chord[k] + tr), t, 0.035, buses().music, 0.25);
  if (phrase < 8) { // the hook
    for (const [at, m, len] of HOOK[phrase]) if (at === s) lead(mtof(m + tr), t, len * sx * 0.92, 0.075, { type: 'square', detune: 7, cutoff: 2400, vibrato: 0.004, breath: 0 });
  } else if (s % 2 === 0) pluck(mtof(chord[1 + (ARP[s / 2] % 3)] + tr + (ARP[s / 2] === 3 ? 12 : 12)), t, 0.05); // the arpeggio
}
const seq = sequencer({ step: playStep, bpm: () => bpmFor(song.lap, song.speed) });
/** The song for a run: playing or not, which run (it starts from the top for a new one), and how fast the train is going. */
export function music(on, run, lap, speed) { song.lap = lap; song.speed = speed; seq.play(on, run); }
export const musicState = () => Object.assign(seq.state(), { lap: song.lap });
