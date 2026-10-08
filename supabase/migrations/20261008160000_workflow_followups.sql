begin;
create or replace function public.sync_request_interpreter_assignment_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
  v_interpreter_id bigint;
  v_job_id uuid;
  v_required_count integer;
  v_assigned_count integer;
  v_primary_interpreter_id bigint;
  v_primary_interpreter_name text;
begin
  v_request_id := case when tg_op = 'DELETE' then old.request_id else new.request_id end;
  v_interpreter_id := case when tg_op = 'DELETE' then old.interpreter_id else new.interpreter_id end;

  select r.job_id, greatest(coalesce(r.requested_people_count, r.required_count, 1), 1)
  into v_job_id, v_required_count
  from public.requests r
  where r.id = v_request_id
  for update;

  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if v_job_id is not null then
    update public.job_applications
    set status = case when tg_op = 'DELETE' or new.status is distinct from 'assigned' then 'pending' else 'accepted' end
    where job_id = v_job_id
      and interpreter_id = v_interpreter_id
      and status not in ('rejected', 'cancelled');
  end if;

  if tg_op = 'DELETE' or new.status is distinct from 'assigned' then
    update public.matchings
    set status = 'cancelled'
    where request_id = v_request_id
      and interpreter_id = v_interpreter_id
      and status in ('pending', 'accepted', 'assigned', 'confirmed', 'in_progress');
  end if;

  select count(*)::integer into v_assigned_count
  from public.request_interpreters ri where ri.request_id = v_request_id and ri.status = 'assigned';

  select ri.interpreter_id, i.name
  into v_primary_interpreter_id, v_primary_interpreter_name
  from public.request_interpreters ri
  join public.interpreters i on i.id = ri.interpreter_id
  where ri.request_id = v_request_id and ri.status = 'assigned'
  order by ri.assigned_at desc, ri.id desc limit 1;

  update public.requests
  set status = case when v_assigned_count = 0 then 'draft' else 'assigned' end,
      matching_status = case when v_assigned_count = 0 then 'draft' else 'assigned' end,
      assignment_status = case
        when v_assigned_count = 0 then 'assignment_pending'
        when v_assigned_count < v_required_count then 'assignment_in_progress'
        else 'assignment_completed'
      end,
      assigned_interpreter_id = v_primary_interpreter_id,
      assigned_interpreter_name = v_primary_interpreter_name,
      matched_interpreter_id = v_primary_interpreter_id,
      matched_interpreter_name = v_primary_interpreter_name,
      updated_at = now()
  where id = v_request_id;

  if v_job_id is not null then
    update public.jobs
    set status = case when v_assigned_count >= v_required_count then 'assigned' else 'open' end,
        assignment_status = case
          when v_assigned_count = 0 then 'assignment_pending'
          when v_assigned_count < v_required_count then 'assignment_in_progress'
          else 'assignment_completed'
        end
    where id = v_job_id;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists sync_request_interpreter_assignment_lifecycle on public.request_interpreters;
create trigger sync_request_interpreter_assignment_lifecycle
after insert or delete or update of status on public.request_interpreters
for each row execute function public.sync_request_interpreter_assignment_lifecycle();



create table public.workflow_automation_config (
 id boolean primary key default true check(id), activated_at timestamptz not null default now()
);
insert into public.workflow_automation_config(id) values(true);
alter table public.workflow_automation_config enable row level security;
revoke all on public.workflow_automation_config from public,anon,authenticated;

create table public.workflow_discovery_preferences (
 auth_user_id uuid primary key references auth.users(id), enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.workflow_discovery_preferences enable row level security;
revoke all on public.workflow_discovery_preferences from public,anon,authenticated;
grant all on public.workflow_discovery_preferences to service_role;
create function public.get_my_discovery_alerts() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select enabled from public.workflow_discovery_preferences where auth_user_id=auth.uid()),false);
$$;
create function public.set_my_discovery_alerts(p_enabled boolean) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not exists(select 1 from public.interpreters where auth_user_id=auth.uid()) then raise exception 'WORKFLOW_FORBIDDEN'; end if;
 insert into public.workflow_discovery_preferences(auth_user_id,enabled) values(auth.uid(),coalesce(p_enabled,false))
 on conflict(auth_user_id) do update set enabled=excluded.enabled,updated_at=now();
 return coalesce(p_enabled,false);
end;$$;
revoke all on function public.get_my_discovery_alerts(),public.set_my_discovery_alerts(boolean) from public,anon;
grant execute on function public.get_my_discovery_alerts(),public.set_my_discovery_alerts(boolean) to authenticated;

alter function public.enqueue_workflow_action_alert(text,text,text,uuid,text) rename to enqueue_workflow_action_alert_base;
revoke all on function public.enqueue_workflow_action_alert_base(text,text,text,uuid,text) from public,anon,authenticated;
create function public.enqueue_workflow_action_alert(p_type text,p_source text,p_version text,p_user uuid,p_role text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient text; alert_id uuid; heading text; body text; path text;
begin
 case p_type
 when 'workflow_offer_reminder' then heading:='배정 요청 응답 안내';body:='배정 요청의 수락 기한이 다가옵니다. 조건을 확인하고 수락 또는 거절해 주세요.';path:='/interpreter-mypage?tab=assignments';
 when 'workflow_unassigned_reminder' then heading:='미배정 의뢰 확인';body:='행사가 임박했지만 필요한 배정 인원이 부족합니다. 지원자와 수락 대기 요청을 확인해 주세요.';path:='/business/mypage?tab=applicants';
 when 'workflow_materials_reminder' then heading:='행사 자료 업로드 안내';body:='예정된 행사에 등록된 자료가 없습니다. 통역사가 준비할 수 있도록 자료를 등록해 주세요.';path:='/business/mypage?tab=materials';
 when 'workflow_materials_uploaded' then heading:='새 행사 자료';body:='배정된 의뢰에 자료가 등록되었습니다. 로그인 후 확인해 주세요.';path:='/interpreter-mypage?tab=preparation';
 when 'workflow_completion_reminder' then heading:='업무 완료 제출 안내';body:='행사 일정이 종료되었습니다. 업무 완료 내용을 제출해 주세요. 이 안내는 입금 또는 지급 완료를 의미하지 않습니다.';path:='/interpreter-mypage?tab=assignments';
 when 'workflow_review_reminder' then heading:='업무 완료 확인 안내';body:='통역사가 제출한 완료 내용의 확인이 필요합니다. 완료 확인 또는 수정 요청을 처리해 주세요. 정산은 별도로 확인합니다.';path:='/business/mypage?tab=work';
 when 'workflow_matching_job' then heading:='조건에 맞는 새 통역 공고';body:='활동 지역과 레벨에 맞는 새 일반 공고가 있습니다. 공고에서 일정과 조건을 확인해 주세요. 배정이 확정된 것은 아닙니다.';path:='/jobs';
 when 'workflow_recruiting_reopened' then heading:='지원한 공고의 재모집 안내';body:='지원한 의뢰에 다시 모집 인원이 생겼습니다. 공고의 최신 조건과 본인의 지원 상태를 확인해 주세요. 배정은 별도 요청과 수락이 필요합니다.';path:='/interpreter-mypage?tab=applications';
 else return public.enqueue_workflow_action_alert_base(p_type,p_source,p_version,p_user,p_role);
 end case;
 if p_role not in ('company','interpreter') then raise exception 'Invalid recipient role'; end if;
 if p_type in ('workflow_matching_job','workflow_recruiting_reopened') and not exists
  (select 1 from public.workflow_discovery_preferences where auth_user_id=p_user and enabled) then return null; end if;
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

create function public.workflow_request_open(p_id bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.requests r where r.id=p_id
  and lower(concat_ws(' ',r.status,r.operation_status)) !~ '(cancel|취소|completed|완료)');
$$;
revoke all on function public.workflow_request_open(bigint) from public,anon,authenticated;

create table public.workflow_closed_jobs(job_id uuid primary key,reason text not null,updated_at timestamptz not null default now());
alter table public.workflow_closed_jobs enable row level security;
revoke all on public.workflow_closed_jobs from public,anon,authenticated;
create function public.sync_workflow_recruiting(p_request bigint,p_version text default '') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.requests%rowtype; count_assigned integer; needed integer; reason text; person record;
begin
 select * into r from public.requests where id=p_request for update;
 if not found or r.job_id is null or not public.workflow_request_open(r.id) then return; end if;
 select count(*) into count_assigned from public.request_interpreters where request_id=r.id and status='assigned';
 needed:=greatest(coalesce(r.requested_people_count,r.required_count,1),1);
 reason:=case when public.workflow_event_started(r.id) then 'started' when count_assigned>=needed then 'capacity' end;
 if reason is not null then
  -- Do not take ownership of manually closed/cancelled jobs.
   if exists(select 1 from public.jobs where id=r.job_id and lower(coalesce(status,'')) in ('open','recruiting','모집중','assigned','배정완료','배정 완료'))
   or exists(select 1 from public.workflow_closed_jobs where job_id=r.job_id) then
   update public.jobs set status=case when reason='capacity' then 'assigned' else 'closed' end where id=r.job_id;
   insert into public.workflow_closed_jobs values(r.job_id,reason,now()) on conflict(job_id) do update set reason=excluded.reason,updated_at=now();
  end if;
 elsif exists(select 1 from public.workflow_closed_jobs closed where closed.job_id=r.job_id and closed.reason='capacity') then
  update public.jobs set status='open' where id=r.job_id and lower(coalesce(status,'')) in ('assigned','open','모집중','배정완료','배정 완료');
  if found then
   for person in select distinct i.auth_user_id from public.job_applications a join public.interpreters i on i.id=a.interpreter_id
    where a.job_id=r.job_id and a.status in ('pending','reviewing','accepted','approved')
     and i.is_public and i.activity_status='active' and not exists(select 1 from public.request_interpreters active
      where active.request_id=r.id and active.interpreter_id=i.id and active.status='assigned') loop
    perform public.enqueue_workflow_action_alert('workflow_recruiting_reopened',r.id::text,p_version,person.auth_user_id,'interpreter');
   end loop;
  end if;
  delete from public.workflow_closed_jobs where job_id=r.job_id;
 end if;
end;$$;
revoke all on function public.sync_workflow_recruiting(bigint,text) from public,anon,authenticated;
create function public.workflow_recruiting_changed() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.sync_workflow_recruiting(case when tg_op='DELETE' then old.request_id else new.request_id end,
  tg_op||':'||coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id')||':'||clock_timestamp()::text);
 if tg_op='DELETE' then return old; else return new; end if;
end;$$;
revoke all on function public.workflow_recruiting_changed() from public,anon,authenticated;
create trigger zz_workflow_recruiting_changed after insert or delete or update of status on public.request_interpreters
 for each row execute function public.workflow_recruiting_changed();

create function public.guard_workflow_recruiting_application() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.requests%rowtype; j_status text;
begin
 for r in select * from public.requests where job_id=new.job_id order by id for update loop
  if not public.workflow_request_open(r.id) or public.workflow_event_started(r.id) then raise exception 'WORKFLOW_RECRUITING_CLOSED'; end if;
  if (select count(*) from public.request_interpreters where request_id=r.id and status='assigned')>=greatest(coalesce(r.requested_people_count,r.required_count,1),1)
   then raise exception 'WORKFLOW_RECRUITING_FULL'; end if;
 end loop;
 select lower(coalesce(status,'')) into j_status from public.jobs where id=new.job_id for update;
 if j_status not in ('open','모집중','recruiting') then raise exception 'WORKFLOW_RECRUITING_CLOSED'; end if;
 return new;
end;$$;
revoke all on function public.guard_workflow_recruiting_application() from public,anon,authenticated;
create trigger guard_workflow_recruiting_application before insert on public.job_applications
 for each row execute function public.guard_workflow_recruiting_application();

create function public.queue_workflow_material_upload() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare person record;
begin
 if not public.workflow_request_open(new.request_id) then return new; end if;
 for person in select distinct i.auth_user_id from public.request_interpreters a join public.interpreters i on i.id=a.interpreter_id
  where a.request_id=new.request_id and a.status='assigned' loop
  perform public.enqueue_workflow_action_alert('workflow_materials_uploaded',new.request_id::text,
   (now() at time zone 'Asia/Seoul')::date::text,person.auth_user_id,'interpreter');
 end loop;
 return new;
end;$$;
revoke all on function public.queue_workflow_material_upload() from public,anon,authenticated;
create trigger workflow_material_upload after insert on public.request_materials for each row execute function public.queue_workflow_material_upload();

create function public.prepare_workflow_followups() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.requests%rowtype; person record; item record; owner_id uuid; start_day date; end_day date; total integer:=0; cutoff timestamptz;
begin
 -- Only the scheduler/service role can invoke this. Never backfill old completion mail.
 perform pg_advisory_xact_lock(hashtext('workflow-followups'));
 select activated_at into cutoff from public.workflow_automation_config where id;
 for item in select o.id,o.interpreter_id from public.assignment_offers o
  where o.status='pending' and o.expires_at>now() and o.expires_at<=now()+interval '6 hours'
   and o.created_at>=cutoff and public.workflow_request_open(o.request_id) and not public.workflow_event_started(o.request_id) loop
  perform public.enqueue_workflow_action_alert('workflow_offer_reminder',item.id::text,'',
   (select auth_user_id from public.interpreters where id=item.interpreter_id),'interpreter');
 end loop;
 for r in select * from public.requests where job_id is not null order by id for update skip locked loop
  perform public.sync_workflow_recruiting(r.id);
  if not public.workflow_request_open(r.id) then continue; end if;
  start_day:=lower(public.company_assignment_window(r.id));end_day:=upper(public.company_assignment_window(r.id))-1;
  if start_day is null or end_day is null then continue; end if;
  select b.auth_user_id into owner_id from public.businesses b where b.status='승인 완료'
   and (b.id=r.company_id or b.auth_user_id=r.company_auth_user_id) order by b.id limit 1;
  if start_day between (now() at time zone 'Asia/Seoul')::date and (now() at time zone 'Asia/Seoul')::date+3
   and not public.workflow_event_started(r.id) then
   if (select count(*) from public.request_interpreters where request_id=r.id and status='assigned')<greatest(coalesce(r.requested_people_count,r.required_count,1),1) then
    perform public.enqueue_workflow_action_alert('workflow_unassigned_reminder',r.id::text,start_day::text,owner_id,'company');
   end if;
   if not exists(select 1 from public.request_materials where request_id=r.id)
    and exists(select 1 from public.request_interpreters where request_id=r.id and status='assigned') then
    perform public.enqueue_workflow_action_alert('workflow_materials_reminder',r.id::text,start_day::text,owner_id,'company');
   end if;
  end if;
  if end_day>=(cutoff at time zone 'Asia/Seoul')::date and public.workflow_event_finished(r.id)
   and end_day between (now() at time zone 'Asia/Seoul')::date-7 and (now() at time zone 'Asia/Seoul')::date-1 then
   for person in select a.id,i.auth_user_id from public.request_interpreters a join public.interpreters i on i.id=a.interpreter_id
    where a.request_id=r.id and a.status='assigned' and not exists(select 1 from public.assignment_completions c
     where c.assignment_id=a.id and c.status in ('submitted','confirmed')) loop
    perform public.enqueue_workflow_action_alert('workflow_completion_reminder',person.id::text,end_day::text,person.auth_user_id,'interpreter');
   end loop;
  end if;
 end loop;
 for item in select c.assignment_id,c.request_id,c.submitted_at from public.assignment_completions c
  where c.status='submitted' and c.submitted_at>=cutoff and c.submitted_at<=now()-interval '24 hours'
   and public.workflow_request_open(c.request_id) and exists(select 1 from public.request_interpreters a where a.id=c.assignment_id and a.status='assigned') loop
  select b.auth_user_id into owner_id from public.requests req join public.businesses b
   on b.id=req.company_id or b.auth_user_id=req.company_auth_user_id where req.id=item.request_id and b.status='승인 완료' order by b.id limit 1;
  perform public.enqueue_workflow_action_alert('workflow_review_reminder',item.assignment_id::text,item.submitted_at::text,owner_id,'company');
 end loop;
 select count(*)::integer into total from public.workflow_action_alerts where created_at>=now()-interval '1 minute';
 return total;
end;$$;
revoke all on function public.prepare_workflow_followups() from public,anon,authenticated;
create function public.queue_workflow_matching_jobs() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare person record; r public.requests%rowtype;
begin
 if new.job_id is null or old.job_id is not null or not new.is_job_public or coalesce(new.request_type,'general')<>'general'
  or not public.workflow_request_open(new.id) or public.workflow_event_started(new.id) then return new; end if;
 select * into r from public.requests where id=new.id;
 for person in select i.auth_user_id from public.interpreters i join public.workflow_discovery_preferences p on p.auth_user_id=i.auth_user_id and p.enabled
  where i.is_public and i.activity_status='active' and i.withdrawn_at is null
   and nullif(i.level,'') is not null
   and coalesce(nullif(regexp_replace(i.level,'[^0-9]','','g'),''),'0')::integer>=coalesce(nullif(regexp_replace(coalesce(r.requested_level,r.required_level,'Lv1'),'[^0-9]','','g'),''),'1')::integer
   and exists(select 1 from jsonb_array_elements_text(coalesce(to_jsonb(i)->'available_regions','[]'::jsonb)) as selected_region(value)
    where length(trim(selected_region.value))>=2 and position(lower(trim(selected_region.value)) in lower(coalesce(r.event_location,'')))>0)
   and not exists(select 1 from public.request_interpreters a where a.interpreter_id=i.id and a.status='assigned'
    and a.request_id<>r.id and public.company_assignment_window(a.request_id)&&public.company_assignment_window(r.id)) loop
  perform public.enqueue_workflow_action_alert('workflow_matching_job',r.id::text,'',person.auth_user_id,'interpreter');
 end loop;
 return new;
end;$$;
revoke all on function public.queue_workflow_matching_jobs() from public,anon,authenticated;
create trigger workflow_matching_job after update of job_id on public.requests for each row execute function public.queue_workflow_matching_jobs();

create function public.workflow_followup_actionable(p_type text,p_source text,p_version text,p_user uuid) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare request_key bigint; assignment_key bigint;
begin
 if p_type='workflow_offer_reminder' then return exists(select 1 from public.assignment_offers o join public.interpreters i on i.id=o.interpreter_id
  where o.id::text=p_source and i.auth_user_id=p_user and o.status='pending' and o.expires_at>now()
   and public.workflow_request_open(o.request_id) and not public.workflow_event_started(o.request_id)); end if;
 if p_type in ('workflow_completion_reminder','workflow_review_reminder') then
  select a.id,a.request_id into assignment_key,request_key from public.request_interpreters a where a.id::text=p_source and a.status='assigned';
  if request_key is null or not public.workflow_request_open(request_key) or not public.workflow_event_finished(request_key) then return false; end if;
  if p_type='workflow_review_reminder' then return exists(select 1 from public.assignment_completions where assignment_id=assignment_key and status='submitted' and submitted_at::text=p_version); end if;
  return not exists(select 1 from public.assignment_completions where assignment_id=assignment_key and status in ('submitted','confirmed'));
 end if;
 if p_type='workflow_materials_uploaded' then return exists(select 1 from public.request_materials m
  where m.request_id::text=p_source and public.workflow_request_open(m.request_id)
   and exists(select 1 from public.request_interpreters a join public.interpreters i on i.id=a.interpreter_id
    where a.request_id=m.request_id and a.status='assigned' and i.auth_user_id=p_user)); end if;
 if p_type in ('workflow_matching_job','workflow_recruiting_reopened') and not exists(select 1 from public.workflow_discovery_preferences where auth_user_id=p_user and enabled) then return false; end if;
 if p_type in ('workflow_unassigned_reminder','workflow_materials_reminder','workflow_matching_job','workflow_recruiting_reopened') then
  select id into request_key from public.requests where id::text=p_source;
  if request_key is null or not public.workflow_request_open(request_key) or public.workflow_event_started(request_key) then return false; end if;
  if p_type='workflow_materials_reminder' then return not exists(select 1 from public.request_materials where request_id=request_key)
    and exists(select 1 from public.request_interpreters where request_id=request_key and status='assigned'); end if;
  if p_type='workflow_unassigned_reminder' then return exists(select 1 from public.requests r where id=request_key and
    (select count(*) from public.request_interpreters where request_id=r.id and status='assigned')<greatest(coalesce(r.requested_people_count,r.required_count,1),1)); end if;
  return exists(select 1 from public.requests r join public.jobs j on j.id=r.job_id where r.id=request_key and r.is_job_public
   and lower(coalesce(j.status,'')) in ('open','모집중','recruiting') and exists(select 1 from public.interpreters i where i.auth_user_id=p_user and i.is_public and i.activity_status='active'));
 end if;
 return true;
end;$$;
revoke all on function public.workflow_followup_actionable(text,text,text,uuid) from public,anon,authenticated;
alter table public.workflow_action_alerts drop constraint workflow_action_alerts_status_check;
alter table public.workflow_action_alerts add constraint workflow_action_alerts_status_check check(status in ('pending','dispatched','sending','sent','failed','uncertain','cancelled'));
alter function public.claim_workflow_action_alert(uuid,uuid) rename to claim_workflow_action_alert_base;
revoke all on function public.claim_workflow_action_alert_base(uuid,uuid) from public,anon,authenticated,service_role;
create function public.claim_workflow_action_alert(p_id uuid,p_nonce uuid) returns setof public.workflow_action_alerts
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.workflow_action_alerts%rowtype;
begin
 select * into item from public.workflow_action_alerts where id=p_id and nonce=p_nonce and status='dispatched' for update;
 if not found then return; end if;
 if not public.workflow_followup_actionable(item.event_type,item.source_id,item.source_version,item.recipient_auth_user_id) then
  update public.workflow_action_alerts set status='cancelled',nonce=null,error_message='처리 또는 조건 변경으로 안내 취소' where id=p_id;
  update public.notifications set channel='internal',recipient_email=null,status='failed',error_message='처리 또는 조건 변경으로 안내 취소' where id=p_id and status not in ('sent','sending');
  return;
 end if;
 return query select * from public.claim_workflow_action_alert_base(p_id,p_nonce);
end;$$;
revoke all on function public.claim_workflow_action_alert(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_workflow_action_alert(uuid,uuid) to service_role;

create function public.get_workflow_exceptions() returns setof jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.is_active_admin() then raise exception 'Admin required'; end if;
 return query select jsonb_build_object('request_id',r.id,'request_no',r.request_no,'event_name',r.event_name,'type','unassigned',
  'label','임박한 미배정','count',greatest(coalesce(r.requested_people_count,r.required_count,1),1)-(select count(*) from public.request_interpreters a where a.request_id=r.id and a.status='assigned'))
  from public.requests r where public.workflow_request_open(r.id) and not public.workflow_event_started(r.id)
   and lower(public.company_assignment_window(r.id))<=(now() at time zone 'Asia/Seoul')::date+3
   and (select count(*) from public.request_interpreters a where a.request_id=r.id and a.status='assigned')<greatest(coalesce(r.requested_people_count,r.required_count,1),1)
 union all select jsonb_build_object('request_id',r.id,'request_no',r.request_no,'event_name',r.event_name,'type','review_overdue','label','완료 확인 지연','count',1)
  from public.assignment_completions c join public.requests r on r.id=c.request_id
  where c.status='submitted' and c.submitted_at<now()-interval '3 days' and public.workflow_request_open(r.id)
 union all select jsonb_build_object('request_id',r.id,'request_no',r.request_no,'event_name',r.event_name,'type','conflict','label','배정 일정 충돌','count',1)
  from public.request_interpreters a join public.requests r on r.id=a.request_id
  where a.status='assigned' and public.workflow_request_open(r.id) and exists(select 1 from public.request_interpreters other
   where other.interpreter_id=a.interpreter_id and other.status='assigned' and other.request_id<>a.request_id
    and public.workflow_request_open(other.request_id) and public.company_assignment_window(other.request_id)&&public.company_assignment_window(a.request_id));
end;$$;
revoke all on function public.get_workflow_exceptions() from public,anon;
grant execute on function public.get_workflow_exceptions() to authenticated;

update public.admin_alert_preferences set event_types=event_types||'{"admin_action_workflow":true}'::jsonb where id=true;
create function public.queue_workflow_exception_alerts() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare item record; total integer:=0; cutoff timestamptz;
begin
 select activated_at into cutoff from public.workflow_automation_config where id;
 for item in select r.id,lower(public.company_assignment_window(r.id)) as day from public.requests r
  where public.workflow_request_open(r.id) and not public.workflow_event_started(r.id)
   and lower(public.company_assignment_window(r.id)) between (now() at time zone 'Asia/Seoul')::date and (now() at time zone 'Asia/Seoul')::date+1
   and (select count(*) from public.request_interpreters a where a.request_id=r.id and a.status='assigned')<greatest(coalesce(r.requested_people_count,r.required_count,1),1) loop
  perform public.enqueue_admin_action_alert('admin_action_workflow','unassigned:'||item.id,item.day::text,'임박한 미배정 의뢰 · 확인 필요','/admin?subTab=all_requests');total:=total+1;
 end loop;
 for item in select assignment_id,submitted_at from public.assignment_completions where status='submitted'
  and submitted_at>=cutoff and submitted_at<=now()-interval '3 days' and public.workflow_request_open(request_id) loop
  perform public.enqueue_admin_action_alert('admin_action_workflow','review:'||item.assignment_id,item.submitted_at::text,'업무 완료 확인 지연 · 확인 필요','/admin?subTab=all_requests');total:=total+1;
 end loop;
 for item in select a.request_id,a.interpreter_id,other.request_id as other_request from public.request_interpreters a
  join public.request_interpreters other on other.interpreter_id=a.interpreter_id and other.request_id>a.request_id and other.status='assigned'
  where a.status='assigned' and public.workflow_request_open(a.request_id) and public.workflow_request_open(other.request_id)
   and public.company_assignment_window(a.request_id)&&public.company_assignment_window(other.request_id) loop
  perform public.enqueue_admin_action_alert('admin_action_workflow','conflict:'||item.interpreter_id||':'||item.request_id||':'||item.other_request,'','배정 일정 충돌 · 확인 필요','/admin?subTab=assignments');total:=total+1;
 end loop;
 return total;
end;$$;
revoke all on function public.queue_workflow_exception_alerts() from public,anon,authenticated;
select cron.schedule('onli-workflow-followups','*/10 * * * *','select public.prepare_workflow_followups();');
select cron.schedule('onli-workflow-exceptions','*/10 * * * *','select public.queue_workflow_exception_alerts();');
commit;
notify pgrst,'reload schema';
