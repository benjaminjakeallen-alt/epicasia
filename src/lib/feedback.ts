import { confirmTap, selectionTick } from './haptics';
import { playConfirm, playTick, playVote, playWin } from './sound';

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

/** An upvote given. */
export function voteFeedback() {
  selectionTick();
  playVote();
}

/** Something to celebrate (new upvotes on your entries). */
export function winFeedback() {
  confirmTap();
  playWin();
}

export { preloadSounds } from './sound';
