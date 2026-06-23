-- Safe mypage data access for interpreters.
-- These RPCs intentionally expose only public job/request fields needed by the UI.

create or replace function public.get_my_job_applications()
returns table (
  application_id uuid,
  application_code text,
  application_status text,
  applied_at timestamptz,
  job_id uuid,
  request_id bigint,
  public_job_code text,
  title text,
  event_name text,
  work_date text,
  start_date date,
  end_date date,
  location text,
  language_pair text,
  level_required text,
  field text,
  number_of_interpreters integer
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ja.id as application_id,
    ja.application_no as application_code,
    ja.status as application_status,
    ja.created_at as applied_at,
    ja.job_id,
    r.id as request_id,
    coalesce(j.job_no, r.request_no) as public_job_code,
    coalesce(j.title, r.event_name, '통역 공고') as title,
    coalesce(j.event_name, r.event_name, j.title) as event_name,
    coalesce(j.date, r.date) as work_date,
    coalesce(
      j.start_date,
      r.start_date,
      case when j.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(j.event_date::text, 10)::date end,
      case when r.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.event_date::text, 10)::date end
    ) as start_date,
    coalesce(
      j.end_date,
      r.end_date,
      case when j.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(j.event_date::text, 10)::date end,
      case when r.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.event_date::text, 10)::date end
    ) as end_date,
    coalesce(j.event_location, j.location, r.event_location) as location,
    coalesce(j.language, r.language) as language_pair,
    coalesce(j.requested_level, j.level, r.requested_level) as level_required,
    coalesce(j.field, r.interpretation_field) as field,
    coalesce(j.people_count, r.requested_people_count, r.required_count) as number_of_interpreters
  from public.job_applications ja
  join public.interpreters i
    on i.id = ja.interpreter_id
  left join public.jobs j
    on j.id = ja.job_id
  left join public.requests r
    on r.job_id = ja.job_id
  where
    auth.uid() is not null
    and (
      public.is_admin()
      or i.auth_user_id = auth.uid()
    )
  order by ja.created_at desc;
$$;

create or replace function public.get_my_assignments()
returns table (
  assignment_id text,
  assignment_code text,
  public_status text,
  assigned_at timestamptz,
  job_id uuid,
  request_id bigint,
  public_job_code text,
  title text,
  event_name text,
  work_date text,
  start_date date,
  end_date date,
  location text,
  language_pair text,
  level_required text,
  field text,
  number_of_interpreters integer
)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.id::text as assignment_id,
    m.matching_no as assignment_code,
    m.status as public_status,
    m.created_at as assigned_at,
    m.job_id,
    m.request_id,
    coalesce(j.job_no, r.request_no) as public_job_code,
    coalesce(j.title, r.event_name, '배정된 통역') as title,
    coalesce(j.event_name, r.event_name, j.title) as event_name,
    coalesce(j.date, r.date) as work_date,
    coalesce(
      m.start_date,
      j.start_date,
      r.start_date,
      case when j.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(j.event_date::text, 10)::date end,
      case when r.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.event_date::text, 10)::date end
    ) as start_date,
    coalesce(
      m.end_date,
      j.end_date,
      r.end_date,
      case when j.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(j.event_date::text, 10)::date end,
      case when r.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.event_date::text, 10)::date end
    ) as end_date,
    coalesce(j.event_location, j.location, r.event_location) as location,
    coalesce(j.language, r.language) as language_pair,
    coalesce(j.requested_level, j.level, r.requested_level) as level_required,
    coalesce(j.field, r.interpretation_field) as field,
    coalesce(j.people_count, r.requested_people_count, r.required_count) as number_of_interpreters
  from public.matchings m
  join public.interpreters i
    on i.id = m.interpreter_id
  left join public.jobs j
    on j.id = m.job_id
  left join public.requests r
    on r.id = m.request_id
  where
    auth.uid() is not null
    and (
      public.is_admin()
      or i.auth_user_id = auth.uid()
    )

  union all

  select
    ('request-interpreter-' || ri.id)::text as assignment_id,
    null::text as assignment_code,
    'assigned'::text as public_status,
    ri.assigned_at as assigned_at,
    r.job_id,
    ri.request_id,
    coalesce(j.job_no, r.request_no) as public_job_code,
    coalesce(j.title, r.event_name, '배정된 통역') as title,
    coalesce(j.event_name, r.event_name, j.title) as event_name,
    coalesce(j.date, r.date) as work_date,
    coalesce(
      j.start_date,
      r.start_date,
      case when j.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(j.event_date::text, 10)::date end,
      case when r.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.event_date::text, 10)::date end
    ) as start_date,
    coalesce(
      j.end_date,
      r.end_date,
      case when j.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(j.event_date::text, 10)::date end,
      case when r.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.event_date::text, 10)::date end
    ) as end_date,
    coalesce(j.event_location, j.location, r.event_location) as location,
    coalesce(j.language, r.language) as language_pair,
    coalesce(j.requested_level, j.level, r.requested_level) as level_required,
    coalesce(j.field, r.interpretation_field) as field,
    coalesce(j.people_count, r.requested_people_count, r.required_count) as number_of_interpreters
  from public.request_interpreters ri
  join public.interpreters i
    on i.id = ri.interpreter_id
  join public.requests r
    on r.id = ri.request_id
  left join public.jobs j
    on j.id = r.job_id
  where
    auth.uid() is not null
    and (
      public.is_admin()
      or i.auth_user_id = auth.uid()
    )
  order by assigned_at desc;
$$;

revoke all on function public.get_my_job_applications() from public;
revoke all on function public.get_my_assignments() from public;
grant execute on function public.get_my_job_applications() to authenticated;
grant execute on function public.get_my_assignments() to authenticated;
