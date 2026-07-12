begin;

-- Keep an audit copy before consolidating historical duplicates.
create table if not exists public.settlements_duplicate_backup_20260712
(like public.settlements including defaults including constraints);

insert into public.settlements_duplicate_backup_20260712
select s.*
from public.settlements s
where exists (
  select 1 from public.settlements other
  where other.request_id=s.request_id and other.interpreter_id=s.interpreter_id and other.id<>s.id
)
on conflict (id) do nothing;

-- The winner is the most recently edited row. Merge irreversible payment/completion
-- facts from every duplicate before removing the older physical rows.
with ranked as (
  select s.*,
    row_number() over (partition by request_id,interpreter_id
      order by updated_at desc nulls last,created_at desc nulls last,id desc) rn
  from public.settlements s
), merged as (
  select request_id,interpreter_id,
    (array_agg(id order by updated_at desc nulls last,created_at desc nulls last,id desc))[1] winner_id,
    max(paid_at) paid_at,
    max(settlement_confirmed_at) settlement_confirmed_at,
    max(interpreter_payment_started_at) interpreter_payment_started_at,
    max(settlement_completed_at) settlement_completed_at,
    (array_remove(array_agg(payout_document_id order by (payout_document_id is not null) desc,
      updated_at desc nulls last),null))[1] payout_document_id,
    (array_remove(array_agg(payment_method order by (payment_method is not null) desc,
      updated_at desc nulls last),null))[1] payment_method,
    (array_remove(array_agg(confirmed_by order by (confirmed_by is not null) desc,
      updated_at desc nulls last),null))[1] confirmed_by,
    (array_remove(array_agg(paid_by order by (paid_by is not null) desc,
      updated_at desc nulls last),null))[1] paid_by,
    string_agg(distinct nullif(trim(admin_memo),''), E'\n') admin_memo,
    bool_or(payout_status='paid' or settlement_status='settlement_completed') was_completed
  from ranked group by request_id,interpreter_id having count(*)>1
)
update public.settlements winner set
  paid_at=coalesce(winner.paid_at,m.paid_at),
  settlement_confirmed_at=coalesce(winner.settlement_confirmed_at,m.settlement_confirmed_at),
  interpreter_payment_started_at=coalesce(winner.interpreter_payment_started_at,m.interpreter_payment_started_at),
  settlement_completed_at=coalesce(winner.settlement_completed_at,m.settlement_completed_at),
  payout_document_id=coalesce(winner.payout_document_id,m.payout_document_id),
  payment_method=coalesce(winner.payment_method,m.payment_method),
  confirmed_by=coalesce(winner.confirmed_by,m.confirmed_by),
  paid_by=coalesce(winner.paid_by,m.paid_by),
  admin_memo=coalesce(nullif(m.admin_memo,''),winner.admin_memo),
  payout_status=case when m.was_completed then 'paid' else winner.payout_status end,
  settlement_status=case when m.was_completed then 'settlement_completed' else winner.settlement_status end,
  updated_at=greatest(winner.updated_at,now())
from merged m where winner.id=m.winner_id;

with ranked as (
  select id,row_number() over (partition by request_id,interpreter_id
    order by updated_at desc nulls last,created_at desc nulls last,id desc) rn
  from public.settlements
)
delete from public.settlements s using ranked r where s.id=r.id and r.rn>1;

-- Remove the obsolete assignment-scoped key: settlement identity is request + interpreter.
drop index if exists public.settlements_assignment_key;
drop index if exists public.settlements_request_interpreter_unique;
create unique index settlements_request_interpreter_unique
  on public.settlements(request_id,interpreter_id);

-- One atomic write path for every admin/client that needs to synchronize a row.
create or replace function public.sync_interpreter_settlement(
  p_request_id bigint,
  p_interpreter_id bigint,
  p_amount numeric default null,
  p_settlement_status text default null,
  p_work_days integer default null,
  p_assignment_id text default null
) returns public.settlements
language plpgsql security invoker set search_path=public as $$
declare result public.settlements;
begin
  insert into public.settlements(request_id,interpreter_id,amount,settlement_status,
    payout_status,work_days,daily_rate,assignment_id)
  values(p_request_id,p_interpreter_id,p_amount,p_settlement_status,
    public.map_legacy_payout_status(p_settlement_status),greatest(coalesce(p_work_days,1),1),
    case when coalesce(p_work_days,1)>0 then coalesce(p_amount,0)/greatest(p_work_days,1) else coalesce(p_amount,0) end,
    p_assignment_id)
  on conflict(request_id,interpreter_id) do update set
    amount=coalesce(excluded.amount,public.settlements.amount),
    settlement_status=coalesce(excluded.settlement_status,public.settlements.settlement_status),
    payout_status=case when excluded.settlement_status is null then public.settlements.payout_status else excluded.payout_status end,
    work_days=coalesce(p_work_days,public.settlements.work_days),
    daily_rate=case when excluded.amount is null then public.settlements.daily_rate else excluded.daily_rate end,
    assignment_id=coalesce(public.settlements.assignment_id,excluded.assignment_id)
  returning * into result;
  return result;
end $$;

grant execute on function public.sync_interpreter_settlement(bigint,bigint,numeric,text,integer,text) to authenticated;

commit;
notify pgrst,'reload schema';
