-- Closed sign-up: a new account needs a trip invite code.
--
-- Admins create codes (random, e.g. "K7QM-2XPA"; optional label, use limit
-- and expiry; revocable) and share them by email, message or QR. The app
-- sends the code as sign-up metadata (`invite_code`); the new-user trigger
-- checks it and counts the use, and rejects the sign-up otherwise — so it
-- holds even for someone calling the Auth API directly. Existing accounts
-- are unaffected.

create or replace function private.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I
  bytes bytea := extensions.gen_random_bytes(8);
  out text := '';
begin
  for i in 0..7 loop
    out := out || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
    if i = 3 then out := out || '-'; end if;
  end loop;
  return out;
end;
$$;

create table if not exists public.trip_invites (
  code text primary key default private.new_invite_code() check (code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  label text check (label is null or char_length(label) <= 80),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0,
  revoked_at timestamptz
);
create index if not exists trip_invites_created_by_idx on public.trip_invites (created_by);

-- Only admins see or manage codes; checking a code at sign-up happens
-- inside the trigger below (security definer), not through RLS.
alter table public.trip_invites enable row level security;
create policy "trip_invites_admin_select" on public.trip_invites
  for select to authenticated using ((select private.is_admin()));
create policy "trip_invites_admin_insert" on public.trip_invites
  for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));
create policy "trip_invites_admin_update" on public.trip_invites
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
begin
  update public.trip_invites
     set uses = uses + 1
   where code = invite
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and (max_uses is null or uses < max_uses);
  if not found then
    raise exception 'invalid_invite_code' using errcode = 'P0001',
      hint = 'Ask a trip organizer for a current invite code.';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)));
  return new;
end;
$$;
