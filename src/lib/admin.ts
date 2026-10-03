import { supabase } from './supabase';

// Organizer tools (Profile → Admin): who's on the trip, who's using the app
// right now, when each person last signed in, and temporary passwords.
// "Active" comes from profiles.last_seen_at, which every open app stamps
// (touchLastSeen); sign-in times and emails come from auth through the
// admin-reset-password function (organizers only).

/** Seen within this long counts as "Active now". */
export const ACTIVE_MS = 5 * 60 * 1000;
/** How often an open app stamps last_seen_at. */
export const HEARTBEAT_MS = 2 * 60 * 1000;

export type Traveler = {
  id: string;
  name: string;
  avatar: string | null;
  isAdmin: boolean;
  lastSeen: string | null;
  email: string | null;
  lastSignIn: string | null;
  joined: string | null;
};

/** Stamps "I'm here" on your profile (fire and forget). */
export function touchLastSeen() {
  Promise.resolve(supabase.rpc('touch_last_seen')).catch(() => {});
}

export async function fetchTravelers(): Promise<Traveler[]> {
  const [{ data: profiles, error }, accounts] = await Promise.all([
    supabase.from('profiles').select('id, display_name, avatar_url, is_admin, last_seen_at').order('display_name'),
    supabase.functions
      .invoke('admin-reset-password', { body: { action: 'list' } })
      .then(({ data }) => (Array.isArray(data?.accounts) ? data.accounts : []))
      .catch(() => []),
  ]);
  if (error) throw error;
  const byId = new Map<string, { email: string | null; last_sign_in_at: string | null; created_at: string | null }>(
    accounts.map((a: { id: string }) => [a.id, a]),
  );
  return (profiles ?? []).map((p) => {
    const a = byId.get(p.id);
    return {
      id: p.id,
      name: p.display_name,
      avatar: p.avatar_url,
      isAdmin: !!p.is_admin,
      lastSeen: p.last_seen_at ?? null,
      email: a?.email ?? null,
      lastSignIn: a?.last_sign_in_at ?? null,
      joined: a?.created_at ?? null,
    };
  });
}

export function isActive(t: Traveler, now = Date.now()) {
  return !!t.lastSeen && now - new Date(t.lastSeen).getTime() < ACTIVE_MS;
}

/** Active now first, then most recently seen / signed in; never-signed-in last. */
export function byActivity(a: Traveler, b: Traveler) {
  const when = (t: Traveler) =>
    Math.max(t.lastSeen ? Date.parse(t.lastSeen) : 0, t.lastSignIn ? Date.parse(t.lastSignIn) : 0);
  return when(b) - when(a) || a.name.localeCompare(b.name);
}

function ago(iso: string, now: number) {
  const min = Math.round((now - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${Math.max(1, min)} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? 'yesterday' : `${d} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Active now", "Active 3 h ago", "Signed in Oct 2", "Hasn't signed in yet". */
export function activityLabel(t: Traveler, now = Date.now()): string {
  if (isActive(t, now)) return 'Active now';
  if (t.lastSeen) return `Active ${ago(t.lastSeen, now)}`;
  if (t.lastSignIn) return `Signed in ${ago(t.lastSignIn, now)}`;
  return 'Hasn’t signed in yet';
}
