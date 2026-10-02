-- Personal trip journal: entries with a trip day, title and text; photos
-- and voice notes attached per entry (journal_media); a private `journal`
-- storage bucket. Entries stay private unless shared to the group, and a
-- shared entry's media becomes readable by every signed-in member.

-- ---------- journal_entries ----------
alter table public.journal_entries
  add column if not exists title text,
  add column if not exists day date not null default current_date,
  add column if not exists city text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.journal_entries drop constraint if exists journal_entries_title_length;
alter table public.journal_entries add constraint journal_entries_title_length
  check (title is null or char_length(title) <= 200);
alter table public.journal_entries drop constraint if exists journal_entries_body_length;
alter table public.journal_entries add constraint journal_entries_body_length
  check (body is null or char_length(body) <= 20000);

create index if not exists journal_entries_user_day_idx on public.journal_entries (user_id, day desc);
create index if not exists journal_entries_shared_idx on public.journal_entries (day desc) where shared_to_group;

-- ---------- journal_media ----------
create table if not exists public.journal_media (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('photo', 'audio')),
  storage_path text not null,
  thumb_path text,
  width integer,
  height integer,
  duration_ms integer,
  caption text check (caption is null or char_length(caption) <= 500),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists journal_media_entry_id_idx on public.journal_media (entry_id, position);
create index if not exists journal_media_user_id_idx on public.journal_media (user_id);

alter table public.journal_media enable row level security;

drop policy if exists "journal_media_select" on public.journal_media;
create policy "journal_media_select" on public.journal_media
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.journal_entries e where e.id = entry_id and e.shared_to_group)
  );
drop policy if exists "journal_media_insert_own" on public.journal_media;
create policy "journal_media_insert_own" on public.journal_media
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.journal_entries e where e.id = entry_id and e.user_id = (select auth.uid()))
  );
drop policy if exists "journal_media_update_own" on public.journal_media;
create policy "journal_media_update_own" on public.journal_media
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "journal_media_delete_own" on public.journal_media;
create policy "journal_media_delete_own" on public.journal_media
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- storage: private journal bucket ----------
-- Files live under "<uid>/<entry id>/<media id>.<ext>". Only the owner
-- writes; reading is the owner, or anyone signed in once the entry the
-- file belongs to is shared to the group.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal', 'journal', false, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
        'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "journal_bucket_read" on storage.objects;
create policy "journal_bucket_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'journal'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.journal_media m
        join public.journal_entries e on e.id = m.entry_id
        where e.shared_to_group and (m.storage_path = name or m.thumb_path = name)
      )
    )
  );
drop policy if exists "journal_bucket_insert_own" on storage.objects;
create policy "journal_bucket_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'journal' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "journal_bucket_delete_own" on storage.objects;
create policy "journal_bucket_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'journal' and (storage.foldername(name))[1] = (select auth.uid())::text);
