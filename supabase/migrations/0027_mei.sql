-- Mei (Oct 14 2026): a traveller in Shinkansen Dash (from the start) and
-- Chain Gang Dynasty. Runs can be saved as her.

alter table public.game_scores drop constraint if exists game_scores_hero_check;
alter table public.game_scores add constraint game_scores_hero_check
  check (hero in ('chris', 'shea', 'emily', 'heather', 'nicole', 'miles', 'bennett', 'jake', 'liam', 'mei'));
