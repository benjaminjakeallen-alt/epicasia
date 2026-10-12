-- Shinkansen Dash: Jake, the secret traveller found down a manhole (finish
-- the sewer level). Runs can be saved as him.

alter table public.game_scores drop constraint if exists game_scores_hero_check;
alter table public.game_scores add constraint game_scores_hero_check
  check (hero in ('chris', 'shea', 'emily', 'heather', 'nicole', 'miles', 'bennett', 'jake'));
