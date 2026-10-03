-- Games. Built so every game shares one scoring model: an entry belongs to
-- a game (`game` key) and a player; other players upvote entries; a
-- player's points in a game = upvotes their entries received. A combined
-- leaderboard across games is then a sum over the same two tables.
--
-- First game: "Lost in Translation" — photos of wonky English spotted on
-- the trip. Game photos stay out of the shared Photos gallery (user's
-- call): they live in their own private `games` bucket at
-- "<uid>/<entry id>.<ext>" (+ ".thumb.jpg"); any member reads, you upload
-- only into your own folder. Deleting an entry removes its votes (cascade);
-- the app deletes its files.
-- Applied live as 0013 + 0013b/c/d: the first version pointed entries at
-- gallery photos (a `photo_id` FK). The fix-ups added the bucket, rewrote
-- the insert policy with ALTER POLICY and made `photo_id` nullable — the
-- column itself is still there, unused and always null, because DROP
-- statements through the Supabase connector wait on a confirmation that
-- never arrives (they time out). Drop it from the SQL editor if it bothers
-- you: `alter table public.game_entries drop column photo_id;`.

create table public.game_entries (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('lost_in_translation')),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null,
  thumb_path text,
  width integer,
  height integer,
  caption text check (caption is null or char_length(caption) <= 200),
  city text check (city is null or city in ('tokyo', 'kyoto', 'beijing', 'shanghai', 'hongKong')),
  created_at timestamptz not null default now()
);

create index game_entries_game_idx on public.game_entries (game, created_at desc);
create index game_entries_created_by_idx on public.game_entries (created_by);

create table public.game_votes (
  entry_id uuid not null references public.game_entries (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);

create index game_votes_user_id_idx on public.game_votes (user_id);

alter table public.game_entries enable row level security;
alter table public.game_votes enable row level security;

-- Entries: everyone signed in sees them; you post as yourself, with a photo
-- in your own folder; you (or an admin) edit or delete your own.
create policy "game_entries_select" on public.game_entries
  for select to authenticated using (true);
create policy "game_entries_insert_own" on public.game_entries
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
  );
create policy "game_entries_update_own_or_admin" on public.game_entries
  for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()))
  with check (created_by = (select auth.uid()) or (select private.is_admin()));
create policy "game_entries_delete_own_or_admin" on public.game_entries
  for delete to authenticated using (created_by = (select auth.uid()) or (select private.is_admin()));

-- Votes: visible to all; one per entry per person (the primary key); never
-- on your own entry; you can take your own vote back.
create policy "game_votes_select" on public.game_votes
  for select to authenticated using (true);
create policy "game_votes_insert_own" on public.game_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not exists (select 1 from public.game_entries e where e.id = entry_id and e.created_by = (select auth.uid()))
  );
create policy "game_votes_delete_own" on public.game_votes
  for delete to authenticated using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('games', 'games', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "games_bucket_read" on storage.objects
  for select to authenticated using (bucket_id = 'games');
create policy "games_bucket_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'games' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "games_bucket_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'games' and (storage.foldername(name))[1] = (select auth.uid())::text);
