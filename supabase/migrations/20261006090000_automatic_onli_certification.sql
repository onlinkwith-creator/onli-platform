begin;

create table public.interpreter_certifications (
 interpreter_id bigint primary key references public.interpreters(id) on delete cascade,
 completed_count integer not null default 0 check(completed_count>=0),
 mode text not null default 'auto' check(mode in ('auto','manual_approved','manual_rejected')),
 updated_at timestamptz not null default now()
);
alter table public.interpreter_certifications enable row level security;
revoke all on public.interpreter_certifications from public,anon,authenticated;
grant select on public.interpreter_certifications to authenticated;
create policy certification_read on public.interpreter_certifications for select to authenticated
using(public.is_active_admin() or exists(select 1 from public.interpreters i
 where i.id=interpreter_id and i.auth_user_id=auth.uid()));

create function public.onli_credit_excluded(j jsonb) returns boolean
language sql immutable as $$
 select coalesce(j->>'is_test','false')='true' or coalesce(j->>'test_data','false')='true'
 or coalesce(j->>'is_test_data','false')='true'
 or lower(concat_ws(' ',j->>'event_name',j->>'title',j->>'request_no',j->>'matching_no')) ~ '(test|테스트|demo|데모)'
 or lower(concat_ws(' ',j->>'status',j->>'matching_status',j->>'assignment_status',j->>'operation_status'))
 ~ '(cancel|취소|no_show|noshow|노쇼|rejected|반려)';
$$;
create function public.onli_credit_completed(j jsonb) returns boolean
language sql immutable as $$
 select not public.onli_credit_excluded(j) and lower(coalesce(nullif(j->>'operation_status',''),j->>'status',j->>'matching_status',''))
 in ('operation_completed','completed','done','finished','업무완료','운영완료');
$$;
create function public.count_onli_completed_work(p_id bigint) returns integer
language sql stable security definer set search_path=public,pg_temp as $$
 select count(distinct credit)::integer from (
  select 'request:'||r.id as credit from public.request_interpreters a
  join public.requests r on r.id=a.request_id
  where a.interpreter_id=p_id and public.onli_credit_completed(to_jsonb(r))
   and not public.onli_credit_excluded(to_jsonb(a))
  union
  select 'request:'||r.id from public.requests r
  where coalesce(to_jsonb(r)->>'assigned_interpreter_id',to_jsonb(r)->>'matched_interpreter_id')=p_id::text
   and public.onli_credit_completed(to_jsonb(r))
   and not exists(select 1 from public.request_interpreters a where a.request_id=r.id
    and a.interpreter_id=p_id and public.onli_credit_excluded(to_jsonb(a)))
  union
  select case when m.request_id is not null then 'request:'||m.request_id
   when m.job_id is not null then 'job:'||m.job_id else 'matching:'||m.id end
  from public.matchings m left join public.requests r on r.id=m.request_id
  left join public.jobs j on j.id=m.job_id
  where m.interpreter_id=p_id and not public.onli_credit_excluded(to_jsonb(m))
   and not public.onli_credit_excluded(coalesce(to_jsonb(j),'{}'::jsonb))
   and case when m.request_id is not null then public.onli_credit_completed(to_jsonb(r))
    else public.onli_credit_completed(to_jsonb(m)) end
   and not exists(select 1 from public.request_interpreters a where a.request_id=m.request_id
    and a.interpreter_id=p_id and public.onli_credit_excluded(to_jsonb(a)))
 ) credits;
$$;
revoke all on function public.count_onli_completed_work(bigint) from public,anon,authenticated;

create function public.refresh_onli_certifications() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.interpreter_certifications(interpreter_id,completed_count,mode)
 select i.id,public.count_onli_completed_work(i.id),case when i.approved then 'manual_approved' else 'auto' end
 from public.interpreters i
 on conflict(interpreter_id) do update set completed_count=excluded.completed_count,updated_at=now()
 where interpreter_certifications.completed_count is distinct from excluded.completed_count;
 return null;
end;
$$;
revoke all on function public.refresh_onli_certifications() from public,anon,authenticated;
create trigger certification_request_changes after insert or update or delete on public.requests
for each statement execute function public.refresh_onli_certifications();
create trigger certification_assignment_changes after insert or update or delete on public.request_interpreters
for each statement execute function public.refresh_onli_certifications();
create trigger certification_matching_changes after insert or update or delete on public.matchings
for each statement execute function public.refresh_onli_certifications();
create trigger certification_job_changes after update or delete on public.jobs
for each statement execute function public.refresh_onli_certifications();

create function public.capture_manual_onli_certification() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' and not coalesce(new.approved,false) then return new; end if;
 if public.is_active_admin() then
  insert into public.interpreter_certifications(interpreter_id,completed_count,mode)
  values(new.id,public.count_onli_completed_work(new.id),case when new.approved then 'manual_approved' else 'manual_rejected' end)
  on conflict(interpreter_id) do update set mode=excluded.mode,completed_count=excluded.completed_count,updated_at=now();
 end if;
 return new;
end;
$$;
revoke all on function public.capture_manual_onli_certification() from public,anon,authenticated;
create trigger certification_manual_change after update of approved on public.interpreters
for each row execute function public.capture_manual_onli_certification();
create trigger certification_initial_manual after insert on public.interpreters
for each row execute function public.capture_manual_onli_certification();

insert into public.interpreter_certifications(interpreter_id,completed_count,mode)
select id,public.count_onli_completed_work(id),case when approved then 'manual_approved' else 'auto' end
from public.interpreters;

create function public.get_interpreter_certifications()
returns table(interpreter_id bigint,completed_count integer,mode text,certified boolean)
language sql stable security definer set search_path=public,pg_temp as $$
 select i.id,coalesce(c.completed_count,0),coalesce(c.mode,'auto'),
 case when c.mode='manual_rejected' then false when c.mode='manual_approved' then true
 else coalesce(c.completed_count,0)>=5 end
 from public.interpreters i left join public.interpreter_certifications c on c.interpreter_id=i.id
 where auth.uid() is not null and (public.is_active_admin() or i.auth_user_id=auth.uid());
$$;
revoke all on function public.get_interpreter_certifications() from public,anon;
grant execute on function public.get_interpreter_certifications() to authenticated;

create function public.set_onli_certification_mode(p_id bigint,p_mode text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_active_admin() then raise exception 'Admin required'; end if;
 if p_mode not in ('auto','manual_approved','manual_rejected') or p_mode is null then raise exception 'Invalid mode'; end if;
 insert into public.interpreter_certifications(interpreter_id,completed_count,mode)
 values(p_id,public.count_onli_completed_work(p_id),p_mode)
 on conflict(interpreter_id) do update set mode=excluded.mode,completed_count=excluded.completed_count,updated_at=now();
end;
$$;
revoke all on function public.set_onli_certification_mode(bigint,text) from public,anon;
grant execute on function public.set_onli_certification_mode(bigint,text) to authenticated;

create or replace view public.public_interpreters as
select i.id,i.name,i.region,i.level,i.short_intro,i.specialties,i.available_regions,
 i.experience_count,i.is_public,i.status,
 case when c.mode='manual_rejected' then false when c.mode='manual_approved' then true
 else coalesce(c.completed_count,0)>=5 end as verified,i.custom_regions
from public.interpreters i left join public.interpreter_certifications c on c.interpreter_id=i.id
where coalesce(i.is_public,false)=true and i.withdrawn_at is null
and lower(trim(coalesce(i.status,''))) in ('active','warning','approved','verified','승인','승인 완료','승인완료','활동중');

commit;
notify pgrst,'reload schema';
