alter table public.settlements
add column if not exists settlement_status text default 'settlement_waiting';

update public.settlements
set settlement_status = case
  when settlement_status in ('settlement_waiting', 'waiting', 'pending', 'settlement_pending') then 'settlement_waiting'
  when settlement_status in ('settlement_confirmed', 'confirmed') then 'settlement_confirmed'
  when settlement_status in ('settlement_paying', 'paying', 'payment_started', 'payment_in_progress') then 'settlement_paying'
  when settlement_status in ('settlement_completed', 'completed', 'paid', 'settlement_done', 'payment_completed') then 'settlement_completed'
  else 'settlement_waiting'
end;

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

notify pgrst, 'reload schema';
