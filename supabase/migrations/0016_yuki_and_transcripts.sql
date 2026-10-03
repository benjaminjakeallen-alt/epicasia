-- Yuki, the AI trip assistant (Oct 2026), and journal voice-note transcripts.

-- Daily question count per traveler: the yuki Edge Function checks and bumps
-- it with the service role (a cost guard). No policies: nobody else reads or
-- writes it.
create table if not exists public.assistant_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null default current_date,
  requests integer not null default 0,
  primary key (user_id, day)
);
alter table public.assistant_usage enable row level security;

-- Counts one more question and returns the new total, atomically.
create or replace function public.assistant_bump(p_user uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.assistant_usage (user_id, day, requests) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set requests = public.assistant_usage.requests + 1
  returning requests;
$$;
revoke all on function public.assistant_bump(uuid) from public, anon, authenticated;
grant execute on function public.assistant_bump(uuid) to service_role;

-- What was said in a voice note (written in the browser while recording).
alter table public.journal_media
  add column if not exists transcript text check (transcript is null or char_length(transcript) <= 8000);
