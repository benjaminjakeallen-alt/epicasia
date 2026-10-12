-- Shinkansen Dash: Liam the ninja, a secret traveller earned with 30,000
-- points in one run. Runs can be saved as him.

alter table public.game_scores drop constraint if exists game_scores_hero_check;
alter table public.game_scores add constraint game_scores_hero_check
  check (hero in ('chris', 'shea', 'emily', 'heather', 'nicole', 'miles', 'bennett', 'jake', 'liam'));
