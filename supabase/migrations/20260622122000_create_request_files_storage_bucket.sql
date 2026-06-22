insert into storage.buckets (id, name, public)
values ('request-files', 'request-files', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

drop policy if exists "Allow request file uploads" on storage.objects;
create policy "Allow request file uploads"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'request-files'
  and name like 'requests/%'
);

drop policy if exists "Allow admin request file reads" on storage.objects;
create policy "Allow admin request file reads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'request-files'
  and public.is_active_admin()
);

drop policy if exists "Allow admin request file deletes" on storage.objects;
create policy "Allow admin request file deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'request-files'
  and public.is_active_admin()
);
