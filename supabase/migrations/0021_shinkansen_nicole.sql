-- Shinkansen Dash gains a fifth traveller, Nicole, unlocked by grabbing a
-- boba tea in the fast end of the line. Runs can now be played as her.

alter table public.game_scores drop constraint if exists game_scores_hero_check;
alter table public.game_scores add constraint game_scores_hero_check
  check (hero in ('chris', 'shea', 'emily', 'heather', 'nicole'));
