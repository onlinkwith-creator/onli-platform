-- Safe dashboard data access for interpreters.
-- Exposes only the signed-in interpreter's own settlement-related rows.

create or replace function public.get_my_settlements()
returns table (
  settlement_id text,
  assignment_id text,
  assignment_code text,
  public_status text,
  assigned_at timestamptz,
  job_id uuid,
  request_id bigint,
  public_job_code text,
  title text,
  event_name text,
  start_date date,
  end_date date,
  amount bigint,
  settlement_status text,
  payment_status text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ('matching-' || m.id::text) as settlement_id,
    m.id::text as assignment_id,
    m.matching_no as assignment_code,
    m.status as public_status,
    m.created_at as assigned_at,
    m.job_id,
    m.request_id,
    coalesce(j.job_no, r.request_no) as public_job_code,
    coalesce(j.title, r.event_name, '배정된 통역') as title,
    coalesce(j.event_name, r.event_name, j.title) as event_name,
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
    coalesce(r.interpreter_payment, 0)::bigint as amount,
    coalesce(r.settlement_status, 'not_required') as settlement_status,
    coalesce(r.payment_status, 'unpaid') as payment_status
  from public.matchings m
  join public.interpreters i
    on i.id = m.interpreter_id
  left join public.jobs j
    on j.id = m.job_id
  left join public.requests r
    on r.id = m.request_id
  where
    auth.uid() is not null
    and i.auth_user_id = auth.uid()

  union all

  select
    ('request-interpreter-' || ri.id::text) as settlement_id,
    ('request-interpreter-' || ri.id::text) as assignment_id,
    null::text as assignment_code,
    'assigned'::text as public_status,
    ri.assigned_at as assigned_at,
    r.job_id,
    ri.request_id,
    coalesce(j.job_no, r.request_no) as public_job_code,
    coalesce(j.title, r.event_name, '배정된 통역') as title,
    coalesce(j.event_name, r.event_name, j.title) as event_name,
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
    coalesce(r.interpreter_payment, 0)::bigint as amount,
    coalesce(r.settlement_status, 'not_required') as settlement_status,
    coalesce(r.payment_status, 'unpaid') as payment_status
  from public.request_interpreters ri
  join public.interpreters i
    on i.id = ri.interpreter_id
  join public.requests r
    on r.id = ri.request_id
  left join public.jobs j
    on j.id = r.job_id
  where
    auth.uid() is not null
    and i.auth_user_id = auth.uid()
  order by assigned_at desc;
$$;

revoke all on function public.get_my_settlements() from public;
revoke all on function public.get_my_settlements() from anon;
grant execute on function public.get_my_settlements() to authenticated;

notify pgrst, 'reload schema';
