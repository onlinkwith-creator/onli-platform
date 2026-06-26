insert into storage.buckets (id, name, public)
values ('request-reference-files', 'request-reference-files', false)
on conflict (id) do nothing;

drop policy if exists "Allow public request reference uploads" on storage.objects;
create policy "Allow public request reference uploads"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'request-reference-files'
  and name like 'requests/%'
);

drop policy if exists "Allow admin request reference reads" on storage.objects;
create policy "Allow admin request reference reads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'request-reference-files'
  and public.is_active_admin()
);

drop policy if exists "Allow admin request reference deletes" on storage.objects;
create policy "Allow admin request reference deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'request-reference-files'
  and public.is_active_admin()
);
