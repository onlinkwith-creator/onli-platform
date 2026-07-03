-- Normalize payout status aliases and keep settlement amounts on interpreter payout basis.

update public.settlements
set payout_status = case
  when lower(trim(payout_status)) in ('completed', 'settlement_completed', 'payout_completed', 'done', 'settled') then 'paid'
  when lower(trim(payout_status)) in ('on_hold', 'hold', 'settlement_on_hold') then 'withheld'
  when lower(trim(payout_status)) in ('canceled') then 'cancelled'
  when lower(trim(payout_status)) in ('settlement_confirmed') then 'confirmed'
  when lower(trim(payout_status)) in ('settlement_pending', 'unpaid') then 'pending'
  else payout_status
end
where lower(trim(payout_status)) in (
  'completed',
  'settlement_completed',
  'payout_completed',
  'done',
  'settled',
  'on_hold',
  'hold',
  'settlement_on_hold',
  'canceled',
  'settlement_confirmed',
  'settlement_pending',
  'unpaid'
);

update public.settlements
set amount = greatest(
      0,
      (coalesce(daily_rate, 0) * greatest(coalesce(work_days, 1), 1))
      + coalesce(extra_amount, 0)
      - coalesce(deduction_amount, 0)
    )
where (amount is null or amount <= 1)
  and coalesce(daily_rate, 0) > 1;

create or replace function public.map_legacy_payout_status(p_status text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_status, 'pending')))
    when 'confirmed' then 'confirmed'
    when 'settlement_confirmed' then 'confirmed'
    when '정산확정' then 'confirmed'
    when 'paid' then 'paid'
    when 'completed' then 'paid'
    when 'settled' then 'paid'
    when 'settlement_completed' then 'paid'
    when 'payout_completed' then 'paid'
    when 'done' then 'paid'
    when '정산완료' then 'paid'
    when 'withheld' then 'withheld'
    when 'on_hold' then 'withheld'
    when 'hold' then 'withheld'
    when 'settlement_on_hold' then 'withheld'
    when '정산보류' then 'withheld'
    when 'cancelled' then 'cancelled'
    when 'canceled' then 'cancelled'
    when '취소' then 'cancelled'
    else 'pending'
  end;
$$;

notify pgrst, 'reload schema';
