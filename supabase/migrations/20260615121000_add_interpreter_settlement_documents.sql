-- Add settlement document upload fields for interpreters.
alter table public.interpreters
add column if not exists bankbook_file_url text,
add column if not exists bankbook_file_name text,
add column if not exists business_license_file_url text,
add column if not exists business_license_file_name text;

-- Private storage bucket for interpreter settlement documents.
insert into storage.buckets (id, name, public)
values ('interpreter-documents', 'interpreter-documents', false)
on conflict (id) do nothing;

drop policy if exists "Allow authenticated interpreter document uploads" on storage.objects;
create policy "Allow authenticated interpreter document uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'interpreter-documents'
);

drop policy if exists "Allow authenticated interpreter document reads" on storage.objects;
create policy "Allow authenticated interpreter document reads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'interpreter-documents'
);

drop policy if exists "Allow authenticated interpreter document updates" on storage.objects;
create policy "Allow authenticated interpreter document updates"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'interpreter-documents'
)
with check (
  bucket_id = 'interpreter-documents'
);

drop policy if exists "Allow authenticated interpreter document deletes" on storage.objects;
create policy "Allow authenticated interpreter document deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'interpreter-documents'
);
