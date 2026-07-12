-- Centralize request/job change notifications and retain deleted rows for audit.

alter table public.notifications
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists notifications_active_created_idx
  on public.notifications(created_at desc) where deleted_at is null;

create or replace function public.notification_status_label(value text)
returns text language sql immutable as $$
  select coalesce((jsonb_build_object(
    'assignment_pending','배정대기', 'assignment_in_progress','배정중', 'assignment_completed','배정완료',
    'operation_before','운영전', 'operation_in_progress','운영중', 'operation_completed','업무완료',
    'settlement_pending','정산 대기', 'settlement_confirmed','정산 확정',
    'interpreter_payment','통역사 지급', 'settlement_completed','정산 완료',
    'quote_pending','견적 준비중', 'quote_confirmed','견적 승인 완료'
  )->>coalesce(value,'')), nullif(value,''), '-');
$$;

create or replace function public.create_request_change_notifications(
  p_request_id bigint,
  p_job_id bigint,
  p_change_type text,
  p_old_value text,
  p_new_value text,
  p_changed_by uuid default auth.uid(),
  p_title text default '[ON-LI] 의뢰 상태가 변경되었습니다',
  p_message text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_request record; v_job record; v_recipient record; v_count integer := 0;
  v_request_no text; v_request_name text; v_label text; v_body text;
begin
  select * into v_request from public.requests where id = p_request_id;
  select * into v_job from public.jobs where id = coalesce(p_job_id, v_request.job_id);
  v_request_no := coalesce(to_jsonb(v_request)->>'request_no', to_jsonb(v_request)->>'request_code',
    to_jsonb(v_request)->>'management_no', to_jsonb(v_job)->>'management_no', p_request_id::text, p_job_id::text, '-');
  v_request_name := coalesce(to_jsonb(v_request)->>'event_name', to_jsonb(v_request)->>'title',
    to_jsonb(v_job)->>'title', to_jsonb(v_job)->>'event_name', '통역 의뢰');
  v_label := case p_change_type
    when 'assignment_status' then '배정상태' when 'operation_status' then '운영상태'
    when 'settlement_status' then '정산상태' when 'quote_status' then '견적상태'
    when 'event_date' then '행사일정' when 'start_date' then '행사일정'
    when 'end_date' then '행사일정' when 'location' then '장소'
    when 'assigned_interpreter' then '배정 통역사' when 'materials' then '자료'
    else '의뢰 주요 정보' end;
  v_body := coalesce(p_message, format(E'의뢰명: %s\n의뢰번호: %s\n변경 항목: %s\n변경 전: %s\n변경 후: %s\n변경일시: %s',
    v_request_name, v_request_no, v_label, public.notification_status_label(p_old_value),
    public.notification_status_label(p_new_value), to_char(now() at time zone 'Asia/Seoul','YYYY.MM.DD HH24:MI')));

  for v_recipient in
    with recipients as (
      select 'admin'::text recipient_type, au.auth_user_id recipient_id, au.email, '관리자'::text name
        from public.admin_users au where au.status='active'
      union all
      select 'company', coalesce(v_request.company_auth_user_id, b.auth_user_id),
        coalesce(b.contact_email, to_jsonb(v_request)->>'company_email', to_jsonb(v_request)->>'email'),
        coalesce(b.company_name, to_jsonb(v_request)->>'company_name','기업 담당자')
        from public.businesses b where b.id = coalesce(v_request.company_id, v_job.company_id)
           or b.auth_user_id = v_request.company_auth_user_id
      union all
      select 'interpreter', i.auth_user_id, i.email, coalesce(i.name,'통역사')
        from public.request_interpreters ri join public.interpreters i on i.id=ri.interpreter_id
       where ri.request_id=p_request_id and coalesce(to_jsonb(ri)->>'status','assigned') not in ('applied','rejected','cancelled')
    ) select distinct on (recipient_type, recipient_id, email) * from recipients
  loop
    if not exists (
      select 1 from public.notifications n where n.deleted_at is null
       and n.related_request_id is not distinct from p_request_id
       and n.recipient_type=v_recipient.recipient_type
       and n.recipient_id is not distinct from v_recipient.recipient_id
       and n.notification_type=p_change_type
       and n.metadata->>'old_value'=coalesce(p_old_value,'') and n.metadata->>'new_value'=coalesce(p_new_value,'')
       and n.created_at > now()-interval '1 minute'
    ) then
      insert into public.notifications(recipient_type,recipient_id,recipient_name,recipient_email,
        notification_type,title,message,related_request_id,channel,status,metadata)
      values(v_recipient.recipient_type,v_recipient.recipient_id,v_recipient.name,v_recipient.email,
        p_change_type,p_title,
        case v_recipient.recipient_type when 'company' then '의뢰하신 통역 건의 상태가 변경되었습니다.'||E'\n'||v_body
          when 'interpreter' then '배정된 통역 업무의 상태가 변경되었습니다. 일정과 장소를 다시 확인해 주세요.'||E'\n'||v_body
          else '관리자에 의해 의뢰 상태가 변경되었습니다.'||E'\n'||v_body end,
        p_request_id,'internal','pending',jsonb_build_object('job_id',p_job_id,'change_type',p_change_type,
          'old_value',coalesce(p_old_value,''),'new_value',coalesce(p_new_value,''),'changed_by',p_changed_by,
          'request_no',v_request_no,'event_name',v_request_name));
      v_count := v_count+1;
      if nullif(trim(coalesce(v_recipient.email,'')),'') is not null then
        insert into public.notifications(recipient_type,recipient_id,recipient_name,recipient_email,
          notification_type,title,message,related_request_id,channel,status,metadata)
        values(v_recipient.recipient_type,v_recipient.recipient_id,v_recipient.name,v_recipient.email,
          p_change_type,p_title,v_body,p_request_id,'email','pending',jsonb_build_object('job_id',p_job_id,
          'change_type',p_change_type,'old_value',coalesce(p_old_value,''),'new_value',coalesce(p_new_value,''),
          'changed_by',p_changed_by,'request_no',v_request_no,'event_name',v_request_name));
      end if;
    end if;
  end loop;
  return v_count;
exception when others then
  raise warning 'request change notification failed: %', sqlerrm;
  return v_count;
end $$;

create or replace function public.notify_request_changes_centrally()
returns trigger language plpgsql security definer set search_path=public as $$
declare k text; old_v text; new_v text; req_id bigint; job_id bigint;
begin
  req_id := case when tg_table_name='requests' then new.id else nullif(to_jsonb(new)->>'request_id','')::bigint end;
  job_id := case when tg_table_name='jobs' then new.id else nullif(to_jsonb(new)->>'job_id','')::bigint end;
  if req_id is null and job_id is not null then select id into req_id from public.requests where requests.job_id=job_id limit 1; end if;
  foreach k in array array['quote_status','assignment_status','operation_status','settlement_status','status','event_date','start_date','end_date','location','assigned_interpreter_id'] loop
    old_v := to_jsonb(old)->>k; new_v := to_jsonb(new)->>k;
    if old_v is distinct from new_v then perform public.create_request_change_notifications(req_id,job_id,k,old_v,new_v,auth.uid()); end if;
  end loop;
  return new;
end $$;

drop trigger if exists notify_request_changes_centrally on public.requests;
create trigger notify_request_changes_centrally after update on public.requests
for each row execute function public.notify_request_changes_centrally();
drop trigger if exists notify_job_changes_centrally on public.jobs;
create trigger notify_job_changes_centrally after update on public.jobs
for each row execute function public.notify_request_changes_centrally();

drop policy if exists "Admins can update notifications" on public.notifications;
create policy "Admins can update notifications" on public.notifications for update to authenticated
using (public.is_active_admin()) with check (public.is_active_admin());

notify pgrst, 'reload schema';
