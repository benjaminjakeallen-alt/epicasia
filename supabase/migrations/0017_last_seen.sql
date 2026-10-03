-- 0017: "who's on the app" for organizers (Profile → Admin).
-- Each signed-in app stamps profiles.last_seen_at with the server's clock
-- when it opens and every couple of minutes while it's in front. Everyone
-- can already read profiles; the stamp only ever touches your own row
-- (security invoker, so profiles_update_own applies).

alter table public.profiles add column if not exists last_seen_at timestamptz;

create or replace function public.touch_last_seen()
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.profiles set last_seen_at = now() where id = (select auth.uid());
$$;

revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
