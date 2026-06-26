-- Enforce public read separation: anonymous clients read curated views only.

alter table public.requests enable row level security;
alter table public.request_interpreters enable row level security;
alter table public.job_applications enable row level security;
alter table public.interpreters enable row level security;
alter table public.jobs enable row level security;

drop policy if exists "Anyone can read public jobs" on public.jobs;
drop policy if exists "Allow public read public jobs" on public.jobs;
drop policy if exists "TEMP public read jobs" on public.jobs;
drop policy if exists "TEMP authenticated read jobs" on public.jobs;
revoke select on public.jobs from anon;

drop policy if exists "Allow public request submissions" on public.requests;
drop policy if exists "Users can read own requests" on public.requests;
drop policy if exists "Users can update own requests" on public.requests;
drop policy if exists "TEMP admin read requests" on public.requests;
drop policy if exists "TEMP authenticated admin read requests" on public.requests;
revoke select, update, delete on public.requests from anon;

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

create or replace function public.prevent_non_admin_request_operation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if new.payment_status is distinct from 'unpaid'
    or new.contact_status is distinct from 'not_contacted'
    or coalesce(new.client_price, 0) <> 0
    or coalesce(new.interpreter_price, 0) <> 0
    or coalesce(new.profit, 0) <> 0
    or coalesce(new.interpreter_fee, 0) <> 0
    or new.assigned_interpreter_id is not null
    or new.assigned_interpreter_name is not null
    or new.matched_interpreter_id is not null
    or new.matched_interpreter_name is not null
    or new.admin_checked is distinct from false
  then
    raise exception 'Only admins can set request operation fields.';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Only admins can update requests.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_non_admin_request_operation_fields on public.requests;
create trigger prevent_non_admin_request_operation_fields
before insert or update on public.requests
for each row
execute function public.prevent_non_admin_request_operation_fields();

drop policy if exists "TEMP admin read request interpreters" on public.request_interpreters;
drop policy if exists "TEMP admin insert request interpreters" on public.request_interpreters;
drop policy if exists "TEMP admin update request interpreters" on public.request_interpreters;
drop policy if exists "TEMP admin delete request interpreters" on public.request_interpreters;
drop policy if exists "TEMP authenticated read request interpreters" on public.request_interpreters;
drop policy if exists "Interpreters can read own request assignments" on public.request_interpreters;
revoke all on public.request_interpreters from anon;

create policy "Interpreters can read own request assignments"
on public.request_interpreters
for select
to authenticated
using (
  exists (
    select 1
    from public.interpreters
    where interpreters.id = request_interpreters.interpreter_id
      and interpreters.auth_user_id = auth.uid()
  )
);

drop policy if exists "TEMP public insert job applications" on public.job_applications;
drop policy if exists "TEMP admin read job applications" on public.job_applications;
drop policy if exists "TEMP admin update job applications" on public.job_applications;
drop policy if exists "TEMP admin delete job applications" on public.job_applications;
drop policy if exists "TEMP authenticated read job applications" on public.job_applications;
drop policy if exists "TEMP authenticated admin update job applications" on public.job_applications;
drop policy if exists "TEMP authenticated admin delete job applications" on public.job_applications;
drop policy if exists "Interpreters can insert own job applications" on public.job_applications;
drop policy if exists "Users can read own job applications" on public.job_applications;
drop policy if exists "Interpreters can withdraw own job applications" on public.job_applications;
revoke select, update, delete on public.job_applications from anon;

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

drop policy if exists "Anyone can read public interpreters" on public.interpreters;
drop policy if exists "TEMP admin read interpreters" on public.interpreters;
drop policy if exists "TEMP authenticated read interpreters" on public.interpreters;
drop policy if exists "Allow authenticated interpreter profile read" on public.interpreters;
drop policy if exists "Users can read own interpreter profile" on public.interpreters;
drop policy if exists "Users can update own interpreter profile" on public.interpreters;
revoke select on public.interpreters from anon;

create policy "Users can read own interpreter profile"
on public.interpreters
for select
to authenticated
using (
  auth.uid() is not null
  and auth_user_id = auth.uid()
);

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
  if public.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if new.level is distinct from old.level
    or new.approved is distinct from old.approved
    or new.status is distinct from old.status
    or new.warning_count is distinct from old.warning_count
    or new.admin_memo is distinct from old.admin_memo
    or new.badge_review_status is distinct from old.badge_review_status
    or new.resume_verified_email_sent_at is distinct from old.resume_verified_email_sent_at
    or new.bankbook_file_url is distinct from old.bankbook_file_url
    or new.business_license_file_url is distinct from old.business_license_file_url
  then
    raise exception 'Only admins can update interpreter admin fields.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_interpreter_self_admin_field_changes on public.interpreters;
create trigger prevent_interpreter_self_admin_field_changes
before update on public.interpreters
for each row
execute function public.prevent_interpreter_self_admin_field_changes();

create or replace view public.public_interpreters as
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
where is_public = true
  and withdrawn_at is null
  and lower(trim(coalesce(status, ''))) in (
    'active',
    'approved',
    'verified',
    '승인',
    '승인 완료',
    '승인완료',
    '활동중'
  );

grant select on public.public_interpreters to anon;
grant select on public.public_interpreters to authenticated;

create or replace view public.public_jobs as
select
  id,
  title,
  event_name,
  null::text as event_type,
  date as work_date,
  start_date,
  end_date,
  location,
  coalesce(event_location, location) as region,
  language as language_pair,
  language,
  field,
  requested_level as level_required,
  requested_level,
  level,
  people_count as number_of_interpreters,
  people_count,
  people,
  preference as public_description,
  preference,
  status as public_status,
  status,
  event_date,
  event_location,
  preferred_gender,
  deadline,
  created_at
from public.jobs
where coalesce(visibility, 'public') = 'public'
  and lower(trim(coalesce(status, ''))) in (
    'open',
    'recruiting',
    'published',
    'closing_soon',
    '모집중',
    '모집 중',
    '공개'
  );

grant select on public.public_jobs to anon;
grant select on public.public_jobs to authenticated;

notify pgrst, 'reload schema';
