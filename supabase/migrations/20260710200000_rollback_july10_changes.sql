-- ============================================================
-- ROLLBACK: Revert all 2026-07-10 Supabase changes
-- ============================================================
-- Reverses:
--   20260710120000_harden_request_company_contact_link.sql
--   20260710123000_fix_job_application_flow.sql
--
-- Preserves all existing data. Only schema/policy/function changes.
-- ============================================================

-- ============================================================
-- 1. DROP new objects added on 2026-07-10
-- ============================================================

-- 1a. Drop the new RPC function (did not exist before today)
drop function if exists public.get_assigned_request_company_contact(bigint);

-- 1b. Drop the new trigger + function (did not exist before today)
drop trigger if exists sync_request_contact_revealed_to_assignments on public.requests;
drop function if exists public.sync_request_contact_revealed_to_assignments();

-- 1c. Drop new columns on job_applications (added today)
alter table public.job_applications
drop column if exists applicant_email,
drop column if exists applicant_phone;

-- 1d. Drop new unique index on job_applications (added today)
drop index if exists public.job_applications_job_interpreter_active_uidx;

-- ============================================================
-- 2. Restore job_applications status constraint
-- ============================================================
-- Today's migration added '지원완료' to the check list.
-- Original (20260518110000): ('pending', 'reviewing', 'accepted', 'rejected', 'cancelled')

alter table public.job_applications
drop constraint if exists job_applications_status_check;

alter table public.job_applications
add constraint job_applications_status_check
check (status in ('pending', 'reviewing', 'accepted', 'rejected', 'cancelled'));

-- ============================================================
-- 3. Restore job_applications RLS policies
-- ============================================================

-- 3a. Drop all policies today created or modified
drop policy if exists "Interpreters can insert own job applications" on public.job_applications;
drop policy if exists "Users can read own job applications" on public.job_applications;
drop policy if exists "Interpreters can withdraw own job applications" on public.job_applications;
drop policy if exists "Admins can update job applications" on public.job_applications;
drop policy if exists "Admins can delete job applications" on public.job_applications;
drop policy if exists "Active admins can delete job applications" on public.job_applications;

-- 3b. Restore INSERT policy (from 20260622133000_enforce_public_views_and_private_rls.sql)
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
    from public.interpreters
    where interpreters.id = job_applications.interpreter_id
      and interpreters.auth_user_id = auth.uid()
      and lower(trim(coalesce(interpreters.status, ''))) in (
        'active',
        'approved',
        'verified',
        '승인',
        '승인 완료',
        '승인완료',
        '활동중'
      )
  )
);

-- 3c. Restore SELECT policy (from 20260622133000_enforce_public_views_and_private_rls.sql)
create policy "Users can read own job applications"
on public.job_applications
for select
to authenticated
using (
  exists (
    select 1
    from public.interpreters
    where interpreters.id = job_applications.interpreter_id
      and interpreters.auth_user_id = auth.uid()
  )
);

-- 3d. Restore DELETE policies (from 20260612050000_allow_interpreter_withdraw_own_job_application.sql)
create policy "Active admins can delete job applications"
on public.job_applications
for delete
to authenticated
using (
  public.is_active_admin()
);

create policy "Interpreters can withdraw own job applications"
on public.job_applications
for delete
to authenticated
using (
  auth.uid() is not null
  and status in ('pending', 'reviewing', '지원완료', '검토중', '보류')
  and exists (
    select 1
    from public.interpreters i
    where i.id = job_applications.interpreter_id
      and i.auth_user_id = auth.uid()
  )
);

-- ============================================================
-- 4. Restore prevent_non_admin_job_application_review_fields trigger
-- ============================================================
-- This trigger was removed by today's migration.
-- Restore from 20260622133000_enforce_public_views_and_private_rls.sql

create or replace function public.prevent_non_admin_job_application_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT'
    and lower(trim(coalesce(new.status, 'pending'))) not in ('pending', '지원완료')
  then
    raise exception 'Only admins can set job application review fields.';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Only admins can update job applications.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_non_admin_job_application_review_fields on public.job_applications;
create trigger prevent_non_admin_job_application_review_fields
before insert or update on public.job_applications
for each row
execute function public.prevent_non_admin_job_application_review_fields();

-- ============================================================
-- 5. Restore public_jobs view
-- ============================================================
-- Today's migration added application_count / applicant_count columns.
-- Restore from 20260624100000_lock_down_jobs_raw_anon_select.sql

drop view if exists public.public_jobs;

create view public.public_jobs
with (security_invoker = false) as
select
  id,
  title,
  event_name,
  null::text as event_type,
  date as work_date,
  date,
  start_date,
  end_date,
  nullif(regexp_replace(coalesce(event_location, location, ''), '[[:space:]].*$', ''), '') as location,
  nullif(regexp_replace(coalesce(event_location, location, ''), '[[:space:]].*$', ''), '') as event_location,
  nullif(regexp_replace(coalesce(event_location, location, ''), '[[:space:]].*$', ''), '') as region,
  language as language_pair,
  language,
  field,
  requested_level as level_required,
  requested_level,
  level,
  people_count as number_of_interpreters,
  people_count,
  people,
  null::text as public_description,
  null::text as preference,
  status as public_status,
  status,
  event_date,
  deadline,
  created_at
from public.jobs
where coalesce(visibility, 'public') = 'public'
  and lower(trim(coalesce(status, ''))) not in (
    'cancelled',
    'canceled',
    '취소',
    'hidden',
    '숨김'
  );

revoke all on public.public_jobs from public;
grant select on public.public_jobs to anon;
grant select on public.public_jobs to authenticated;

-- ============================================================
-- 6. Restore set_request_company_id_from_business function
-- ============================================================
-- Today's migration changed the lookup to use min() + HAVING count(*)=1.
-- Restore from 20260708120000_fix_interpreter_assignment_company_contact_path.sql

create or replace function public.set_request_company_id_from_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null and new.company_auth_user_id is not null then
    select b.id
    into new.company_id
    from public.businesses b
    where b.auth_user_id = new.company_auth_user_id
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists set_request_company_id_from_business on public.requests;
create trigger set_request_company_id_from_business
before insert or update of company_auth_user_id, company_id on public.requests
for each row
execute function public.set_request_company_id_from_business();

-- ============================================================
-- 7. Restore businesses RLS policy
-- ============================================================
-- Today's migration added contact_revealed / is_contact_visible conditions.
-- Restore from 20260708133000_direct_interpreter_work_prep_access.sql

drop policy if exists "assigned_interpreters_can_read_company_contact" on public.businesses;
create policy "assigned_interpreters_can_read_company_contact"
on public.businesses
for select
to authenticated
using (
  exists (
    select 1
    from public.requests r
    join public.request_interpreters ri on ri.request_id = r.id
    join public.interpreters i on i.id = ri.interpreter_id
    where r.company_id = businesses.id
      and i.auth_user_id = auth.uid()
  )
);

-- ============================================================
-- 8. Reload PostgREST schema cache
-- ============================================================

notify pgrst, 'reload schema';
