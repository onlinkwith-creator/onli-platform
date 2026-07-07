-- Admin settlement workflow, status-only.
-- Do not reference optional timestamp columns.

alter table public.settlements
add column if not exists settlement_status text default 'settlement_waiting',
add column if not exists updated_at timestamptz default now();

update public.settlements
set settlement_status = case
  when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_waiting', 'settlement_pending', 'pending', 'unpaid', '') then 'settlement_waiting'
  when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_confirmed', 'confirmed') then 'settlement_confirmed'
  when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_paying', 'paying', 'payment_started') then 'settlement_paying'
  when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_completed', 'settlement_paid', 'paid', 'completed', 'settled') then 'settlement_completed'
  else 'settlement_waiting'
end,
updated_at = coalesce(updated_at, now());

alter table public.settlements
alter column settlement_status set default 'settlement_waiting';

alter table public.settlements
drop constraint if exists settlements_settlement_status_check;

alter table public.settlements
add constraint settlements_settlement_status_check
check (settlement_status in ('settlement_waiting', 'settlement_confirmed', 'settlement_paying', 'settlement_completed'));

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
          'settlement_waiting',
          'settlement_pending',
          'settlement_confirmed',
          'settlement_paying',
          'settlement_completed',
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
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_next_status text := lower(trim(coalesce(p_next_status, '')));
  v_previous_status text;
  v_request_id bigint;
  v_interpreter_id bigint;
  v_interpreter_auth_user_id uuid;
  v_has_settlement_status boolean;
  v_has_status boolean;
  v_has_payout_status boolean;
  v_has_updated_at boolean;
  v_has_request_settlement_status boolean;
  v_has_request_updated_at boolean;
  v_settlement jsonb;
  v_action_label text;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_active_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  v_next_status := case
    when v_next_status in ('settlement_waiting', 'settlement_pending', 'pending', 'unpaid', 'waiting', 'wait') then 'settlement_waiting'
    when v_next_status in ('settlement_confirmed', 'confirmed') then 'settlement_confirmed'
    when v_next_status in ('settlement_paying', 'paying', 'payment_started') then 'settlement_paying'
    when v_next_status in ('settlement_completed', 'settlement_paid', 'completed', 'paid', 'settled') then 'settlement_completed'
    else v_next_status
  end;

  if v_next_status not in ('settlement_waiting', 'settlement_confirmed', 'settlement_paying', 'settlement_completed') then
    raise exception '지원하지 않는 정산 상태입니다: %', p_next_status;
  end if;

  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'settlements' and column_name = 'settlement_status'),
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'settlements' and column_name = 'status'),
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'settlements' and column_name = 'payout_status'),
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'settlements' and column_name = 'updated_at')
  into v_has_settlement_status, v_has_status, v_has_payout_status, v_has_updated_at;

  if not (v_has_settlement_status or v_has_status or v_has_payout_status) then
    raise exception 'settlements 테이블에 상태 컬럼이 없습니다.';
  end if;

  select request_id, interpreter_id,
    case
      when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_waiting', 'settlement_pending', 'pending', 'unpaid', '') then 'settlement_waiting'
      when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_confirmed', 'confirmed') then 'settlement_confirmed'
      when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_paying', 'paying', 'payment_started') then 'settlement_paying'
      when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_completed', 'settlement_paid', 'paid', 'completed', 'settled') then 'settlement_completed'
      else 'settlement_waiting'
    end
  into v_request_id, v_interpreter_id, v_previous_status
  from public.settlements
  where id = p_settlement_id
  for update;

  if not found then
    raise exception '정산 정보를 찾을 수 없습니다.';
  end if;

  v_action_label := case
    when v_next_status = 'settlement_confirmed' then '정산 확정'
    when v_next_status = 'settlement_paying' then '통역사 지급'
    when v_next_status = 'settlement_completed' then '정산 완료'
    else '정산 대기'
  end;

  execute format(
    'update public.settlements set %s where id = $1 returning to_jsonb(settlements.*)',
    array_to_string(
      array_remove(array[
        case when v_has_settlement_status then 'settlement_status = $2' end,
        case when v_has_status then 'status = $2' end,
        case when v_has_payout_status then format(
          'payout_status = case when $2 = %L then %L when $2 in (%L, %L) then %L else %L end',
          'settlement_completed',
          'paid',
          'settlement_confirmed',
          'settlement_paying',
          'confirmed',
          'pending'
        ) end,
        case when v_has_updated_at then 'updated_at = now()' end
      ], null),
      ', '
    )
  )
  using p_settlement_id, v_next_status
  into v_settlement;

  select
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'requests' and column_name = 'settlement_status'),
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'requests' and column_name = 'updated_at')
  into v_has_request_settlement_status, v_has_request_updated_at;

  if v_request_id is not null and v_has_request_settlement_status then
    execute format(
      'update public.requests set %s where id = $1',
      array_to_string(
        array_remove(array[
          'settlement_status = $2',
          case when v_has_request_updated_at then 'updated_at = now()' end
        ], null),
        ', '
      )
    )
    using v_request_id, v_next_status;
  end if;

  if v_interpreter_auth_user_id is null then
    select i.auth_user_id
    into v_interpreter_auth_user_id
    from public.interpreters i
    where i.id = v_interpreter_id;
  end if;

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
    v_next_status,
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
      'interpreter_' || v_next_status,
      v_action_label,
      case
        when v_next_status = 'settlement_confirmed' then '정산이 확정되었습니다.'
        when v_next_status = 'settlement_paying' then '통역사 지급 절차가 시작되었습니다.'
        when v_next_status = 'settlement_completed' then '정산이 완료되었습니다.'
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
