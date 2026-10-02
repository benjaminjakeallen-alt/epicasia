-- Group chat unread badge + push notifications.
--
-- chat_reads: when you last had the chat open; unread = messages from
-- others after that. push_tokens: Expo push tokens per device (a phone
-- signed into two accounts has one row per account; the app deletes its
-- row on sign-out). Pushes are sent by the `notify-chat` Edge Function,
-- which the sender's app calls after a message is saved.

create table if not exists public.chat_reads (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now()
);
alter table public.chat_reads enable row level security;
create policy "chat_reads_select_own" on public.chat_reads
  for select to authenticated using (user_id = (select auth.uid()));
create policy "chat_reads_insert_own" on public.chat_reads
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "chat_reads_update_own" on public.chat_reads
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.push_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null check (char_length(token) <= 255),
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table public.push_tokens enable row level security;
create policy "push_tokens_select_own" on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy "push_tokens_insert_own" on public.push_tokens
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push_tokens_update_own" on public.push_tokens
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push_tokens_delete_own" on public.push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

-- Counting unread messages filters on created_at.
create index if not exists messages_created_at_idx on public.messages (created_at desc);
