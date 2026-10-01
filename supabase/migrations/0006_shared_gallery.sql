-- Shared photo gallery: richer gallery_photos rows, favorites, a private
-- gallery bucket, and chat photos copied into the gallery automatically.

-- ---------- gallery_photos ----------
-- `bucket` says where the original lives: 'gallery' for photos uploaded in
-- the gallery, 'chat' for photos posted in the group chat (same object,
-- never copied). `thumb_path` is a small JPEG made on the device at upload
-- (image transformations are a paid Supabase feature).
alter table public.gallery_photos
  add column if not exists bucket text not null default 'gallery',
  add column if not exists thumb_path text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists message_id uuid references public.messages (id) on delete cascade;

alter table public.gallery_photos drop constraint if exists gallery_photos_bucket_check;
alter table public.gallery_photos add constraint gallery_photos_bucket_check check (bucket in ('gallery', 'chat'));
alter table public.gallery_photos drop constraint if exists gallery_photos_caption_length;
alter table public.gallery_photos add constraint gallery_photos_caption_length check (caption is null or char_length(caption) <= 1000);

create unique index if not exists gallery_photos_message_id_key on public.gallery_photos (message_id);
create index if not exists gallery_photos_created_at_idx on public.gallery_photos (created_at desc);

-- Owners (or an admin) can edit their own caption. No update policy existed.
drop policy if exists "gallery_photos_update_own_or_admin" on public.gallery_photos;
create policy "gallery_photos_update_own_or_admin" on public.gallery_photos
  for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin()));

-- ---------- chat thumbnails ----------
alter table public.messages add column if not exists image_thumb_path text;

-- ---------- favorites ----------
create table if not exists public.photo_favorites (
  photo_id uuid not null references public.gallery_photos (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
create index if not exists photo_favorites_user_id_idx on public.photo_favorites (user_id);

alter table public.photo_favorites enable row level security;
drop policy if exists "photo_favorites_select_all" on public.photo_favorites;
create policy "photo_favorites_select_all" on public.photo_favorites
  for select to authenticated using (true);
drop policy if exists "photo_favorites_insert_own" on public.photo_favorites;
create policy "photo_favorites_insert_own" on public.photo_favorites
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "photo_favorites_delete_own" on public.photo_favorites;
create policy "photo_favorites_delete_own" on public.photo_favorites
  for delete to authenticated using (user_id = (select auth.uid()));
alter table public.photo_favorites replica identity full;

-- ---------- chat photos flow into the gallery ----------
-- Done in the database (not the app) so a chat photo always lands in the
-- gallery, even if the sender's app closes right after sending. Runs as
-- the sender (security invoker), so the normal RLS rules still apply.
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
        (user_id, bucket, storage_path, thumb_path, width, height, caption, message_id, created_at)
      values
        (new.user_id, 'chat', new.image_path, new.image_thumb_path, new.image_width, new.image_height,
         nullif(btrim(coalesce(new.body, '')), ''), new.id, new.created_at)
      on conflict (message_id) do nothing;
    end if;
  elsif tg_op = 'UPDATE' then
    -- Deleting a chat message removes its photo from the gallery too.
    if new.deleted_at is not null and old.deleted_at is null then
      delete from public.gallery_photos where message_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists chat_photo_to_gallery on public.messages;
create trigger chat_photo_to_gallery
  after insert or update of deleted_at on public.messages
  for each row execute function private.chat_photo_to_gallery();

-- Any chat photos posted before this migration.
insert into public.gallery_photos
  (user_id, bucket, storage_path, thumb_path, width, height, caption, message_id, created_at)
select user_id, 'chat', image_path, image_thumb_path, image_width, image_height,
       nullif(btrim(coalesce(body, '')), ''), id, created_at
from public.messages
where image_path is not null and deleted_at is null
on conflict (message_id) do nothing;

-- ---------- realtime ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gallery_photos') then
    alter publication supabase_realtime add table public.gallery_photos;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'photo_favorites') then
    alter publication supabase_realtime add table public.photo_favorites;
  end if;
end $$;
alter table public.gallery_photos replica identity full;

-- ---------- storage: gallery bucket becomes private ----------
-- It was public-read (anyone with a URL); trip photos should only be
-- visible to signed-in trip members, like chat photos. Originals go under
-- "<uid>/<photo id>.<ext>", thumbnails beside them.
update storage.buckets
  set public = false,
      file_size_limit = 31457280,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
  where id = 'gallery';

drop policy if exists "gallery_bucket_read" on storage.objects;
create policy "gallery_bucket_read" on storage.objects
  for select to authenticated using (bucket_id = 'gallery');
drop policy if exists "gallery_bucket_insert" on storage.objects;
create policy "gallery_bucket_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gallery' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- (gallery_bucket_delete_own_or_admin from 0003 stays as is.)
