-- Applied directly via the Supabase MCP connector (project rjywjnidmjpfcjymaavi)
-- to address the performance advisor's findings after 0001_init.sql:
-- 1) missing covering indexes on foreign key columns
-- 2) RLS policies calling auth.uid()/private.is_admin() directly, which
--    Postgres re-evaluates per row; wrapping as (select auth.uid()) makes
--    it an initplan evaluated once per query instead.
-- 3) multiple permissive policies for the same role+action on profiles
--    (UPDATE) and journal_entries (SELECT) — consolidated into one policy
--    each so Postgres doesn't have to evaluate and OR two separate ones.

-- ---------- indexes ----------
create index if not exists documents_user_id_idx on public.documents (user_id);
create index if not exists expense_shares_user_id_idx on public.expense_shares (user_id);
create index if not exists expenses_paid_by_idx on public.expenses (paid_by);
create index if not exists flights_created_by_idx on public.flights (created_by);
create index if not exists gallery_photos_user_id_idx on public.gallery_photos (user_id);
create index if not exists itinerary_items_created_by_idx on public.itinerary_items (created_by);
create index if not exists journal_entries_user_id_idx on public.journal_entries (user_id);
create index if not exists lodging_created_by_idx on public.lodging (created_by);
create index if not exists messages_user_id_idx on public.messages (user_id);
create index if not exists packing_items_user_id_idx on public.packing_items (user_id);

-- ---------- profiles: consolidate the two UPDATE policies into one ----------
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_admin_update_any" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- ---------- itinerary_items / flights / lodging / messages ----------
drop policy if exists "itinerary_items_insert_own" on public.itinerary_items;
create policy "itinerary_items_insert_own" on public.itinerary_items
  for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists "itinerary_items_modify_own_or_admin" on public.itinerary_items;
create policy "itinerary_items_modify_own_or_admin" on public.itinerary_items
  for update to authenticated using (created_by = (select auth.uid()) or (select private.is_admin()));
drop policy if exists "itinerary_items_delete_own_or_admin" on public.itinerary_items;
create policy "itinerary_items_delete_own_or_admin" on public.itinerary_items
  for delete to authenticated using (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "flights_insert_own" on public.flights;
create policy "flights_insert_own" on public.flights
  for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists "flights_modify_own_or_admin" on public.flights;
create policy "flights_modify_own_or_admin" on public.flights
  for update to authenticated using (created_by = (select auth.uid()) or (select private.is_admin()));
drop policy if exists "flights_delete_own_or_admin" on public.flights;
create policy "flights_delete_own_or_admin" on public.flights
  for delete to authenticated using (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "lodging_insert_own" on public.lodging;
create policy "lodging_insert_own" on public.lodging
  for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists "lodging_modify_own_or_admin" on public.lodging;
create policy "lodging_modify_own_or_admin" on public.lodging
  for update to authenticated using (created_by = (select auth.uid()) or (select private.is_admin()));
drop policy if exists "lodging_delete_own_or_admin" on public.lodging;
create policy "lodging_delete_own_or_admin" on public.lodging
  for delete to authenticated using (created_by = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "messages_modify_own_or_admin" on public.messages;
create policy "messages_modify_own_or_admin" on public.messages
  for update to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));
drop policy if exists "messages_delete_own_or_admin" on public.messages;
create policy "messages_delete_own_or_admin" on public.messages
  for delete to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

-- ---------- expenses / expense_shares ----------
drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own" on public.expenses
  for insert to authenticated with check (paid_by = (select auth.uid()));
drop policy if exists "expenses_modify_own_or_admin" on public.expenses;
create policy "expenses_modify_own_or_admin" on public.expenses
  for update to authenticated using (paid_by = (select auth.uid()) or (select private.is_admin()));
drop policy if exists "expenses_delete_own_or_admin" on public.expenses;
create policy "expenses_delete_own_or_admin" on public.expenses
  for delete to authenticated using (paid_by = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "expense_shares_insert_by_payer_or_admin" on public.expense_shares;
create policy "expense_shares_insert_by_payer_or_admin" on public.expense_shares
  for insert to authenticated
  with check (
    (select private.is_admin())
    or exists (select 1 from public.expenses e where e.id = expense_id and e.paid_by = (select auth.uid()))
  );
drop policy if exists "expense_shares_update_own_settled_or_admin" on public.expense_shares;
create policy "expense_shares_update_own_settled_or_admin" on public.expense_shares
  for update to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

-- ---------- gallery_photos ----------
drop policy if exists "gallery_photos_insert_own" on public.gallery_photos;
create policy "gallery_photos_insert_own" on public.gallery_photos
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "gallery_photos_delete_own_or_admin" on public.gallery_photos;
create policy "gallery_photos_delete_own_or_admin" on public.gallery_photos
  for delete to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));

-- ---------- packing_items / documents ----------
drop policy if exists "packing_items_owner_only" on public.packing_items;
create policy "packing_items_owner_only" on public.packing_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "documents_owner_only" on public.documents;
create policy "documents_owner_only" on public.documents
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- journal_entries: split "for all" into per-action policies so
-- the SELECT case can merge with the "shared" visibility into one policy
-- instead of two permissive ones ----------
drop policy if exists "journal_entries_owner_all" on public.journal_entries;
drop policy if exists "journal_entries_select_shared" on public.journal_entries;

create policy "journal_entries_select" on public.journal_entries
  for select to authenticated
  using (user_id = (select auth.uid()) or shared_to_group = true);
create policy "journal_entries_insert_own" on public.journal_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "journal_entries_update_own" on public.journal_entries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "journal_entries_delete_own" on public.journal_entries
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- storage: same auth.uid()/is_admin() wrapping ----------
drop policy if exists "gallery_bucket_delete_own_or_admin" on storage.objects;
create policy "gallery_bucket_delete_own_or_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gallery' and (owner = (select auth.uid()) or (select private.is_admin())));

drop policy if exists "documents_bucket_owner_only" on storage.objects;
create policy "documents_bucket_owner_only" on storage.objects
  for all to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
