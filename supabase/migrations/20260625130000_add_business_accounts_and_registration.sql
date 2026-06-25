-- Supabase Migration: Add business accounts and registration structure

-- 1. Create businesses table
create table if not exists public.businesses (
  id bigint generated always as identity primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  company_name text not null,
  business_number text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  country text not null,
  primary_fields text[] not null default '{}',
  tax_invoice_required boolean not null default false,
  notes text,
  status text not null default '검토중' check (status in ('검토중', '승인 완료', '이용 제한')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Enable Row Level Security (RLS) on public.businesses
alter table public.businesses enable row level security;

-- 3. RLS policies for businesses
drop policy if exists "Admins can manage all businesses" on public.businesses;
create policy "Admins can manage all businesses"
on public.businesses
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Allow authenticated business registration" on public.businesses;
create policy "Allow authenticated business registration"
on public.businesses
for insert
to authenticated
with check (
  auth.uid() is not null
  and auth_user_id = auth.uid()
);

drop policy if exists "Allow users to read own business profile" on public.businesses;
create policy "Allow users to read own business profile"
on public.businesses
for select
to authenticated
using (
  auth.uid() is not null
  and auth_user_id = auth.uid()
);

drop policy if exists "Allow users to update own business profile" on public.businesses;
create policy "Allow users to update own business profile"
on public.businesses
for update
to authenticated
using (
  auth.uid() is not null
  and auth_user_id = auth.uid()
)
with check (
  auth.uid() is not null
  and auth_user_id = auth.uid()
);

-- 4. Trigger preventing self modification of administrative fields (status/notes)
create or replace function public.prevent_business_self_admin_field_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.status is distinct from old.status
    and coalesce(new.status, '') <> '검토중'
  then
    raise exception 'Only admins can update business status.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_business_self_admin_field_changes on public.businesses;
create trigger prevent_business_self_admin_field_changes
before update on public.businesses
for each row
execute function public.prevent_business_self_admin_field_changes();

-- 5. Alter requests table to add company_auth_user_id link
alter table public.requests
add column if not exists company_auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists requests_company_auth_user_id_idx
on public.requests(company_auth_user_id);

-- 6. RLS policies on requests for business clients
drop policy if exists "Companies can read own requests" on public.requests;
create policy "Companies can read own requests"
on public.requests
for select
to authenticated
using (
  company_auth_user_id = auth.uid()
);

drop policy if exists "Companies can update own requests" on public.requests;
create policy "Companies can update own requests"
on public.requests
for update
to authenticated
using (
  company_auth_user_id = auth.uid()
)
with check (
  company_auth_user_id = auth.uid()
);

-- 7. Update storage policies to allow companies to read, update, and upload request reference files
drop policy if exists "Secure request reference reads" on storage.objects;
create policy "Secure request reference reads"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('request-files', 'request-reference-files')
  and (
    public.is_admin()
    or exists (
      select 1
      from public.requests r
      where r.company_auth_user_id = auth.uid()
        and (
          r.reference_file_path = storage.objects.name
          or r.reference_file_url = storage.objects.name
        )
    )
    or exists (
      select 1
      from public.requests r
      join public.interpreters i
        on i.auth_user_id = auth.uid()
      where
        (
          r.reference_file_path = storage.objects.name
          or r.reference_file_url = storage.objects.name
        )
        and (
          r.assigned_interpreter_id = i.id
          or r.matched_interpreter_id = i.id
          or exists (
            select 1
            from public.matchings m
            where m.request_id = r.id
              and m.interpreter_id = i.id
          )
          or exists (
            select 1
            from public.request_interpreters ri
            where ri.request_id = r.id
              and ri.interpreter_id = i.id
          )
        )
    )
  )
);

drop policy if exists "Secure request reference updates" on storage.objects;
create policy "Secure request reference updates"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('request-files', 'request-reference-files')
  and (
    public.is_admin()
    or exists (
      select 1
      from public.requests r
      where r.company_auth_user_id = auth.uid()
        and (
          r.reference_file_path = storage.objects.name
          or r.reference_file_url = storage.objects.name
        )
    )
  )
)
with check (
  bucket_id in ('request-files', 'request-reference-files')
  and (
    public.is_admin()
    or exists (
      select 1
      from public.requests r
      where r.company_auth_user_id = auth.uid()
        and (
          r.reference_file_path = storage.objects.name
          or r.reference_file_url = storage.objects.name
        )
    )
  )
);

drop policy if exists "Secure request reference uploads" on storage.objects;
create policy "Secure request reference uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('request-files', 'request-reference-files')
  and (
    public.is_admin()
    or name like (auth.uid()::text || '/%')
    or name like 'requests/reference_files/%'
  )
);
