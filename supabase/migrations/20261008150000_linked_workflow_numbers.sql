begin;

-- Keep UUIDs/FKs intact. Allocate immutable display numbers under the request.
create table public.workflow_number_registry (
 kind text not null, entity text not null, prefix text not null, sequence integer not null,
 number text not null unique, legacy_number text, primary key(kind,entity), unique(prefix,sequence)
);
alter table public.workflow_number_registry enable row level security;
revoke all on public.workflow_number_registry from public,anon,authenticated;
grant all on public.workflow_number_registry to service_role;
alter table public.request_interpreters add column if not exists assignment_no text;

create function public.allocate_linked_workflow_number(p_kind text,p_entity text,p_prefix text,p_legacy text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare result text; next_sequence integer;
begin
 perform pg_advisory_xact_lock(hashtext('workflow-number:'||p_prefix));
 select number into result from public.workflow_number_registry where kind=p_kind and entity=p_entity;
 if result is not null then return result; end if;
 select coalesce(max(sequence),0)+1 into next_sequence from public.workflow_number_registry where prefix=p_prefix;
 result:=p_prefix||'-'||case when p_kind='job' then next_sequence::text else lpad(next_sequence::text,3,'0') end;
 insert into public.workflow_number_registry values(p_kind,p_entity,p_prefix,next_sequence,result,p_legacy);
 return result;
end;$$;
revoke all on function public.allocate_linked_workflow_number(text,text,text,text) from public,anon,authenticated;

create function public.sync_linked_workflow_numbers() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare parent_no text; linked_job uuid; request_key bigint; assigned_number text; canonical_id bigint;
begin
 if tg_table_name='requests' then
  if new.job_id is null or nullif(new.request_no,'') is null then return new; end if;
  -- Ambiguous legacy links must be reviewed, not silently renumbered.
  if (select count(*) from public.requests where job_id=new.job_id)>1 then return new; end if;
  update public.jobs set job_no=public.allocate_linked_workflow_number('job',new.job_id::text,new.request_no,job_no)
   where id=new.job_id and job_no is distinct from public.allocate_linked_workflow_number('job',new.job_id::text,new.request_no,job_no);
  update public.job_applications set application_no=public.allocate_linked_workflow_number('application',id::text,
   (select job_no from public.jobs where id=new.job_id)||'-APP',application_no) where job_id=new.job_id;
  update public.request_interpreters set assignment_no=public.allocate_linked_workflow_number('assignment',id::text,
   (select job_no from public.jobs where id=new.job_id)||'-ASG',assignment_no) where request_id=new.id;
  -- Existing history numbers stay stable when a job is linked again.
 elsif tg_table_name='job_applications' then
  select job_no into parent_no from public.jobs where id=new.job_id;
  if parent_no ~ '^ONLI-REQ-[0-9]+-[0-9]+$' then
   new.application_no:=public.allocate_linked_workflow_number('application',new.id::text,parent_no||'-APP',new.application_no);
  end if;
 else
  request_key:=new.request_id;
  select r.job_id,coalesce(j.job_no,r.request_no) into linked_job,parent_no
   from public.requests r left join public.jobs j on j.id=r.job_id where r.id=request_key;
  if parent_no ~ '^ONLI-REQ-[0-9]+(-[0-9]+)?$' then
   if tg_table_name='request_interpreters' then
    new.assignment_no:=public.allocate_linked_workflow_number('assignment',new.id::text,parent_no||'-ASG',new.assignment_no);
   else
    select id into canonical_id from public.request_interpreters where request_id=request_key and interpreter_id=new.interpreter_id and status='assigned' order by id desc limit 1;
    assigned_number:=case when canonical_id is not null and new.status in ('assigned','accepted','confirmed','in_progress')
     then public.allocate_linked_workflow_number('assignment',canonical_id::text,parent_no||'-ASG',new.matching_no)
     else public.allocate_linked_workflow_number('matching-history',new.id::text,parent_no||'-ASG',new.matching_no) end;
    if exists(select 1 from public.matchings m where m.matching_no=assigned_number and m.id is distinct from new.id) then
     assigned_number:=public.allocate_linked_workflow_number('matching-history',new.id::text,parent_no||'-ASG',new.matching_no);
    end if;
    new.matching_no:=assigned_number;
   end if;
  end if;
 end if;
 return new;
end;$$;
revoke all on function public.sync_linked_workflow_numbers() from public,anon,authenticated;
create trigger zz_linked_request_number after insert or update of job_id on public.requests
 for each row execute function public.sync_linked_workflow_numbers();
create trigger zz_linked_application_number before insert on public.job_applications
 for each row execute function public.sync_linked_workflow_numbers();
create trigger zz_linked_assignment_number before insert on public.request_interpreters
 for each row execute function public.sync_linked_workflow_numbers();
create trigger zz_linked_matching_number before insert on public.matchings
 for each row execute function public.sync_linked_workflow_numbers();

do $$declare r record; parent_no text; a record; assigned_number text; canonical_id bigint; previous_role text:=current_setting('request.jwt.claim.role',true);
begin
 -- Owner-run backfill only; restore the transaction-local JWT role afterwards.
 perform set_config('request.jwt.claim.role','service_role',true);
 for r in select req.id,req.request_no,req.job_id from public.requests req
  where req.job_id is not null and req.request_no ~ '^ONLI-REQ-[0-9]+$'
   and (select count(*) from public.requests other where other.job_id=req.job_id)=1 order by req.id loop
  update public.jobs set job_no=public.allocate_linked_workflow_number('job',r.job_id::text,r.request_no,job_no) where id=r.job_id
   returning job_no into parent_no;
  for a in select id,application_no from public.job_applications where job_id=r.job_id order by created_at,id loop
   update public.job_applications set application_no=public.allocate_linked_workflow_number('application',a.id::text,parent_no||'-APP',a.application_no) where id=a.id;
  end loop;
  for a in select id,interpreter_id,assignment_no from public.request_interpreters where request_id=r.id order by assigned_at,id loop
   update public.request_interpreters set assignment_no=public.allocate_linked_workflow_number('assignment',a.id::text,parent_no||'-ASG',a.assignment_no) where id=a.id;
  end loop;
  for a in select id,interpreter_id,matching_no,status from public.matchings where request_id=r.id order by id desc loop
   select id into canonical_id from public.request_interpreters where request_id=r.id and interpreter_id=a.interpreter_id and status='assigned' order by id desc limit 1;
   assigned_number:=case when canonical_id is not null and a.status in ('assigned','accepted','confirmed','in_progress')
    then public.allocate_linked_workflow_number('assignment',canonical_id::text,parent_no||'-ASG',a.matching_no)
    else public.allocate_linked_workflow_number('matching-history',a.id::text,parent_no||'-ASG',a.matching_no) end;
   if exists(select 1 from public.matchings m where m.matching_no=assigned_number and m.id<>a.id) then
    assigned_number:=public.allocate_linked_workflow_number('matching-history',a.id::text,parent_no||'-ASG',a.matching_no);
   end if;
   update public.matchings set matching_no=assigned_number where id=a.id;
  end loop;
 end loop;
 perform set_config('request.jwt.claim.role',coalesce(previous_role,''),true);
end;$$;

-- Preserve the existing owner-only projection and add display identifiers only.
alter function public.get_my_work_completions() rename to get_my_work_completions_number_base;
revoke all on function public.get_my_work_completions_number_base() from public,anon,authenticated;
create function public.get_my_work_completions() returns setof jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select item||jsonb_build_object('assignment_no',a.assignment_no,'job_no',j.job_no)
 from public.get_my_work_completions_number_base() item
 join public.request_interpreters a on a.id=(item->>'assignment_id')::bigint
 join public.requests r on r.id=a.request_id left join public.jobs j on j.id=r.job_id;
$$;
revoke all on function public.get_my_work_completions() from public,anon;
grant execute on function public.get_my_work_completions() to authenticated;
commit;
notify pgrst,'reload schema';
