begin;

alter table public.documents
  add column if not exists issued_at timestamptz;

update public.documents
set issued_at = coalesce(issued_at, created_at, now())
where issued_at is null;

alter table public.documents
  alter column issued_at set default now(),
  alter column issued_at set not null;

alter table public.settlements
  add column if not exists payout_due_date date;

alter table public.document_counters drop constraint if exists document_counters_document_type_check;
alter table public.documents drop constraint if exists documents_document_type_check;

alter table public.document_counters add constraint document_counters_document_type_check
  check (document_type in ('estimate','completion','payout','settlement_statement','payout_statement'));
alter table public.documents add constraint documents_document_type_check
  check (document_type in ('estimate','completion','payout','settlement_statement','payout_statement'));

insert into public.document_counters(document_type,prefix,last_number) values
  ('settlement_statement','ONLI-STM',0),
  ('payout_statement','ONLI-PAY',0)
on conflict(document_type) do nothing;

create or replace function public.allocate_onli_document_number(p_document_type text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_number bigint; v_prefix text;
begin
  if not public.is_active_admin() then
    raise exception using errcode='42501',message='관리자 권한이 필요합니다.';
  end if;
  if p_document_type not in ('estimate','completion','payout','settlement_statement','payout_statement') then
    raise exception using errcode='22023',message='지원하지 않는 문서 유형입니다.';
  end if;
  insert into public.document_counters(document_type,prefix,last_number)
  values(p_document_type,case p_document_type when 'estimate' then 'ONLI-EST' when 'completion' then 'ONLI-COM'
    when 'settlement_statement' then 'ONLI-STM' else 'ONLI-PAY' end,0)
  on conflict(document_type) do nothing;
  update public.document_counters set last_number=last_number+1,updated_at=now()
    where document_type=p_document_type returning last_number,prefix into v_number,v_prefix;
  return rtrim(v_prefix,'-')||'-'||lpad(v_number::text,4,'0');
end $$;

revoke all on function public.allocate_onli_document_number(text) from public;
grant execute on function public.allocate_onli_document_number(text) to authenticated;

-- A logical statement has one current version. Payout statements are scoped per interpreter.
create unique index if not exists documents_settlement_statement_version_key
  on public.documents(document_type,request_id,coalesce(interpreter_id,0),version)
  where document_type in ('settlement_statement','payout_statement');

create or replace function public.reserve_settlement_statement(
  p_document_type text,p_request_id bigint,p_interpreter_id bigint default null,p_regenerate boolean default false
) returns public.documents language plpgsql security definer set search_path=public,pg_temp as $$
declare v_existing public.documents; v_result public.documents; v_no text; v_version integer; v_settlement uuid;
begin
  if not public.is_active_admin() then raise exception using errcode='42501',message='관리자 권한이 필요합니다.'; end if;
  if p_document_type not in ('settlement_statement','payout_statement') then raise exception using errcode='22023',message='지원하지 않는 문서 유형입니다.'; end if;
  if p_document_type='payout_statement' and p_interpreter_id is null then raise exception using errcode='22023',message='통역사 정보가 필요합니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_document_type||':'||p_request_id||':'||coalesce(p_interpreter_id,0),0));
  if exists(select 1 from public.documents where document_type=p_document_type and request_id=p_request_id
    and coalesce(interpreter_id,0)=coalesce(p_interpreter_id,0) and status='draft'
    and created_at>now()-interval '10 minutes') then
    raise exception using errcode='55000',message='동일 문서를 이미 생성하고 있습니다. 잠시 후 다시 시도해주세요.';
  end if;
  delete from public.documents where document_type=p_document_type and request_id=p_request_id
    and coalesce(interpreter_id,0)=coalesce(p_interpreter_id,0) and status='draft'
    and created_at<=now()-interval '10 minutes';
  select * into v_existing from public.documents where document_type=p_document_type and request_id=p_request_id
    and coalesce(interpreter_id,0)=coalesce(p_interpreter_id,0) and status='issued'
    order by version desc,created_at desc limit 1;
  if found and not p_regenerate then return v_existing; end if;
  if p_document_type='payout_statement' then
    select id into v_settlement from public.settlements where request_id=p_request_id and interpreter_id=p_interpreter_id limit 1;
  end if;
  v_no:=coalesce(v_existing.document_no,public.allocate_onli_document_number(p_document_type));
  select coalesce(max(version),0)+1 into v_version from public.documents where document_type=p_document_type
    and request_id=p_request_id and coalesce(interpreter_id,0)=coalesce(p_interpreter_id,0);
  insert into public.documents(document_type,document_no,status,version,request_id,interpreter_id,settlement_id,
    title,storage_bucket,file_path,created_by,issued_at)
  values(p_document_type,v_no,'draft',v_version,p_request_id,p_interpreter_id,v_settlement::text,
    case p_document_type when 'settlement_statement' then '정산서' else '지급명세서' end,
    'onli-documents','pending/'||gen_random_uuid()::text,auth.uid(),now()) returning * into v_result;
  return v_result;
end $$;
revoke all on function public.reserve_settlement_statement(text,bigint,bigint,boolean) from public;
grant execute on function public.reserve_settlement_statement(text,bigint,bigint,boolean) to authenticated;

drop policy if exists "Companies can read own settlement statements" on public.documents;
create policy "Companies can read own settlement statements" on public.documents for select to authenticated
using(document_type='settlement_statement' and status='issued' and exists(
  select 1 from public.requests r join public.businesses b on b.auth_user_id=auth.uid()
  where r.id=documents.request_id and r.company_auth_user_id=b.auth_user_id));

drop policy if exists "Interpreters can read own payout statements" on public.documents;
create policy "Interpreters can read own payout statements" on public.documents for select to authenticated
using(document_type='payout_statement' and status='issued' and exists(
  select 1 from public.interpreters i join public.request_interpreters ri on ri.interpreter_id=i.id
  where i.id=documents.interpreter_id and i.auth_user_id=auth.uid()
    and ri.request_id=documents.request_id and ri.status='assigned'));

drop policy if exists "Statement owners can read private files" on storage.objects;
create policy "Statement owners can read private files" on storage.objects for select to authenticated using(
  bucket_id='onli-documents' and exists(select 1 from public.documents d where d.storage_bucket=bucket_id
    and d.file_path=name and d.status='issued' and (
      (d.document_type='settlement_statement' and exists(select 1 from public.requests r
        where r.id=d.request_id and r.company_auth_user_id=auth.uid())) or
      (d.document_type='payout_statement' and exists(select 1 from public.interpreters i
        join public.request_interpreters ri on ri.interpreter_id=i.id
        where i.id=d.interpreter_id and i.auth_user_id=auth.uid() and ri.request_id=d.request_id and ri.status='assigned'))
    )));

commit;
notify pgrst,'reload schema';
