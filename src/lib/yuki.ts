import { todayDay } from './dates';
import { supabase } from './supabase';

// Yuki (雪), the trip's AI voice assistant: the `yuki` Edge Function answers
// with Claude, reading the app's data as the signed-in traveler (see
// supabase/functions/yuki). The conversation itself is voice — see
// yukiVoice.ts — and only lives in memory for a few minutes.

export type YukiTurn = { role: 'user' | 'assistant'; text: string };

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

/**
 * Asks Yuki; throws an Error whose message is safe to say. `voice` asks for
 * a short spoken answer; `device` is what's kept on this phone only
 * (settings, checklist ticks, the screen they're on).
 */
export async function askYuki(
  history: YukiTurn[],
  opts: { name: string; voice?: boolean; device?: Record<string, unknown> },
): Promise<{ reply: string; remaining: number | null }> {
  const { data, error } = await supabase.functions.invoke('yuki', {
    body: {
      action: 'ask',
      messages: history,
      today: todayDay(),
      tz: timeZone(),
      name: opts.name,
      voice: !!opts.voice,
      device: opts.device,
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
