-- Godzilla Rampage gains a fifth level (Tokyo Tower) and, behind a secret,
-- "Girl Power" mode: Emily and Heather become playable heroes and rescue
-- Chris and Shea. Runs can now reach level 5 and be played as either.

alter table public.game_scores drop constraint if exists game_scores_level_check;
alter table public.game_scores add constraint game_scores_level_check check (level between 1 and 5);

alter table public.game_scores drop constraint if exists game_scores_hero_check;
alter table public.game_scores add constraint game_scores_hero_check
  check (hero in ('chris', 'shea', 'emily', 'heather'));
