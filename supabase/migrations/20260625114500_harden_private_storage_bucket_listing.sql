-- Keep private document buckets private and remove anonymous object listing.
--
-- Target buckets:
--   resume-files
--   reference-files
--   interpreter-documents

insert into storage.buckets (id, name, public)
values
  ('resume-files', 'resume-files', false),
  ('reference-files', 'reference-files', false),
  ('interpreter-documents', 'interpreter-documents', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

drop policy if exists "Allow authenticated resume uploads" on storage.objects;
drop policy if exists "Allow authenticated resume reads" on storage.objects;
drop policy if exists "Allow authenticated resume updates" on storage.objects;
drop policy if exists "Allow authenticated resume deletes" on storage.objects;
drop policy if exists "Allow own resume and settlement document uploads" on storage.objects;
drop policy if exists "Allow own or admin resume and settlement document reads" on storage.objects;
drop policy if exists "Allow own resume and settlement document updates" on storage.objects;
drop policy if exists "Allow own or admin resume and settlement document deletes" on storage.objects;
drop policy if exists "Secure private document uploads" on storage.objects;
drop policy if exists "Secure private document reads" on storage.objects;
drop policy if exists "Secure private document updates" on storage.objects;
drop policy if exists "Secure private document deletes" on storage.objects;

create policy "Secure private document uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('resume-files', 'reference-files', 'interpreter-documents')
  and (
    public.is_admin()
    or name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
    or name like ('reference-files/' || auth.uid()::text || '/%')
  )
);

create policy "Secure private document reads"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('resume-files', 'reference-files', 'interpreter-documents')
  and (
    public.is_admin()
    or name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
    or name like ('reference-files/' || auth.uid()::text || '/%')
  )
);

create policy "Secure private document updates"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('resume-files', 'reference-files', 'interpreter-documents')
  and (
    public.is_admin()
    or name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
    or name like ('reference-files/' || auth.uid()::text || '/%')
  )
)
with check (
  bucket_id in ('resume-files', 'reference-files', 'interpreter-documents')
  and (
    public.is_admin()
    or name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
    or name like ('reference-files/' || auth.uid()::text || '/%')
  )
);

create policy "Secure private document deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('resume-files', 'reference-files', 'interpreter-documents')
  and (
    public.is_admin()
    or name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
    or name like ('reference-files/' || auth.uid()::text || '/%')
  )
);
