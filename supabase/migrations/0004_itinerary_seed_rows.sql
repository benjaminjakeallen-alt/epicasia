-- Allow "trip plan" itinerary rows that no single user owns (created_by
-- null) — the seeded day-by-day plan from the Asia Disney Adventure
-- artifact. Existing RLS already does the right thing for them: every
-- member can read them, only admins can update/delete them (created_by =
-- auth.uid() is never true for null), and inserts from the app still must
-- set created_by to the caller.
--
-- Also switch the FK to ON DELETE SET NULL, so deleting a user keeps the
-- items they added (as unowned plan rows) instead of blocking the delete.
alter table public.itinerary_items alter column created_by drop not null;
alter table public.itinerary_items drop constraint if exists itinerary_items_created_by_fkey;
alter table public.itinerary_items
  add constraint itinerary_items_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;
