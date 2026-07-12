create or replace function public.ensure_settlements_for_request(target_request_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare
  request_record public.requests%rowtype;
  v_work_days integer;
  v_amount numeric;
  v_daily_rate numeric;
begin
  select * into request_record from public.requests where id=target_request_id;
  if not found then return; end if;

  if not (coalesce(request_record.operation_status,'') in ('completed','operation_completed')
    or coalesce(request_record.assignment_status,'') in ('assigned','preparing','ready')
    or coalesce(request_record.settlement_status,'') in ('pending','confirmed','completed','on_hold')
    or coalesce(request_record.status,'') in ('completed','settlement_pending','settled','업무완료','운영완료','정산대기','정산완료')) then
    return;
  end if;

  v_work_days:=greatest(1,coalesce(request_record.settlement_work_days,1));
  v_amount:=coalesce(request_record.settlement_final_amount,request_record.interpreter_payment,request_record.interpreter_price,0);
  v_daily_rate:=coalesce(request_record.settlement_base_amount,
    nullif(round(v_amount/v_work_days,0),0),v_amount,0);

  insert into public.settlements(request_id,interpreter_id,interpreter_auth_user_id,
    assignment_id,amount,payout_status,work_days,daily_rate,extra_amount,
    deduction_amount,paid_at,admin_memo)
  select ri.request_id,ri.interpreter_id,i.auth_user_id,
    'request_interpreters:'||ri.id::text,v_amount,
    public.map_request_settlement_status_to_payout(coalesce(request_record.settlement_status,'pending')),
    v_work_days,v_daily_rate,coalesce(request_record.settlement_extra_amount,0),
    coalesce(request_record.settlement_deduction_amount,0),request_record.settlement_completed_at,
    request_record.settlement_memo
  from public.request_interpreters ri
  join public.interpreters i on i.id=ri.interpreter_id
  where ri.request_id=target_request_id and ri.status='assigned'
  on conflict on constraint settlements_request_interpreter_key do update set
    interpreter_auth_user_id=coalesce(excluded.interpreter_auth_user_id,public.settlements.interpreter_auth_user_id),
    assignment_id=coalesce(public.settlements.assignment_id,excluded.assignment_id),
    amount=case when public.settlements.payout_status='pending' then excluded.amount else public.settlements.amount end,
    work_days=coalesce(public.settlements.work_days,excluded.work_days),
    daily_rate=case when public.settlements.payout_status='pending' then excluded.daily_rate else public.settlements.daily_rate end,
    extra_amount=case when public.settlements.extra_amount=0 then excluded.extra_amount else public.settlements.extra_amount end,
    deduction_amount=case when public.settlements.deduction_amount=0 then excluded.deduction_amount else public.settlements.deduction_amount end,
    admin_memo=coalesce(public.settlements.admin_memo,excluded.admin_memo),updated_at=now();
end;
$$;

-- Bind the financial RPC explicitly to the same named constraint.
create or replace function public.save_request_financials(
  p_request_id bigint,p_company_amount numeric,p_interpreter_amount numeric
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_request public.requests%rowtype; v_assignment record; v_ids jsonb:='[]'; v_id uuid; v_days integer;
begin
  if not public.is_active_admin() then raise exception using errcode='42501',message='관리자 권한이 필요합니다.'; end if;
  if p_company_amount is not null and p_company_amount<0 then raise exception using errcode='22003',message='기업 금액은 0 이상이어야 합니다.'; end if;
  if p_interpreter_amount is not null and p_interpreter_amount<0 then raise exception using errcode='22003',message='통역사 지급액은 0 이상이어야 합니다.'; end if;
  update public.requests set company_amount=p_company_amount,client_price=p_company_amount,
    interpreter_payment=p_interpreter_amount,interpreter_price=p_interpreter_amount,
    settlement_final_amount=p_interpreter_amount,
    platform_profit=case when p_company_amount is null or p_interpreter_amount is null then null else p_company_amount-p_interpreter_amount end,
    profit=case when p_company_amount is null or p_interpreter_amount is null then null else p_company_amount-p_interpreter_amount end,
    updated_at=now() where id=p_request_id returning * into v_request;
  if not found then raise exception using errcode='P0002',message='의뢰를 찾을 수 없습니다.'; end if;
  v_days:=greatest(coalesce(v_request.settlement_work_days,1),1);
  for v_assignment in select ri.id,ri.interpreter_id,i.auth_user_id from public.request_interpreters ri
    join public.interpreters i on i.id=ri.interpreter_id where ri.request_id=p_request_id and ri.status='assigned'
  loop
    insert into public.settlements(request_id,interpreter_id,interpreter_auth_user_id,assignment_id,
      amount,work_days,daily_rate,extra_amount,deduction_amount,admin_memo)
    values(p_request_id,v_assignment.interpreter_id,v_assignment.auth_user_id,'request_interpreters:'||v_assignment.id,
      coalesce(p_interpreter_amount,0),v_days,coalesce(p_interpreter_amount,0)/v_days,
      coalesce(v_request.settlement_extra_amount,0),coalesce(v_request.settlement_deduction_amount,0),v_request.settlement_memo)
    on conflict on constraint settlements_request_interpreter_key do update set
      interpreter_auth_user_id=coalesce(excluded.interpreter_auth_user_id,public.settlements.interpreter_auth_user_id),
      assignment_id=coalesce(public.settlements.assignment_id,excluded.assignment_id),amount=excluded.amount,
      work_days=excluded.work_days,daily_rate=excluded.daily_rate,extra_amount=excluded.extra_amount,
      deduction_amount=excluded.deduction_amount,admin_memo=coalesce(excluded.admin_memo,public.settlements.admin_memo),updated_at=now()
    returning id into v_id;
    v_ids:=v_ids||jsonb_build_array(v_id);
  end loop;
  return jsonb_build_object('success',true,'request_id',p_request_id,'request',to_jsonb(v_request),
    'settlement_synced',jsonb_array_length(v_ids)>0,'settlement_count',jsonb_array_length(v_ids),
    'settlement_ids',v_ids,'company_amount',p_company_amount,'interpreter_amount',p_interpreter_amount,
    'reason',case when jsonb_array_length(v_ids)=0 then 'unassigned' else null end);
end;
$$;

revoke all on function public.save_request_financials(bigint,numeric,numeric) from public;
grant execute on function public.save_request_financials(bigint,numeric,numeric) to authenticated;
notify pgrst,'reload schema';
