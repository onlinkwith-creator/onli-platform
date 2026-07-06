-- Keep settlement management classification aligned with requests.settlement_status.
-- The admin UI treats requests.settlement_status as the source of truth.

alter table public.settlements
add column if not exists status text,
add column if not exists settlement_status text;

create or replace function public.map_request_settlement_status_to_payout(status_value text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(status_value, ''))
    when 'confirmed' then 'confirmed'
    when 'settlement_confirmed' then 'confirmed'
    when '정산확정' then 'confirmed'
    when 'fixed' then 'confirmed'
    when 'finalized' then 'confirmed'
    when 'completed' then 'paid'
    when 'paid' then 'paid'
    when 'settlement_completed' then 'paid'
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
  status = r.settlement_status,
  settlement_status = r.settlement_status,
  payout_status = public.map_request_settlement_status_to_payout(r.settlement_status),
  updated_at = now()
from public.requests r
where s.request_id = r.id
  and r.settlement_status is not null
  and (
    s.status is distinct from r.settlement_status
    or s.settlement_status is distinct from r.settlement_status
    or s.payout_status is distinct from public.map_request_settlement_status_to_payout(r.settlement_status)
  );

create or replace function public.sync_settlement_status_from_request()
returns trigger
language plpgsql
as $$
begin
  if new.settlement_status is distinct from old.settlement_status then
    update public.settlements
    set
      status = new.settlement_status,
      settlement_status = new.settlement_status,
      payout_status = public.map_request_settlement_status_to_payout(new.settlement_status),
      updated_at = now()
    where request_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_settlement_status_from_request on public.requests;
create trigger sync_settlement_status_from_request
after update of settlement_status on public.requests
for each row
execute function public.sync_settlement_status_from_request();

notify pgrst, 'reload schema';
