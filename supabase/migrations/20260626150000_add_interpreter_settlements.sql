-- ON-LI interpreter payout settlement management.

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  request_id bigint not null references public.requests(id) on delete cascade,
  interpreter_id bigint not null references public.interpreters(id) on delete cascade,
  assignment_id text,
  payout_document_id uuid references public.documents(id) on delete set null,
  amount numeric not null default 0,
  payout_status text not null default 'pending'
    check (payout_status in ('pending', 'confirmed', 'paid', 'withheld', 'cancelled')),
  work_days integer,
  daily_rate numeric,
  extra_amount numeric not null default 0,
  deduction_amount numeric not null default 0,
  paid_at timestamptz,
  payment_method text,
  admin_memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists settlements_assignment_key
on public.settlements(request_id, interpreter_id, coalesce(assignment_id, ''));

create index if not exists settlements_request_idx
on public.settlements(request_id, payout_status, created_at desc);

create index if not exists settlements_interpreter_idx
on public.settlements(interpreter_id, created_at desc);

create table if not exists public.settlement_logs (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid default auth.uid(),
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists settlement_logs_settlement_idx
on public.settlement_logs(settlement_id, created_at desc);

alter table public.settlements enable row level security;
alter table public.settlement_logs enable row level security;

drop policy if exists settlements_admin_all on public.settlements;
create policy settlements_admin_all
on public.settlements
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists settlements_interpreter_select_own on public.settlements;
create policy settlements_interpreter_select_own
on public.settlements
for select
to authenticated
using (
  exists (
    select 1
    from public.interpreters i
    where i.id = settlements.interpreter_id
      and i.auth_user_id = auth.uid()
  )
);

drop policy if exists settlement_logs_admin_select on public.settlement_logs;
create policy settlement_logs_admin_select
on public.settlement_logs
for select
to authenticated
using (public.is_active_admin());

create or replace function public.touch_settlements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_settlements_updated_at on public.settlements;
create trigger touch_settlements_updated_at
before update on public.settlements
for each row
execute function public.touch_settlements_updated_at();

create or replace function public.map_request_settlement_status_to_payout(status text)
returns text
language sql
immutable
as $$
  select case
    when status in ('confirmed', 'settlement_confirmed', '정산확정') then 'confirmed'
    when status in ('completed', 'settled', 'settlement_completed', '정산완료') then 'paid'
    when status in ('on_hold', 'hold', 'settlement_on_hold', '정산보류') then 'withheld'
    when status in ('cancelled', 'canceled', '취소') then 'cancelled'
    else 'pending'
  end;
$$;

create or replace function public.ensure_settlements_for_request(target_request_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record record;
begin
  select *
  into request_record
  from public.requests
  where id = target_request_id;

  if request_record.id is null then
    return;
  end if;

  if not (
    request_record.operation_status in ('completed', 'operation_completed')
    or request_record.settlement_status in ('pending', 'confirmed', 'completed', 'on_hold')
    or request_record.status in ('completed', 'settlement_pending', 'settled', '업무완료', '정산대기', '정산완료')
  ) then
    return;
  end if;

  insert into public.settlements (
    request_id,
    interpreter_id,
    assignment_id,
    amount,
    payout_status,
    work_days,
    daily_rate,
    extra_amount,
    deduction_amount,
    paid_at,
    admin_memo
  )
  select
    ri.request_id,
    ri.interpreter_id,
    ('request_interpreters:' || ri.id::text),
    coalesce(request_record.settlement_final_amount, request_record.interpreter_payment, 0),
    public.map_request_settlement_status_to_payout(coalesce(request_record.settlement_status, 'pending')),
    request_record.settlement_work_days,
    case
      when coalesce(request_record.settlement_work_days, 0) > 0
        then round(coalesce(request_record.settlement_base_amount, request_record.interpreter_payment, 0)::numeric / request_record.settlement_work_days, 0)
      else null
    end,
    coalesce(request_record.settlement_extra_amount, 0),
    coalesce(request_record.settlement_deduction_amount, 0),
    request_record.settlement_completed_at,
    request_record.settlement_memo
  from public.request_interpreters ri
  where ri.request_id = target_request_id
  on conflict (request_id, interpreter_id, (coalesce(assignment_id, ''))) do update
  set
    amount = case
      when public.settlements.payout_status = 'pending' then excluded.amount
      else public.settlements.amount
    end,
    work_days = coalesce(public.settlements.work_days, excluded.work_days),
    daily_rate = coalesce(public.settlements.daily_rate, excluded.daily_rate),
    extra_amount = case
      when public.settlements.extra_amount = 0 then excluded.extra_amount
      else public.settlements.extra_amount
    end,
    deduction_amount = case
      when public.settlements.deduction_amount = 0 then excluded.deduction_amount
      else public.settlements.deduction_amount
    end,
    admin_memo = coalesce(public.settlements.admin_memo, excluded.admin_memo);

  insert into public.settlements (
    request_id,
    interpreter_id,
    assignment_id,
    amount,
    payout_status,
    work_days,
    daily_rate,
    extra_amount,
    deduction_amount,
    paid_at,
    admin_memo
  )
  select
    m.request_id,
    m.interpreter_id,
    ('matchings:' || m.id::text),
    coalesce(request_record.settlement_final_amount, request_record.interpreter_payment, 0),
    public.map_request_settlement_status_to_payout(coalesce(request_record.settlement_status, 'pending')),
    request_record.settlement_work_days,
    case
      when coalesce(request_record.settlement_work_days, 0) > 0
        then round(coalesce(request_record.settlement_base_amount, request_record.interpreter_payment, 0)::numeric / request_record.settlement_work_days, 0)
      else null
    end,
    coalesce(request_record.settlement_extra_amount, 0),
    coalesce(request_record.settlement_deduction_amount, 0),
    request_record.settlement_completed_at,
    request_record.settlement_memo
  from public.matchings m
  where m.request_id = target_request_id
    and not exists (
      select 1
      from public.request_interpreters ri
      where ri.request_id = m.request_id
        and ri.interpreter_id = m.interpreter_id
    )
  on conflict (request_id, interpreter_id, (coalesce(assignment_id, ''))) do update
  set
    amount = case
      when public.settlements.payout_status = 'pending' then excluded.amount
      else public.settlements.amount
    end,
    work_days = coalesce(public.settlements.work_days, excluded.work_days),
    daily_rate = coalesce(public.settlements.daily_rate, excluded.daily_rate),
    extra_amount = case
      when public.settlements.extra_amount = 0 then excluded.extra_amount
      else public.settlements.extra_amount
    end,
    deduction_amount = case
      when public.settlements.deduction_amount = 0 then excluded.deduction_amount
      else public.settlements.deduction_amount
    end,
    admin_memo = coalesce(public.settlements.admin_memo, excluded.admin_memo);
end;
$$;

create or replace function public.create_settlements_for_completed_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.operation_status in ('completed', 'operation_completed')
    or new.settlement_status in ('pending', 'confirmed', 'completed', 'on_hold')
    or new.status in ('completed', 'settlement_pending', 'settled', '업무완료', '정산대기', '정산완료')
  ) then
    perform public.ensure_settlements_for_request(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists create_settlements_for_completed_request on public.requests;
create trigger create_settlements_for_completed_request
after insert or update on public.requests
for each row
execute function public.create_settlements_for_completed_request();

create or replace function public.create_settlement_for_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_settlements_for_request(new.request_id);
  return new;
end;
$$;

drop trigger if exists create_settlement_for_request_assignment on public.request_interpreters;
create trigger create_settlement_for_request_assignment
after insert or update on public.request_interpreters
for each row
execute function public.create_settlement_for_assignment();

drop trigger if exists create_settlement_for_matching_assignment on public.matchings;
create trigger create_settlement_for_matching_assignment
after insert or update on public.matchings
for each row
when (new.request_id is not null)
execute function public.create_settlement_for_assignment();

insert into public.settlements (
  request_id,
  interpreter_id,
  assignment_id,
  amount,
  payout_status,
  work_days,
  daily_rate,
  extra_amount,
  deduction_amount,
  paid_at,
  admin_memo
)
select
  r.id,
  ri.interpreter_id,
  ('request_interpreters:' || ri.id::text),
  coalesce(r.settlement_final_amount, r.interpreter_payment, 0),
  public.map_request_settlement_status_to_payout(coalesce(r.settlement_status, 'pending')),
  r.settlement_work_days,
  case
    when coalesce(r.settlement_work_days, 0) > 0
      then round(coalesce(r.settlement_base_amount, r.interpreter_payment, 0)::numeric / r.settlement_work_days, 0)
    else null
  end,
  coalesce(r.settlement_extra_amount, 0),
  coalesce(r.settlement_deduction_amount, 0),
  r.settlement_completed_at,
  r.settlement_memo
from public.requests r
join public.request_interpreters ri on ri.request_id = r.id
where (
  r.operation_status in ('completed', 'operation_completed')
  or r.settlement_status in ('pending', 'confirmed', 'completed', 'on_hold')
  or r.status in ('completed', 'settlement_pending', 'settled', '업무완료', '정산대기', '정산완료')
)
on conflict (request_id, interpreter_id, (coalesce(assignment_id, ''))) do nothing;

insert into public.settlements (
  request_id,
  interpreter_id,
  assignment_id,
  amount,
  payout_status,
  work_days,
  daily_rate,
  extra_amount,
  deduction_amount,
  paid_at,
  admin_memo
)
select
  r.id,
  m.interpreter_id,
  ('matchings:' || m.id::text),
  coalesce(r.settlement_final_amount, r.interpreter_payment, 0),
  public.map_request_settlement_status_to_payout(coalesce(r.settlement_status, 'pending')),
  r.settlement_work_days,
  case
    when coalesce(r.settlement_work_days, 0) > 0
      then round(coalesce(r.settlement_base_amount, r.interpreter_payment, 0)::numeric / r.settlement_work_days, 0)
    else null
  end,
  coalesce(r.settlement_extra_amount, 0),
  coalesce(r.settlement_deduction_amount, 0),
  r.settlement_completed_at,
  r.settlement_memo
from public.requests r
join public.matchings m on m.request_id = r.id
where (
  r.operation_status in ('completed', 'operation_completed')
  or r.settlement_status in ('pending', 'confirmed', 'completed', 'on_hold')
  or r.status in ('completed', 'settlement_pending', 'settled', '업무완료', '정산대기', '정산완료')
)
and not exists (
  select 1
  from public.request_interpreters ri
  where ri.request_id = m.request_id
    and ri.interpreter_id = m.interpreter_id
)
on conflict (request_id, interpreter_id, (coalesce(assignment_id, ''))) do nothing;

create or replace function public.log_settlement_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record record;
  interpreter_record record;
begin
  if tg_op = 'INSERT' then
    insert into public.settlement_logs (settlement_id, previous_status, new_status, changed_by, memo)
    values (new.id, null, new.payout_status, auth.uid(), new.admin_memo);
    return new;
  end if;

  if coalesce(old.payout_status, '') = coalesce(new.payout_status, '') then
    if old.amount is distinct from new.amount then
      insert into public.settlement_logs (settlement_id, previous_status, new_status, changed_by, memo)
      values (new.id, old.payout_status, new.payout_status, auth.uid(), coalesce(new.admin_memo, '정산 금액 변경'));
    end if;
    return new;
  end if;

  insert into public.settlement_logs (settlement_id, previous_status, new_status, changed_by, memo)
  values (new.id, old.payout_status, new.payout_status, auth.uid(), new.admin_memo);

  select *
  into request_record
  from public.requests
  where id = new.request_id;

  select *
  into interpreter_record
  from public.interpreters
  where id = new.interpreter_id;

  if new.payout_status = 'confirmed' then
    perform public.enqueue_notification_event_v2(
      'interpreter_settlement_confirmed',
      'settlement',
      new.id::text,
      'interpreter',
      interpreter_record.email,
      interpreter_record.phone,
      jsonb_build_object(
        'settlement_id', new.id,
        'request_id', new.request_id,
        'request_no', to_jsonb(request_record)->>'request_no',
        'event_name', to_jsonb(request_record)->>'event_name',
        'interpreter_name', interpreter_record.name,
        'amount', new.amount,
        'status', new.payout_status
      ),
      'email',
      '정산 확정',
      '통역 업무의 지급 금액이 확정되었습니다.'
    );
  elsif new.payout_status = 'paid' then
    perform public.enqueue_notification_event_v2(
      'interpreter_payout_paid',
      'settlement',
      new.id::text,
      'interpreter',
      interpreter_record.email,
      interpreter_record.phone,
      jsonb_build_object(
        'settlement_id', new.id,
        'request_id', new.request_id,
        'request_no', to_jsonb(request_record)->>'request_no',
        'event_name', to_jsonb(request_record)->>'event_name',
        'interpreter_name', interpreter_record.name,
        'amount', new.amount,
        'paid_at', new.paid_at,
        'status', new.payout_status
      ),
      'email',
      '지급 완료',
      '정산 금액 지급이 완료되었습니다.'
    );
  elsif new.payout_status = 'withheld' then
    perform public.enqueue_notification_event_v2(
      'interpreter_settlement_withheld',
      'settlement',
      new.id::text,
      'interpreter',
      interpreter_record.email,
      interpreter_record.phone,
      jsonb_build_object(
        'settlement_id', new.id,
        'request_id', new.request_id,
        'request_no', to_jsonb(request_record)->>'request_no',
        'event_name', to_jsonb(request_record)->>'event_name',
        'interpreter_name', interpreter_record.name,
        'amount', new.amount,
        'status', new.payout_status
      ),
      'email',
      '정산 보류',
      '정산 처리가 보류되었습니다.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists log_settlement_status_insert on public.settlements;
create trigger log_settlement_status_insert
after insert on public.settlements
for each row
execute function public.log_settlement_status_change();

drop trigger if exists log_settlement_status_update on public.settlements;
create trigger log_settlement_status_update
after update on public.settlements
for each row
execute function public.log_settlement_status_change();

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
    s.id::text as settlement_id,
    s.assignment_id,
    s.assignment_id as assignment_code,
    'settlement'::text as public_status,
    s.created_at as assigned_at,
    r.job_id,
    s.request_id,
    r.request_no as public_job_code,
    coalesce(r.event_name, '배정된 통역') as title,
    r.event_name,
    r.start_date,
    r.end_date,
    coalesce(s.amount, 0)::bigint as amount,
    case
      when s.payout_status = 'paid' then 'completed'
      when s.payout_status = 'withheld' then 'on_hold'
      else s.payout_status
    end as settlement_status,
    coalesce(to_jsonb(r)->>'payment_status', 'unpaid') as payment_status,
    s.work_days as settlement_work_days,
    coalesce(r.settlement_level, i.level, r.required_level, r.requested_level) as settlement_level,
    (coalesce(s.daily_rate, 0) * coalesce(s.work_days, 0))::bigint as settlement_base_amount,
    coalesce(s.extra_amount, 0)::bigint as settlement_extra_amount,
    coalesce(s.deduction_amount, 0)::bigint as settlement_deduction_amount,
    coalesce(s.amount, 0)::bigint as settlement_final_amount,
    s.paid_at as settlement_completed_at
  from public.settlements s
  join public.interpreters i on i.id = s.interpreter_id
  join public.requests r on r.id = s.request_id
  where auth.uid() is not null
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
    coalesce(to_jsonb(r)->>'payment_status', 'unpaid') as payment_status,
    r.settlement_work_days,
    r.settlement_level,
    r.settlement_base_amount,
    coalesce(r.settlement_extra_amount, 0)::bigint as settlement_extra_amount,
    coalesce(r.settlement_deduction_amount, 0)::bigint as settlement_deduction_amount,
    r.settlement_final_amount,
    r.settlement_completed_at
  from public.request_interpreters ri
  join public.interpreters i on i.id = ri.interpreter_id
  join public.requests r on r.id = ri.request_id
  left join public.jobs j on j.id = r.job_id
  where auth.uid() is not null
    and i.auth_user_id = auth.uid()
    and not exists (
      select 1
      from public.settlements s
      where s.request_id = ri.request_id
        and s.interpreter_id = ri.interpreter_id
    )

  union all

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
    coalesce(to_jsonb(r)->>'payment_status', 'unpaid') as payment_status,
    r.settlement_work_days,
    r.settlement_level,
    r.settlement_base_amount,
    coalesce(r.settlement_extra_amount, 0)::bigint as settlement_extra_amount,
    coalesce(r.settlement_deduction_amount, 0)::bigint as settlement_deduction_amount,
    r.settlement_final_amount,
    r.settlement_completed_at
  from public.matchings m
  join public.interpreters i on i.id = m.interpreter_id
  left join public.jobs j on j.id = m.job_id
  left join public.requests r on r.id = m.request_id
  where auth.uid() is not null
    and i.auth_user_id = auth.uid()
    and not exists (
      select 1
      from public.settlements s
      where s.request_id = m.request_id
        and s.interpreter_id = m.interpreter_id
    )
  order by assigned_at desc;
$$;

revoke all on function public.get_my_settlements() from public;
revoke all on function public.get_my_settlements() from anon;
grant execute on function public.get_my_settlements() to authenticated;

revoke all on public.settlements from anon;
revoke all on public.settlement_logs from anon;

notify pgrst, 'reload schema';
