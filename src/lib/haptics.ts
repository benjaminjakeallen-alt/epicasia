import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Haptics that also work in the browser build.
// - Native: expo-haptics.
// - Android browsers: the Vibration API.
// - iOS Safari has no Vibration API, but since iOS 18 toggling a native
//   `<input type="checkbox" switch>` plays the system selection haptic, so
//   we click a hidden one. Browsers only allow this during/just after a
//   user gesture (tap, swipe) — fine for everything that calls these.

function webTick() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(8);
      return;
    }
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch {
    // No haptics available — silently skip.
  }
}

/** Light tick: an item clicking into place. */
export function selectionTick() {
  if (Platform.OS === 'web') return webTick();
  Haptics.selectionAsync().catch(() => {});
}

/** Firmer tap: confirming an action (opening a section). */
export function confirmTap() {
  if (Platform.OS === 'web') return webTick();
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Game feedback: a light tick, a heavy thump, or a success/error buzz. */
export function gameHaptic(kind: unknown) {
  if (Platform.OS === 'web') return webTick();
  const done = () => {};
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(done);
  else if (kind === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(done);
  else if (kind === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(done);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(done);
}
