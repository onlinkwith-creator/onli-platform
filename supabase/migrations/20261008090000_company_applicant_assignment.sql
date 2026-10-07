begin;

-- Serialize administrator and company inserts against the same headcount.
create function public.guard_assignment_capacity() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare required integer;
begin
 select greatest(coalesce(requested_people_count,required_count,1),1)
 into required from public.requests where id=new.request_id for update;
 if not found then raise exception 'ASSIGNMENT_REQUEST_NOT_FOUND'; end if;
 perform 1 from public.interpreters where id=new.interpreter_id for update;
 if new.status='assigned' and not exists (
  select 1 from public.request_interpreters where request_id=new.request_id
   and interpreter_id=new.interpreter_id and status='assigned'
 ) and (select count(*) from public.request_interpreters
   where request_id=new.request_id and status='assigned')>=required then
  raise exception 'ASSIGNMENT_CAPACITY_FULL';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_assignment_capacity() from public,anon,authenticated;
create trigger guard_assignment_capacity before insert or update of request_id,interpreter_id,status on public.request_interpreters
for each row execute function public.guard_assignment_capacity();

create function public.company_assignment_window(p_request_id bigint)
returns daterange language sql stable security definer set search_path=public,pg_temp as $$
 select daterange(
  coalesce(nullif(to_jsonb(r)->>'start_date','')::date,nullif(to_jsonb(r)->>'event_date','')::date,
   nullif(to_jsonb(j)->>'start_date','')::date,nullif(to_jsonb(j)->>'event_date','')::date),
  coalesce(nullif(to_jsonb(r)->>'end_date','')::date,nullif(to_jsonb(j)->>'end_date','')::date,
   nullif(to_jsonb(r)->>'start_date','')::date,nullif(to_jsonb(r)->>'event_date','')::date,
   nullif(to_jsonb(j)->>'start_date','')::date,nullif(to_jsonb(j)->>'event_date','')::date), '[]')
 from public.requests r left join public.jobs j on j.id=r.job_id where r.id=p_request_id;
$$;
revoke all on function public.company_assignment_window(bigint) from public,anon,authenticated;

create function public.assign_company_applicant(p_request_id bigint,p_application_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.requests%rowtype; a public.job_applications%rowtype;
 existing public.request_interpreters%rowtype; event_window daterange; assignment_key bigint; target_interpreter bigint;
begin
 if not public.portal_owns_request(p_request_id) then
  raise exception 'ASSIGNMENT_FORBIDDEN' using errcode='42501';
 end if;
 select * into r from public.requests where id=p_request_id for update;
 select * into a from public.job_applications where id=p_application_id and job_id=r.job_id;
 if not found or a.interpreter_id is null then raise exception 'ASSIGNMENT_INVALID_APPLICATION'; end if;
 -- Request, interpreter, then application: consistent with assignment triggers.
 target_interpreter:=a.interpreter_id;
 perform 1 from public.interpreters where id=target_interpreter for update;
 select * into a from public.job_applications where id=p_application_id and job_id=r.job_id for update;
 if not found or a.interpreter_id is distinct from target_interpreter then
  raise exception 'ASSIGNMENT_INVALID_APPLICATION';
 end if;
 if not public.portal_owns_request(p_request_id) then
  raise exception 'ASSIGNMENT_FORBIDDEN' using errcode='42501';
 end if;
 select * into existing from public.request_interpreters
 where request_id=r.id and interpreter_id=a.interpreter_id;
 if found then
  if existing.status='assigned' then
   return jsonb_build_object('assignment_id',existing.id,'already_assigned',true);
  end if;
  raise exception 'ASSIGNMENT_ADMIN_REQUIRED';
 end if;
 if a.status not in ('pending','reviewing','accepted','approved') then
  raise exception 'ASSIGNMENT_APPLICATION_UNAVAILABLE';
 end if;
 if not exists(select 1 from public.public_interpreters where id=a.interpreter_id)
 or exists(select 1 from public.interpreters where id=a.interpreter_id
  and coalesce(activity_status,'active') not in ('active','활동중')) then
  raise exception 'ASSIGNMENT_INTERPRETER_UNAVAILABLE';
 end if;
 if lower(concat_ws(' ',r.status,r.operation_status)) ~ '(cancel|complete|finished|in_progress|취소|완료|진행중|운영중)'
 then raise exception 'ASSIGNMENT_REQUEST_CLOSED'; end if;
 event_window:=public.company_assignment_window(r.id);
 if event_window is null or lower_inf(event_window) or upper_inf(event_window) or isempty(event_window) then
  raise exception 'ASSIGNMENT_SCHEDULE_MISSING';
 end if;
 if lower(event_window)<(now() at time zone 'Asia/Seoul')::date then
  raise exception 'ASSIGNMENT_REQUEST_CLOSED';
 end if;
 if exists(select 1 from public.request_interpreters ri join public.requests other on other.id=ri.request_id
  where ri.interpreter_id=a.interpreter_id and ri.status='assigned' and ri.request_id<>r.id
   and lower(concat_ws(' ',other.status,other.operation_status)) !~ '(cancel|취소)'
   and public.company_assignment_window(other.id) && event_window)
 or exists(select 1 from public.matchings m where m.interpreter_id=a.interpreter_id
   and m.status in ('assigned','confirmed','in_progress')
   and m.request_id is distinct from r.id and m.job_id is distinct from r.job_id
   and m.start_date<=upper(event_window)-1 and m.end_date>=lower(event_window)) then
  raise exception 'ASSIGNMENT_SCHEDULE_CONFLICT';
 end if;
 insert into public.request_interpreters(request_id,interpreter_id,status,contact_visible)
 values(r.id,a.interpreter_id,'assigned',false) returning id into assignment_key;
 -- Existing assignment triggers synchronize requests, jobs, settlements and notifications.
 update public.job_applications set status='accepted' where id=a.id;
 return jsonb_build_object('assignment_id',assignment_key,'already_assigned',false);
end;
$$;
revoke all on function public.assign_company_applicant(bigint,uuid) from public,anon;
grant execute on function public.assign_company_applicant(bigint,uuid) to authenticated;

create or replace function public.get_company_portal_applicants(p_request_id bigint)
returns setof jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',a.id,'request_id',r.id,'status',a.status,
  'application_no',to_jsonb(a)->'application_no','created_at',a.created_at,
  'assigned',exists(select 1 from public.request_interpreters ri where ri.request_id=r.id
   and ri.interpreter_id=a.interpreter_id and ri.status='assigned'),
  'assigned_count',(select count(*) from public.request_interpreters ri where ri.request_id=r.id and ri.status='assigned'),
  'required_count',greatest(coalesce(r.requested_people_count,r.required_count,1),1),
  'assignment_open',coalesce(
   not lower_inf(public.company_assignment_window(r.id))
   and not upper_inf(public.company_assignment_window(r.id))
   and not isempty(public.company_assignment_window(r.id))
   and lower(public.company_assignment_window(r.id)) >= (now() at time zone 'Asia/Seoul')::date
   and lower(concat_ws(' ',r.status,r.operation_status)) !~ '(cancel|complete|finished|in_progress|취소|완료|진행중|운영중)',false),
  'profile',case when i.id is null then null else public.portal_pick(to_jsonb(i),array[
   'id','name','level','short_intro','specialties','region','available_regions','custom_regions','experience_count','verified']) end)
 from public.requests r join public.job_applications a on a.job_id=r.job_id
 left join public.public_interpreters i on i.id=a.interpreter_id
 where r.id=p_request_id and public.portal_owns_request(r.id) order by a.created_at desc,a.id;
$$;
revoke all on function public.get_company_portal_applicants(bigint) from public,anon;
grant execute on function public.get_company_portal_applicants(bigint) to authenticated;
commit;
notify pgrst,'reload schema';
