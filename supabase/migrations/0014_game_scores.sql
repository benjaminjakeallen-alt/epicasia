-- Arcade scores. Unlike the photo games (points = upvotes), an arcade game
-- scores itself: each finished run posts one row. First game: Godzilla
-- Rampage (the app shows each player's best run on its high-score board).
-- Rows are append-only from the app: you insert your own runs; an admin may
-- delete a bogus one. Scores are capped so a tampered client can't post
-- something absurd (a perfect run is well under 10 million).

create table public.game_scores (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('godzilla_rampage')),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  score integer not null check (score > 0 and score < 10000000),
  level smallint not null check (level between 1 and 4),
  round smallint not null default 1 check (round between 1 and 999),
  hero text not null check (hero in ('chris', 'shea')),
  created_at timestamptz not null default now()
);

create index game_scores_game_score_idx on public.game_scores (game, score desc);
create index game_scores_user_id_idx on public.game_scores (user_id);

alter table public.game_scores enable row level security;

create policy "game_scores_select" on public.game_scores
  for select to authenticated using (true);
create policy "game_scores_insert_own" on public.game_scores
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "game_scores_delete_admin" on public.game_scores
  for delete to authenticated
  using ((select private.is_admin()));
