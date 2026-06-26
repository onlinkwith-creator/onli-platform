-- Settlement automation fields for completed ON-LI interpretation work.

alter table public.requests
add column if not exists settlement_work_days integer,
add column if not exists settlement_level text,
add column if not exists settlement_base_amount bigint,
add column if not exists settlement_extra_amount bigint not null default 0,
add column if not exists settlement_deduction_amount bigint not null default 0,
add column if not exists settlement_final_amount bigint,
add column if not exists settlement_memo text,
add column if not exists settlement_confirmed_at timestamptz,
add column if not exists settlement_completed_at timestamptz;

create index if not exists requests_settlement_level_idx
on public.requests(settlement_level);

alter table public.requests disable trigger prevent_non_admin_request_operation_fields;

update public.requests
set settlement_status = case
  when settlement_status in ('not_required', 'pending', 'confirmed', 'completed', 'on_hold') then settlement_status
  when settlement_status in ('settled', '정산완료') then 'completed'
  when settlement_status in ('settlement_confirmed', '정산확정') then 'confirmed'
  when settlement_status in ('hold', 'settlement_on_hold', '정산보류') then 'on_hold'
  when settlement_status in ('unsettled', 'settlement_pending', '정산대기', '미정산') then 'pending'
  else 'not_required'
end;

alter table public.requests enable trigger prevent_non_admin_request_operation_fields;

update public.jobs
set settlement_status = case
  when settlement_status in ('not_required', 'pending', 'confirmed', 'completed', 'on_hold') then settlement_status
  when settlement_status in ('settled', '정산완료') then 'completed'
  when settlement_status in ('settlement_confirmed', '정산확정') then 'confirmed'
  when settlement_status in ('hold', 'settlement_on_hold', '정산보류') then 'on_hold'
  when settlement_status in ('unsettled', 'settlement_pending', '정산대기', '미정산') then 'pending'
  else 'not_required'
end;

do $$
begin
  alter table public.requests drop constraint if exists requests_settlement_status_flow_check;
  alter table public.requests
  add constraint requests_settlement_status_flow_check
  check (settlement_status in ('not_required', 'pending', 'confirmed', 'completed', 'on_hold'));

  alter table public.jobs drop constraint if exists jobs_settlement_status_check;
  alter table public.jobs drop constraint if exists jobs_settlement_status_flow_check;
  alter table public.jobs
  add constraint jobs_settlement_status_flow_check
  check (settlement_status in ('not_required', 'pending', 'confirmed', 'completed', 'on_hold'));
end $$;

drop function if exists public.get_my_settlements();

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
  payment_status text,
  settlement_work_days integer,
  settlement_level text,
  settlement_base_amount bigint,
  settlement_extra_amount bigint,
  settlement_deduction_amount bigint,
  settlement_final_amount bigint,
  settlement_completed_at timestamptz
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
    coalesce(r.settlement_final_amount, r.interpreter_payment, 0)::bigint as amount,
    coalesce(r.settlement_status, 'not_required') as settlement_status,
    coalesce(r.payment_status, 'unpaid') as payment_status,
    r.settlement_work_days,
    r.settlement_level,
    r.settlement_base_amount,
    coalesce(r.settlement_extra_amount, 0)::bigint as settlement_extra_amount,
    coalesce(r.settlement_deduction_amount, 0)::bigint as settlement_deduction_amount,
    r.settlement_final_amount,
    r.settlement_completed_at
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
    coalesce(r.settlement_final_amount, r.interpreter_payment, 0)::bigint as amount,
    coalesce(r.settlement_status, 'not_required') as settlement_status,
    coalesce(r.payment_status, 'unpaid') as payment_status,
    r.settlement_work_days,
    r.settlement_level,
    r.settlement_base_amount,
    coalesce(r.settlement_extra_amount, 0)::bigint as settlement_extra_amount,
    coalesce(r.settlement_deduction_amount, 0)::bigint as settlement_deduction_amount,
    r.settlement_final_amount,
    r.settlement_completed_at
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
