-- Settlement management uses requests.settlement_status as the source of truth.
-- Keep settlement rows aligned so helper screens and legacy reads do not drift.

create or replace function public.map_request_settlement_status_to_payout(status_value text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(nullif(trim(status_value), ''), 'pending'))
    when 'confirmed' then 'confirmed'
    when 'settlement_confirmed' then 'confirmed'
    when 'finalized' then 'confirmed'
    when 'fixed' then 'confirmed'
    when '정산확정' then 'confirmed'
    when 'completed' then 'paid'
    when 'paid' then 'paid'
    when 'settlement_completed' then 'paid'
    when 'payment_completed' then 'paid'
    when '정산완료' then 'paid'
    when '지급완료' then 'paid'
    when 'hold' then 'withheld'
    when 'on_hold' then 'withheld'
    when 'settlement_hold' then 'withheld'
    when '정산보류' then 'withheld'
    else 'pending'
  end
$$;

update public.settlements s
set
  settlement_status = r.settlement_status,
  status = r.settlement_status,
  payout_status = public.map_request_settlement_status_to_payout(r.settlement_status),
  updated_at = now()
from public.requests r
where s.request_id = r.id
  and r.settlement_status is not null
  and (
    s.settlement_status is distinct from r.settlement_status
    or s.status is distinct from r.settlement_status
    or s.payout_status is distinct from public.map_request_settlement_status_to_payout(r.settlement_status)
  );

notify pgrst, 'reload schema';
