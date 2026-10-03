import { AccessibilityInfo } from 'react-native';

// Spoken feedback for the accessibility mode. With VoiceOver on, the text
// goes to VoiceOver (so nothing is read twice, in two voices); otherwise,
// if the mode's speech is on, it's spoken with expo-speech. A new
// announcement cuts off the previous one, so turning the ring quickly
// only finishes the item it stops on.

// The browser can't tell whether a screen reader is running (RN-web reports
// `true` regardless), so it's treated as off: the mode speaks for itself.
// VoiceOver users still hear the ring through its adjustable control.
const screenReaderOn = false;

/** Subscribe to screen-reader changes (always false in the browser). Returns an unsubscribe. */
export function watchScreenReader(cb: (on: boolean) => void): () => void {
  cb(false);
  return () => {};
}

export function isScreenReaderOn() {
  return screenReaderOn;
}

export async function announce(text: string, opts: { speak: boolean; rate: number }) {
  if (screenReaderOn) {
    AccessibilityInfo.announceForAccessibility(text);
    return;
  }
  if (!opts.speak) return;
  try {
    const Speech = await import('expo-speech');
    await Speech.stop();
    Speech.speak(text, { rate: opts.rate, language: 'en-US' });
  } catch {
    // Speech is a help, never a blocker.
  }
}
