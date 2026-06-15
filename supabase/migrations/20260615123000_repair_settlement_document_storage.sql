-- Store settlement documents in the existing private resume-files bucket.
alter table public.interpreters
add column if not exists bankbook_file_url text,
add column if not exists bankbook_file_name text,
add column if not exists business_license_file_url text,
add column if not exists business_license_file_name text;

insert into storage.buckets (id, name, public)
values ('resume-files', 'resume-files', false)
on conflict (id) do nothing;

-- Replace the earlier broad resume-files storage policies with owner/admin-scoped access.
drop policy if exists "Allow authenticated resume uploads" on storage.objects;
drop policy if exists "Allow authenticated resume reads" on storage.objects;
drop policy if exists "Allow authenticated resume updates" on storage.objects;
drop policy if exists "Allow authenticated resume deletes" on storage.objects;

drop policy if exists "Allow own resume and settlement document uploads" on storage.objects;
create policy "Allow own resume and settlement document uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'resume-files'
  and (
    name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
  )
);

drop policy if exists "Allow own or admin resume and settlement document reads" on storage.objects;
create policy "Allow own or admin resume and settlement document reads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'resume-files'
  and (
    name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
    or public.is_active_admin()
  )
);

drop policy if exists "Allow own resume and settlement document updates" on storage.objects;
create policy "Allow own resume and settlement document updates"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'resume-files'
  and (
    name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
  )
)
with check (
  bucket_id = 'resume-files'
  and (
    name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
  )
);

drop policy if exists "Allow own or admin resume and settlement document deletes" on storage.objects;
create policy "Allow own or admin resume and settlement document deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'resume-files'
  and (
    name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
    or public.is_active_admin()
  )
);
