// Sushi Conveyor — sound, on the shared synth (../shared/synth.js).
//
//   music    a gentle sushi-bar loop in D minor pentatonic (yo/min-yo flavour): a plucked koto
//            arpeggio, a soft shakuhachi-ish lead with a hook, a round bass and light woodblock and
//            shaker. It quickens with the belt (+6 bpm a level) and is ducked under the pause menu.
//   effects  soft and short: a wooden tok when you lift a plate, a chime as it lands on its ticket,
//            a three-note pluck for an order served, a low boop for one nobody ordered, a sizzle for
//            wasabi, a falling run when an order runs out, a sparkle for the lucky cat.

import { setup, audio, ctx, buses, tone, noise, pluck, lead, drum, mtof, sequencer, duck, isMuted, isMusicOn, setMuted, setMusic } from '../shared/synth.js';

setup('sushi', 0.28);
export { audio, duck, isMuted, isMusicOn, setMuted, setMusic };

const at = () => { const a = ctx(); return a ? a.currentTime : 0; };
export const SFX = {
  tok: () => { tone(820, 0.05, { type: 'triangle', vol: 0.03, slideTo: 620 }); noise(0.03, { vol: 0.02, type: 'bandpass', freq: 2400, q: 3 }); },
  land: () => { tone(1318.5, 0.25, { vol: 0.014 }); tone(1975.5, 0.3, { vol: 0.009, delay: 0.04 }); },
  served: () => { if (!ctx()) return; const t = at(); [74, 77, 81, 86].forEach((m, i) => pluck(mtof(m), t + i * 0.06, 0.035, buses().sfx)); },
  wrong: () => { tone(220, 0.16, { type: 'triangle', vol: 0.03, slideTo: 165 }); },
  wasabi: () => { noise(0.5, { vol: 0.05, type: 'bandpass', freq: 3000, sweepTo: 900, q: 0.8 }); tone(600, 0.3, { vol: 0.02, slideTo: 1400 }); },
  late: () => [587, 523, 440, 392].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.02, delay: i * 0.08 })),
  lucky: () => [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => tone(f, 0.5, { vol: 0.016, delay: i * 0.055 })),
  combo: () => [880, 1108.7, 1318.5].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.014, delay: i * 0.045 })),
  count: (hi) => tone(hi ? 1046.5 : 523, hi ? 0.4 : 0.16, { vol: 0.03 }),
  gong: () => { tone(110, 2, { vol: 0.06, attack: 0.01 }); tone(164.8, 1.6, { vol: 0.03 }); tone(233, 1.2, { vol: 0.015 }); },
};

// ---- the song --------------------------------------------------------------------------------
// D minor pentatonic over Dm – Bb – C – Am: [bass, three chord tones]
const CHORDS = [[38, 62, 65, 69], [34, 58, 62, 65], [36, 60, 64, 67], [33, 57, 60, 64]];
const HOOK = [
  [[0, 74, 3], [3, 72, 1], [4, 69, 4], [8, 72, 2], [10, 74, 2], [12, 77, 4]],
  [[0, 74, 6], [6, 72, 2], [8, 69, 4], [12, 67, 4]],
  [[0, 69, 2], [2, 72, 2], [4, 74, 4], [8, 77, 2], [10, 79, 2], [12, 81, 4]],
  [[0, 79, 4], [4, 77, 2], [6, 74, 2], [8, 74, 8]],
];
const ARP = [0, 1, 2, 3, 2, 1, 3, 2];
const song = { level: 1 };
export function setLevel(l) { song.level = l; }
const bpm = () => 100 + 6 * (song.level - 1);
function playStep(step, t, sx) {
  const s = step % 16, bar = Math.floor(step / 16), phrase = bar % 8, chord = CHORDS[bar % 4];
  if (s === 0 || s === 10) drum.kick(t, 0.28);
  if (s === 4 || s === 12) tone(1200, 0.04, { type: 'triangle', vol: 0.018, bus: buses().music, t, slideTo: 900 }); // woodblock
  if (s % 2 === 1) drum.hat(t, 0.03);
  if (s === 0 || s === 8) tone(mtof(chord[0]), sx * 6, { type: 'triangle', vol: 0.06, bus: buses().music, t, lp: 600 });
  if (s % 2 === 0) pluck(mtof(chord[1 + (ARP[(s / 2) % 8] % 3)] + (s % 8 === 6 ? 12 : 0)), t, 0.03, buses().music, 0.5);
  if (phrase < 4) for (const [st, m, len] of HOOK[phrase]) if (st === s) lead(mtof(m), t, len * sx, 0.026, { type: 'sine', vibrato: 0.012, breath: 0.4 });
}
const seq = sequencer({ bpm, step: playStep });
export const music = (on, key) => seq.play(on, key);
export const musicState = () => seq.state();
