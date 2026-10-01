-- Group chat: photo messages, replies, soft delete, emoji reactions, a
-- private photo bucket, realtime delivery and a private typing channel.
-- The one room is "everyone" (the whole trip); messages keep the shared
-- shape from 0001 (any member reads/posts, the author or an admin
-- edits/deletes).

-- ---------- messages ----------
alter table public.messages
  alter column body drop not null,
  add column if not exists image_path text,
  add column if not exists image_width integer,
  add column if not exists image_height integer,
  add column if not exists reply_to uuid references public.messages (id) on delete set null,
  add column if not exists deleted_at timestamptz;

-- A live message needs text or a photo; text is capped so one message
-- can't be a novel.
alter table public.messages drop constraint if exists messages_has_content;
alter table public.messages add constraint messages_has_content
  check (deleted_at is not null or char_length(btrim(coalesce(body, ''))) > 0 or image_path is not null);
alter table public.messages drop constraint if exists messages_body_length;
alter table public.messages add constraint messages_body_length
  check (body is null or char_length(body) <= 4000);

create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists messages_reply_to_idx on public.messages (reply_to);

-- The 0001 update policy had no WITH CHECK, so it defaulted to USING —
-- fine for authors, but spelled out here so an update can never move a
-- message to another author.
drop policy if exists "messages_modify_own_or_admin" on public.messages;
create policy "messages_modify_own_or_admin" on public.messages
  for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin()));

-- ---------- reactions ----------
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists message_reactions_user_id_idx on public.message_reactions (user_id);

alter table public.message_reactions enable row level security;

drop policy if exists "message_reactions_select_all" on public.message_reactions;
create policy "message_reactions_select_all" on public.message_reactions
  for select to authenticated using (true);
drop policy if exists "message_reactions_insert_own" on public.message_reactions;
create policy "message_reactions_insert_own" on public.message_reactions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "message_reactions_delete_own" on public.message_reactions;
create policy "message_reactions_delete_own" on public.message_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Realtime DELETE events carry only the primary key unless the old row is
-- logged in full; the client needs user_id + emoji to remove a reaction.
alter table public.message_reactions replica identity full;

-- ---------- realtime ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;

-- Typing indicators use a private broadcast channel, "chat:everyone":
-- only signed-in members may join or send on it.
drop policy if exists "chat_typing_read" on realtime.messages;
create policy "chat_typing_read" on realtime.messages
  for select to authenticated using ((select realtime.topic()) = 'chat:everyone');
drop policy if exists "chat_typing_write" on realtime.messages;
create policy "chat_typing_write" on realtime.messages
  for insert to authenticated with check ((select realtime.topic()) = 'chat:everyone');

-- ---------- photo storage ----------
-- Private bucket: every trip member can view/download chat photos (via
-- signed URLs), uploads go under the sender's own "<uid>/..." folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat_bucket_read" on storage.objects;
create policy "chat_bucket_read" on storage.objects
  for select to authenticated using (bucket_id = 'chat');
drop policy if exists "chat_bucket_insert_own_folder" on storage.objects;
create policy "chat_bucket_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "chat_bucket_delete_own_or_admin" on storage.objects;
create policy "chat_bucket_delete_own_or_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin())));
