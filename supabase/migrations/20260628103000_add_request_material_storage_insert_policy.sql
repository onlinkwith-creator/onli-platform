-- Allow companies to upload material files for their own requests.

drop policy if exists "Allow request materials storage uploads" on storage.objects;
create policy "Allow request materials storage uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'request-files'
  and name like 'requests/reference_files/materials/%'
  and exists (
    select 1
    from public.requests r
    where r.company_auth_user_id = auth.uid()
      and name like ('requests/reference_files/materials/' || r.id::text || '/%')
  )
);
