-- Chat and photos, round 2 (Oct 2026), for the PWA:
--   chat rooms (open or private), editing your messages, muting a person or
--   a room, video messages; web push subscriptions (the app is a PWA, so the
--   Expo push tokens from 0009 are retired); photo "taken at" times, video in
--   the gallery and shared albums.
-- Non-destructive on purpose (ALTER POLICY, CREATE OR REPLACE TRIGGER):
-- DROP statements through the Supabase connector hang waiting for a
-- confirmation. Retired, now unused: public.chat_reads, public.push_tokens.
-- (Applied live as 0015a–e; 0015d revoked two helper functions that the live
-- database still has, unused — public.push_public_key and
-- public.save_push_subscription — this file is the clean final schema.)

-- ============================== chat rooms ==============================
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  emoji text check (emoji is null or char_length(emoji) <= 16),
  is_private boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- The original single room. Its fixed id is the default for messages.
insert into public.chat_rooms (id, name, emoji, is_private, created_by)
values ('00000000-0000-4000-8000-000000000001', 'Everyone', '🌏', false, null)
on conflict (id) do nothing;

create table if not exists public.chat_room_members (
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists chat_rooms_created_by_idx on public.chat_rooms (created_by);
create index if not exists chat_room_members_user_idx on public.chat_room_members (user_id);

-- Who can see a room: anyone signed in for an open room; for a private room
-- its creator and its members. Security definer so policies on the room
-- tables can use it without recursing into their own RLS.
create or replace function private.can_see_room(r uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_rooms c
    where c.id = r
      and (not c.is_private
           or c.created_by = (select auth.uid())
           or exists (select 1 from public.chat_room_members m where m.room_id = r and m.user_id = (select auth.uid())))
  );
$$;
revoke all on function private.can_see_room(uuid) from public, anon;
grant execute on function private.can_see_room(uuid) to authenticated;

-- Realtime topics are "chat:<room id>" (typing indicators).
create or replace function private.can_use_chat_topic(t text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when t ~ '^chat:[0-9a-f-]{36}$' then private.can_see_room(substr(t, 6)::uuid)
    else false
  end;
$$;
revoke all on function private.can_use_chat_topic(text) from public, anon;
grant execute on function private.can_use_chat_topic(text) to authenticated;

alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;

-- Membership check alone, for the rooms' own select policy: that policy is
-- also checked on INSERT ... RETURNING, when can_see_room() can't see the new
-- row yet, so it tests the row's own columns inline.
create or replace function private.is_room_member(r uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.chat_room_members m where m.room_id = r and m.user_id = (select auth.uid()));
$$;
revoke all on function private.is_room_member(uuid) from public, anon;
grant execute on function private.is_room_member(uuid) to authenticated;

create policy "chat_rooms_select_visible" on public.chat_rooms
  for select to authenticated
  using (not is_private or created_by = (select auth.uid()) or (select private.is_room_member(id)));
create policy "chat_rooms_insert_own" on public.chat_rooms
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "chat_rooms_update_creator_or_admin" on public.chat_rooms
  for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()))
  with check (created_by = (select auth.uid()) or (select private.is_admin()));
create policy "chat_rooms_delete_creator_or_admin" on public.chat_rooms
  for delete to authenticated
  using (id <> '00000000-0000-4000-8000-000000000001'
         and (created_by = (select auth.uid()) or (select private.is_admin())));

create policy "chat_room_members_select_visible" on public.chat_room_members
  for select to authenticated using ((select private.can_see_room(room_id)));
-- the room's creator (or an admin) adds people
create policy "chat_room_members_insert_creator" on public.chat_room_members
  for insert to authenticated
  with check (exists (select 1 from public.chat_rooms c where c.id = room_id
                       and (c.created_by = (select auth.uid()) or (select private.is_admin()))));
-- the creator removes people; anyone can leave
create policy "chat_room_members_delete" on public.chat_room_members
  for delete to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.chat_rooms c where c.id = room_id
                     and (c.created_by = (select auth.uid()) or (select private.is_admin()))));

-- ============================== messages ==============================
alter table public.messages
  add column if not exists room_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references public.chat_rooms (id) on delete cascade,
  add column if not exists edited_at timestamptz,
  add column if not exists video_path text,
  add column if not exists video_duration_ms integer;
create index if not exists messages_room_created_idx on public.messages (room_id, created_at desc);

alter policy "messages_select_all" on public.messages
  using ((select private.can_see_room(room_id)));
alter policy "messages_insert_own" on public.messages
  with check (user_id = (select auth.uid()) and (select private.can_see_room(room_id)));
-- reactions are visible exactly where their message is
alter policy "message_reactions_select_all" on public.message_reactions
  using (exists (select 1 from public.messages m where m.id = message_id));

-- Editing: the server stamps edited_at whenever a live message's text changes.
create or replace function private.stamp_message_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is null and new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;
create or replace trigger stamp_message_edit
  before update of body on public.messages
  for each row execute function private.stamp_message_edit();

-- Typing channels per room.
alter policy "chat_typing_read" on realtime.messages
  using ((select private.can_use_chat_topic((select realtime.topic()))));
alter policy "chat_typing_write" on realtime.messages
  with check ((select private.can_use_chat_topic((select realtime.topic()))));

-- Unread counts per room (replaces public.chat_reads).
create table if not exists public.chat_room_reads (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  room_id uuid not null references public.chat_rooms (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, room_id)
);
create index if not exists chat_room_reads_room_idx on public.chat_room_reads (room_id);
alter table public.chat_room_reads enable row level security;
create policy "chat_room_reads_select_own" on public.chat_room_reads
  for select to authenticated using (user_id = (select auth.uid()));
create policy "chat_room_reads_insert_own" on public.chat_room_reads
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "chat_room_reads_update_own" on public.chat_room_reads
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Mutes: no notifications from a person, or from a room.
create table if not exists public.chat_mutes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  muted_user_id uuid references public.profiles (id) on delete cascade,
  muted_room_id uuid references public.chat_rooms (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(muted_user_id, muted_room_id) = 1),
  check (muted_user_id is null or muted_user_id <> user_id)
);
create unique index if not exists chat_mutes_person_uq on public.chat_mutes (user_id, muted_user_id) where muted_user_id is not null;
create unique index if not exists chat_mutes_room_uq on public.chat_mutes (user_id, muted_room_id) where muted_room_id is not null;
create index if not exists chat_mutes_muted_user_idx on public.chat_mutes (muted_user_id);
create index if not exists chat_mutes_muted_room_idx on public.chat_mutes (muted_room_id);
alter table public.chat_mutes enable row level security;
create policy "chat_mutes_select_own" on public.chat_mutes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "chat_mutes_insert_own" on public.chat_mutes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "chat_mutes_delete_own" on public.chat_mutes
  for delete to authenticated using (user_id = (select auth.uid()));

-- Realtime for rooms and members (new rooms appear live).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_rooms') then
    alter publication supabase_realtime add table public.chat_rooms;
  end if;
end $$;

-- ============================== web push ==============================
create table if not exists public.web_push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists web_push_subscriptions_user_idx on public.web_push_subscriptions (user_id);
alter table public.web_push_subscriptions enable row level security;
create policy "web_push_select_own" on public.web_push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "web_push_delete_own" on public.web_push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Subscriptions are saved by the notify-chat Edge Function (action
-- "subscribe"): the same browser can change hands (sign out, sign in as
-- someone else), and an endpoint is an unguessable secret only its browser
-- knows, so the caller takes it over. There are no insert/update policies.

-- VAPID keys: made once by the notify-chat Edge Function (WebCrypto) and kept
-- in the private schema; the private key never leaves the server.
create table if not exists private.push_config (
  id boolean primary key default true check (id),
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);
create or replace function public.push_server_config()
returns table (public_key text, private_jwk jsonb)
language sql
stable
security definer
set search_path = ''
as $$ select public_key, private_jwk from private.push_config where id $$;
revoke all on function public.push_server_config() from public, anon, authenticated;
grant execute on function public.push_server_config() to service_role;

create or replace function public.push_config_save(p_public text, p_private jsonb)
returns table (public_key text, private_jwk jsonb)
language sql
security definer
set search_path = ''
as $$
  insert into private.push_config (id, public_key, private_jwk) values (true, p_public, p_private)
  on conflict (id) do nothing;
  select public_key, private_jwk from private.push_config where id;
$$;
revoke all on function public.push_config_save(text, jsonb) from public, anon, authenticated;
grant execute on function public.push_config_save(text, jsonb) to service_role;

-- ============================== gallery ==============================
alter table public.gallery_photos
  add column if not exists taken_at timestamptz,
  add column if not exists video_path text,
  add column if not exists video_duration_ms integer;
update public.gallery_photos set taken_at = created_at where taken_at is null;
alter table public.gallery_photos alter column taken_at set default now();
alter table public.gallery_photos alter column taken_at set not null;
create index if not exists gallery_photos_taken_at_idx on public.gallery_photos (taken_at desc);

-- Chat photos and videos flow into the gallery (videos now too; an edited
-- message updates the caption). Replaces the 0006 version.
create or replace function private.chat_photo_to_gallery()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.image_path is not null and new.deleted_at is null then
      insert into public.gallery_photos
        (user_id, bucket, storage_path, thumb_path, width, height, caption, message_id, created_at, taken_at,
         video_path, video_duration_ms)
      values
        (new.user_id, 'chat', new.image_path, new.image_thumb_path, new.image_width, new.image_height,
         nullif(btrim(coalesce(new.body, '')), ''), new.id, new.created_at, new.created_at,
         new.video_path, new.video_duration_ms)
      on conflict (message_id) do nothing;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.deleted_at is not null and old.deleted_at is null then
      delete from public.gallery_photos where message_id = new.id;
    elsif new.body is distinct from old.body then
      update public.gallery_photos set caption = nullif(btrim(coalesce(new.body, '')), '') where message_id = new.id;
    end if;
  end if;
  return new;
end;
$$;
create or replace trigger chat_photo_to_gallery
  after insert or update of deleted_at, body on public.messages
  for each row execute function private.chat_photo_to_gallery();

-- Shared albums (city albums are worked out in the app from the trip dates).
create table if not exists public.photo_albums (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.album_photos (
  album_id uuid not null references public.photo_albums (id) on delete cascade,
  photo_id uuid not null references public.gallery_photos (id) on delete cascade,
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (album_id, photo_id)
);
create index if not exists album_photos_photo_idx on public.album_photos (photo_id);
create index if not exists album_photos_added_by_idx on public.album_photos (added_by);
create index if not exists photo_albums_created_by_idx on public.photo_albums (created_by);
alter table public.photo_albums enable row level security;
alter table public.album_photos enable row level security;
create policy "photo_albums_select_all" on public.photo_albums for select to authenticated using (true);
create policy "photo_albums_insert_own" on public.photo_albums
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "photo_albums_update_own_or_admin" on public.photo_albums
  for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()))
  with check (created_by = (select auth.uid()) or (select private.is_admin()));
create policy "photo_albums_delete_own_or_admin" on public.photo_albums
  for delete to authenticated using (created_by = (select auth.uid()) or (select private.is_admin()));
create policy "album_photos_select_all" on public.album_photos for select to authenticated using (true);
create policy "album_photos_insert_own" on public.album_photos
  for insert to authenticated with check (added_by = (select auth.uid()));
create policy "album_photos_delete" on public.album_photos
  for delete to authenticated
  using (added_by = (select auth.uid()) or (select private.is_admin())
         or exists (select 1 from public.photo_albums a where a.id = album_id and a.created_by = (select auth.uid())));

-- ============================== storage ==============================
-- Videos in chat and the gallery (Supabase's free plan caps uploads at 50 MB).
update storage.buckets
  set file_size_limit = 52428800,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
                                 'video/mp4', 'video/quicktime', 'video/webm']
  where id in ('chat', 'gallery');
