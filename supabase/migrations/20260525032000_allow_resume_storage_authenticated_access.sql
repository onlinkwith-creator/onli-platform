-- Allow signed-in users to upload, read, and update files in the private resume bucket.
insert into storage.buckets (id, name, public)
values ('resume-files', 'resume-files', false)
on conflict (id) do nothing;

drop policy if exists "Allow authenticated resume uploads" on storage.objects;
create policy "Allow authenticated resume uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'resume-files'
);

drop policy if exists "Allow authenticated resume reads" on storage.objects;
create policy "Allow authenticated resume reads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'resume-files'
);

drop policy if exists "Allow authenticated resume updates" on storage.objects;
create policy "Allow authenticated resume updates"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'resume-files'
)
with check (
  bucket_id = 'resume-files'
);
