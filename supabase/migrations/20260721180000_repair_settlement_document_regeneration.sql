begin;

create or replace function public.reserve_settlement_statement(
  p_document_type text,
  p_request_id bigint,
  p_interpreter_id bigint default null,
  p_regenerate boolean default false
) returns public.documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.documents;
  v_result public.documents;
  v_no text;
  v_version integer;
  v_settlement uuid;
begin
  if not public.is_active_admin() then
    raise exception using errcode='42501', message='관리자 권한이 필요합니다.';
  end if;
  if p_document_type not in ('settlement_statement','payout_statement') then
    raise exception using errcode='22023', message='지원하지 않는 문서 유형입니다.';
  end if;
  if p_document_type='payout_statement' and p_interpreter_id is null then
    raise exception using errcode='22023', message='통역사 정보가 필요합니다.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_document_type||':'||p_request_id||':'||coalesce(p_interpreter_id,0), 0
  ));

  -- A platform CPU termination cannot run the Edge Function catch block.
  -- Clear abandoned reservations quickly, while retaining a short concurrency lease.
  delete from public.documents
  where document_type=p_document_type
    and request_id=p_request_id
    and coalesce(interpreter_id,0)=coalesce(p_interpreter_id,0)
    and status='draft'
    and created_at<=now()-interval '2 minutes';

  if exists(
    select 1 from public.documents
    where document_type=p_document_type
      and request_id=p_request_id
      and coalesce(interpreter_id,0)=coalesce(p_interpreter_id,0)
      and status='draft'
  ) then
    raise exception using errcode='55000', message='동일 문서를 이미 생성하고 있습니다. 잠시 후 다시 시도해주세요.';
  end if;

  -- A voided prior version still owns the logical document number.
  select * into v_existing
  from public.documents
  where document_type=p_document_type
    and request_id=p_request_id
    and coalesce(interpreter_id,0)=coalesce(p_interpreter_id,0)
    and status in ('issued','voided')
  order by version desc, created_at desc
  limit 1;

  if found and not p_regenerate and v_existing.status='issued' then
    return v_existing;
  end if;

  if p_document_type='payout_statement' then
    select id into v_settlement
    from public.settlements
    where request_id=p_request_id and interpreter_id=p_interpreter_id
    limit 1;
  end if;

  v_no:=coalesce(v_existing.document_no, public.allocate_onli_document_number(p_document_type));
  select coalesce(max(version),0)+1 into v_version
  from public.documents
  where document_type=p_document_type
    and request_id=p_request_id
    and coalesce(interpreter_id,0)=coalesce(p_interpreter_id,0);

  insert into public.documents(
    document_type,document_no,status,version,request_id,interpreter_id,
    settlement_id,title,storage_bucket,file_path,created_by,issued_at
  ) values (
    p_document_type,v_no,'draft',v_version,p_request_id,p_interpreter_id,
    v_settlement::text,
    case p_document_type when 'settlement_statement' then '정산서' else '지급명세서' end,
    'onli-documents','pending/'||gen_random_uuid()::text,auth.uid(),now()
  ) returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.reserve_settlement_statement(text,bigint,bigint,boolean) from public;
grant execute on function public.reserve_settlement_statement(text,bigint,bigint,boolean) to authenticated;

-- Remove reservations left by the confirmed CPU-limit failures.
delete from public.documents
where document_type in ('settlement_statement','payout_statement')
  and status='draft'
  and file_path like 'pending/%';

commit;
notify pgrst, 'reload schema';
