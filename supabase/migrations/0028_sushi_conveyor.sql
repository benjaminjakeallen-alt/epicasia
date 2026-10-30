-- Sushi Conveyor (Oct 30 2026): an arcade game scored like the others. `level`
-- is the fastest belt reached (1–5), `round` is always 1, `hero` is who sat at
-- the counter.

alter table public.game_scores drop constraint if exists game_scores_game_check;
alter table public.game_scores add constraint game_scores_game_check
  check (game in ('godzilla_rampage', 'shinkansen_dash', 'chain_gang', 'sushi_conveyor'));
