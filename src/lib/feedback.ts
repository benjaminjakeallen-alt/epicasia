import { confirmTap, selectionTick } from './haptics';
import { playConfirm, playTick } from './sound';

// Paired sound + haptic, so every interaction feels the same everywhere.

/** The ring moved one step (either direction). */
export function stepFeedback() {
  selectionTick();
  playTick();
}

/** Opening a section. */
export function openFeedback() {
  confirmTap();
  playConfirm();
}

export { preloadSounds } from './sound';
