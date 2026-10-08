begin;
create or replace function public.queue_workflow_matching_jobs() returns trigger
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
   and exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(to_jsonb(i)->'available_regions')='array'
    then to_jsonb(i)->'available_regions' else '[]'::jsonb end) as selected_region(value)
    where length(trim(selected_region.value))>=2 and position(lower(trim(selected_region.value)) in lower(coalesce(r.event_location,'')))>0)
   and not exists(select 1 from public.request_interpreters a where a.interpreter_id=i.id and a.status='assigned'
    and a.request_id<>r.id and public.company_assignment_window(a.request_id)&&public.company_assignment_window(r.id)) loop
  perform public.enqueue_workflow_action_alert('workflow_matching_job',r.id::text,'',person.auth_user_id,'interpreter');
 end loop;
 return new;
end;$$;
revoke all on function public.queue_workflow_matching_jobs() from public,anon,authenticated;
commit;
notify pgrst,'reload schema';

