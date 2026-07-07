-- Ensure company material uploads have the expected private storage bucket.

insert into storage.buckets (id, name, public)
values ('reference_files', 'reference_files', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

drop policy if exists "Authenticated users can upload reference files" on storage.objects;
create policy "Authenticated users can upload reference files"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'reference_files');

drop policy if exists "Authenticated users can read reference files" on storage.objects;
create policy "Authenticated users can read reference files"
on storage.objects
for select
to authenticated
using (bucket_id = 'reference_files');

drop policy if exists "Authenticated users can update reference files" on storage.objects;
create policy "Authenticated users can update reference files"
on storage.objects
for update
to authenticated
using (bucket_id = 'reference_files')
with check (bucket_id = 'reference_files');

drop policy if exists "Authenticated users can delete reference files" on storage.objects;
create policy "Authenticated users can delete reference files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'reference_files');
