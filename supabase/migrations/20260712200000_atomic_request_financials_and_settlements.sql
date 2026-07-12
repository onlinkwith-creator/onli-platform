begin;

create table if not exists public.settlements_duplicate_backup_20260712
(like public.settlements including defaults including constraints including indexes);
insert into public.settlements_duplicate_backup_20260712
select s.* from public.settlements s where exists (
  select 1 from public.settlements d
  where d.request_id=s.request_id and d.interpreter_id=s.interpreter_id and d.id<>s.id
) on conflict(id) do nothing;

-- Preserve the latest edited amount while retaining irreversible completion data.
with ranked as (
  select s.*,row_number() over(partition by request_id,interpreter_id
    order by updated_at desc nulls last,created_at desc nulls last,id desc) rn
  from public.settlements s
), merged as (
  select request_id,interpreter_id,
    (array_agg(id order by updated_at desc nulls last,created_at desc nulls last,id desc))[1] winner_id,
    max(paid_at) paid_at,max(settlement_confirmed_at) settlement_confirmed_at,
    max(interpreter_payment_started_at) interpreter_payment_started_at,
    max(settlement_completed_at) settlement_completed_at,
    (array_remove(array_agg(payout_document_id order by (payout_document_id is not null) desc,updated_at desc),null))[1] payout_document_id,
    string_agg(distinct nullif(trim(admin_memo),''),E'\n') admin_memo,
    bool_or(payout_status='paid' or settlement_status='settlement_completed') completed
  from ranked group by request_id,interpreter_id having count(*)>1
)
update public.settlements w set
  paid_at=coalesce(w.paid_at,m.paid_at),
  settlement_confirmed_at=coalesce(w.settlement_confirmed_at,m.settlement_confirmed_at),
  interpreter_payment_started_at=coalesce(w.interpreter_payment_started_at,m.interpreter_payment_started_at),
  settlement_completed_at=coalesce(w.settlement_completed_at,m.settlement_completed_at),
  payout_document_id=coalesce(w.payout_document_id,m.payout_document_id),
  admin_memo=coalesce(nullif(m.admin_memo,''),w.admin_memo),
  payout_status=case when m.completed then 'paid' else w.payout_status end,
  settlement_status=case when m.completed then 'settlement_completed' else w.settlement_status end
from merged m where w.id=m.winner_id;

with ranked as (
  select id,row_number() over(partition by request_id,interpreter_id
    order by updated_at desc nulls last,created_at desc nulls last,id desc) rn
  from public.settlements
)
delete from public.settlements s using ranked r where s.id=r.id and r.rn>1;

drop index if exists public.settlements_assignment_key;
drop index if exists public.settlements_request_interpreter_unique;
alter table public.settlements drop constraint if exists settlements_request_interpreter_key;
alter table public.settlements add constraint settlements_request_interpreter_key unique(request_id,interpreter_id);

create or replace function public.save_request_financials(
  p_request_id bigint,p_company_amount numeric,p_interpreter_amount numeric
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_request public.requests%rowtype;
  v_assignment record;
  v_settlement_ids jsonb := '[]'::jsonb;
  v_settlement_id uuid;
  v_work_days integer;
begin
  if not public.is_active_admin() then raise exception using errcode='42501',message='관리자 권한이 필요합니다.'; end if;
  if p_company_amount is not null and p_company_amount<0 then raise exception using errcode='22003',message='기업 금액은 0 이상이어야 합니다.'; end if;
  if p_interpreter_amount is not null and p_interpreter_amount<0 then raise exception using errcode='22003',message='통역사 지급액은 0 이상이어야 합니다.'; end if;

  update public.requests set
    company_amount=p_company_amount,client_price=p_company_amount,
    interpreter_payment=p_interpreter_amount,interpreter_price=p_interpreter_amount,
    settlement_final_amount=p_interpreter_amount,
    platform_profit=case when p_company_amount is null or p_interpreter_amount is null then null else p_company_amount-p_interpreter_amount end,
    profit=case when p_company_amount is null or p_interpreter_amount is null then null else p_company_amount-p_interpreter_amount end,
    updated_at=now()
  where id=p_request_id returning * into v_request;
  if not found then raise exception using errcode='P0002',message='의뢰를 찾을 수 없습니다.'; end if;

  v_work_days:=greatest(coalesce(v_request.settlement_work_days,1),1);
  for v_assignment in
    select ri.id,ri.interpreter_id,i.auth_user_id from public.request_interpreters ri
    join public.interpreters i on i.id=ri.interpreter_id
    where ri.request_id=p_request_id and ri.status='assigned'
    order by ri.assigned_at desc,ri.id desc
  loop
    insert into public.settlements(request_id,interpreter_id,interpreter_auth_user_id,assignment_id,
      amount,work_days,daily_rate,extra_amount,deduction_amount,admin_memo)
    values(p_request_id,v_assignment.interpreter_id,v_assignment.auth_user_id,
      'request_interpreters:'||v_assignment.id::text,coalesce(p_interpreter_amount,0),v_work_days,
      coalesce(p_interpreter_amount,0)/v_work_days,coalesce(v_request.settlement_extra_amount,0),
      coalesce(v_request.settlement_deduction_amount,0),v_request.settlement_memo)
    on conflict(request_id,interpreter_id) do update set
      interpreter_auth_user_id=coalesce(excluded.interpreter_auth_user_id,public.settlements.interpreter_auth_user_id),
      assignment_id=coalesce(public.settlements.assignment_id,excluded.assignment_id),
      amount=excluded.amount,work_days=excluded.work_days,daily_rate=excluded.daily_rate,
      extra_amount=excluded.extra_amount,deduction_amount=excluded.deduction_amount,
      admin_memo=coalesce(excluded.admin_memo,public.settlements.admin_memo),updated_at=now()
    returning id into v_settlement_id;
    v_settlement_ids:=v_settlement_ids||jsonb_build_array(v_settlement_id);
  end loop;

  return jsonb_build_object('success',true,'request',to_jsonb(v_request),
    'settlement_synced',jsonb_array_length(v_settlement_ids)>0,
    'settlement_ids',v_settlement_ids,
    'reason',case when jsonb_array_length(v_settlement_ids)=0 then 'unassigned' else null end);
end;
$$;

revoke all on function public.save_request_financials(bigint,numeric,numeric) from public;
grant execute on function public.save_request_financials(bigint,numeric,numeric) to authenticated;

commit;
notify pgrst,'reload schema';
