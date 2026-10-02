-- Profile photos: a private `avatars` bucket (any signed-in member reads,
-- you write only under "<your uid>/"), and a sane display-name length.
-- profiles.avatar_url (from 0001) holds the storage path, not a URL.

alter table public.profiles add constraint profiles_display_name_length
  check (char_length(btrim(display_name)) between 1 and 60);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars_bucket_read" on storage.objects
  for select to authenticated using (bucket_id = 'avatars');
create policy "avatars_bucket_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars_bucket_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
