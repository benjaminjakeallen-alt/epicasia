// The public web address of the app. Links we send to people (invites,
// confirmation and password-reset emails) must point here: anyone can open
// it, app or not. Vercel's other addresses for the project (per-deployment
// and team URLs like epicasia-…-allen-trailmarks.vercel.app) sit behind
// Vercel login — links built from those broke for invited travelers.
// EXPO_PUBLIC_SITE_URL overrides it (e.g. a custom domain later).
const PUBLIC_SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://epicasia.vercel.app').replace(/\/+$/, '');

/** `path` on the public site, e.g. siteUrl('/register', { invite: 'K7QM-2XPA' }). */
export function siteUrl(path: string, query?: Record<string, string>): string {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  return `${PUBLIC_SITE}/${path.replace(/^\/+/, '')}${qs}`;
}

/**
 * Where an auth email should send someone back to: the public site. It must
 * be listed in Supabase → Authentication → URL Configuration → Redirect
 * URLs, or Supabase falls back to its Site URL.
 */
export function authReturnUrl(path: string, query?: Record<string, string>): string {
  return siteUrl(path, query);
}
