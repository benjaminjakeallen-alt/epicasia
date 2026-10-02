import { AccessibilityInfo, Platform } from 'react-native';

// Spoken feedback for the accessibility mode. With VoiceOver on, the text
// goes to VoiceOver (so nothing is read twice, in two voices); otherwise,
// if the mode's speech is on, it's spoken with expo-speech. A new
// announcement cuts off the previous one, so turning the ring quickly
// only finishes the item it stops on.

// RN-web can't detect a screen reader and reports `true` regardless, so on
// web we treat it as off (the web build is only a preview anyway).
let screenReaderOn = false;
if (Platform.OS !== 'web') {
  AccessibilityInfo.isScreenReaderEnabled()
    .then((on) => {
      screenReaderOn = on;
    })
    .catch(() => {});
  AccessibilityInfo.addEventListener('screenReaderChanged', (on) => {
    screenReaderOn = on;
  });
}

/** Subscribe to screen-reader changes (always false on web). Returns an unsubscribe. */
export function watchScreenReader(cb: (on: boolean) => void): () => void {
  if (Platform.OS === 'web') {
    cb(false);
    return () => {};
  }
  AccessibilityInfo.isScreenReaderEnabled().then(cb).catch(() => {});
  const sub = AccessibilityInfo.addEventListener('screenReaderChanged', cb);
  return () => sub.remove();
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
