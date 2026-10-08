begin;

-- A date-only deadline remains open through the end of that day in Korea.
create function public.workflow_recruiting_deadline_passed(p_job uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.jobs where id=p_job
  and deadline < (now() at time zone 'Asia/Seoul')::date);
$$;
revoke all on function public.workflow_recruiting_deadline_passed(uuid) from public,anon,authenticated;

create or replace function public.sync_request_interpreter_assignment_lifecycle()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare request_key bigint; interpreter_key bigint; job_key uuid; required integer;
 assigned integer; primary_id bigint; primary_name text;
begin
 request_key:=case when tg_op='DELETE' then old.request_id else new.request_id end;
 interpreter_key:=case when tg_op='DELETE' then old.interpreter_id else new.interpreter_id end;
 select r.job_id,greatest(coalesce(r.requested_people_count,r.required_count,1),1)
 into job_key,required from public.requests r where r.id=request_key for update;
 if not found or not public.workflow_request_open(request_key) then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if job_key is not null then
  update public.job_applications set status=case
   when tg_op='DELETE' or new.status is distinct from 'assigned' then 'pending' else 'accepted' end
  where job_id=job_key and interpreter_id=interpreter_key and status not in ('rejected','cancelled','withdrawn');
 end if;
 if tg_op='DELETE' or new.status is distinct from 'assigned' then
  update public.matchings set status='cancelled' where request_id=request_key and interpreter_id=interpreter_key
   and status in ('pending','accepted','assigned','confirmed','in_progress');
 end if;
 select count(*)::integer into assigned from public.request_interpreters where request_id=request_key and status='assigned';
 select a.interpreter_id,i.name into primary_id,primary_name from public.request_interpreters a
  join public.interpreters i on i.id=a.interpreter_id where a.request_id=request_key and a.status='assigned'
  order by a.assigned_at desc,a.id desc limit 1;
 update public.requests set status=case when assigned=0 then 'draft' else 'assigned' end,
  matching_status=case when assigned=0 then 'draft' else 'assigned' end,
  assignment_status=case when assigned=0 then 'assignment_pending' when assigned<required then 'assignment_in_progress' else 'assignment_completed' end,
  assigned_interpreter_id=primary_id,assigned_interpreter_name=primary_name,
  matched_interpreter_id=primary_id,matched_interpreter_name=primary_name,updated_at=now()
 where id=request_key;
 -- Recruiting status belongs exclusively to sync_workflow_recruiting. The old
 -- unconditional 'open' here erased manual closures before the later trigger ran.
 update public.jobs set assignment_status=case when assigned=0 then 'assignment_pending'
  when assigned<required then 'assignment_in_progress' else 'assignment_completed' end where id=job_key;
 if tg_op='DELETE' then return old; else return new; end if;
end;$$;
revoke all on function public.sync_request_interpreter_assignment_lifecycle() from public,anon,authenticated;

create or replace function public.sync_workflow_recruiting(p_request bigint,p_version text default '') returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.requests%rowtype; assigned integer; needed integer; reason text; current_status text; person record;
begin
 select * into r from public.requests where id=p_request for update;
 if not found or r.job_id is null or not public.workflow_request_open(r.id) then return; end if;
 -- Ambiguous legacy shared jobs cannot safely be controlled by either request.
 if (select count(*) from public.requests where job_id=r.job_id)>1 then return; end if;
 select lower(coalesce(status,'')) into current_status from public.jobs where id=r.job_id for update;
 if not found then return; end if;
 select count(*) into assigned from public.request_interpreters where request_id=r.id and status='assigned';
 needed:=greatest(coalesce(r.requested_people_count,r.required_count,1),1);
 reason:=case when public.workflow_event_started(r.id) then 'started'
  when public.workflow_recruiting_deadline_passed(r.job_id) then 'deadline'
  when assigned>=needed then 'capacity' end;
 if reason is not null then
  if current_status in ('open','recruiting','모집중','closing_soon','마감임박')
   or (current_status in ('assigned','closed') and exists(select 1 from public.workflow_closed_jobs where job_id=r.job_id)) then
   update public.jobs set status=case when reason='capacity' then 'assigned' else 'closed' end where id=r.job_id;
   insert into public.workflow_closed_jobs values(r.job_id,reason,now())
    on conflict(job_id) do update set reason=excluded.reason,updated_at=now();
  end if;
 elsif exists(select 1 from public.workflow_closed_jobs closed where closed.job_id=r.job_id and closed.reason='capacity') then
  if current_status in ('assigned','open','recruiting','모집중','배정완료','배정 완료') then
   update public.jobs set status='open' where id=r.job_id;
   for person in select distinct i.auth_user_id from public.job_applications a join public.interpreters i on i.id=a.interpreter_id
    where a.job_id=r.job_id and a.status in ('pending','reviewing','accepted','approved')
     and i.is_public and i.activity_status='active' and i.withdrawn_at is null
     and not exists(select 1 from public.request_interpreters active where active.request_id=r.id
      and active.interpreter_id=i.id and active.status='assigned') loop
    perform public.enqueue_workflow_action_alert('workflow_recruiting_reopened',r.id::text,p_version,person.auth_user_id,'interpreter');
   end loop;
  end if;
  delete from public.workflow_closed_jobs where job_id=r.job_id;
 end if;
end;$$;

create or replace function public.guard_workflow_recruiting_application() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.requests%rowtype; job_status text;
begin
 for r in select * from public.requests where job_id=new.job_id order by id for update loop
  if not public.workflow_request_open(r.id) or public.workflow_event_started(r.id) then raise exception 'WORKFLOW_RECRUITING_CLOSED'; end if;
  if (select count(*) from public.request_interpreters where request_id=r.id and status='assigned')>=greatest(coalesce(r.requested_people_count,r.required_count,1),1)
   then raise exception 'WORKFLOW_RECRUITING_FULL'; end if;
 end loop;
 select lower(coalesce(status,'')) into job_status from public.jobs where id=new.job_id for update;
 if job_status not in ('open','모집중','recruiting','closing_soon','마감임박')
  or public.workflow_recruiting_deadline_passed(new.job_id) then raise exception 'WORKFLOW_RECRUITING_CLOSED'; end if;
 return new;
end;$$;

-- Reuse the existing event/template/worker allowlist, with a company-specific link.
alter function public.enqueue_workflow_action_alert(text,text,text,uuid,text) rename to enqueue_workflow_action_alert_before_recruiting;
revoke all on function public.enqueue_workflow_action_alert_before_recruiting(text,text,text,uuid,text) from public,anon,authenticated;
create function public.enqueue_workflow_action_alert(p_type text,p_source text,p_version text,p_user uuid,p_role text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient text; alert_id uuid; heading text:='배정 빈자리 안내';
 body text:='확정 배정이 취소되어 빈자리가 생겼습니다. 지원자를 확인하고 다른 통역사에게 배정을 요청해 주세요.';
 path text:='/business/mypage?tab=applicants';
begin
 if p_type<>'workflow_recruiting_reopened' or p_role<>'company' then
  return public.enqueue_workflow_action_alert_before_recruiting(p_type,p_source,p_version,p_user,p_role);
 end if;
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

create function public.workflow_assignment_vacancy_alert() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare request_key bigint; owner_id uuid;
begin
 if old.status<>'assigned' or (tg_op='UPDATE' and new.status='assigned') then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 request_key:=old.request_id;
 if public.workflow_request_open(request_key) and not public.workflow_event_started(request_key)
  and exists(select 1 from public.requests r join public.jobs j on j.id=r.job_id where r.id=request_key
   and not public.workflow_recruiting_deadline_passed(j.id) and lower(coalesce(j.status,'')) in ('open','recruiting','모집중','closing_soon')
   and (select count(*) from public.request_interpreters where request_id=r.id and status='assigned')<greatest(coalesce(r.requested_people_count,r.required_count,1),1)) then
  select b.auth_user_id into owner_id from public.requests r join public.businesses b
   on b.id=r.company_id or b.auth_user_id=r.company_auth_user_id where r.id=request_key and b.status='승인 완료' order by b.id limit 1;
  perform public.enqueue_workflow_action_alert('workflow_recruiting_reopened',request_key::text,
   'vacancy:'||old.id||':'||clock_timestamp()::text,owner_id,'company');
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end;$$;
revoke all on function public.workflow_assignment_vacancy_alert() from public,anon,authenticated;
create trigger zzz_workflow_assignment_vacancy_alert after delete or update of status on public.request_interpreters
 for each row execute function public.workflow_assignment_vacancy_alert();

create function public.workflow_recruiting_request_changed() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.sync_workflow_recruiting(new.id,'request:'||new.id||':'||clock_timestamp()::text);
 return new;
end;$$;
revoke all on function public.workflow_recruiting_request_changed() from public,anon,authenticated;
create trigger workflow_recruiting_request_changed after update of requested_people_count,required_count,start_date,end_date,event_start_time
 on public.requests for each row execute function public.workflow_recruiting_request_changed();

-- Original private claim rechecks remain in place, including message unread alerts.
alter function public.workflow_followup_actionable(text,text,text,uuid) rename to workflow_followup_actionable_before_recruiting;
revoke all on function public.workflow_followup_actionable_before_recruiting(text,text,text,uuid) from public,anon,authenticated;
create function public.workflow_followup_actionable(p_type text,p_source text,p_version text,p_user uuid) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if p_type='workflow_recruiting_reopened' and p_version like 'vacancy:%' then
  return exists(select 1 from public.requests r join public.jobs j on j.id=r.job_id join public.businesses b
   on b.id=r.company_id or b.auth_user_id=r.company_auth_user_id where r.id::text=p_source
   and b.auth_user_id=p_user and b.status='승인 완료' and public.workflow_request_open(r.id)
   and not public.workflow_event_started(r.id) and not public.workflow_recruiting_deadline_passed(j.id)
   and lower(coalesce(j.status,'')) in ('open','recruiting','모집중','closing_soon')
   and (select count(*) from public.request_interpreters where request_id=r.id and status='assigned')<greatest(coalesce(r.requested_people_count,r.required_count,1),1));
 end if;
 if p_type in ('workflow_matching_job','workflow_recruiting_reopened') and exists(select 1 from public.requests r
  where r.id::text=p_source and public.workflow_recruiting_deadline_passed(r.job_id)) then return false; end if;
 return public.workflow_followup_actionable_before_recruiting(p_type,p_source,p_version,p_user);
end;$$;
revoke all on function public.workflow_followup_actionable(text,text,text,uuid) from public,anon,authenticated;

commit;
notify pgrst,'reload schema';
