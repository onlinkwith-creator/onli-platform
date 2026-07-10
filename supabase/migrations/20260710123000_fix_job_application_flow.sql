-- Fix job application creation/read flow.
-- Canonical applicant relation: job_applications.interpreter_id -> interpreters.id.

alter table public.job_applications
add column if not exists applicant_email text,
add column if not exists applicant_phone text,
add column if not exists interpreter_id bigint references public.interpreters(id) on delete set null;

update public.job_applications
set
  email = nullif(lower(trim(email)), ''),
  applicant_email = nullif(lower(trim(coalesce(applicant_email, email))), ''),
  phone = nullif(regexp_replace(coalesce(phone, ''), '[\s\-\(\)]', '', 'g'), ''),
  applicant_phone = nullif(
    regexp_replace(coalesce(applicant_phone, phone, ''), '[\s\-\(\)]', '', 'g'),
    ''
  );

with interpreter_by_email as (
  select
    lower(trim(email)) as email,
    min(id) as interpreter_id
  from public.interpreters
  where nullif(lower(trim(email)), '') is not null
  group by lower(trim(email))
  having count(*) = 1
)
update public.job_applications ja
set interpreter_id = ibe.interpreter_id
from interpreter_by_email ibe
where ja.interpreter_id is null
  and nullif(lower(trim(coalesce(ja.applicant_email, ja.email))), '') = ibe.email;

do $$
begin
  create unique index if not exists job_applications_job_interpreter_active_uidx
  on public.job_applications(job_id, interpreter_id)
  where interpreter_id is not null
    and lower(trim(coalesce(status, 'pending'))) not in ('cancelled', 'canceled', '취소');
exception
  when unique_violation then
    raise warning 'Skipped job_applications active unique index because duplicate rows exist.';
end $$;

alter table public.job_applications enable row level security;

drop policy if exists "TEMP public insert job applications" on public.job_applications;
drop policy if exists "TEMP admin read job applications" on public.job_applications;
drop policy if exists "TEMP admin update job applications" on public.job_applications;
drop policy if exists "TEMP admin delete job applications" on public.job_applications;
drop policy if exists "TEMP authenticated read job applications" on public.job_applications;
drop policy if exists "TEMP authenticated admin update job applications" on public.job_applications;
drop policy if exists "TEMP authenticated admin delete job applications" on public.job_applications;
drop policy if exists "Approved interpreters can insert applications" on public.job_applications;
drop policy if exists "Allow authenticated interpreter job application insert" on public.job_applications;
drop policy if exists "Interpreters can insert own job applications" on public.job_applications;
drop policy if exists "Users can read own job applications" on public.job_applications;
drop policy if exists "Interpreters can withdraw own job applications" on public.job_applications;
drop policy if exists "Admins can read job applications" on public.job_applications;
drop policy if exists "Admins can update job applications" on public.job_applications;
drop policy if exists "Admins can delete job applications" on public.job_applications;

revoke select, update, delete on public.job_applications from anon;

create policy "Interpreters can insert own job applications"
on public.job_applications
for insert
to authenticated
with check (
  auth.uid() is not null
  and job_id is not null
  and interpreter_id is not null
  and lower(trim(coalesce(status, 'pending'))) in ('pending', '지원완료')
  and exists (
    select 1
    from public.interpreters i
    where i.id = job_applications.interpreter_id
      and i.auth_user_id = auth.uid()
      and lower(trim(coalesce(i.status, ''))) in (
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
  public.is_admin()
  or exists (
    select 1
    from public.interpreters i
    where i.id = job_applications.interpreter_id
      and i.auth_user_id = auth.uid()
  )
);

create policy "Interpreters can withdraw own job applications"
on public.job_applications
for delete
to authenticated
using (
  lower(trim(coalesce(status, 'pending'))) in ('pending', 'reviewing', '지원완료', '검토중', '보류')
  and exists (
    select 1
    from public.interpreters i
    where i.id = job_applications.interpreter_id
      and i.auth_user_id = auth.uid()
  )
);

create policy "Admins can update job applications"
on public.job_applications
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete job applications"
on public.job_applications
for delete
to authenticated
using (public.is_admin());

create or replace view public.public_jobs
with (security_invoker = false) as
select
  j.id,
  j.title,
  j.event_name,
  null::text as event_type,
  j.date as work_date,
  j.date,
  j.start_date,
  j.end_date,
  nullif(regexp_replace(coalesce(j.event_location, j.location, ''), '[[:space:]].*$', ''), '') as location,
  nullif(regexp_replace(coalesce(j.event_location, j.location, ''), '[[:space:]].*$', ''), '') as event_location,
  nullif(regexp_replace(coalesce(j.event_location, j.location, ''), '[[:space:]].*$', ''), '') as region,
  j.language as language_pair,
  j.language,
  j.field,
  j.requested_level as level_required,
  j.requested_level,
  j.level,
  j.people_count as number_of_interpreters,
  j.people_count,
  j.people,
  null::text as public_description,
  null::text as preference,
  j.status as public_status,
  j.status,
  j.event_date,
  j.deadline,
  j.created_at,
  coalesce(ja.application_count, 0)::integer as application_count,
  coalesce(ja.application_count, 0)::integer as applicant_count
from public.jobs j
left join lateral (
  select count(*) as application_count
  from public.job_applications app
  where app.job_id = j.id
    and lower(trim(coalesce(app.status, 'pending'))) not in ('cancelled', 'canceled', '취소')
) ja on true
where coalesce(j.visibility, 'public') = 'public'
  and lower(trim(coalesce(j.status, ''))) not in (
    'cancelled',
    'canceled',
    '취소',
    'hidden',
    '숨김'
  );

revoke all on public.public_jobs from public;
grant select on public.public_jobs to anon;
grant select on public.public_jobs to authenticated;

notify pgrst, 'reload schema';
