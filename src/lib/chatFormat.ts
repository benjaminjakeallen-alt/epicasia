import { personColors } from '../theme/colors';
import type { Message } from './chat';

// Pure display helpers for the group chat (no React, no network).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Messages ARE real instants (unlike flight times), so they're shown in the
// phone's own time zone.
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function sameDay(a: string, b: string): boolean {
  return localDayKey(new Date(a)) === localDayKey(new Date(b));
}

/** "Today" / "Yesterday" / "Sat, Jun 7" (+ year when not this year). */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (localDayKey(d) === localDayKey(now)) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (localDayKey(d) === localDayKey(y)) return 'Yesterday';
  const base = `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

const GROUP_GAP_MS = 5 * 60 * 1000;

/** True when two messages belong in the same visual run (same sender, close in time, same day). */
export function sameRun(a: Message | undefined, b: Message | undefined): boolean {
  if (!a || !b) return false;
  if (a.user_id !== b.user_id) return false;
  if (!sameDay(a.created_at, b.created_at)) return false;
  return Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < GROUP_GAP_MS;
}

// A stable color per traveler (by their position in the member list),
// from the theme's text-safe person palette (white initials pass AA).
const PERSON_COLORS = personColors;

export function personColor(index: number): string {
  return PERSON_COLORS[((index % PERSON_COLORS.length) + PERSON_COLORS.length) % PERSON_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Fits a photo inside a max box, keeping its aspect ratio (falls back to 4:3). */
export function photoSize(w: number | null, h: number | null, maxW: number, maxH: number) {
  const ratio = w && h ? w / h : 4 / 3;
  let width = maxW;
  let height = width / ratio;
  if (height > maxH) {
    height = maxH;
    width = height * ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

/** "Sarah is typing…", "Sarah and Mike are typing…", "3 people are typing…" */
export function typingLabel(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}
