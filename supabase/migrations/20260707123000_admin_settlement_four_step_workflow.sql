-- Admin settlement workflow: pending -> confirmed -> paying -> completed.
-- Frontend tab ids remain settlement_*, while settlements.settlement_status stores plain DB values.

alter table public.settlements
add column if not exists settlement_status text default 'pending',
add column if not exists settlement_confirmed_at timestamptz,
add column if not exists payment_started_at timestamptz,
add column if not exists paid_at timestamptz,
add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
add column if not exists payment_started_by uuid references auth.users(id) on delete set null,
add column if not exists completed_by uuid references auth.users(id) on delete set null,
add column if not exists updated_at timestamptz default now();

update public.settlements
set settlement_status = case
  when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_pending', 'pending', 'unpaid', '') then 'pending'
  when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_confirmed', 'confirmed') then 'confirmed'
  when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_paying', 'paying', 'payment_started') then 'paying'
  when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_paid', 'settlement_completed', 'paid', 'completed', 'settled') then 'completed'
  else 'pending'
end,
updated_at = coalesce(updated_at, now());

alter table public.settlements
alter column settlement_status set default 'pending';

alter table public.settlements
drop constraint if exists settlements_settlement_status_check;

alter table public.settlements
add constraint settlements_settlement_status_check
check (settlement_status in ('pending', 'confirmed', 'paying', 'completed'));

create index if not exists settlements_settlement_status_idx
on public.settlements(settlement_status, created_at desc);

do $$
begin
  if to_regclass('public.requests') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'requests'
         and column_name = 'settlement_status'
     ) then
    alter table public.requests drop constraint if exists requests_settlement_status_flow_check;
    alter table public.requests add constraint requests_settlement_status_flow_check
    check (
      settlement_status is null
      or settlement_status = any (
        array[
          'not_required',
          'pending',
          'confirmed',
          'paying',
          'completed',
          'on_hold',
          'settlement_pending',
          'settlement_confirmed',
          'settlement_paid'
        ]::text[]
      )
    );
  end if;
end $$;

drop function if exists public.admin_update_settlement_status(uuid, text);

create function public.admin_update_settlement_status(
  p_settlement_id uuid,
  p_next_status text
)
returns public.settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_next_status text := lower(trim(coalesce(p_next_status, '')));
  v_previous_status text;
  v_settlement public.settlements%rowtype;
  v_request_id bigint;
  v_interpreter_auth_user_id uuid;
  v_action_label text;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_active_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if v_next_status in ('settlement_pending', 'unpaid') then
    v_next_status := 'pending';
  elsif v_next_status = 'settlement_confirmed' then
    v_next_status := 'confirmed';
  elsif v_next_status in ('settlement_paying', 'payment_started') then
    v_next_status := 'paying';
  elsif v_next_status in ('settlement_paid', 'settlement_completed', 'paid') then
    v_next_status := 'completed';
  end if;

  if v_next_status not in ('pending', 'confirmed', 'paying', 'completed') then
    raise exception '지원하지 않는 정산 상태입니다: %', p_next_status;
  end if;

  select *
  into v_settlement
  from public.settlements
  where id = p_settlement_id
  for update;

  if not found then
    raise exception '정산 정보를 찾을 수 없습니다.';
  end if;

  v_previous_status := case
    when lower(coalesce(v_settlement.settlement_status, v_settlement.payout_status, '')) in ('settlement_pending', 'pending', 'unpaid', '') then 'pending'
    when lower(coalesce(v_settlement.settlement_status, v_settlement.payout_status, '')) in ('settlement_confirmed', 'confirmed') then 'confirmed'
    when lower(coalesce(v_settlement.settlement_status, v_settlement.payout_status, '')) in ('settlement_paying', 'paying', 'payment_started') then 'paying'
    when lower(coalesce(v_settlement.settlement_status, v_settlement.payout_status, '')) in ('settlement_paid', 'settlement_completed', 'paid', 'completed', 'settled') then 'completed'
    else 'pending'
  end;

  v_action_label := case
    when v_next_status = 'confirmed' then '정산 확정'
    when v_next_status = 'paying' then '통역사 지급'
    when v_next_status = 'completed' then '정산 완료'
    else '정산 대기'
  end;

  update public.settlements
  set settlement_status = v_next_status,
      payout_status = case
        when v_next_status = 'completed' then 'paid'
        when v_next_status in ('confirmed', 'paying') then 'confirmed'
        else 'pending'
      end,
      settlement_confirmed_at = case
        when v_next_status = 'pending' then null
        else coalesce(settlement_confirmed_at, now())
      end,
      payment_started_at = case
        when v_next_status in ('pending', 'confirmed') then null
        else coalesce(payment_started_at, now())
      end,
      paid_at = case
        when v_next_status = 'completed' then now()
        else null
      end,
      confirmed_by = case
        when v_next_status = 'pending' then null
        when v_next_status = 'confirmed' then v_actor
        else coalesce(confirmed_by, v_actor)
      end,
      payment_started_by = case
        when v_next_status in ('pending', 'confirmed') then null
        when v_next_status = 'paying' then v_actor
        else coalesce(payment_started_by, v_actor)
      end,
      completed_by = case
        when v_next_status = 'completed' then v_actor
        else null
      end,
      paid_by = case
        when v_next_status = 'completed' then v_actor
        else null
      end,
      updated_at = now()
  where id = p_settlement_id
  returning * into v_settlement;

  v_request_id := v_settlement.request_id;
  v_interpreter_auth_user_id := v_settlement.interpreter_auth_user_id;

  if v_interpreter_auth_user_id is null then
    select i.auth_user_id
    into v_interpreter_auth_user_id
    from public.interpreters i
    where i.id = v_settlement.interpreter_id;
  end if;

  update public.requests
  set settlement_status = v_next_status,
      settlement_confirmed_at = case
        when v_next_status = 'pending' then null
        else coalesce(settlement_confirmed_at, now())
      end,
      settlement_completed_at = case
        when v_next_status = 'completed' then now()
        when v_next_status in ('pending', 'confirmed', 'paying') then null
        else settlement_completed_at
      end,
      updated_at = now()
  where id = v_request_id;

  insert into public.settlement_logs (
    settlement_id,
    previous_status,
    new_status,
    changed_by,
    memo
  )
  values (
    p_settlement_id,
    v_previous_status,
    v_next_status,
    v_actor,
    v_action_label
  );

  insert into public.activity_logs (
    action_type,
    description,
    user_id,
    related_table,
    related_id
  )
  values (
    'settlement_' || v_next_status,
    v_action_label,
    v_actor,
    'settlements',
    p_settlement_id::text
  );

  if v_interpreter_auth_user_id is not null then
    insert into public.notifications (
      recipient_type,
      recipient_id,
      notification_type,
      title,
      message,
      related_request_id,
      channel,
      status
    )
    values (
      'interpreter',
      v_interpreter_auth_user_id,
      'interpreter_settlement_' || v_next_status,
      v_action_label,
      case
        when v_next_status = 'confirmed' then '정산이 확정되었습니다.'
        when v_next_status = 'paying' then '통역사 지급 절차가 시작되었습니다.'
        when v_next_status = 'completed' then '정산이 완료되었습니다.'
        else '정산 상태가 대기로 변경되었습니다.'
      end,
      v_request_id,
      'internal',
      'pending'
    );
  end if;

  return v_settlement;
end;
$$;

revoke all on function public.admin_update_settlement_status(uuid, text) from public;
revoke all on function public.admin_update_settlement_status(uuid, text) from anon;
grant execute on function public.admin_update_settlement_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';
