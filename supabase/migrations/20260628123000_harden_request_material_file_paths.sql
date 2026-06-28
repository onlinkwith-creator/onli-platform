-- Store request material files with safe storage keys while preserving original display names.

alter table public.request_materials
add column if not exists original_file_name text,
add column if not exists mime_type text,
add column if not exists company_id bigint references public.businesses(id) on delete set null;

update public.request_materials rm
set original_file_name = coalesce(rm.original_file_name, rm.file_name)
where rm.original_file_name is null;

update public.request_materials rm
set company_id = b.id
from public.requests r
join public.businesses b on b.auth_user_id = r.company_auth_user_id
where rm.request_id = r.id
  and rm.company_id is null;

create index if not exists request_materials_company_idx
on public.request_materials(company_id, created_at desc);

create index if not exists request_materials_request_idx
on public.request_materials(request_id, created_at desc);

alter table public.request_materials enable row level security;

drop policy if exists "Companies can insert own request materials" on public.request_materials;
create policy "Companies can insert own request materials"
on public.request_materials
for insert
to authenticated
with check (
  exists (
    select 1
    from public.requests r
    where r.id = request_materials.request_id
      and r.company_auth_user_id = auth.uid()
  )
  and (
    request_materials.company_id is null
    or exists (
      select 1
      from public.businesses b
      where b.id = request_materials.company_id
        and b.auth_user_id = auth.uid()
    )
  )
);

drop policy if exists "Allow request materials storage uploads" on storage.objects;
create policy "Allow request materials storage uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'request-files'
  and name like 'requests/reference_files/materials/%'
  and name ~ '^requests/reference_files/materials/[0-9]+/[A-Za-z0-9-]+[.](pdf|jpg|jpeg|png)$'
  and exists (
    select 1
    from public.requests r
    where r.company_auth_user_id = auth.uid()
      and name like ('requests/reference_files/materials/' || r.id::text || '/%')
  )
);

notify pgrst, 'reload schema';
