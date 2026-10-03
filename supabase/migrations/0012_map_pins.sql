-- Toolkit → Map pins: the group's shared places (hotels, meeting points,
-- restaurants…). Shared shape: every signed-in member reads and adds;
-- only the creator or an admin edits or deletes.
-- `address` is meant to hold the address as written locally (e.g. Chinese
-- characters) so it can be shown to a taxi driver; lat/lng are optional
-- (from "use my location"), otherwise maps search by name + address.

create table public.map_pins (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  address text check (address is null or char_length(address) <= 300),
  note text check (note is null or char_length(note) <= 500),
  category text not null default 'other'
    check (category in ('hotel', 'meet', 'food', 'sight', 'shop', 'other')),
  city text check (city is null or city in ('tokyo', 'kyoto', 'beijing', 'shanghai', 'hongKong')),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  created_at timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);

create index map_pins_created_by_idx on public.map_pins (created_by);

alter table public.map_pins enable row level security;

create policy "map_pins_select" on public.map_pins
  for select to authenticated using (true);
create policy "map_pins_insert_own" on public.map_pins
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "map_pins_update_own_or_admin" on public.map_pins
  for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()))
  with check (created_by = (select auth.uid()) or (select private.is_admin()));
create policy "map_pins_delete_own_or_admin" on public.map_pins
  for delete to authenticated using (created_by = (select auth.uid()) or (select private.is_admin()));
