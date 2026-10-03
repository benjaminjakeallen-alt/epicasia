-- 0018: Konbini Review — buy a mystery snack or drink at a convenience
-- store, film your reaction, rate it 1–5. Same scoring as every photo
-- game (points = upvotes received); the snack ratings feed a "best and
-- worst snack of the trip" list. Entries reuse game_entries: the video
-- and its poster live in the private `games` bucket like Lost in
-- Translation's photos (storage_path = poster, video_path = the clip).

alter table public.game_entries drop constraint if exists game_entries_game_check;
alter table public.game_entries
  add constraint game_entries_game_check check (game in ('lost_in_translation', 'konbini_review'));

alter table public.game_entries
  add column if not exists title text check (title is null or char_length(title) between 1 and 80),
  add column if not exists rating smallint check (rating is null or rating between 1 and 5),
  add column if not exists video_path text,
  add column if not exists video_duration_ms integer check (video_duration_ms is null or video_duration_ms >= 0);

-- A review always has its snack, its rating and its video (in your folder).
alter table public.game_entries
  add constraint game_entries_konbini_complete check (
    game <> 'konbini_review'
    or (title is not null and rating is not null and video_path is not null)
  );
alter table public.game_entries
  add constraint game_entries_video_in_own_folder check (
    video_path is null or split_part(video_path, '/', 1) = split_part(storage_path, '/', 1)
  );

-- Reaction videos: the games bucket now takes short clips too (50 MB, the
-- free plan's per-file cap, like chat and the gallery).
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm']
where id = 'games';
