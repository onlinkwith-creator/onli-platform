begin;

create table public.post_assignment_automation_config(id boolean primary key default true check(id),activated_at timestamptz not null default now());
insert into public.post_assignment_automation_config(id) values(true);
alter table public.post_assignment_automation_config enable row level security;
revoke all on public.post_assignment_automation_config from public,anon,authenticated;

create table public.request_changes (
 id uuid primary key default gen_random_uuid(), request_id bigint not null references public.requests(id) on delete cascade,
 proposed_by uuid not null, client_nonce uuid not null, job_id uuid, previous_terms jsonb not null, proposed_terms jsonb not null,
 note text not null check(length(note) between 1 and 1000),
 status text not null default 'pending' check(status in ('pending','applied','declined','cancelled','expired')),
 created_at timestamptz not null default now(), expires_at timestamptz not null, resolved_at timestamptz,
 unique(proposed_by,client_nonce)
);
create unique index request_changes_pending on public.request_changes(request_id) where status='pending';
create table public.request_change_responses (
 change_id uuid not null references public.request_changes(id) on delete cascade,
 assignment_id bigint not null references public.request_interpreters(id) on delete cascade,
 interpreter_id bigint not null references public.interpreters(id), auth_user_id uuid not null,
 status text not null default 'pending' check(status in ('pending','accepted','declined')), responded_at timestamptz,
 primary key(change_id,assignment_id)
);
create table public.material_acknowledgements (
 material_id bigint not null references public.request_materials(id) on delete cascade,
 assignment_id bigint not null references public.request_interpreters(id) on delete cascade,
 auth_user_id uuid not null, source_version text not null, acknowledged_at timestamptz not null default now(),
 primary key(material_id,assignment_id)
);
alter table public.request_changes enable row level security;
alter table public.request_change_responses enable row level security;
alter table public.material_acknowledgements enable row level security;
revoke all on public.request_changes,public.request_change_responses,public.material_acknowledgements from public,anon,authenticated;

create function public.workflow_terms(p_id bigint) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select public.portal_pick(to_jsonb(r),array['start_date','end_date','event_date','event_location','event_start_time','event_end_time','work_hours'])
 from public.requests r where id=p_id;
$$;
revoke all on function public.workflow_terms(bigint) from public,anon,authenticated;

create function public.workflow_change_current(p_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(public.workflow_request_open(c.request_id) and not public.workflow_event_started(c.request_id)
  and c.expires_at>now() and public.workflow_terms(c.request_id)=c.previous_terms
  and exists(select 1 from public.requests r join public.businesses b on b.id=r.company_id or b.auth_user_id=r.company_auth_user_id
   where r.id=c.request_id and r.job_id is not distinct from c.job_id and b.status='승인 완료' and b.auth_user_id=c.proposed_by)
  and (select array_agg(id order by id) from public.request_interpreters where request_id=c.request_id and status='assigned')
   =(select array_agg(assignment_id order by assignment_id) from public.request_change_responses where change_id=c.id)
  and not exists(select 1 from public.request_change_responses s join public.interpreters i on i.id=s.interpreter_id
   join public.request_interpreters a on a.id=s.assignment_id where s.change_id=c.id
    and (a.interpreter_id is distinct from s.interpreter_id or i.auth_user_id is distinct from s.auth_user_id or i.withdrawn_at is not null)),false)
 from public.request_changes c where c.id=p_id;
$$;
revoke all on function public.workflow_change_current(uuid) from public,anon,authenticated;

alter function public.enqueue_workflow_action_alert(text,text,text,uuid,text) rename to enqueue_workflow_action_alert_before_changes;
revoke all on function public.enqueue_workflow_action_alert_before_changes(text,text,text,uuid,text) from public,anon,authenticated;
create function public.enqueue_workflow_action_alert(p_type text,p_source text,p_version text,p_user uuid,p_role text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient text; alert_id uuid; heading text; body text; path text;
begin
 if p_type not in ('workflow_change_proposed','workflow_change_applied','workflow_change_declined','workflow_change_cancelled','workflow_change_expired') then
  return public.enqueue_workflow_action_alert_before_changes(p_type,p_source,p_version,p_user,p_role);
 end if;
 if p_role not in ('company','interpreter') then raise exception 'Invalid recipient role'; end if;
 path:=case when p_role='company' then '/business/mypage?tab=changes' else '/interpreter-mypage?tab=changes' end;
 case p_type
 when 'workflow_change_proposed' then heading:='업무 조건 변경 요청';body:='기업이 배정 업무의 일정 또는 조건 변경을 요청했습니다. 변경 전후 내용을 확인하고 동의 또는 거절해 주세요. 동의 완료 전에는 기존 조건이 유지됩니다.';
 when 'workflow_change_applied' then heading:='업무 조건 변경 확정';body:='배정 통역사 전원이 동의하여 변경된 업무 조건이 반영되었습니다. 마이페이지에서 최신 조건을 확인해 주세요.';
 when 'workflow_change_declined' then heading:='업무 조건 변경 거절';body:='조건 변경 요청이 거절되었습니다. 기존 업무 조건은 유지됩니다. 필요한 사항은 의뢰 메시지에서 협의해 주세요.';
 when 'workflow_change_cancelled' then heading:='업무 조건 변경 취소';body:='조건 변경 요청이 취소되었습니다. 기존 업무 조건은 유지됩니다.';
 when 'workflow_change_expired' then heading:='업무 조건 변경 만료';body:='기한 내 전원 동의가 이루어지지 않아 조건 변경 요청이 만료되었습니다. 기존 업무 조건은 유지됩니다.';
 end case;
 select lower(trim(email)) into recipient from auth.users where id=p_user and email_confirmed_at is not null;
 if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return null; end if;
 insert into public.workflow_action_alerts(event_type,source_id,source_version,recipient_auth_user_id,recipient_type,recipient_email,title,message,portal_path)
 values(p_type,p_source,coalesce(p_version,''),p_user,p_role,recipient,heading,body,path)
 on conflict(event_type,source_id,source_version,recipient_auth_user_id) do nothing returning id into alert_id;
 if alert_id is not null then
  insert into public.notifications(id,recipient_type,recipient_id,recipient_email,notification_type,title,message,channel,status)
  values(alert_id,p_role,p_user,recipient,p_type,heading,body||' https://onli-platform.vercel.app'||path,'email','pending');
 end if;
 return alert_id;
end;$$;
revoke all on function public.enqueue_workflow_action_alert(text,text,text,uuid,text) from public,anon,authenticated;

create function public.workflow_change_alert() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare person record;
begin
 if old.status is not distinct from new.status then return new; end if;
 perform public.enqueue_workflow_action_alert('workflow_change_'||new.status,new.id::text,'',new.proposed_by,'company');
 for person in select distinct auth_user_id from public.request_change_responses where change_id=new.id loop
  perform public.enqueue_workflow_action_alert('workflow_change_'||new.status,new.id::text,'',person.auth_user_id,'interpreter');
 end loop;
 return new;
end;$$;
revoke all on function public.workflow_change_alert() from public,anon,authenticated;
create trigger workflow_change_alert after update of status on public.request_changes for each row execute function public.workflow_change_alert();

create function public.cancel_changes_on_owner_transfer() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.company_id is distinct from old.company_id or new.company_auth_user_id is distinct from old.company_auth_user_id then
  update public.request_changes set status='cancelled',resolved_at=now() where request_id=new.id and status='pending';
 end if;
 return new;
end;$$;
revoke all on function public.cancel_changes_on_owner_transfer() from public,anon,authenticated;
create trigger cancel_changes_on_owner_transfer after update of company_id,company_auth_user_id on public.requests
 for each row execute function public.cancel_changes_on_owner_transfer();

create function public.propose_request_change(p_request_id bigint,p_terms jsonb,p_note text,p_nonce uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.requests%rowtype; c public.request_changes%rowtype; terms jsonb; start_day date; end_day date;
 starts_at timestamptz; original_start timestamptz; person record; v_change_id uuid;
begin
 if not public.portal_owns_request(p_request_id) then raise exception 'CHANGE_FORBIDDEN' using errcode='42501'; end if;
 select * into r from public.requests where id=p_request_id for update;
 select * into c from public.request_changes where proposed_by=auth.uid() and client_nonce=p_nonce;
 if found then
  if c.request_id<>p_request_id or c.note<>trim(p_note) or c.proposed_terms<>p_terms then raise exception 'CHANGE_NONCE_MISMATCH'; end if;
  return c.id;
 end if;
 if not public.workflow_request_open(r.id) or public.workflow_event_started(r.id) then raise exception 'CHANGE_REQUEST_CLOSED'; end if;
 if r.job_id is not null and (select count(*) from public.requests where job_id=r.job_id)>1 then raise exception 'CHANGE_ADMIN_REQUIRED'; end if;
 if jsonb_typeof(p_terms)<>'object' or p_terms-array['start_date','end_date','event_date','event_location','event_start_time','event_end_time','work_hours']<>'{}'::jsonb
  or length(trim(coalesce(p_note,''))) not between 1 and 1000 or p_nonce is null then raise exception 'CHANGE_INVALID_TERMS'; end if;
 begin start_day:=(p_terms->>'start_date')::date;end_day:=(p_terms->>'end_date')::date;
 exception when others then raise exception 'CHANGE_INVALID_TERMS'; end;
 if start_day is null or end_day is null or end_day<start_day or end_day-start_day>366
  or length(trim(coalesce(p_terms->>'event_location',''))) not between 1 and 300
  or (nullif(p_terms->>'event_start_time','') is not null and (p_terms->>'event_start_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$')
  or (nullif(p_terms->>'event_end_time','') is not null and (p_terms->>'event_end_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$')
  or length(coalesce(p_terms->>'work_hours',''))>300 then raise exception 'CHANGE_INVALID_TERMS'; end if;
 if start_day=end_day and nullif(p_terms->>'event_start_time','') is not null and nullif(p_terms->>'event_end_time','') is not null
  and (p_terms->>'event_end_time')::time<=(p_terms->>'event_start_time')::time then raise exception 'CHANGE_INVALID_TERMS'; end if;
 starts_at:=(start_day+coalesce(nullif(p_terms->>'event_start_time','')::time,'00:00'::time)) at time zone 'Asia/Seoul';
 original_start:=(lower(public.company_assignment_window(r.id))+case when r.event_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
  then r.event_start_time::time else '00:00'::time end) at time zone 'Asia/Seoul';
 if starts_at<=now() then raise exception 'CHANGE_REQUEST_CLOSED'; end if;
 terms:=jsonb_build_object('start_date',start_day,'end_date',end_day,'event_date',start_day,
  'event_location',trim(p_terms->>'event_location'),'event_start_time',nullif(p_terms->>'event_start_time',''),
  'event_end_time',nullif(p_terms->>'event_end_time',''),'work_hours',nullif(trim(p_terms->>'work_hours'),''));
 if terms<>p_terms or terms=public.workflow_terms(r.id) then raise exception 'CHANGE_INVALID_TERMS'; end if;
 if not exists(select 1 from public.request_interpreters where request_id=r.id and status='assigned')
  or exists(select 1 from public.request_interpreters a join public.interpreters i on i.id=a.interpreter_id
   where a.request_id=r.id and a.status='assigned' and (i.auth_user_id is null or i.withdrawn_at is not null)) then raise exception 'CHANGE_ADMIN_REQUIRED'; end if;
 update public.request_changes set status='expired',resolved_at=now() where request_id=r.id and status='pending' and expires_at<=now();
 if exists(select 1 from public.request_changes where request_id=r.id and status='pending') then raise exception 'CHANGE_ALREADY_PENDING'; end if;
 insert into public.request_changes(request_id,proposed_by,client_nonce,job_id,previous_terms,proposed_terms,note,expires_at)
 values(r.id,auth.uid(),p_nonce,r.job_id,public.workflow_terms(r.id),terms,trim(p_note),least(now()+interval '48 hours',starts_at,original_start)) returning id into v_change_id;
 insert into public.request_change_responses(change_id,assignment_id,interpreter_id,auth_user_id)
 select v_change_id,a.id,a.interpreter_id,i.auth_user_id from public.request_interpreters a join public.interpreters i on i.id=a.interpreter_id
 where a.request_id=r.id and a.status='assigned';
 for person in select distinct auth_user_id from public.request_change_responses where change_id=v_change_id loop
  perform public.enqueue_workflow_action_alert('workflow_change_proposed',v_change_id::text,'',person.auth_user_id,'interpreter');
 end loop;
 return v_change_id;
end;$$;
revoke all on function public.propose_request_change(bigint,jsonb,text,uuid) from public,anon;
grant execute on function public.propose_request_change(bigint,jsonb,text,uuid) to authenticated;

alter function public.allow_self_service_request_update(jsonb,jsonb) rename to allow_self_service_request_update_before_changes;
revoke all on function public.allow_self_service_request_update_before_changes(jsonb,jsonb) from public,anon,authenticated;
create function public.allow_self_service_request_update(previous jsonb,next_row jsonb) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select case when current_setting('app.onli_self_service',true)='agreed_condition_change' then
  previous-array['start_date','end_date','event_date','event_location','event_start_time','event_end_time','work_hours','updated_at']
   =next_row-array['start_date','end_date','event_date','event_location','event_start_time','event_end_time','work_hours','updated_at']
  and exists(select 1 from public.request_changes c where c.request_id=(previous->>'id')::bigint and c.status='applied'
   and c.previous_terms=public.portal_pick(previous,array['start_date','end_date','event_date','event_location','event_start_time','event_end_time','work_hours'])
   and c.proposed_terms=public.portal_pick(next_row,array['start_date','end_date','event_date','event_location','event_start_time','event_end_time','work_hours'])
   and not exists(select 1 from public.request_change_responses where change_id=c.id and status<>'accepted')
   and exists(select 1 from public.request_change_responses where change_id=c.id and auth_user_id=auth.uid()))
 else public.allow_self_service_request_update_before_changes(previous,next_row) end;
$$;
revoke all on function public.allow_self_service_request_update(jsonb,jsonb) from public,anon,authenticated;

create function public.respond_request_change(p_change_id uuid,p_accept boolean) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.request_changes%rowtype; request_key bigint; person record; old_context text; terms jsonb; event_window daterange; previous_response text;
begin
 select request_id into request_key from public.request_changes where id=p_change_id;
 perform 1 from public.requests where id=request_key for update;
 select * into c from public.request_changes where id=p_change_id for update;
 if not found or not exists(select 1 from public.request_change_responses s join public.interpreters i on i.id=s.interpreter_id
  join public.request_interpreters a on a.id=s.assignment_id where s.change_id=c.id and s.auth_user_id=auth.uid()
   and i.auth_user_id=auth.uid() and i.withdrawn_at is null and a.status='assigned' and a.request_id=c.request_id
   and a.interpreter_id=s.interpreter_id) then raise exception 'CHANGE_FORBIDDEN' using errcode='42501'; end if;
 if c.status<>'pending' then return c.status; end if;
 if c.expires_at<=now() then update public.request_changes set status='expired',resolved_at=now() where id=c.id;return 'expired'; end if;
 if not public.workflow_change_current(c.id) then raise exception 'CHANGE_STALE'; end if;
 if p_accept is null then raise exception 'CHANGE_INVALID_RESPONSE'; end if;
 select status into previous_response from public.request_change_responses where change_id=c.id and auth_user_id=auth.uid() limit 1;
 if previous_response<>'pending' then
  if previous_response='accepted' and p_accept then return 'pending'; end if;
  raise exception 'CHANGE_ALREADY_RESPONDED';
 end if;
 update public.request_change_responses set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now()
 where change_id=c.id and auth_user_id=auth.uid() and status='pending';
 if not p_accept then update public.request_changes set status='declined',resolved_at=now() where id=c.id;return 'declined'; end if;
 if exists(select 1 from public.request_change_responses where change_id=c.id and status<>'accepted') then return 'pending'; end if;
 terms:=c.proposed_terms;event_window:=daterange((terms->>'start_date')::date,(terms->>'end_date')::date,'[]');
 -- Request first, then all interpreter locks in deterministic order.
 for person in select interpreter_id from public.request_change_responses where change_id=c.id order by interpreter_id loop
  perform 1 from public.interpreters where id=person.interpreter_id for update;
  if exists(select 1 from public.request_interpreters a join public.requests r on r.id=a.request_id
   where a.interpreter_id=person.interpreter_id and a.status='assigned' and r.id<>c.request_id
    and lower(concat_ws(' ',r.status,r.operation_status)) !~ '(cancel|취소)' and public.company_assignment_window(r.id)&&event_window)
   or exists(select 1 from public.matchings m where m.interpreter_id=person.interpreter_id and m.request_id is distinct from c.request_id
    and m.job_id is distinct from (select job_id from public.requests where id=c.request_id)
    and m.status in ('assigned','confirmed','in_progress') and m.start_date<=upper(event_window)-1 and m.end_date>=lower(event_window))
   then raise exception 'CHANGE_SCHEDULE_CONFLICT'; end if;
 end loop;
 if not public.workflow_change_current(c.id) then raise exception 'CHANGE_STALE'; end if;
 update public.request_changes set status='applied',resolved_at=now() where id=c.id;
 old_context:=current_setting('app.onli_self_service',true);
 perform set_config('app.onli_self_service','agreed_condition_change',true);
 update public.requests set start_date=(terms->>'start_date')::date,end_date=(terms->>'end_date')::date,
  event_date=(terms->>'event_date')::date,event_location=terms->>'event_location',event_start_time=terms->>'event_start_time',
  event_end_time=terms->>'event_end_time',work_hours=terms->>'work_hours',updated_at=now() where id=c.request_id;
 perform set_config('app.onli_self_service',coalesce(old_context,''),true);
 update public.jobs set start_date=(terms->>'start_date')::date,end_date=(terms->>'end_date')::date,location=terms->>'event_location'
 where id=(select job_id from public.requests where id=c.request_id);
 update public.matchings set start_date=(terms->>'start_date')::date,end_date=(terms->>'end_date')::date
 where request_id=c.request_id and status in ('assigned','confirmed','in_progress');
 update public.assignment_offers set status='cancelled',responded_at=now() where request_id=c.request_id and status='pending';
 return 'applied';
end;$$;
revoke all on function public.respond_request_change(uuid,boolean) from public,anon;
grant execute on function public.respond_request_change(uuid,boolean) to authenticated;

create function public.cancel_request_change(p_change_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare request_key bigint;
begin
 select request_id into request_key from public.request_changes where id=p_change_id;
 if not public.portal_owns_request(request_key) then raise exception 'CHANGE_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.requests where id=request_key for update;
 update public.request_changes set status='cancelled',resolved_at=now() where id=p_change_id and status='pending';
end;$$;
revoke all on function public.cancel_request_change(uuid) from public,anon;
grant execute on function public.cancel_request_change(uuid) to authenticated;

create function public.get_my_request_changes() returns setof jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 return query select jsonb_build_object('request_id',r.id::text,'request_no',r.request_no,'event_name',r.event_name,
  'company',public.portal_owns_request(r.id),'current_terms',public.workflow_terms(r.id),
  'can_propose',public.portal_owns_request(r.id) and public.workflow_request_open(r.id) and not public.workflow_event_started(r.id),
  'changes',coalesce((select jsonb_agg(payload order by created_at desc) from (
   select c.created_at,jsonb_build_object('id',c.id,'status',case when c.status='pending' and c.expires_at<=now() then 'expired' else c.status end,
    'current',public.workflow_change_current(c.id),'before',c.previous_terms,'after',c.proposed_terms,'note',c.note,
    'created_at',c.created_at,'expires_at',c.expires_at,
    'total',(select count(*) from public.request_change_responses where change_id=c.id),
    'accepted',(select count(*) from public.request_change_responses where change_id=c.id and status='accepted'),
    'my_status',(select status from public.request_change_responses where change_id=c.id and auth_user_id=auth.uid() limit 1)) as payload
   from public.request_changes c where c.request_id=r.id and exists(select 1 from public.businesses b
    where b.status='승인 완료' and b.auth_user_id=c.proposed_by and (b.id=r.company_id or b.auth_user_id=r.company_auth_user_id))
    and ((public.portal_owns_request(r.id) and c.proposed_by=auth.uid()) or exists(select 1 from public.request_change_responses
    where change_id=c.id and auth_user_id=auth.uid())) order by c.created_at desc limit 10
  )entries),'[]'::jsonb))
 from public.requests r where exists(select 1 from public.request_interpreters a join public.interpreters i on i.id=a.interpreter_id
  where a.request_id=r.id and a.status='assigned' and (public.portal_owns_request(r.id) or (i.auth_user_id=auth.uid() and i.withdrawn_at is null)))
 order by r.id desc limit 100;
end;$$;
revoke all on function public.get_my_request_changes() from public,anon;
grant execute on function public.get_my_request_changes() to authenticated;

create function public.material_source_version(p_id bigint) returns text language sql stable security definer set search_path=public,pg_temp as $$
 select md5((to_jsonb(m)-array['file_name','original_file_name'])::text) from public.request_materials m where id=p_id;
$$;
revoke all on function public.material_source_version(bigint) from public,anon,authenticated;
create function public.get_material_acknowledgements(p_request_id bigint) returns setof jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.portal_owns_request(p_request_id) and not exists(select 1 from public.request_interpreters a join public.interpreters i on i.id=a.interpreter_id
  where a.request_id=p_request_id and a.status='assigned' and i.auth_user_id=auth.uid() and i.withdrawn_at is null) then raise exception 'MATERIAL_FORBIDDEN' using errcode='42501'; end if;
 return query select jsonb_build_object('material_id',m.id::text,'assignment_id',a.id::text,'interpreter_name',i.name,
  'mine',i.auth_user_id=auth.uid(),'version',public.material_source_version(m.id),
  'acknowledged_at',case when receipt.source_version=public.material_source_version(m.id) and receipt.auth_user_id=i.auth_user_id then receipt.acknowledged_at end)
 from public.request_materials m join public.request_interpreters a on a.request_id=m.request_id and a.status='assigned'
 join public.interpreters i on i.id=a.interpreter_id left join public.material_acknowledgements receipt on receipt.material_id=m.id and receipt.assignment_id=a.id
 where m.request_id=p_request_id and (public.portal_owns_request(p_request_id) or i.auth_user_id=auth.uid()) order by m.created_at desc,a.id;
end;$$;
revoke all on function public.get_material_acknowledgements(bigint) from public,anon;
grant execute on function public.get_material_acknowledgements(bigint) to authenticated;
create function public.acknowledge_request_material(p_material_id bigint,p_version text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare material public.request_materials%rowtype; assignment_key bigint; request_key bigint;
begin
 select request_id into request_key from public.request_materials where id=p_material_id;
 perform 1 from public.requests where id=request_key for update;
 select * into material from public.request_materials where id=p_material_id for update;
 select a.id into assignment_key from public.request_interpreters a join public.interpreters i on i.id=a.interpreter_id
 where a.request_id=material.request_id and a.status='assigned' and i.auth_user_id=auth.uid() and i.withdrawn_at is null;
 if assignment_key is null or not public.workflow_request_open(material.request_id) then raise exception 'MATERIAL_FORBIDDEN' using errcode='42501'; end if;
 if p_version is distinct from public.material_source_version(material.id) then raise exception 'MATERIAL_VERSION_CHANGED'; end if;
 insert into public.material_acknowledgements(material_id,assignment_id,auth_user_id,source_version) values(material.id,assignment_key,auth.uid(),p_version)
 on conflict(material_id,assignment_id) do update set auth_user_id=excluded.auth_user_id,source_version=excluded.source_version,
  acknowledged_at=case when material_acknowledgements.source_version=excluded.source_version and material_acknowledgements.auth_user_id=excluded.auth_user_id
   then material_acknowledgements.acknowledged_at else now() end;
end;$$;
revoke all on function public.acknowledge_request_material(bigint,text) from public,anon;
grant execute on function public.acknowledge_request_material(bigint,text) to authenticated;

alter function public.prepare_workflow_followups() rename to prepare_workflow_followups_before_changes;
revoke all on function public.prepare_workflow_followups_before_changes() from public,anon,authenticated;
create function public.prepare_workflow_followups() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare r record;
begin
 for r in select id from public.requests where id in(select request_id from public.request_changes where status='pending' and expires_at<=now())
  order by id for update skip locked loop
  update public.request_changes set status='expired',resolved_at=now() where request_id=r.id and status='pending' and expires_at<=now();
 end loop;
 return public.prepare_workflow_followups_before_changes();
end;$$;
revoke all on function public.prepare_workflow_followups() from public,anon,authenticated;

alter function public.workflow_followup_actionable(text,text,text,uuid) rename to workflow_followup_actionable_before_changes;
revoke all on function public.workflow_followup_actionable_before_changes(text,text,text,uuid) from public,anon,authenticated;
create function public.workflow_followup_actionable(p_type text,p_source text,p_version text,p_user uuid) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if p_type like 'workflow_change_%' then
  return exists(select 1 from public.request_changes c where c.id::text=p_source
   and exists(select 1 from public.requests r join public.businesses b on b.id=r.company_id or b.auth_user_id=r.company_auth_user_id
    where r.id=c.request_id and b.status='승인 완료' and b.auth_user_id=c.proposed_by)
   and (c.proposed_by=p_user or exists(select 1 from public.request_change_responses s join public.interpreters i on i.id=s.interpreter_id
    join public.request_interpreters a on a.id=s.assignment_id where s.change_id=c.id and s.auth_user_id=p_user
     and i.auth_user_id=p_user and i.withdrawn_at is null and a.status='assigned' and a.interpreter_id=s.interpreter_id and a.request_id=c.request_id))
   and case when p_type='workflow_change_proposed' then c.status='pending' and public.workflow_change_current(c.id)
    and exists(select 1 from public.request_change_responses where change_id=c.id and auth_user_id=p_user and status='pending')
    else p_type='workflow_change_'||c.status end);
 end if;
 return public.workflow_followup_actionable_before_changes(p_type,p_source,p_version,p_user);
end;$$;
revoke all on function public.workflow_followup_actionable(text,text,text,uuid) from public,anon,authenticated;

alter function public.get_workflow_exceptions() rename to get_workflow_exceptions_before_changes;
revoke all on function public.get_workflow_exceptions_before_changes() from public,anon,authenticated;
create function public.get_workflow_exceptions() returns setof jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.is_active_admin() then raise exception 'Admin required'; end if;
 return query select * from public.get_workflow_exceptions_before_changes();
 return query select jsonb_build_object('request_id',c.request_id,'request_no',r.request_no,'event_name',r.event_name,
  'type','change_overdue','label',case when public.workflow_change_current(c.id) then '조건 변경 응답 지연' else '조건 변경 재검토 필요' end,'count',1)
 from public.request_changes c join public.requests r on r.id=c.request_id where c.status='pending' and c.expires_at>now()
  and (c.created_at<now()-interval '24 hours' or not public.workflow_change_current(c.id));
 return query select jsonb_build_object('request_id',null,'request_no',null,'event_name',a.title,'alert_id',a.id,
  'type','email_failed','label',case when a.status='uncertain' then '이메일 발송 결과 확인' else '이메일 발송 실패' end,'count',1)
 from public.workflow_action_alerts a where a.status='uncertain' or (a.status='failed' and (a.attempts>=5 or a.dispatch_attempts>=10))
 order by a.created_at desc limit 100;
end;$$;
revoke all on function public.get_workflow_exceptions() from public,anon;
grant execute on function public.get_workflow_exceptions() to authenticated;

alter function public.queue_workflow_exception_alerts() rename to queue_workflow_exception_alerts_before_changes;
revoke all on function public.queue_workflow_exception_alerts_before_changes() from public,anon,authenticated;
create function public.queue_workflow_exception_alerts() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare item record; total integer; cutoff timestamptz;
begin
 total:=public.queue_workflow_exception_alerts_before_changes();
 select activated_at into cutoff from public.post_assignment_automation_config where id;
 for item in select id,request_id,created_at from public.request_changes where status='pending' and expires_at>now()
  and created_at>=cutoff and (created_at<now()-interval '24 hours' or not public.workflow_change_current(id)) loop
  perform public.enqueue_admin_action_alert('admin_action_workflow','change:'||item.id,item.created_at::text,
   '업무 조건 변경 응답 지연 또는 재검토 · 확인 필요','/admin?subTab=all_requests');total:=total+1;
 end loop;
 for item in select id,status from public.workflow_action_alerts where created_at>=cutoff
  and (status='uncertain' or (status='failed' and (attempts>=5 or dispatch_attempts>=10))) order by created_at limit 100 loop
  perform public.enqueue_admin_action_alert('admin_action_workflow','mail:'||item.id,item.status,
   '사용자 안내 이메일 발송 문제 · 확인 필요','/admin?subTab=all_requests');total:=total+1;
 end loop;
 return total;
end;$$;
revoke all on function public.queue_workflow_exception_alerts() from public,anon,authenticated;

commit;
notify pgrst,'reload schema';
