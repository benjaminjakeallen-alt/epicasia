// Adaptive resolution, shared by the 3D games: when a phone can't keep up (frames slower than ~40 fps
// for a couple of seconds), draw at a lower resolution — 2× → 1.6× → 1.3× → 1× of the screen's points —
// so the game stays smooth rather than sharp and stuttering. It only ever steps down during a session
// (stepping back up and down again would hitch every time). A frame that took over 0.1 s (a hidden page,
// a level loading) doesn't count.
export const QUALITY_STEPS = [2, 1.6, 1.3, 1];
export const SLOW_DT = 1 / 40, SLOW_FOR = 2;

/** onChange(cap) is called with the new highest pixel ratio whenever it steps down. */
export function adaptiveQuality(onChange) {
  let i = 0, ema = 1 / 60, slow = 0, frames = 0;
  return {
    get cap() { return QUALITY_STEPS[i]; },
    get step() { return i; },
    tick(dt) {
      if (!(dt > 0) || dt > 0.1) return;
      frames++;
      ema += (dt - ema) * 0.08;
      slow = frames > 30 && ema > SLOW_DT ? slow + dt : 0; // (not in the first half-second: things settle)
      if (slow > SLOW_FOR && i < QUALITY_STEPS.length - 1) {
        i++; slow = 0; ema = 1 / 50;
        onChange(QUALITY_STEPS[i]);
      }
    },
  };
}
