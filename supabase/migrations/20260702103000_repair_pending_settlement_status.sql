-- Completed work should create pending payout rows; payout_status = paid is only
-- for confirmed payment completion. Repair auto-backfilled rows that were
-- incorrectly classified as paid from legacy request settlement_status values.

create or replace function public.map_legacy_payout_status(p_status text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(nullif(trim(p_status), ''), 'pending'))
    when 'confirmed' then 'confirmed'
    when 'settlement_confirmed' then 'confirmed'
    when '정산확정' then 'confirmed'
    when 'paid' then 'paid'
    when '지급완료' then 'paid'
    when '지급 완료' then 'paid'
    when 'withheld' then 'withheld'
    when 'on_hold' then 'withheld'
    when 'hold' then 'withheld'
    when '보류' then 'withheld'
    when 'cancelled' then 'cancelled'
    when 'canceled' then 'cancelled'
    when '취소' then 'cancelled'
    else 'pending'
  end;
$$;

update public.settlements s
set payout_status = 'pending',
    paid_at = null,
    updated_at = now()
where s.payout_status = 'paid'
  and s.payment_method is null
  and exists (
    select 1
    from public.settlement_logs sl
    where sl.settlement_id = s.id
      and sl.previous_status is null
      and sl.new_status = 'paid'
      and sl.changed_by is null
  )
  and not exists (
    select 1
    from public.settlement_logs sl
    where sl.settlement_id = s.id
      and sl.previous_status is not null
  );

insert into public.settlement_logs (
  settlement_id,
  previous_status,
  new_status,
  changed_by,
  memo
)
select
  s.id,
  'paid',
  'pending',
  null,
  '자동 백필 정산 상태 오분류 보정'
from public.settlements s
where s.payout_status = 'pending'
  and s.payment_method is null
  and not exists (
    select 1
    from public.settlement_logs sl
    where sl.settlement_id = s.id
      and sl.new_status = 'pending'
      and sl.memo = '자동 백필 정산 상태 오분류 보정'
  );

notify pgrst, 'reload schema';
