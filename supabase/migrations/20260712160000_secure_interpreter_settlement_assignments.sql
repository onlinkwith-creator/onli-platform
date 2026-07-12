-- Interpreter settlement visibility must originate from the canonical active assignment.

drop function if exists public.get_my_settlements();
create function public.get_my_settlements()
returns table (
  settlement_id text, assignment_id text, assignment_code text, public_status text,
  assigned_at timestamptz, job_id uuid, request_id bigint, public_job_code text,
  title text, event_name text, start_date date, end_date date, amount bigint,
  settlement_status text, payment_status text, settlement_work_days integer,
  settlement_level text, settlement_base_amount bigint, settlement_extra_amount bigint,
  settlement_deduction_amount bigint, settlement_final_amount bigint,
  settlement_completed_at timestamptz
)
language sql security definer stable set search_path=public as $$
  with my_interpreter as (
    select i.id from public.interpreters i where i.auth_user_id=auth.uid()
  ), active_assignments as (
    select distinct on (ri.request_id)
      ri.id,ri.request_id,ri.interpreter_id,ri.assigned_at,ri.status
    from public.request_interpreters ri
    join my_interpreter mine on mine.id=ri.interpreter_id
    where ri.status='assigned'
    order by ri.request_id,ri.assigned_at desc nulls last,ri.id desc
  )
  select
    coalesce(s.id::text,'request-interpreter-'||a.id::text),
    coalesce(s.assignment_id,'request-interpreters:'||a.id::text),
    coalesce(s.assignment_id,'request-interpreters:'||a.id::text),
    a.status,a.assigned_at,r.job_id,a.request_id,coalesce(j.job_no,r.request_no),
    coalesce(j.title,r.event_name,'배정된 통역'),coalesce(j.event_name,r.event_name,j.title),
    coalesce(j.start_date,r.start_date,
      case when j.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(j.event_date::text,10)::date end,
      case when r.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.event_date::text,10)::date end),
    coalesce(j.end_date,r.end_date,
      case when j.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(j.event_date::text,10)::date end,
      case when r.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.event_date::text,10)::date end),
    coalesce(s.amount,r.settlement_final_amount,r.interpreter_payment,0)::bigint,
    case when s.payout_status='paid' then 'completed'
      when s.payout_status='withheld' then 'on_hold'
      else coalesce(s.settlement_status,s.payout_status,r.settlement_status,'not_required') end,
    coalesce(to_jsonb(r)->>'payment_status','unpaid'),
    coalesce(s.work_days,r.settlement_work_days),
    coalesce(r.settlement_level,i.level,r.required_level,r.requested_level),
    coalesce((s.daily_rate*coalesce(s.work_days,0))::bigint,r.settlement_base_amount),
    coalesce(s.extra_amount,r.settlement_extra_amount,0)::bigint,
    coalesce(s.deduction_amount,r.settlement_deduction_amount,0)::bigint,
    coalesce(s.amount,r.settlement_final_amount,r.interpreter_payment,0)::bigint,
    coalesce(s.settlement_completed_at,s.paid_at,r.settlement_completed_at)
  from active_assignments a
  join public.interpreters i on i.id=a.interpreter_id
  join public.requests r on r.id=a.request_id
  left join public.jobs j on j.id=r.job_id
  left join public.settlements s
    on s.request_id=a.request_id and s.interpreter_id=a.interpreter_id
  order by a.assigned_at desc;
$$;

revoke all on function public.get_my_settlements() from public,anon;
grant execute on function public.get_my_settlements() to authenticated;

drop policy if exists settlements_interpreter_select_own on public.settlements;
drop policy if exists "Interpreters can read own settlements" on public.settlements;
create policy "Interpreters read own actively assigned settlements"
on public.settlements for select to authenticated using (
  exists (
    select 1 from public.interpreters i
    join public.request_interpreters ri on ri.interpreter_id=i.id
    where i.id=settlements.interpreter_id and i.auth_user_id=auth.uid()
      and ri.request_id=settlements.request_id and ri.status='assigned'
  )
);

drop policy if exists "assigned_interpreters_can_read_request_interpreters" on public.request_interpreters;
create policy "Interpreters read own active assignments"
on public.request_interpreters for select to authenticated using (
  status='assigned' and exists (
    select 1 from public.interpreters i
    where i.id=request_interpreters.interpreter_id and i.auth_user_id=auth.uid()
  )
);

drop policy if exists "assigned_interpreters_can_read_assigned_requests" on public.requests;
drop policy if exists "Assigned interpreters can read linked requests" on public.requests;
create policy "Interpreters read actively assigned requests"
on public.requests for select to authenticated using (
  exists (
    select 1 from public.request_interpreters ri
    join public.interpreters i on i.id=ri.interpreter_id
    where ri.request_id=requests.id and ri.status='assigned' and i.auth_user_id=auth.uid()
  )
);

notify pgrst,'reload schema';
