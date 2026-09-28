import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// "Keep me signed in for 30 days". Supabase's refresh token never expires on
// its own, so the 30-day cap (and the opposite, "sign out when I close the
// app") is enforced here, checked once at startup by AuthProvider.
//
// Passwords are deliberately NOT stored by the app — the login fields are
// tagged (textContentType / autoComplete) so iCloud Keychain or the
// browser's password manager offers to save them instead.

const REMEMBER_UNTIL = 'epicasia.rememberUntil';
const SESSION_ONLY = 'epicasia.sessionOnly';
const SAVED_EMAIL = 'epicasia.savedEmail';
const WEB_TAB_MARKER = 'epicasia.browserSession';

export const REMEMBER_DAYS = 30;
const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;

// Native: module state resets on every cold start, which is exactly the
// "app was closed" signal a session-only sign-in needs.
let signedInThisLaunch = false;

function webSession(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export async function recordSignIn(remember: boolean, email: string) {
  signedInThisLaunch = true;
  webSession()?.setItem(WEB_TAB_MARKER, '1');
  if (remember) {
    await Promise.all([
      AsyncStorage.setItem(REMEMBER_UNTIL, String(Date.now() + REMEMBER_MS)),
      AsyncStorage.setItem(SAVED_EMAIL, email.trim()),
      AsyncStorage.removeItem(SESSION_ONLY),
    ]);
  } else {
    await Promise.all([
      AsyncStorage.setItem(SESSION_ONLY, '1'),
      AsyncStorage.removeItem(REMEMBER_UNTIL),
      AsyncStorage.removeItem(SAVED_EMAIL),
    ]);
  }
}

/** True when a stored session should be discarded instead of restored. */
export async function sessionExpired(): Promise<boolean> {
  const [until, sessionOnly] = await Promise.all([
    AsyncStorage.getItem(REMEMBER_UNTIL),
    AsyncStorage.getItem(SESSION_ONLY),
  ]);
  if (sessionOnly) {
    const web = webSession();
    return web ? web.getItem(WEB_TAB_MARKER) !== '1' : !signedInThisLaunch;
  }
  if (until) return Date.now() > Number(until);
  // Signed in before this feature existed: start their 30 days now rather
  // than signing them out.
  await AsyncStorage.setItem(REMEMBER_UNTIL, String(Date.now() + REMEMBER_MS));
  return false;
}

/** Clears the sign-in window but keeps the remembered email for next time. */
export async function clearSignIn() {
  signedInThisLaunch = false;
  webSession()?.removeItem(WEB_TAB_MARKER);
  await Promise.all([AsyncStorage.removeItem(REMEMBER_UNTIL), AsyncStorage.removeItem(SESSION_ONLY)]);
}

export async function savedEmail(): Promise<string | null> {
  return AsyncStorage.getItem(SAVED_EMAIL);
}
