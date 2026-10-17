// Godzilla Rampage — sound, on the shared synth (../shared/synth.js). It used to be an
// 8-note beep loop with harsh square-wave effects (review, Oct 17 2026); now every level
// has its own song and the effects are soft.
//
//   L1 Godzilla Rampage   E minor arcade rock: a punchy square lead, rock drums
//   L2 Coal Mine Chaos    G major country shuffle: a plucked banjo lead (Chris is from Price, Utah)
//   L3 Christmas Chaos    F major sleigh ride: bell lead and jingles
//   L4 Kaiju Showdown     D minor, driving 16th bass and toms
//   L5 Tokyo Tower Terror A minor synthwave
//   finale                C major celebration, for the fireworks and the dance
// A little faster every round (and when Godzilla's angry, a touch busier).

import { setup, audio, ctx, buses, tone, noise, pluck, lead, drum, mtof, sequencer, duck, isMuted, isMusicOn, setMuted, setMusic } from '../shared/synth.js';

setup('rampage', 0.32);
export { audio, duck, isMuted, isMusicOn, setMuted, setMusic };

export const SFX = {
  jump: () => { noise(0.1, { vol: 0.025, type: 'bandpass', freq: 700, sweepTo: 2000, q: 1.2 }); tone(380, 0.09, { vol: 0.016, slideTo: 620 }); },
  over: () => { tone(1318.5, 0.12, { vol: 0.02 }); tone(1975.5, 0.16, { vol: 0.016, delay: 0.05 }); },
  smash: () => { tone(160, 0.16, { vol: 0.07, slideTo: 60 }); noise(0.2, { vol: 0.06, freq: 1600, sweepTo: 300 }); },
  pick: () => [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, 0.4, { vol: 0.018, delay: i * 0.06 })),
  die: () => { tone(520, 0.7, { type: 'triangle', vol: 0.04, slideTo: 110, attack: 0.01 }); },
  roar: () => { noise(0.9, { vol: 0.07, freq: 380, sweepTo: 160 }); tone(90, 0.9, { type: 'sawtooth', vol: 0.025, lp: 260, slideTo: 55 }); },
  stomp: () => { tone(80, 0.22, { vol: 0.1, slideTo: 40 }); noise(0.12, { vol: 0.03, freq: 300 }); },
  swing: () => noise(0.1, { vol: 0.03, type: 'bandpass', freq: 1800, sweepTo: 600, q: 1 }),
  climb: () => noise(0.03, { vol: 0.012, freq: 900 }),
  tick: () => tone(1568, 0.04, { vol: 0.012 }),
  oneup: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.025, delay: i * 0.07 })),
  rescue: () => { const a = ctx(); if (!a) return; const t = a.currentTime; [72, 76, 79, 76, 79, 84].forEach((m, i) => pluck(mtof(m), t + i * 0.12, 0.06, buses().sfx)); },
  over2: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.035, delay: i * 0.24 })),
  whoosh: () => noise(1.3, { vol: 0.05, type: 'bandpass', freq: 1200, sweepTo: 120, q: 0.8 }),
  boom: () => { tone(60, 1, { vol: 0.16, slideTo: 28 }); noise(1.1, { vol: 0.1, freq: 260, sweepTo: 80 }); },
  launch: () => tone(500, 0.4, { vol: 0.01, slideTo: 1500 }),
  bang: () => { noise(0.4, { vol: 0.05, freq: 1800, sweepTo: 300 }); tone(180, 0.2, { type: 'triangle', vol: 0.02, slideTo: 60 }); },
  secret: () => { const a = ctx(); if (!a) return; const t = a.currentTime; [72, 79, 84, 88, 91, 96].forEach((m, i) => pluck(mtof(m), t + i * 0.07, 0.06, buses().sfx)); },
  toolEnd: () => tone(300, 0.25, { type: 'triangle', vol: 0.025, slideTo: 130 }),
  land: () => noise(0.05, { vol: 0.02, freq: 420 }),
  combo: (n) => tone(mtof(72 + Math.min(12, n * 2)), 0.14, { type: 'triangle', vol: 0.025 }),
  matcha: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.5, { vol: 0.02, delay: i * 0.08 })); noise(0.5, { vol: 0.02, type: 'bandpass', freq: 600, sweepTo: 200 }); },
  vent: () => noise(0.6, { vol: 0.04, type: 'bandpass', freq: 500, sweepTo: 1400, q: 0.8 }),
  beam: () => { tone(220, 0.5, { type: 'sawtooth', vol: 0.02, lp: 1400, slideTo: 330 }); noise(0.5, { vol: 0.03, type: 'bandpass', freq: 2400, q: 2 }); },
};

// ---- the songs ---------------------------------------------------------------------------
// chords: [bass root, three chord tones]; hook: 4 bars of [step (16ths), midi, length]
const STYLES = [
  { bpm: 132, chords: [[40, 52, 55, 59], [36, 52, 55, 60], [43, 50, 55, 59], [38, 50, 54, 57]], lead: 'square', drums: 'rock', bass: 'eighths',
    hook: [[[0, 64, 2], [2, 67, 2], [4, 71, 4], [8, 69, 2], [10, 67, 2], [12, 64, 4]], [[0, 64, 2], [2, 67, 2], [4, 72, 4], [8, 71, 2], [10, 69, 2], [12, 67, 4]],
      [[0, 67, 2], [2, 71, 2], [4, 74, 4], [8, 72, 2], [10, 71, 2], [12, 67, 4]], [[0, 69, 3], [3, 67, 3], [6, 66, 2], [8, 64, 8]]] },
  { bpm: 120, chords: [[43, 55, 59, 62], [48, 52, 55, 60], [50, 54, 57, 62], [43, 55, 59, 62]], lead: 'banjo', drums: 'shuffle', bass: 'boomchick',
    hook: [[[0, 67, 2], [2, 71, 2], [4, 74, 2], [6, 71, 2], [8, 72, 4], [12, 71, 4]], [[0, 72, 2], [2, 76, 2], [4, 74, 2], [6, 72, 2], [8, 71, 4], [12, 69, 4]],
      [[0, 74, 2], [2, 78, 2], [4, 81, 4], [8, 78, 2], [10, 76, 2], [12, 74, 4]], [[0, 72, 2], [2, 71, 2], [4, 69, 4], [8, 67, 8]]] },
  { bpm: 126, chords: [[41, 57, 60, 65], [38, 57, 62, 65], [46, 58, 62, 65], [48, 55, 60, 64]], lead: 'bell', drums: 'sleigh', bass: 'roots',
    hook: [[[0, 69, 2], [2, 69, 2], [4, 69, 4], [8, 72, 2], [10, 70, 2], [12, 69, 4]], [[0, 74, 2], [2, 74, 2], [4, 74, 4], [8, 72, 2], [10, 70, 2], [12, 69, 4]],
      [[0, 70, 2], [2, 70, 2], [4, 72, 2], [6, 74, 2], [8, 77, 4], [12, 74, 4]], [[0, 72, 4], [4, 70, 2], [6, 67, 2], [8, 65, 8]]] },
  { bpm: 140, chords: [[38, 50, 53, 57], [46, 50, 53, 58], [48, 52, 55, 60], [45, 49, 52, 57]], lead: 'saw', drums: 'drive', bass: 'sixteenths',
    hook: [[[0, 62, 2], [2, 62, 1], [3, 65, 1], [4, 69, 4], [8, 67, 2], [10, 65, 2], [12, 64, 4]], [[0, 62, 2], [2, 62, 1], [3, 65, 1], [4, 70, 4], [8, 69, 2], [10, 67, 2], [12, 65, 4]],
      [[0, 72, 2], [2, 70, 2], [4, 69, 4], [8, 67, 2], [10, 65, 2], [12, 67, 4]], [[0, 69, 4], [4, 73, 4], [8, 76, 8]]] },
  { bpm: 116, chords: [[45, 57, 60, 64], [41, 57, 60, 65], [48, 55, 60, 64], [43, 55, 59, 62]], lead: 'synth', drums: 'disco', bass: 'octaves',
    hook: [[[0, 76, 3], [3, 74, 3], [6, 72, 2], [8, 69, 8]], [[0, 77, 3], [3, 76, 3], [6, 72, 2], [8, 69, 8]],
      [[0, 72, 2], [2, 74, 2], [4, 76, 4], [8, 79, 4], [12, 76, 4]], [[0, 74, 6], [6, 72, 2], [8, 71, 8]]] },
  { bpm: 128, chords: [[36, 52, 55, 60], [41, 53, 57, 60], [43, 55, 59, 62], [36, 52, 55, 60]], lead: 'bell', drums: 'disco', bass: 'octaves', // the finale
    hook: [[[0, 72, 2], [2, 76, 2], [4, 79, 4], [8, 84, 4], [12, 79, 4]], [[0, 77, 2], [2, 81, 2], [4, 84, 4], [8, 81, 2], [10, 77, 2], [12, 72, 4]],
      [[0, 74, 2], [2, 79, 2], [4, 83, 4], [8, 86, 4], [12, 83, 4]], [[0, 84, 4], [4, 79, 4], [8, 72, 8]]] },
];
export const FINALE = 5;
const song = { style: 0, round: 0, angry: false };
function voice(kind, m, t, len, sx) {
  const f = mtof(m), v = 0.075;
  if (kind === 'banjo') { pluck(f, t, 0.11, undefined, 0.35); return; }
  if (kind === 'bell') { tone(f, len + 0.5, { vol: v * 0.9, bus: buses().music, t, attack: 0.003 }); tone(f * 2.76, 0.4, { vol: v * 0.25, bus: buses().music, t, attack: 0.002 }); return; }
  if (kind === 'saw') { lead(f, t, len, v * 0.8, { type: 'sawtooth', detune: 9, cutoff: 1500, vibrato: 0.005, breath: 0 }); return; }
  if (kind === 'synth') { lead(f, t, len, v * 0.85, { type: 'square', detune: 10, cutoff: 2200, vibrato: 0.006, breath: 0 }); return; }
  lead(f, t, len, v * 0.8, { type: 'square', detune: 4, cutoff: 2600, vibrato: 0.003, breath: 0 }); // arcade
}
function playStep(step, t, sx) {
  const S = STYLES[song.style] || STYLES[0];
  const s = step % 16, bar = Math.floor(step / 16), chord = S.chords[bar % 4], group = Math.floor(bar / 4) % 2;
  const mb = buses().music;
  // drums
  if (S.drums === 'rock') { if (s === 0 || s === 8 || s === 10) drum.kick(t); if (s === 4 || s === 12) drum.clap(t, 0.15); if (s % 2 === 0) drum.hat(t, 0.04); }
  else if (S.drums === 'shuffle') { if (s === 0 || s === 8) drum.kick(t, 0.4); if (s === 4 || s === 12) drum.clap(t, 0.11); if (s % 4 === 0 || s % 4 === 3) drum.hat(t, 0.035); }
  else if (S.drums === 'sleigh') { if (s === 0 || s === 8) drum.kick(t, 0.38); if (s === 4 || s === 12) drum.clap(t, 0.1); drum.hat(t, s % 2 ? 0.03 : 0.05); if (s % 4 === 2) noise(0.08, { vol: 0.05, type: 'bandpass', freq: 9000, q: 3, bus: mb, t }); }
  else if (S.drums === 'drive') { if (s % 4 === 0 || s === 14) drum.kick(t, 0.5); if (s === 4 || s === 12) drum.clap(t, 0.15); drum.hat(t, s % 2 ? 0.02 : 0.04); if (s === 13 || s === 15) tone(140 - s * 3, 0.15, { vol: 0.12, bus: mb, t, slideTo: 70 }); }
  else { if (s % 4 === 0) drum.kick(t, 0.46); if (s === 4 || s === 12) drum.clap(t, 0.13); if (s % 4 === 2) drum.open(t, 0.04); else drum.hat(t, 0.025); }
  // bass
  const root = chord[0], bt = (m, len) => tone(mtof(m), len, { type: S.bass === 'octaves' ? 'sawtooth' : 'triangle', vol: S.bass === 'octaves' ? 0.09 : 0.2, lp: 700, bus: mb, t, attack: 0.005 });
  if (S.bass === 'eighths' && s % 2 === 0) bt(root, sx * 1.7);
  else if (S.bass === 'boomchick') { if (s === 0 || s === 8) bt(root, sx * 3); if (s === 4 || s === 12) bt(root + 7, sx * 2); }
  else if (S.bass === 'roots' && (s === 0 || s === 6 || s === 8 || s === 14)) bt(root, sx * 2);
  else if (S.bass === 'sixteenths') bt(root + (s % 8 === 6 ? 12 : 0), sx * 0.9);
  else if (S.bass === 'octaves' && s % 2 === 0) bt(root + (s % 4 === 2 ? 12 : 0), sx * 1.6);
  // chords: soft stabs on the offbeats
  if (s % 4 === 2 && S.lead !== 'banjo') for (let k = 1; k < 4; k++) pluck(mtof(chord[k]), t, 0.028, mb, 0.22);
  // the hook in one 4-bar group, an arpeggio in the next
  if (group === 0) { for (const [at, m, len] of S.hook[bar % 4]) if (at === s) voice(S.lead, m, t, len * sx * 0.9, sx); }
  else if (s % 2 === 0) pluck(mtof(chord[1 + ((s / 2) % 3)] + 12), t, song.angry ? 0.06 : 0.045, mb, 0.3);
}
const seq = sequencer({ step: playStep, bpm: () => Math.min(176, (STYLES[song.style] || STYLES[0]).bpm * (1 + 0.04 * song.round)) });
/** The song: playing or not; which style (level 0–4, or FINALE); the round (a little quicker each); Godzilla angry. */
export function music(on, style, round, angry) { song.style = style; song.round = round; song.angry = !!angry; seq.play(on, style * 100 + round); }
export const musicState = () => Object.assign(seq.state(), { style: song.style });
