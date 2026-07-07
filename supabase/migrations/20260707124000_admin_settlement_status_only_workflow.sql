-- Canonical admin settlement workflow.
-- The only settlement_status values are:
-- settlement_waiting -> settlement_confirmed -> settlement_paying -> settlement_completed.

alter table public.settlements
add column if not exists settlement_status text default 'settlement_waiting',
add column if not exists settlement_confirmed_at timestamptz,
add column if not exists interpreter_payment_started_at timestamptz,
add column if not exists settlement_completed_at timestamptz,
add column if not exists updated_at timestamptz default now();

update public.settlements
set settlement_status = case
  when settlement_status = 'settlement_confirmed' then 'settlement_confirmed'
  when settlement_status = 'settlement_paying' then 'settlement_paying'
  when settlement_status = 'settlement_completed' then 'settlement_completed'
  else 'settlement_waiting'
end,
updated_at = coalesce(updated_at, now());

alter table public.settlements
alter column settlement_status set default 'settlement_waiting';

alter table public.settlements
drop constraint if exists settlements_settlement_status_check;

alter table public.settlements
add constraint settlements_settlement_status_check
check (
  settlement_status in (
    'settlement_waiting',
    'settlement_confirmed',
    'settlement_paying',
    'settlement_completed'
  )
);

create index if not exists settlements_settlement_status_idx
on public.settlements(settlement_status, created_at desc);

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
  v_next_status text := trim(coalesce(p_next_status, ''));
  v_previous_status text;
  v_interpreter_id bigint;
  v_interpreter_auth_user_id uuid;
  v_settlement jsonb;
  v_action_label text;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_active_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if v_next_status not in (
    'settlement_waiting',
    'settlement_confirmed',
    'settlement_paying',
    'settlement_completed'
  ) then
    raise exception '지원하지 않는 정산 상태입니다: %', p_next_status;
  end if;

  select
    interpreter_id,
    settlement_status
  into
    v_interpreter_id,
    v_previous_status
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

  update public.settlements
  set settlement_status = v_next_status,
      settlement_confirmed_at = case
        when v_next_status = 'settlement_waiting' then null
        else coalesce(settlement_confirmed_at, now())
      end,
      interpreter_payment_started_at = case
        when v_next_status in ('settlement_waiting', 'settlement_confirmed') then null
        else coalesce(interpreter_payment_started_at, now())
      end,
      settlement_completed_at = case
        when v_next_status = 'settlement_completed' then coalesce(settlement_completed_at, now())
        else null
      end,
      updated_at = now()
  where id = p_settlement_id
  returning to_jsonb(settlements.*) into v_settlement;

  select i.auth_user_id
  into v_interpreter_auth_user_id
  from public.interpreters i
  where i.id = v_interpreter_id;

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
      (v_settlement->>'request_id')::bigint,
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
