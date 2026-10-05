begin;

-- Publish counts only; never return assignment identities or private jobs.
create or replace function public.get_public_job_counts(p_job_ids uuid[])
returns table(job_id uuid, assigned_count bigint)
language sql stable security definer set search_path=public,pg_temp as $$
  select j.id, count(distinct ri.interpreter_id)
  from public.public_jobs j
  left join public.requests r on r.job_id=j.id
  left join public.request_interpreters ri on ri.request_id=r.id and ri.status='assigned'
  where j.id=any(p_job_ids)
  group by j.id;
$$;
revoke all on function public.get_public_job_counts(uuid[]) from public;
grant execute on function public.get_public_job_counts(uuid[]) to anon,authenticated;

create or replace function public.get_portal_requests(p_request_ids bigint[] default null)
returns setof jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select public.portal_pick(to_jsonb(r), array[
    'id','request_no','request_code','request_type','company_name','event_name','title',
    'event_date','start_date','end_date','event_start_time','event_end_time','event_location',
    'location','language','language_direction','interpretation_field','work_hours',
    'requested_level','required_level','requested_people_count','required_count',
    'preferred_gender','urgency','request_details','request_detail','job_description',
    'job_field','materials_available','reference_file_name','reference_file_path',
    'reference_file_url','storage_folder_id','interpreter_id','interpreter_name',
    'status','matching_status','assignment_status',
    'operation_status','estimate_status','job_id','created_at','updated_at'
  ]) || case when public.portal_owns_request(r.id) then
    public.portal_pick(to_jsonb(r),array['company_id','company_auth_user_id','company_amount',
      'payment_status','contact_name','manager_name','email','phone','contact_email_or_phone',
      'selected_interpreter_id','selected_interpreter_name'])
  else public.portal_pick(to_jsonb(r),array['settlement_status','settlement_completed_at']) end
  || jsonb_build_object('business_profile',public.portal_pick(to_jsonb(b),
    array['company_name','contact_name','contact_phone','contact_email']),
    'job_no',j.job_no,
    'assigned_count',(select count(distinct ri.interpreter_id)
      from public.request_interpreters ri where ri.request_id=r.id and ri.status='assigned'))
  from public.requests r
  left join public.businesses b on b.auth_user_id=r.company_auth_user_id
  left join public.jobs j on j.id=r.job_id
  where auth.uid() is not null and (p_request_ids is null or r.id=any(p_request_ids))
    and (public.portal_owns_request(r.id) or public.portal_assigned(r.id))
  order by r.created_at desc;
$$;
revoke all on function public.get_portal_requests(bigint[]) from public,anon;
grant execute on function public.get_portal_requests(bigint[]) to authenticated;

-- Server-side guard prevents stale tabs and direct clients submitting past events.
create or replace function public.guard_job_application_event_date()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare event_day text; deadline_day date;
begin
  select coalesce(nullif(left(j.start_date::text,10),''),
    nullif(left(j.event_date::text,10),''),nullif(left(j.date::text,10),'')),j.deadline
    into event_day,deadline_day from public.jobs j where j.id=new.job_id;
  if event_day ~ '^\d{4}-\d{2}-\d{2}$'
    and event_day::date < (now() at time zone 'Asia/Seoul')::date then
    raise exception using errcode='22023',message='이미 시작일이 지난 행사에는 지원할 수 없습니다.';
  end if;
  if deadline_day < (now() at time zone 'Asia/Seoul')::date then
    raise exception using errcode='22023',message='지원 마감일이 지났습니다.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_job_application_event_date() from public,anon,authenticated;
drop trigger if exists guard_job_application_event_date on public.job_applications;
create trigger guard_job_application_event_date before insert on public.job_applications
for each row execute function public.guard_job_application_event_date();

commit;
notify pgrst,'reload schema';
