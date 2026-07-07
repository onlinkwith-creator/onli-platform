-- Admin settlement status workflow: pending -> confirmed -> paid.

alter table public.settlements
add column if not exists settlement_status text,
add column if not exists settlement_confirmed_at timestamptz,
add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
add column if not exists paid_by uuid references auth.users(id) on delete set null;

update public.settlements
set settlement_status = case
  when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_paid', 'paid', 'completed', 'settlement_completed') then 'settlement_paid'
  when lower(coalesce(settlement_status, payout_status, '')) in ('settlement_confirmed', 'confirmed') then 'settlement_confirmed'
  else 'settlement_pending'
end
where settlement_status is null
   or settlement_status not in ('settlement_pending', 'settlement_confirmed', 'settlement_paid');

create or replace function public.admin_update_settlement_status(
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
  v_payout_status text;
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

  if v_next_status not in ('settlement_pending', 'settlement_confirmed', 'settlement_paid') then
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

  v_previous_status := coalesce(
    v_settlement.settlement_status,
    case
      when v_settlement.payout_status = 'paid' then 'settlement_paid'
      when v_settlement.payout_status = 'confirmed' then 'settlement_confirmed'
      else 'settlement_pending'
    end
  );

  v_payout_status := case
    when v_next_status = 'settlement_paid' then 'paid'
    when v_next_status = 'settlement_confirmed' then 'confirmed'
    else 'pending'
  end;

  v_action_label := case
    when v_next_status = 'settlement_paid' then '지급 완료'
    when v_next_status = 'settlement_confirmed' then '정산 확정'
    else '정산 대기'
  end;

  update public.settlements
  set settlement_status = v_next_status,
      payout_status = v_payout_status,
      settlement_confirmed_at = case
        when v_next_status = 'settlement_confirmed' and settlement_confirmed_at is null then now()
        when v_next_status = 'settlement_paid' and settlement_confirmed_at is null then now()
        when v_next_status = 'settlement_pending' then null
        else settlement_confirmed_at
      end,
      confirmed_by = case
        when v_next_status in ('settlement_confirmed', 'settlement_paid') and confirmed_by is null then v_actor
        when v_next_status = 'settlement_pending' then null
        else confirmed_by
      end,
      paid_at = case
        when v_next_status = 'settlement_paid' then coalesce(paid_at, now())
        when v_next_status = 'settlement_confirmed' then null
        when v_next_status = 'settlement_pending' then null
        else paid_at
      end,
      paid_by = case
        when v_next_status = 'settlement_paid' then v_actor
        when v_next_status in ('settlement_confirmed', 'settlement_pending') then null
        else paid_by
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
        when v_next_status = 'settlement_confirmed' and settlement_confirmed_at is null then now()
        when v_next_status = 'settlement_paid' and settlement_confirmed_at is null then now()
        when v_next_status = 'settlement_pending' then null
        else settlement_confirmed_at
      end,
      settlement_completed_at = case
        when v_next_status = 'settlement_paid' then coalesce(settlement_completed_at, now())
        when v_next_status in ('settlement_confirmed', 'settlement_pending') then null
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
    case
      when v_next_status = 'settlement_paid' then 'settlement_paid'
      when v_next_status = 'settlement_confirmed' then 'settlement_confirmed'
      else 'settlement_pending'
    end,
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
      case
        when v_next_status = 'settlement_paid' then 'interpreter_settlement_paid'
        when v_next_status = 'settlement_confirmed' then 'interpreter_settlement_confirmed'
        else 'interpreter_settlement_pending'
      end,
      v_action_label,
      case
        when v_next_status = 'settlement_paid' then '정산 지급이 완료되었습니다.'
        when v_next_status = 'settlement_confirmed' then '정산이 확정되었습니다.'
        else '정산 상태가 대기로 변경되었습니다.'
      end,
      v_request_id,
      'internal',
      'pending'
    );
  end if;

  return jsonb_build_object(
    'settlement_id', p_settlement_id,
    'request_id', v_request_id,
    'previous_status', v_previous_status,
    'settlement_status', v_next_status,
    'payout_status', v_payout_status,
    'settlement_confirmed_at', v_settlement.settlement_confirmed_at,
    'paid_at', v_settlement.paid_at
  );
end;
$$;

revoke all on function public.admin_update_settlement_status(uuid, text) from public;
revoke all on function public.admin_update_settlement_status(uuid, text) from anon;
grant execute on function public.admin_update_settlement_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';
