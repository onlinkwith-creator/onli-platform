-- Stabilize admin notification history and interpreter settlement reads.
-- RLS remains enabled; admin access is explicit and public reads are not granted.

alter table public.notification_events enable row level security;
alter table public.settlements enable row level security;

update public.notification_events
set
  status = 'failed',
  error_message = coalesce(error_message, 'Previous transient status was normalized to failed.')
where status in ('processing', 'skipped');

alter table public.notification_events
drop constraint if exists notification_events_status_check;

alter table public.notification_events
add constraint notification_events_status_check
check (status in ('pending', 'sent', 'failed'));

drop policy if exists notification_events_admin_select on public.notification_events;
drop policy if exists notification_events_admin_insert on public.notification_events;
drop policy if exists notification_events_admin_update on public.notification_events;
drop policy if exists notification_events_admin_all on public.notification_events;

create policy notification_events_admin_all
on public.notification_events
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists notification_events_admin_soft_delete on public.notification_events;
create policy notification_events_admin_soft_delete
on public.notification_events
for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

revoke all on public.notification_events from anon;
grant select, insert, update on public.notification_events to authenticated;

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

revoke all on public.settlements from anon;
grant select, update on public.settlements to authenticated;

create or replace function public.is_settlement_request_ready(request_record public.requests)
returns boolean
language sql
stable
as $$
  select
    coalesce(request_record.operation_status, '') in ('completed', 'operation_completed')
    or coalesce(request_record.assignment_status, '') in ('assigned', 'preparing', 'ready')
    or coalesce(request_record.settlement_status, '') in ('pending', 'confirmed', 'completed', 'on_hold')
    or coalesce(request_record.status, '') in ('completed', 'settlement_pending', 'settled', '업무완료', '운영완료', '정산대기', '정산완료')
$$;

create or replace function public.ensure_settlements_for_request(target_request_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record record;
  v_work_days integer;
  v_amount numeric;
  v_daily_rate numeric;
begin
  select *
  into request_record
  from public.requests
  where id = target_request_id;

  if request_record.id is null then
    return;
  end if;

  if not public.is_settlement_request_ready(request_record) then
    return;
  end if;

  v_work_days := greatest(1, coalesce(request_record.settlement_work_days, 1));
  v_amount := coalesce(request_record.settlement_final_amount, request_record.interpreter_payment, request_record.interpreter_price, 0);
  v_daily_rate := coalesce(
    request_record.settlement_base_amount,
    nullif(round(v_amount / greatest(1, v_work_days), 0), 0),
    v_amount,
    0
  );

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
    v_amount,
    public.map_request_settlement_status_to_payout(coalesce(request_record.settlement_status, 'pending')),
    v_work_days,
    v_daily_rate,
    coalesce(request_record.settlement_extra_amount, 0),
    coalesce(request_record.settlement_deduction_amount, 0),
    request_record.settlement_completed_at,
    request_record.settlement_memo
  from public.request_interpreters ri
  where ri.request_id = target_request_id
    and ri.interpreter_id is not null
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
    v_amount,
    public.map_request_settlement_status_to_payout(coalesce(request_record.settlement_status, 'pending')),
    v_work_days,
    v_daily_rate,
    coalesce(request_record.settlement_extra_amount, 0),
    coalesce(request_record.settlement_deduction_amount, 0),
    request_record.settlement_completed_at,
    request_record.settlement_memo
  from public.matchings m
  where m.request_id = target_request_id
    and m.interpreter_id is not null
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
  if public.is_settlement_request_ready(new) then
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

do $$
declare
  ready_request record;
begin
  for ready_request in
    select r.id
    from public.requests r
    where public.is_settlement_request_ready(r)
  loop
    perform public.ensure_settlements_for_request(ready_request.id);
  end loop;
end;
$$;

update public.settlements s
set
  work_days = coalesce(s.work_days, 1),
  daily_rate = coalesce(s.daily_rate, s.amount, 0),
  amount = coalesce(s.amount, 0),
  payout_status = coalesce(nullif(s.payout_status, ''), 'pending');

notify pgrst, 'reload schema';
