begin;

create table public.assignment_offers (
 id uuid primary key default gen_random_uuid(),
 request_id bigint not null references public.requests(id) on delete cascade,
 application_id uuid not null references public.job_applications(id) on delete cascade,
 interpreter_id bigint not null references public.interpreters(id) on delete cascade,
 proposed_by uuid not null,
 amount numeric not null check(amount>0 and amount<=100000000 and amount=trunc(amount)),
 terms jsonb not null,
 status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled','expired')),
 expires_at timestamptz not null default now()+interval '24 hours',
 created_at timestamptz not null default now(),responded_at timestamptz,
 assignment_id bigint references public.request_interpreters(id) on delete set null
);
create unique index assignment_offer_pending_pair on public.assignment_offers(request_id,interpreter_id) where status='pending';
create index assignment_offer_capacity on public.assignment_offers(request_id,expires_at) where status='pending';
alter table public.assignment_offers enable row level security;
revoke all on public.assignment_offers from public,anon,authenticated;

create table public.assignment_completions (
 assignment_id bigint primary key references public.request_interpreters(id) on delete cascade,
 request_id bigint not null references public.requests(id) on delete cascade,
 interpreter_id bigint not null references public.interpreters(id) on delete cascade,
 status text not null default 'submitted' check(status in ('submitted','confirmed','revision_requested')),
 report text not null,review_note text,
 submitted_at timestamptz not null default now(),confirmed_at timestamptz,confirmed_by uuid
);
alter table public.assignment_completions enable row level security;
revoke all on public.assignment_completions from public,anon,authenticated;
alter table public.request_interpreters add column agreed_total_amount numeric;
alter table public.settlements add column work_confirmed_at timestamptz;

-- Legacy callers must not bypass the interpreter's response.
revoke all on function public.assign_company_applicant(bigint,uuid) from authenticated;

create function public.workflow_event_started(p_request_id bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(lower(public.company_assignment_window(r.id)) < (now() at time zone 'Asia/Seoul')::date
 or (lower(public.company_assignment_window(r.id))=(now() at time zone 'Asia/Seoul')::date
  and case when r.event_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
   then r.event_start_time::time else '00:00'::time end <= (now() at time zone 'Asia/Seoul')::time),true)
 from public.requests r where r.id=p_request_id;
$$;
revoke all on function public.workflow_event_started(bigint) from public,anon,authenticated;

create or replace function public.guard_assignment_capacity() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare required integer; active_count integer; reserved_count integer;
begin
 select greatest(coalesce(requested_people_count,required_count,1),1) into required
 from public.requests where id=new.request_id for update;
 if not found then raise exception 'ASSIGNMENT_REQUEST_NOT_FOUND'; end if;
 perform 1 from public.interpreters where id=new.interpreter_id for update;
 if new.status='assigned' and not exists(select 1 from public.request_interpreters
  where request_id=new.request_id and interpreter_id=new.interpreter_id and status='assigned') then
  select count(*) into active_count from public.request_interpreters where request_id=new.request_id and status='assigned';
  select count(*) into reserved_count from public.assignment_offers where request_id=new.request_id
   and status='pending' and expires_at>now() and interpreter_id<>new.interpreter_id;
  if active_count+reserved_count>=required then raise exception 'ASSIGNMENT_CAPACITY_FULL'; end if;
 end if;
 return new;
end;
$$;

create function public.propose_company_assignment(p_request_id bigint,p_application_id uuid,p_amount numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.requests%rowtype; a public.job_applications%rowtype; o public.assignment_offers%rowtype;
 event_window daterange; terms jsonb; required integer;
begin
 if not public.portal_owns_request(p_request_id) then raise exception 'ASSIGNMENT_FORBIDDEN' using errcode='42501'; end if;
 select * into r from public.requests where id=p_request_id for update;
 select * into a from public.job_applications where id=p_application_id and job_id=r.job_id for update;
 if not found or a.interpreter_id is null then raise exception 'ASSIGNMENT_INVALID_APPLICATION'; end if;
 if p_amount is null or p_amount<=0 or p_amount>100000000 or p_amount<>trunc(p_amount) then raise exception 'WORKFLOW_INVALID_AMOUNT'; end if;
 if a.status not in ('pending','reviewing','accepted','approved') then raise exception 'ASSIGNMENT_APPLICATION_UNAVAILABLE'; end if;
 if not exists(select 1 from public.public_interpreters where id=a.interpreter_id)
 or exists(select 1 from public.interpreters where id=a.interpreter_id and coalesce(activity_status,'active') not in ('active','활동중'))
 then raise exception 'ASSIGNMENT_INTERPRETER_UNAVAILABLE'; end if;
 if exists(select 1 from public.request_interpreters where request_id=r.id and interpreter_id=a.interpreter_id)
 then raise exception 'ASSIGNMENT_ADMIN_REQUIRED'; end if;
 event_window:=public.company_assignment_window(r.id);
 if event_window is null or lower_inf(event_window) or upper_inf(event_window) or isempty(event_window)
 then raise exception 'ASSIGNMENT_SCHEDULE_MISSING'; end if;
 if public.workflow_event_started(r.id)
 or lower(concat_ws(' ',r.status,r.operation_status)) ~ '(cancel|complete|finished|in_progress|취소|완료|진행중|운영중)'
 then raise exception 'ASSIGNMENT_REQUEST_CLOSED'; end if;
 update public.assignment_offers set status='expired',responded_at=now()
 where request_id=r.id and status='pending' and expires_at<=now();
 select * into o from public.assignment_offers where request_id=r.id and interpreter_id=a.interpreter_id and status='pending';
 if found then
  if o.amount is distinct from p_amount then raise exception 'WORKFLOW_CANCEL_OFFER_FIRST'; end if;
  return jsonb_build_object('offer_id',o.id,'status',o.status);
 end if;
 required:=greatest(coalesce(r.requested_people_count,r.required_count,1),1);
 if (select count(*) from public.request_interpreters where request_id=r.id and status='assigned')
  +(select count(*) from public.assignment_offers where request_id=r.id and status='pending' and expires_at>now())>=required
 then raise exception 'ASSIGNMENT_CAPACITY_FULL'; end if;
 terms:=jsonb_build_object('event_name',r.event_name,'start_date',lower(event_window),'end_date',upper(event_window)-1,
  'location',coalesce(to_jsonb(r)->>'event_location',to_jsonb(r)->>'location'),
  'work_hours',to_jsonb(r)->>'work_hours','start_time',to_jsonb(r)->>'event_start_time',
  'end_time',to_jsonb(r)->>'event_end_time','currency','KRW','amount_basis','전체 일정 기준 세전 보수');
 insert into public.assignment_offers(request_id,application_id,interpreter_id,proposed_by,amount,terms,expires_at)
 values(r.id,a.id,a.interpreter_id,auth.uid(),p_amount,terms,
  least(now()+interval '24 hours',(lower(event_window)+
   case when r.event_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
    then r.event_start_time::time else '00:00'::time end) at time zone 'Asia/Seoul')) returning * into o;
 return jsonb_build_object('offer_id',o.id,'status','pending');
end;
$$;
revoke all on function public.propose_company_assignment(bigint,uuid,numeric) from public,anon;
grant execute on function public.propose_company_assignment(bigint,uuid,numeric) to authenticated;

create function public.respond_assignment_offer(p_offer_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.assignment_offers%rowtype; r public.requests%rowtype; a public.job_applications%rowtype;
 event_window daterange; assignment_key bigint; previous_context text;
begin
 select * into o from public.assignment_offers where id=p_offer_id;
 if not found or not public.portal_owns_interpreter(o.interpreter_id) then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501'; end if;
 -- Same lock order as canonical assignment creation; re-read after waiting.
 select * into r from public.requests where id=o.request_id for update;
 perform 1 from public.interpreters where id=o.interpreter_id for update;
 select * into o from public.assignment_offers where id=p_offer_id for update;
 if o.status='accepted' and p_accept then return jsonb_build_object('status','accepted','assignment_id',o.assignment_id); end if;
 if o.status<>'pending' then raise exception 'WORKFLOW_OFFER_CLOSED'; end if;
 if o.expires_at<=now() then
  update public.assignment_offers set status='expired',responded_at=now() where id=o.id;
  return jsonb_build_object('status','expired');
 end if;
 if p_accept is null then raise exception 'WORKFLOW_INVALID_RESPONSE'; end if;
 if not p_accept then
  update public.assignment_offers set status='declined',responded_at=now() where id=o.id;
  return jsonb_build_object('status','declined');
 end if;
 if not exists(select 1 from public.businesses b where b.status='승인 완료'
  and (b.id=r.company_id or b.auth_user_id=r.company_auth_user_id))
 then raise exception 'ASSIGNMENT_FORBIDDEN'; end if;
 select * into a from public.job_applications where id=o.application_id and job_id=r.job_id and interpreter_id=o.interpreter_id for update;
 if not found or a.status not in ('pending','reviewing','accepted','approved') then raise exception 'ASSIGNMENT_APPLICATION_UNAVAILABLE'; end if;
 if not exists(select 1 from public.public_interpreters where id=o.interpreter_id)
 or exists(select 1 from public.interpreters where id=o.interpreter_id and coalesce(activity_status,'active') not in ('active','활동중'))
 then raise exception 'ASSIGNMENT_INTERPRETER_UNAVAILABLE'; end if;
 event_window:=public.company_assignment_window(r.id);
 if public.workflow_event_started(r.id)
 or lower(concat_ws(' ',r.status,r.operation_status)) ~ '(cancel|complete|finished|in_progress|취소|완료|진행중|운영중)'
 then raise exception 'ASSIGNMENT_REQUEST_CLOSED'; end if;
 if (o.terms->>'start_date')::date is distinct from lower(event_window)
 or (o.terms->>'end_date')::date is distinct from upper(event_window)-1
 or o.terms->>'location' is distinct from coalesce(to_jsonb(r)->>'event_location',to_jsonb(r)->>'location')
 or o.terms->>'work_hours' is distinct from to_jsonb(r)->>'work_hours'
 or o.terms->>'start_time' is distinct from to_jsonb(r)->>'event_start_time'
 or o.terms->>'end_time' is distinct from to_jsonb(r)->>'event_end_time'
 then raise exception 'WORKFLOW_TERMS_CHANGED'; end if;
 if exists(select 1 from public.request_interpreters ri join public.requests other on other.id=ri.request_id
  where ri.interpreter_id=o.interpreter_id and ri.status='assigned' and ri.request_id<>r.id
   and lower(concat_ws(' ',other.status,other.operation_status)) !~ '(cancel|취소)'
   and public.company_assignment_window(other.id) && event_window)
 or exists(select 1 from public.matchings m where m.interpreter_id=o.interpreter_id
  and m.status in ('assigned','confirmed','in_progress') and m.request_id is distinct from r.id
  and m.job_id is distinct from r.job_id and m.start_date<=upper(event_window)-1 and m.end_date>=lower(event_window))
 then raise exception 'ASSIGNMENT_SCHEDULE_CONFLICT'; end if;
 if exists(select 1 from public.request_interpreters where request_id=r.id and interpreter_id=o.interpreter_id)
 then raise exception 'ASSIGNMENT_ADMIN_REQUIRED'; end if;
 previous_context:=current_setting('app.onli_self_service',true);
 perform set_config('app.onli_self_service','interpreter_acceptance',true);
 update public.assignment_offers set status='accepted',responded_at=now() where id=o.id;
 insert into public.request_interpreters(request_id,interpreter_id,status,contact_visible,agreed_total_amount)
 values(r.id,o.interpreter_id,'assigned',false,o.amount) returning id into assignment_key;
 update public.job_applications set status='accepted' where id=a.id;
 update public.assignment_offers set assignment_id=assignment_key where id=o.id;
 perform set_config('app.onli_self_service',coalesce(previous_context,''),true);
 return jsonb_build_object('status','accepted','assignment_id',assignment_key);
end;
$$;
revoke all on function public.respond_assignment_offer(uuid,boolean) from public,anon;
grant execute on function public.respond_assignment_offer(uuid,boolean) to authenticated;

create function public.cancel_assignment_offer(p_offer_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.assignment_offers%rowtype;
begin
 select * into o from public.assignment_offers where id=p_offer_id;
 if not found or not (public.portal_owns_request(o.request_id) or public.is_active_admin()) then
  raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.requests where id=o.request_id for update;
 select * into o from public.assignment_offers where id=p_offer_id for update;
 if o.status<>'pending' then raise exception 'WORKFLOW_OFFER_CLOSED'; end if;
 update public.assignment_offers set status='cancelled',responded_at=now() where id=o.id;
end;
$$;
revoke all on function public.cancel_assignment_offer(uuid) from public,anon;
grant execute on function public.cancel_assignment_offer(uuid) to authenticated;

create function public.get_my_assignment_offers() returns setof jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',o.id,'request_id',o.request_id,'amount',o.amount,'terms',o.terms,
  'status',case when o.status='pending' and o.expires_at<=now() then 'expired' else o.status end,
  'expires_at',o.expires_at,'company_name',r.company_name,'interpreter_name',i.name)
 from public.assignment_offers o join public.requests r on r.id=o.request_id
 join public.interpreters i on i.id=o.interpreter_id
 where public.portal_owns_request(o.request_id) or public.portal_owns_interpreter(o.interpreter_id) or public.is_active_admin()
 order by o.created_at desc;
$$;
revoke all on function public.get_my_assignment_offers() from public,anon;
grant execute on function public.get_my_assignment_offers() to authenticated;

-- Keep the established applicant-profile allowlist and add only offer metadata.
alter function public.get_company_portal_applicants(bigint) rename to get_company_portal_applicants_base;
revoke all on function public.get_company_portal_applicants_base(bigint) from public,anon,authenticated;
create function public.get_company_portal_applicants(p_request_id bigint) returns setof jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select item||jsonb_build_object('reserved_count',(select count(*) from public.assignment_offers
  where request_id=p_request_id and status='pending' and expires_at>now()),
  'offer',(select jsonb_build_object('id',o.id,'amount',o.amount,'status',
   case when o.status='pending' and o.expires_at<=now() then 'expired' else o.status end,'expires_at',o.expires_at)
   from public.assignment_offers o where o.request_id=p_request_id and o.application_id=(item->>'id')::uuid
   order by o.created_at desc limit 1))
 from public.get_company_portal_applicants_base(p_request_id) item;
$$;
revoke all on function public.get_company_portal_applicants(bigint) from public,anon;
grant execute on function public.get_company_portal_applicants(bigint) to authenticated;

create function public.auto_publish_company_request() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare job_key uuid; payload jsonb; columns_sql text; values_sql text; previous_context text;
begin
 if new.job_id is not null or coalesce(new.request_type,'general')<>'general'
 or new.start_date is null or new.end_date is null or new.end_date<new.start_date
 or public.workflow_event_started(new.id)
 or nullif(btrim(new.event_name),'') is null or nullif(btrim(new.event_location),'') is null
 or not exists(select 1 from public.businesses b where b.status='승인 완료'
  and (b.id=new.company_id or b.auth_user_id=new.company_auth_user_id)) then return new; end if;
 -- Publish structured event fields, not private client notes/contacts/reference files.
 payload:=jsonb_build_object('title',new.event_name||' 통역 모집','event_name',new.event_name,
  'company_name',new.company_name,'start_date',new.start_date,'end_date',new.end_date,'event_date',new.start_date,
  'date',new.start_date::text||' ~ '||new.end_date::text,'location',new.event_location,'event_location',new.event_location,
  'people_count',greatest(coalesce(new.requested_people_count,new.required_count,1),1),
  'people',greatest(coalesce(new.requested_people_count,new.required_count,1),1)::text||'명',
  'level',coalesce(new.requested_level,new.required_level),'requested_level',coalesce(new.requested_level,new.required_level),
  'language',coalesce(nullif(to_jsonb(new)->>'language_direction',''),'한국어 ↔ 일본어'),
  'field',coalesce(to_jsonb(new)->>'interpretation_field',to_jsonb(new)->>'job_field'),
  'pay','협의','status','recruiting','visibility','public','assignment_status','assignment_pending','operation_status','operation_before');
 select string_agg(format('%I',key),','),string_agg(format('v.%I',key),',') into columns_sql,values_sql
 from jsonb_object_keys(payload) key join information_schema.columns c
 on c.table_schema='public' and c.table_name='jobs' and c.column_name=key;
 execute format('insert into public.jobs (%s) select %s from jsonb_populate_record(null::public.jobs,$1) v returning id',columns_sql,values_sql)
 into job_key using payload;
 previous_context:=current_setting('app.onli_self_service',true);
 perform set_config('app.onli_self_service','company_publication',true);
 update public.requests set job_id=job_key,is_public=true,is_job_public=true where id=new.id;
 perform set_config('app.onli_self_service',coalesce(previous_context,''),true);
 return new;
end;
$$;
revoke all on function public.auto_publish_company_request() from public,anon,authenticated;
create trigger auto_publish_company_request after insert on public.requests
for each row execute function public.auto_publish_company_request();

create function public.workflow_event_finished(p_request_id bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(upper(public.company_assignment_window(r.id))-1 < (now() at time zone 'Asia/Seoul')::date
 or (upper(public.company_assignment_window(r.id))-1=(now() at time zone 'Asia/Seoul')::date
  and case when r.event_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
   then r.event_end_time::time <= (now() at time zone 'Asia/Seoul')::time else false end),false)
 from public.requests r where r.id=p_request_id;
$$;
revoke all on function public.workflow_event_finished(bigint) from public,anon,authenticated;

create function public.submit_assignment_completion(p_assignment_id bigint,p_report text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.request_interpreters%rowtype; current_status text;
begin
 select * into a from public.request_interpreters where id=p_assignment_id;
 if not found or a.status<>'assigned' or not public.portal_owns_interpreter(a.interpreter_id) then
  raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.requests where id=a.request_id for update;
 select * into a from public.request_interpreters where id=p_assignment_id for update;
 if a.status<>'assigned' or not public.portal_owns_interpreter(a.interpreter_id) then raise exception 'WORKFLOW_FORBIDDEN'; end if;
 if not public.workflow_event_finished(a.request_id) then raise exception 'WORKFLOW_EVENT_NOT_FINISHED'; end if;
 if exists(select 1 from public.requests where id=a.request_id and lower(concat_ws(' ',status,operation_status)) ~ '(cancel|취소)') then raise exception 'ASSIGNMENT_REQUEST_CLOSED'; end if;
 if nullif(btrim(p_report),'') is null or length(p_report)>2000 then raise exception 'WORKFLOW_REPORT_REQUIRED'; end if;
 select status into current_status from public.assignment_completions where assignment_id=a.id;
 if current_status='confirmed' then raise exception 'WORKFLOW_COMPLETION_CONFIRMED'; end if;
 if current_status='submitted' then return; end if;
 insert into public.assignment_completions(assignment_id,request_id,interpreter_id,report)
 values(a.id,a.request_id,a.interpreter_id,btrim(p_report))
 on conflict(assignment_id) do update set status='submitted',report=excluded.report,submitted_at=now(),review_note=null;
end;
$$;
revoke all on function public.submit_assignment_completion(bigint,text) from public,anon;
grant execute on function public.submit_assignment_completion(bigint,text) to authenticated;

create function public.review_assignment_completion(p_assignment_id bigint,p_confirm boolean,p_note text default '') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.assignment_completions%rowtype; previous_context text;
begin
 select * into c from public.assignment_completions where assignment_id=p_assignment_id;
 if not found or not public.portal_owns_request(c.request_id) then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.requests where id=c.request_id for update;
 select * into c from public.assignment_completions where assignment_id=p_assignment_id for update;
 if not public.portal_owns_request(c.request_id) then raise exception 'WORKFLOW_FORBIDDEN' using errcode='42501'; end if;
 if exists(select 1 from public.requests where id=c.request_id and lower(concat_ws(' ',status,operation_status)) ~ '(cancel|취소)')
 then raise exception 'ASSIGNMENT_REQUEST_CLOSED'; end if;
 if c.status='confirmed' and p_confirm then return; end if;
 if c.status<>'submitted' or p_confirm is null then raise exception 'WORKFLOW_COMPLETION_NOT_SUBMITTED'; end if;
 if not exists(select 1 from public.request_interpreters where id=c.assignment_id and status='assigned') then raise exception 'ASSIGNMENT_REQUEST_CLOSED'; end if;
 if not public.workflow_event_finished(c.request_id) then raise exception 'WORKFLOW_EVENT_NOT_FINISHED'; end if;
 if not p_confirm then
  if nullif(btrim(p_note),'') is null or length(p_note)>2000 then raise exception 'WORKFLOW_REVIEW_NOTE_REQUIRED'; end if;
  update public.assignment_completions set status='revision_requested',review_note=btrim(p_note) where assignment_id=c.assignment_id;
  return;
 end if;
 update public.assignment_completions set status='confirmed',confirmed_at=now(),confirmed_by=auth.uid(),review_note=null where assignment_id=c.assignment_id;
 -- Work confirmation is not proof of a payment or payout.
 update public.settlements set work_confirmed_at=now() where request_id=c.request_id and interpreter_id=c.interpreter_id;
 if not exists(select 1 from public.request_interpreters a where a.request_id=c.request_id and a.status='assigned'
  and not exists(select 1 from public.assignment_completions done where done.assignment_id=a.id and done.status='confirmed')) then
  previous_context:=current_setting('app.onli_self_service',true);
  perform set_config('app.onli_self_service','company_completion',true);
  update public.requests set operation_status='operation_completed',updated_at=now() where id=c.request_id;
  update public.jobs set operation_status='operation_completed' where id=(select job_id from public.requests where id=c.request_id);
  perform set_config('app.onli_self_service',coalesce(previous_context,''),true);
 end if;
end;
$$;
revoke all on function public.review_assignment_completion(bigint,boolean,text) from public,anon;
grant execute on function public.review_assignment_completion(bigint,boolean,text) to authenticated;

create function public.get_my_work_completions() returns setof jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('assignment_id',a.id,'request_id',r.id,'request_no',r.request_no,
 'event_name',r.event_name,'interpreter_name',i.name,'agreed_total_amount',a.agreed_total_amount,
 'can_submit',public.workflow_event_finished(r.id) and lower(concat_ws(' ',r.status,r.operation_status)) !~ '(cancel|취소)',
 'status',coalesce(c.status,'not_submitted'),'report',c.report,'review_note',c.review_note,
 'confirmed_at',c.confirmed_at,'start_date',lower(public.company_assignment_window(r.id)),
 'end_date',upper(public.company_assignment_window(r.id))-1)
 from public.request_interpreters a join public.requests r on r.id=a.request_id join public.interpreters i on i.id=a.interpreter_id
 left join public.assignment_completions c on c.assignment_id=a.id
 where a.status='assigned' and (public.portal_owns_request(r.id) or public.portal_owns_interpreter(a.interpreter_id) or public.is_active_admin())
 order by a.assigned_at desc;
$$;
revoke all on function public.get_my_work_completions() from public,anon;
grant execute on function public.get_my_work_completions() to authenticated;

create or replace function public.count_onli_completed_work(p_id bigint) returns integer
language sql stable security definer set search_path=public,pg_temp as $$
 select count(distinct credit)::integer from (
  select 'request:'||r.id as credit from public.request_interpreters a join public.requests r on r.id=a.request_id
  where a.interpreter_id=p_id and public.onli_credit_completed(to_jsonb(r)) and not public.onli_credit_excluded(to_jsonb(a))
  union
  select 'request:'||r.id from public.assignment_completions c join public.requests r on r.id=c.request_id
  join public.request_interpreters a on a.id=c.assignment_id
  where c.interpreter_id=p_id and c.status='confirmed' and a.status='assigned'
   and not public.onli_credit_excluded(to_jsonb(r)) and not public.onli_credit_excluded(to_jsonb(a))
  union
  select 'request:'||r.id from public.requests r
  where coalesce(to_jsonb(r)->>'assigned_interpreter_id',to_jsonb(r)->>'matched_interpreter_id')=p_id::text
   and public.onli_credit_completed(to_jsonb(r))
   and not exists(select 1 from public.request_interpreters a where a.request_id=r.id and a.interpreter_id=p_id and public.onli_credit_excluded(to_jsonb(a)))
  union
  select case when m.request_id is not null then 'request:'||m.request_id when m.job_id is not null then 'job:'||m.job_id else 'matching:'||m.id end
  from public.matchings m left join public.requests r on r.id=m.request_id left join public.jobs j on j.id=m.job_id
  where m.interpreter_id=p_id and not public.onli_credit_excluded(to_jsonb(m)) and not public.onli_credit_excluded(coalesce(to_jsonb(j),'{}'::jsonb))
   and case when m.request_id is not null then public.onli_credit_completed(to_jsonb(r)) else public.onli_credit_completed(to_jsonb(m)) end
   and not exists(select 1 from public.request_interpreters a where a.request_id=m.request_id and a.interpreter_id=p_id and public.onli_credit_excluded(to_jsonb(a)))
 ) credits;
$$;
create trigger certification_completion_changes after insert or update or delete on public.assignment_completions
for each statement execute function public.refresh_onli_certifications();

-- Business/interpreter authority is scoped by actor, request and changed columns.
create function public.allow_self_service_request_update(previous jsonb,next_row jsonb) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(case current_setting('app.onli_self_service',true)
 when 'company_publication' then public.portal_owns_request((previous->>'id')::bigint)
  and previous->>'job_id' is null and next_row->>'job_id' is not null
  and next_row->>'is_public'='true' and next_row->>'is_job_public'='true'
  and previous-array['job_id','is_public','is_job_public','updated_at']
   =next_row-array['job_id','is_public','is_job_public','updated_at']
 when 'interpreter_acceptance' then exists(select 1 from public.request_interpreters a
  where a.request_id=(previous->>'id')::bigint and a.status='assigned' and public.portal_owns_interpreter(a.interpreter_id))
  and previous-array['status','matching_status','assignment_status','assigned_interpreter_id','assigned_interpreter_name',
   'matched_interpreter_id','matched_interpreter_name','updated_at']
   =next_row-array['status','matching_status','assignment_status','assigned_interpreter_id','assigned_interpreter_name',
   'matched_interpreter_id','matched_interpreter_name','updated_at']
 when 'company_completion' then public.portal_owns_request((previous->>'id')::bigint)
  and next_row->>'operation_status'='operation_completed'
  and previous-array['operation_status','updated_at']=next_row-array['operation_status','updated_at']
  and exists(select 1 from public.request_interpreters where request_id=(previous->>'id')::bigint and status='assigned')
  and not exists(select 1 from public.request_interpreters a where a.request_id=(previous->>'id')::bigint and a.status='assigned'
   and not exists(select 1 from public.assignment_completions c where c.assignment_id=a.id and c.status='confirmed'))
 else false end,false);
$$;
revoke all on function public.allow_self_service_request_update(jsonb,jsonb) from public,anon,authenticated;

-- Preserve the deployed guards; the new exceptions never authorize money edits.
do $$
declare function_name text; definition text; begin_line text; exception_body text;
begin
 foreach function_name in array array['prevent_non_admin_request_operation_fields','prevent_non_admin_job_application_review_fields'] loop
  if to_regprocedure('public.'||function_name||'()') is null then continue; end if;
  definition:=pg_get_functiondef(to_regprocedure('public.'||function_name||'()'));
  begin_line:=(regexp_match(definition,E'(?i)(\n[ \\t]*begin\\y)'))[1];
  if begin_line is null then raise exception 'Unexpected guard definition: %',function_name; end if;
  if function_name='prevent_non_admin_request_operation_fields' then
   exception_body:=$guard$
    if tg_op='UPDATE' and public.allow_self_service_request_update(to_jsonb(old),to_jsonb(new)) then return new; end if;
   $guard$;
  else
   exception_body:=$guard$
    if tg_op='UPDATE' and current_setting('app.onli_self_service',true)='interpreter_acceptance'
     and public.portal_owns_interpreter(new.interpreter_id) and new.status='accepted'
     and to_jsonb(old)-array['status','updated_at']=to_jsonb(new)-array['status','updated_at'] then return new; end if;
   $guard$;
  end if;
  definition:=overlay(definition placing E'\nBEGIN\n'||exception_body from strpos(definition,begin_line) for length(begin_line));
  execute definition;
 end loop;
end;
$$;

commit;
notify pgrst,'reload schema';
