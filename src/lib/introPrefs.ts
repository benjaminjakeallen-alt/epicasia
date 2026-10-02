import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { todayDay } from './dates';

// Which launch intro to play on this cold open:
// - 'full'  — the ~5.4s little-planet sequence: the first time ever, after
//             each app update (a new `version` in app.json), and once on the
//             first day of the trip;
// - 'short' — a ~1.5s version every other time;
// - 'none'  — skipped entirely (the accessibility mode sets this).

export type IntroMode = 'full' | 'short' | 'none';

const SEEN_VERSION = 'epicasia.introSeenVersion';
const TRIP_DAY_SEEN = 'epicasia.introTripDaySeen';
const SKIP = 'epicasia.introSkip';
const TRIP_FIRST_DAY = '2027-06-05';

function appVersion(): string {
  return Constants.expoConfig?.version ?? '0';
}

export async function introModeForLaunch(): Promise<IntroMode> {
  try {
    const [seen, tripDaySeen, skip] = await Promise.all([
      AsyncStorage.getItem(SEEN_VERSION),
      AsyncStorage.getItem(TRIP_DAY_SEEN),
      AsyncStorage.getItem(SKIP),
    ]);
    if (skip === '1') return 'none';
    if (seen !== appVersion()) return 'full';
    if (todayDay() === TRIP_FIRST_DAY && !tripDaySeen) return 'full';
    return 'short';
  } catch {
    return 'full';
  }
}

/** Remember that the full intro has played (this version, and today if it's day one). */
export async function markFullIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_VERSION, appVersion());
    if (todayDay() === TRIP_FIRST_DAY) await AsyncStorage.setItem(TRIP_DAY_SEEN, '1');
  } catch {
    // Not remembering just means the full intro plays again next time.
  }
}

/** Accessibility mode turns the intro off entirely. */
export async function setIntroSkipped(skip: boolean): Promise<void> {
  try {
    if (skip) await AsyncStorage.setItem(SKIP, '1');
    else await AsyncStorage.removeItem(SKIP);
  } catch {
    // ignore
  }
}
