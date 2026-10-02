// Plain-text day/time helpers shared by the add forms and lists. Days are
// "YYYY-MM-DD" strings (Postgres `date`); times are typed as "9:00 AM" or
// "21:00" — deliberately text fields rather than a native picker (see
// CLAUDE.md → Itinerary).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "2027-06-06" -> a local Date at midnight. Deliberately not `new
// Date(dayString)` — that parses as UTC midnight, which shifts to the
// previous day once formatted in a negative-UTC-offset timezone (all of
// the Americas).
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// "9:00 AM" / "9am" / "21:00" -> { hour, minute } in 24h, or null.
export function parseTimeInput(raw: string): { hour: number; minute: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (hour > 23 || minute > 59) return null;
  if (meridiem && (hour < 1 || hour > 12)) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return { hour, minute };
}

/** "Jun 6" */
export function formatMonthDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Sat" */
export function formatWeekday(day: string): string {
  return WEEKDAYS[parseDay(day).getDay()];
}

/** Whole nights between two "YYYY-MM-DD" days (DST-safe). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(checkOut) - toUtc(checkIn)) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ---- Wall-clock times -------------------------------------------------
// Flight times are the local time at that airport ("departs 10:30 in
// Tokyo"), which is what boarding passes show and what travellers think
// in. Storing a real instant would need each airport's time zone, so the
// wall-clock time is stored as if it were UTC and always read back in
// UTC — the phone's own time zone never shifts it.

export function wallClockISO(day: string, time: { hour: number; minute: number }): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${day}T${pad(time.hour)}:${pad(time.minute)}:00Z`;
}

/** Day part of a wall-clock timestamp: "2027-06-09". */
export function wallClockDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** "10:30 AM" from a wall-clock timestamp. */
export function formatWallClockTime(iso: string): string {
  const date = new Date(iso);
  const h = date.getUTCHours();
  const m = String(date.getUTCMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Today on the phone's own calendar, as "YYYY-MM-DD". */
export function todayDay(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
