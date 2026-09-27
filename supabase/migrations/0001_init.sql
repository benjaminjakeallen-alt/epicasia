-- Epic Asia — initial schema.
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste
-- this whole file -> Run. Safe to re-run (uses IF NOT EXISTS / OR REPLACE
-- throughout) if something fails partway and you need to retry.

-- ============================================================
-- Profiles (one row per trip member, keyed to Supabase Auth)
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Auto-create a profile row whenever someone registers via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- SECURITY DEFINER helper so RLS policies can check "is this user an admin"
-- without recursively re-evaluating profiles' own RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select to authenticated using (true);

-- Any user may update their own row; an admin may update any row. This
-- alone would let a user grant themselves is_admin (a same-statement
-- subquery in WITH CHECK sees the row's *already-updated* value, not the
-- prior one, so it can't be used here to compare old vs. new) — the
-- trigger below is what actually blocks that.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_admin_update_any" on public.profiles;
create policy "profiles_admin_update_any" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (true);

-- BEFORE UPDATE triggers see the pre-update row via OLD/a same-table
-- subquery (the write hasn't happened yet), so this correctly blocks a
-- non-admin from changing is_admin on any row, including their own.
create or replace function public.protect_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and not coalesce((select is_admin from public.profiles where id = auth.uid()), false) then
    raise exception 'Only an admin can change is_admin';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_is_admin_update on public.profiles;
create trigger protect_is_admin_update
  before update on public.profiles
  for each row execute procedure public.protect_is_admin();

-- ============================================================
-- Shared trip logistics: itinerary, flights, lodging, chat
-- ============================================================

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  city text,
  title text not null,
  description text,
  start_time timestamptz,
  end_time timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.flights (
  id uuid primary key default gen_random_uuid(),
  airline text,
  flight_number text,
  departure_airport text,
  arrival_airport text,
  departure_time timestamptz,
  arrival_time timestamptz,
  confirmation_code text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.lodging (
  id uuid primary key default gen_random_uuid(),
  city text,
  name text not null,
  address text,
  check_in date,
  check_out date,
  confirmation_code text,
  notes text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

-- Any trip member can read and post; only the creator or an admin can
-- edit/delete an entry. itinerary_items/flights/lodging key off
-- created_by, messages keys off user_id — kept as separate statements
-- (rather than one dynamic loop over both column names) so each policy is
-- plain, readable SQL.
alter table public.itinerary_items enable row level security;
alter table public.flights enable row level security;
alter table public.lodging enable row level security;
alter table public.messages enable row level security;

drop policy if exists "itinerary_items_select_all" on public.itinerary_items;
create policy "itinerary_items_select_all" on public.itinerary_items for select to authenticated using (true);
drop policy if exists "itinerary_items_insert_own" on public.itinerary_items;
create policy "itinerary_items_insert_own" on public.itinerary_items
  for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "itinerary_items_modify_own_or_admin" on public.itinerary_items;
create policy "itinerary_items_modify_own_or_admin" on public.itinerary_items
  for update to authenticated using (created_by = auth.uid() or public.is_admin());
drop policy if exists "itinerary_items_delete_own_or_admin" on public.itinerary_items;
create policy "itinerary_items_delete_own_or_admin" on public.itinerary_items
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());

drop policy if exists "flights_select_all" on public.flights;
create policy "flights_select_all" on public.flights for select to authenticated using (true);
drop policy if exists "flights_insert_own" on public.flights;
create policy "flights_insert_own" on public.flights
  for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "flights_modify_own_or_admin" on public.flights;
create policy "flights_modify_own_or_admin" on public.flights
  for update to authenticated using (created_by = auth.uid() or public.is_admin());
drop policy if exists "flights_delete_own_or_admin" on public.flights;
create policy "flights_delete_own_or_admin" on public.flights
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());

drop policy if exists "lodging_select_all" on public.lodging;
create policy "lodging_select_all" on public.lodging for select to authenticated using (true);
drop policy if exists "lodging_insert_own" on public.lodging;
create policy "lodging_insert_own" on public.lodging
  for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "lodging_modify_own_or_admin" on public.lodging;
create policy "lodging_modify_own_or_admin" on public.lodging
  for update to authenticated using (created_by = auth.uid() or public.is_admin());
drop policy if exists "lodging_delete_own_or_admin" on public.lodging;
create policy "lodging_delete_own_or_admin" on public.lodging
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());

drop policy if exists "messages_select_all" on public.messages;
create policy "messages_select_all" on public.messages for select to authenticated using (true);
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "messages_modify_own_or_admin" on public.messages;
create policy "messages_modify_own_or_admin" on public.messages
  for update to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "messages_delete_own_or_admin" on public.messages;
create policy "messages_delete_own_or_admin" on public.messages
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- ============================================================
-- Expenses (shared, with per-user split shares)
-- ============================================================

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  paid_by uuid not null references public.profiles (id),
  amount numeric(10, 2) not null,
  currency text not null default 'USD',
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  share_amount numeric(10, 2) not null,
  settled boolean not null default false,
  unique (expense_id, user_id)
);

alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;

drop policy if exists "expenses_select_all" on public.expenses;
create policy "expenses_select_all" on public.expenses for select to authenticated using (true);
drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own" on public.expenses for insert to authenticated with check (paid_by = auth.uid());
drop policy if exists "expenses_modify_own_or_admin" on public.expenses;
create policy "expenses_modify_own_or_admin" on public.expenses
  for update to authenticated using (paid_by = auth.uid() or public.is_admin());
drop policy if exists "expenses_delete_own_or_admin" on public.expenses;
create policy "expenses_delete_own_or_admin" on public.expenses
  for delete to authenticated using (paid_by = auth.uid() or public.is_admin());

drop policy if exists "expense_shares_select_all" on public.expense_shares;
create policy "expense_shares_select_all" on public.expense_shares for select to authenticated using (true);
drop policy if exists "expense_shares_insert_by_payer_or_admin" on public.expense_shares;
create policy "expense_shares_insert_by_payer_or_admin" on public.expense_shares
  for insert to authenticated
  with check (
    public.is_admin()
    or exists (select 1 from public.expenses e where e.id = expense_id and e.paid_by = auth.uid())
  );
drop policy if exists "expense_shares_update_own_settled_or_admin" on public.expense_shares;
create policy "expense_shares_update_own_settled_or_admin" on public.expense_shares
  for update to authenticated using (user_id = auth.uid() or public.is_admin());

-- ============================================================
-- Shared photo gallery
-- ============================================================

create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

alter table public.gallery_photos enable row level security;
drop policy if exists "gallery_photos_select_all" on public.gallery_photos;
create policy "gallery_photos_select_all" on public.gallery_photos for select to authenticated using (true);
drop policy if exists "gallery_photos_insert_own" on public.gallery_photos;
create policy "gallery_photos_insert_own" on public.gallery_photos
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "gallery_photos_delete_own_or_admin" on public.gallery_photos;
create policy "gallery_photos_delete_own_or_admin" on public.gallery_photos
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- ============================================================
-- Personal (private): packing list, documents, journal
-- ============================================================

create table if not exists public.packing_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  label text not null,
  is_packed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  storage_path text not null,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  body text,
  photo_url text,
  shared_to_group boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.packing_items enable row level security;
alter table public.documents enable row level security;
alter table public.journal_entries enable row level security;

drop policy if exists "packing_items_owner_only" on public.packing_items;
create policy "packing_items_owner_only" on public.packing_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "documents_owner_only" on public.documents;
create policy "documents_owner_only" on public.documents
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "journal_entries_owner_all" on public.journal_entries;
create policy "journal_entries_owner_all" on public.journal_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "journal_entries_select_shared" on public.journal_entries;
create policy "journal_entries_select_shared" on public.journal_entries
  for select to authenticated using (shared_to_group = true);

-- ============================================================
-- Storage buckets
-- ============================================================

insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Gallery: any trip member can upload; anyone (incl. public bucket reads)
-- can view since it's a shared album.
drop policy if exists "gallery_bucket_insert" on storage.objects;
create policy "gallery_bucket_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'gallery');
drop policy if exists "gallery_bucket_read" on storage.objects;
create policy "gallery_bucket_read" on storage.objects
  for select using (bucket_id = 'gallery');
drop policy if exists "gallery_bucket_delete_own_or_admin" on storage.objects;
create policy "gallery_bucket_delete_own_or_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gallery' and (owner = auth.uid() or public.is_admin()));

-- Documents: private, path must be prefixed with the uploader's user id
-- (e.g. "<uid>/passport.jpg"), enforced by folder-name check.
drop policy if exists "documents_bucket_owner_only" on storage.objects;
create policy "documents_bucket_owner_only" on storage.objects
  for all to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
