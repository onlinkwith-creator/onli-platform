-- Harden public schema RLS policies for production use.
-- This migration intentionally replaces older TEMP anon admin policies.

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(trim(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users current_admin
    where current_admin.status = 'active'
      and current_admin.role in ('owner', 'admin', 'staff')
      and current_admin.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_active_admin();
$$;

create or replace function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users current_admin
    where current_admin.status = 'active'
      and current_admin.role = 'owner'
      and current_admin.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_admin_manager()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_owner();
$$;

update public.admin_users admin_user
set auth_user_id = auth_user.id,
    updated_at = now()
from auth.users auth_user
where admin_user.auth_user_id is null
  and lower(trim(admin_user.email)) = lower(trim(auth_user.email));

do $$
begin
  if exists (
    select 1
    from public.admin_users
    where status = 'active'
      and role = 'owner'
      and auth_user_id is null
  ) then
    raise notice 'Some active owner admin_users rows have no auth_user_id. They will show as 권한 미연동 and cannot pass DB admin RLS until linked.';
  end if;
end;
$$;

create or replace function public.can_read_admin_users()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_admin();
$$;

create or replace function public.can_write_admin_users()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_owner();
$$;

do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      table_record.schemaname,
      table_record.tablename
    );

    execute format(
      'drop policy if exists "Active admins can manage all rows" on %I.%I',
      table_record.schemaname,
      table_record.tablename
    );

    execute format(
      'create policy "Active admins can manage all rows" on %I.%I for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin())',
      table_record.schemaname,
      table_record.tablename
    );
  end loop;
end;
$$;

drop policy if exists "Active admins can manage all rows" on public.admin_users;
drop policy if exists admin_users_select on public.admin_users;
drop policy if exists admin_users_insert on public.admin_users;
drop policy if exists admin_users_update on public.admin_users;
drop policy if exists admin_users_delete on public.admin_users;
drop policy if exists "Active admins can read admin users" on public.admin_users;
drop policy if exists "Active admins can insert admin users" on public.admin_users;
drop policy if exists "Active admins can update admin users" on public.admin_users;

create policy admin_users_select
on public.admin_users
for select
to authenticated
using (public.is_admin());

create policy admin_users_insert
on public.admin_users
for insert
to authenticated
with check (public.is_owner());

create policy admin_users_update
on public.admin_users
for update
to authenticated
using (public.is_owner())
with check (public.is_owner());

create policy admin_users_delete
on public.admin_users
for delete
to authenticated
using (public.is_owner());

-- Remove legacy broad temporary policies.
drop policy if exists "TEMP public read jobs" on public.jobs;
drop policy if exists "TEMP public insert jobs" on public.jobs;
drop policy if exists "TEMP public update jobs" on public.jobs;
drop policy if exists "TEMP public delete jobs" on public.jobs;
drop policy if exists "TEMP authenticated read jobs" on public.jobs;
drop policy if exists "Allow public read public jobs" on public.jobs;

drop policy if exists "TEMP public read applications" on public.applications;
drop policy if exists "TEMP public insert applications" on public.applications;
drop policy if exists "TEMP public update applications" on public.applications;
drop policy if exists "TEMP public delete applications" on public.applications;
drop policy if exists "TEMP authenticated admin read applications" on public.applications;
drop policy if exists "TEMP authenticated admin insert applications" on public.applications;
drop policy if exists "TEMP authenticated admin update applications" on public.applications;
drop policy if exists "TEMP authenticated admin delete applications" on public.applications;

drop policy if exists "TEMP public insert job applications" on public.job_applications;
drop policy if exists "TEMP admin read job applications" on public.job_applications;
drop policy if exists "TEMP admin update job applications" on public.job_applications;
drop policy if exists "TEMP admin delete job applications" on public.job_applications;
drop policy if exists "TEMP authenticated read job applications" on public.job_applications;
drop policy if exists "TEMP authenticated admin update job applications" on public.job_applications;
drop policy if exists "TEMP authenticated admin delete job applications" on public.job_applications;

drop policy if exists "TEMP admin read requests" on public.requests;
drop policy if exists "TEMP admin update requests" on public.requests;
drop policy if exists "TEMP admin delete requests" on public.requests;
drop policy if exists "TEMP authenticated admin read requests" on public.requests;
drop policy if exists "TEMP authenticated admin update requests" on public.requests;
drop policy if exists "TEMP authenticated admin delete requests" on public.requests;

drop policy if exists "TEMP admin read interpreters" on public.interpreters;
drop policy if exists "TEMP authenticated read interpreters" on public.interpreters;
drop policy if exists "TEMP admin update interpreter approval" on public.interpreters;
drop policy if exists "TEMP authenticated admin update interpreter approval" on public.interpreters;
drop policy if exists "TEMP authenticated admin delete interpreters" on public.interpreters;
drop policy if exists "Allow public interpreter registration" on public.interpreters;
drop policy if exists "Allow authenticated interpreter profile read" on public.interpreters;

drop policy if exists "TEMP public insert applications" on public.request_applications;
drop policy if exists "TEMP admin read applications" on public.request_applications;
drop policy if exists "TEMP admin update applications" on public.request_applications;
drop policy if exists "TEMP admin delete request applications" on public.request_applications;
drop policy if exists "TEMP authenticated admin read request_applications" on public.request_applications;
drop policy if exists "TEMP authenticated admin update request_applications" on public.request_applications;
drop policy if exists "TEMP authenticated admin delete request_applications" on public.request_applications;

drop policy if exists "TEMP admin read request interpreters" on public.request_interpreters;
drop policy if exists "TEMP admin insert request interpreters" on public.request_interpreters;
drop policy if exists "TEMP admin delete request interpreters" on public.request_interpreters;
drop policy if exists "TEMP authenticated read request interpreters" on public.request_interpreters;
drop policy if exists "TEMP authenticated admin insert request interpreters" on public.request_interpreters;
drop policy if exists "TEMP authenticated admin delete request interpreters" on public.request_interpreters;

drop policy if exists "TEMP admin read matchings" on public.matchings;
drop policy if exists "TEMP admin insert matchings" on public.matchings;
drop policy if exists "TEMP admin update matchings" on public.matchings;
drop policy if exists "TEMP authenticated admin read matchings" on public.matchings;
drop policy if exists "TEMP authenticated admin insert matchings" on public.matchings;
drop policy if exists "TEMP authenticated admin update matchings" on public.matchings;

drop policy if exists "TEMP admin insert admin logs" on public.admin_logs;
drop policy if exists "TEMP authenticated admin insert admin logs" on public.admin_logs;

-- Public job listing. Writes are handled by the shared admin policy above.
create policy "Anyone can read public jobs"
on public.jobs
for select
to anon, authenticated
using (
  coalesce(visibility, 'public') = 'public'
  and coalesce(status, '') not in ('cancelled', '취소', '숨김', 'hidden')
);

-- Public interpreter listing.
drop policy if exists "Anyone can read public interpreters" on public.interpreters;
revoke select on public.interpreters from anon;

alter table public.interpreters
add column if not exists experience_count integer not null default 0;

drop view if exists public.public_interpreters;
create view public.public_interpreters as
select
  id,
  name,
  region,
  level,
  short_intro,
  specialties,
  available_regions,
  experience_count,
  is_public,
  status
from public.interpreters
where coalesce(is_public, false) = true
  and withdrawn_at is null
  and lower(trim(coalesce(status, ''))) in ('active', 'warning', 'approved', '승인', '승인완료', '활동중');

grant select on public.public_interpreters to anon, authenticated;

drop policy if exists "Users can read own interpreter profile" on public.interpreters;
create policy "Users can read own interpreter profile"
on public.interpreters
for select
to authenticated
using (
  auth.uid() is not null
  and auth_user_id = auth.uid()
);

drop policy if exists "Allow authenticated interpreter registration" on public.interpreters;
create policy "Allow authenticated interpreter registration"
on public.interpreters
for insert
to authenticated
with check (
  auth.uid() is not null
  and auth_user_id = auth.uid()
);

drop policy if exists "Allow authenticated interpreter profile link" on public.interpreters;
drop policy if exists "Users can update own interpreter profile" on public.interpreters;
create policy "Users can update own interpreter profile"
on public.interpreters
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

create or replace function public.prevent_interpreter_self_admin_field_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.level is distinct from old.level
    or new.approved is distinct from old.approved
    or new.warning_count is distinct from old.warning_count
    or new.admin_memo is distinct from old.admin_memo
    or new.badge_review_status is distinct from old.badge_review_status
    or new.resume_verified_email_sent_at is distinct from old.resume_verified_email_sent_at
  then
    raise exception 'Only admins can update interpreter admin fields.';
  end if;

  if new.status is distinct from old.status
    and coalesce(new.status, '') <> 'withdrawn'
  then
    raise exception 'Only admins can update interpreter status.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_interpreter_self_admin_field_changes on public.interpreters;
create trigger prevent_interpreter_self_admin_field_changes
before update on public.interpreters
for each row
execute function public.prevent_interpreter_self_admin_field_changes();

drop policy if exists "Interpreters can withdraw own profile" on public.interpreters;
create policy "Interpreters can withdraw own profile"
on public.interpreters
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

-- Company request submission is public; reads/writes after submission are owner-or-admin.
drop policy if exists "Allow public request submissions" on public.requests;
drop policy if exists "Users can read own requests" on public.requests;
drop policy if exists "Users can update own requests" on public.requests;
revoke select, update, delete on public.requests from anon;
-- TODO(company accounts): allow select using company_auth_user_id = auth.uid() after company accounts launch.
create policy "Allow public request submissions"
on public.requests
for insert
to anon, authenticated
with check (
  coalesce(status, 'draft') in ('draft', 'pending', 'requested')
  and coalesce(matching_status, 'draft') in ('draft', 'pending', 'requested')
  and coalesce(assignment_status, 'waiting') in ('waiting', 'assigning')
  and coalesce(operation_status, 'before_operation') = 'before_operation'
  and coalesce(settlement_status, 'not_required') = 'not_required'
  and assigned_interpreter_id is null
  and assigned_interpreter_name is null
  and matched_interpreter_id is null
  and matched_interpreter_name is null
  and coalesce(admin_checked, false) = false
  and coalesce(is_public, false) = false
  and coalesce(is_job_public, false) = false
);

-- Job applications: applicant/interpreter and admin only.
revoke select, update, delete on public.job_applications from anon;
drop policy if exists "Interpreters can insert own job applications" on public.job_applications;
drop policy if exists "Approved interpreters can insert applications" on public.job_applications;
create policy "Interpreters can insert own job applications"
on public.job_applications
for insert
to authenticated
with check (
  auth.uid() is not null
  and job_id is not null
  and interpreter_id is not null
  and exists (
    select 1
    from public.interpreters i
    where i.id = job_applications.interpreter_id
      and (
        i.auth_user_id = auth.uid()
      )
      and lower(trim(coalesce(i.status, ''))) in (
        'active',
        'approved',
        '승인',
        '승인 완료',
        '승인완료',
        '활동중'
      )
  )
);

drop policy if exists "Users can read own job applications" on public.job_applications;
create policy "Users can read own job applications"
on public.job_applications
for select
to authenticated
using (
  exists (
    select 1
    from public.interpreters i
    where i.id = job_applications.interpreter_id
      and (
        i.auth_user_id = auth.uid()
      )
  )
);

drop policy if exists "Interpreters can withdraw own job applications" on public.job_applications;
create policy "Interpreters can withdraw own job applications"
on public.job_applications
for delete
to authenticated
using (
  status in ('pending', '지원완료')
  and exists (
    select 1
    from public.interpreters i
    where i.id = job_applications.interpreter_id
      and (
        i.auth_user_id = auth.uid()
      )
  )
);

-- Legacy applications table.
create policy "Anyone can submit legacy applications"
on public.applications
for insert
to anon, authenticated
with check (true);

create policy "Users can read own legacy applications"
on public.applications
for select
to authenticated
using (lower(trim(coalesce(email, ''))) = public.current_user_email());

-- Request applications: interpreter/applicant and admin only.
create policy "Interpreters can submit request applications"
on public.request_applications
for insert
to authenticated
with check (
  auth.uid() is not null
  and (
    interpreter_id is null
    or exists (
      select 1
      from public.interpreters i
      where i.id = request_applications.interpreter_id
      and (
          i.auth_user_id = auth.uid()
        )
    )
  )
);

create policy "Users can read own request applications"
on public.request_applications
for select
to authenticated
using (
  lower(trim(coalesce(applicant_contact, ''))) = public.current_user_email()
  or exists (
    select 1
    from public.interpreters i
    where i.id = request_applications.interpreter_id
      and (
        i.auth_user_id = auth.uid()
      )
  )
);

-- Assignments and matchings are admin-managed; interpreters can read their own rows.
revoke all on public.request_interpreters from anon;
create policy "Interpreters can read own request assignments"
on public.request_interpreters
for select
to authenticated
using (
  exists (
    select 1
    from public.interpreters i
    where i.id = request_interpreters.interpreter_id
      and (
        i.auth_user_id = auth.uid()
      )
  )
);

create policy "Interpreters can read own matchings"
on public.matchings
for select
to authenticated
using (
  exists (
    select 1
    from public.interpreters i
    where i.id = matchings.interpreter_id
      and (
        i.auth_user_id = auth.uid()
      )
  )
);

-- Admin log and mail tables remain admin-only via the shared admin policy.

-- Optional public tables from older Supabase templates.
do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'drop policy if exists "Users can read own profiles" on public.profiles';
    execute 'create policy "Users can read own profiles" on public.profiles for select to authenticated using (id = auth.uid())';
    execute 'drop policy if exists "Users can update own profiles" on public.profiles';
    execute 'create policy "Users can update own profiles" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid())';
  end if;

  if to_regclass('public.users') is not null then
    execute 'drop policy if exists "Users can read own users row" on public.users';
    execute 'create policy "Users can read own users row" on public.users for select to authenticated using (id = auth.uid())';
    execute 'drop policy if exists "Users can update own users row" on public.users';
    execute 'create policy "Users can update own users row" on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid())';
  end if;
end;
$$;

-- Storage policies for request files and interpreter documents.
insert into storage.buckets (id, name, public)
values
  ('resume-files', 'resume-files', false),
  ('interpreter-documents', 'interpreter-documents', false),
  ('request-files', 'request-files', false),
  ('request-reference-files', 'request-reference-files', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

drop policy if exists "Allow request file uploads" on storage.objects;
drop policy if exists "Allow admin request file reads" on storage.objects;
drop policy if exists "Allow admin request file deletes" on storage.objects;
drop policy if exists "Allow authenticated resume uploads" on storage.objects;
drop policy if exists "Allow authenticated resume reads" on storage.objects;
drop policy if exists "Allow authenticated resume updates" on storage.objects;
drop policy if exists "Allow authenticated resume deletes" on storage.objects;
drop policy if exists "Allow own or admin resume and settlement document uploads" on storage.objects;
drop policy if exists "Allow own or admin resume and settlement document reads" on storage.objects;
drop policy if exists "Allow own or admin resume and settlement document updates" on storage.objects;
drop policy if exists "Allow own or admin resume and settlement document deletes" on storage.objects;
drop policy if exists "Allow request reference uploads" on storage.objects;
drop policy if exists "Allow admin request reference reads" on storage.objects;
drop policy if exists "Allow admin request reference deletes" on storage.objects;
drop policy if exists "Secure interpreter document uploads" on storage.objects;
drop policy if exists "Secure interpreter document reads" on storage.objects;
drop policy if exists "Secure interpreter document updates" on storage.objects;
drop policy if exists "Secure interpreter document deletes" on storage.objects;
drop policy if exists "Secure request reference uploads" on storage.objects;
drop policy if exists "Secure request reference reads" on storage.objects;
drop policy if exists "Secure request reference deletes" on storage.objects;

create policy "Secure interpreter document uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('resume-files', 'interpreter-documents')
  and (
    public.is_admin()
    or name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
  )
);

create policy "Secure interpreter document reads"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('resume-files', 'interpreter-documents')
  and (
    public.is_admin()
    or name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
  )
);

create policy "Secure interpreter document updates"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('resume-files', 'interpreter-documents')
  and (
    public.is_admin()
    or name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
  )
)
with check (
  bucket_id in ('resume-files', 'interpreter-documents')
  and (
    public.is_admin()
    or name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
  )
);

create policy "Secure interpreter document deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('resume-files', 'interpreter-documents')
  and (
    public.is_admin()
    or name like (auth.uid()::text || '/%')
    or name like ('interpreter-documents/' || auth.uid()::text || '/%')
  )
);

create policy "Secure request reference uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('request-files', 'request-reference-files')
  and (
    public.is_admin()
    or name like (auth.uid()::text || '/%')
  )
);

create policy "Secure request reference reads"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('request-files', 'request-reference-files')
  and public.is_admin()
);

create policy "Secure request reference deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('request-files', 'request-reference-files')
  and public.is_admin()
);
