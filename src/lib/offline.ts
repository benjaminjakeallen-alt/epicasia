import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

// Offline copies of trip data. Every successful read is saved on the phone
// (per signed-in user); when a read fails — no signal in a Beijing metro, a
// dead hotel Wi-Fi — the saved copy is returned instead, and the app shows
// a small "Offline" note with when it was saved. Screens can also `peek` at
// the saved copy to show it instantly while the fresh read is in flight.
// Signing out clears every copy.

const PREFIX = 'epicasia.cache.';

type Entry<T> = { data: T; savedAt: number };

async function userKey(name: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession(); // local; works offline
  const uid = data.session?.user.id;
  return uid ? `${PREFIX}${uid}.${name}` : null;
}

// ---- offline state, for the notice --------------------------------------

let offlineSince: number | null = null; // savedAt of the copy being shown
const listeners = new Set<(savedAt: number | null) => void>();
function setOffline(savedAt: number | null) {
  if (savedAt === offlineSince) return;
  offlineSince = savedAt;
  listeners.forEach((l) => l(savedAt));
}

/** null while online; otherwise when the data being shown was saved. */
export function useOfflineSince(): number | null {
  return useSyncExternalStore(subscribe, () => offlineSince, () => null);
}

function subscribe(cb: () => void) {
  const l = () => cb();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// ---- reads ----------------------------------------------------------------

// supabase-js retries a failed read 3 times (1s, 2s, 4s) before giving up,
// so with no signal a read takes ~7s to fail. Waiting that long is worse
// than showing the saved copy; after this long we show it and let the read
// finish in the background (its result refreshes the saved copy).
const SLOW_MS = 3500;

/**
 * Runs `fetcher`; saves its result under `name`. If it fails — or is still
 * waiting after SLOW_MS — returns the saved copy (and flags offline);
 * without a saved copy it waits for / rethrows the real result.
 */
export async function cached<T>(name: string, fetcher: () => Promise<T>): Promise<T> {
  const key = await userKey(name);
  const live = fetcher().then((data) => {
    if (key) AsyncStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() } satisfies Entry<T>)).catch(() => {});
    return data;
  });
  const first = await Promise.race([
    live.then(
      (data) => ({ kind: 'ok' as const, data }),
      (error: unknown) => ({ kind: 'error' as const, error }),
    ),
    new Promise<{ kind: 'slow' }>((resolve) => setTimeout(() => resolve({ kind: 'slow' }), SLOW_MS)),
  ]);
  if (first.kind === 'ok') {
    setOffline(null);
    return first.data;
  }
  const hit = key ? await read<T>(key) : null;
  if (hit) {
    live.catch(() => {}); // still settling in the background
    setOffline(hit.savedAt);
    return hit.data;
  }
  if (first.kind === 'error') throw first.error;
  return live; // slow, nothing saved: keep waiting for the real answer
}

async function read<T>(key: string): Promise<Entry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Entry<T>) : null;
  } catch {
    return null;
  }
}

/** The saved copy, if any — for showing something instantly. */
export async function peek<T>(name: string): Promise<T | null> {
  const key = await userKey(name);
  return key ? ((await read<T>(key))?.data ?? null) : null;
}

/** Forget every saved copy (sign-out). */
export async function clearOfflineCopies(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.removeMany(keys);
  } catch {
    // ignore
  }
  setOffline(null);
}

/** "today 9:41 AM" / "Jun 7, 9:41 AM" */
export function savedLabel(savedAt: number, now = new Date()): string {
  const d = new Date(savedAt);
  const h = d.getHours();
  const time = `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `today ${time}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${time}`;
}
