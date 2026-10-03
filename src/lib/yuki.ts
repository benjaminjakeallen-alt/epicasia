import AsyncStorage from '@react-native-async-storage/async-storage';
import { todayDay } from './dates';
import { supabase } from './supabase';

// Yuki (雪), the trip's AI assistant: the `yuki` Edge Function answers with
// Claude, reading the app's data as the signed-in traveler (see
// supabase/functions/yuki). The conversation is kept on this phone only,
// under the offline-cache prefix, so signing out clears it.

export type YukiTurn = { id: string; role: 'user' | 'assistant'; text: string; failed?: boolean };

export const YUKI_SUGGESTIONS = [
  'What’s the plan today?',
  'When do we fly to Beijing?',
  'Do I need a visa for China?',
  'What’s 5,000 yen in dollars?',
];

const key = (uid: string) => `epicasia.cache.${uid}.yuki`;
const KEEP = 40;

export async function loadConversation(uid: string): Promise<YukiTurn[]> {
  try {
    const raw = await AsyncStorage.getItem(key(uid));
    return raw ? (JSON.parse(raw) as YukiTurn[]) : [];
  } catch {
    return [];
  }
}

export async function saveConversation(uid: string, turns: YukiTurn[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key(uid), JSON.stringify(turns.slice(-KEEP)));
  } catch {
    // best effort
  }
}

export async function clearConversation(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(uid));
  } catch {
    // ignore
  }
}

/** The function's own message for a failed call (it answers { error, message }). */
async function errorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (typeof body?.message === 'string') return body.message;
    } catch {
      // not JSON
    }
  }
  return 'I can’t reach the internet right now — try again when you have signal.';
}

function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Asks Yuki; throws an Error whose message is safe to show. */
export async function askYuki(history: YukiTurn[], name: string): Promise<{ reply: string; remaining: number | null }> {
  const { data, error } = await supabase.functions.invoke('yuki', {
    body: {
      action: 'ask',
      messages: history.filter((t) => !t.failed).map((t) => ({ role: t.role, text: t.text })),
      today: todayDay(),
      tz: timeZone(),
      name,
    },
  });
  if (error) throw new Error(await errorMessage(error));
  return { reply: String(data?.reply ?? ''), remaining: typeof data?.remaining === 'number' ? data.remaining : null };
}

export type DraftInput = {
  day: string;
  city: string | null;
  title: string;
  story: string;
  voice: string[];
  captions: string[];
  /** Up to 4 photos, base64 without the data: prefix. */
  photos: { media_type: string; data: string }[];
};

/** A first-person journal entry drafted from the day's notes and photos. */
export async function draftJournal(entry: DraftInput): Promise<string> {
  const { photos, ...rest } = entry;
  const { data, error } = await supabase.functions.invoke('yuki', {
    body: { action: 'journal_draft', entry: rest, photos, tz: timeZone() },
  });
  if (error) throw new Error(await errorMessage(error));
  return String(data?.draft ?? '');
}

/** A photo shrunk to ≤ 1024 px JPEG for Yuki to look at (base64, no data: prefix). */
export async function imageForYuki(uri: string): Promise<{ media_type: string; data: string } | null> {
  try {
    const bitmap = await createImageBitmap(await (await fetch(uri)).blob());
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return { media_type: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1] ?? '' };
  } catch {
    return null;
  }
}
