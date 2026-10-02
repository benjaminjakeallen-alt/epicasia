-- My documents (inside Arrivals): each traveler's private copies of their
-- passport, visa, insurance, Visit Japan Web QR codes, bookings…
-- The `documents` table and private `documents` bucket exist since 0001
-- (owner-only RLS on both, files under "<uid>/"); this adds what the app
-- shows and limits what can be uploaded.

alter table public.documents
  add column kind text not null default 'other',
  add column mime text not null default 'application/octet-stream',
  add column size_bytes bigint,
  add column thumb_path text,
  add column file_name text;

alter table public.documents
  add constraint documents_kind_check
    check (kind in ('passport', 'visa', 'insurance', 'vjw', 'china-arrival', 'booking', 'other')),
  add constraint documents_label_length check (char_length(btrim(label)) between 1 and 80),
  add constraint documents_file_name_length check (file_name is null or char_length(file_name) <= 200),
  add constraint documents_path_own_folder
    check (split_part(storage_path, '/', 1) = user_id::text);

-- Photos and PDFs only, up to 20 MB.
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
where id = 'documents';
