-- DDL for adding request materials and contact visibility options.

-- 1. Create request_materials table
create table if not exists public.request_materials (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.requests(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size bigint,
  file_type text, -- '제품 소개서', '상담 자료', '발표 자료', '행사 안내문'
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Enable RLS on request_materials
alter table public.request_materials enable row level security;

-- Drop existing policies if any
drop policy if exists "Admins can manage all materials" on public.request_materials;
drop policy if exists "Companies can read own request materials" on public.request_materials;
drop policy if exists "Companies can insert own request materials" on public.request_materials;
drop policy if exists "Companies can delete own request materials" on public.request_materials;
drop policy if exists "Interpreters can read assigned request materials" on public.request_materials;

-- Policies for request_materials:
-- 1. Active admins can manage all rows
create policy "Admins can manage all materials"
on public.request_materials
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

-- 2. Companies can select/insert/delete own request materials
create policy "Companies can read own request materials"
on public.request_materials
for select
to authenticated
using (
  exists (
    select 1
    from public.requests r
    where r.id = request_materials.request_id
      and r.company_auth_user_id = auth.uid()
  )
);

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
);

create policy "Companies can delete own request materials"
on public.request_materials
for delete
to authenticated
using (
  exists (
    select 1
    from public.requests r
    where r.id = request_materials.request_id
      and r.company_auth_user_id = auth.uid()
  )
);

-- 3. Assigned interpreters can select request materials
create policy "Interpreters can read assigned request materials"
on public.request_materials
for select
to authenticated
using (
  exists (
    select 1
    from public.request_interpreters ri
    join public.interpreters i on i.id = ri.interpreter_id
    where ri.request_id = request_materials.request_id
      and i.auth_user_id = auth.uid()
  )
);

-- Add column is_contact_visible to request_interpreters
alter table public.request_interpreters
add column if not exists is_contact_visible boolean not null default false;

-- Add RLS policy for companies to select request_interpreters for their own requests
drop policy if exists "Companies can read own request assignments" on public.request_interpreters;
create policy "Companies can read own request assignments"
on public.request_interpreters
for select
to authenticated
using (
  exists (
    select 1
    from public.requests r
    where r.id = request_interpreters.request_id
      and r.company_auth_user_id = auth.uid()
  )
);

-- Add storage policies for materials files in request-files bucket:
drop policy if exists "Allow request materials storage reads" on storage.objects;
create policy "Allow request materials storage reads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'request-files'
  and exists (
    select 1
    from public.request_materials rm
    join public.requests r on r.id = rm.request_id
    where rm.file_path = storage.objects.name
      and (
        r.company_auth_user_id = auth.uid()
        or public.is_active_admin()
        or exists (
          select 1
          from public.request_interpreters ri
          join public.interpreters i on i.id = ri.interpreter_id
          where ri.request_id = rm.request_id
            and i.auth_user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "Allow request materials storage deletes" on storage.objects;
create policy "Allow request materials storage deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'request-files'
  and exists (
    select 1
    from public.request_materials rm
    join public.requests r on r.id = rm.request_id
    where rm.file_path = storage.objects.name
      and (
        r.company_auth_user_id = auth.uid()
        or public.is_active_admin()
      )
  )
);
