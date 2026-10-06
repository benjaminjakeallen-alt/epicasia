-- Shinkansen Dash: a second arcade game on the same score table. A run's
-- `level` is the furthest stage reached (1 Tokyo … 5 Kyoto) and `round` how
-- many times round the route; hero is the traveller played.

alter table public.game_scores drop constraint if exists game_scores_game_check;
alter table public.game_scores add constraint game_scores_game_check
  check (game in ('godzilla_rampage', 'shinkansen_dash'));
