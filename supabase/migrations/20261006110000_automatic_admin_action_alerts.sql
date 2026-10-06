begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
do $$begin
 if to_regclass('net.http_request_queue') is not null then
  revoke all on net.http_request_queue from public,anon,authenticated;
 end if;
 if to_regclass('net._http_response') is not null then
  revoke all on net._http_response from public,anon,authenticated;
 end if;
end;$$;

-- Only events inserted after this migration enter this queue. Never backfill it.
create table public.admin_action_alerts (
 id uuid primary key default gen_random_uuid(),
 nonce uuid,
 event_type text not null,
 source_id text not null,
 source_version text not null default '',
 title text not null,
 admin_path text not null,
 status text not null default 'pending' check(status in ('pending','dispatched','sending','sent','failed','uncertain')),
 attempts integer not null default 0,
 dispatch_attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 provider_message_id text,
 error_message text,
 unique(event_type,source_id,source_version)
);
alter table public.admin_action_alerts enable row level security;
revoke all on public.admin_action_alerts from public,anon,authenticated;
grant all on public.admin_action_alerts to service_role;
create index admin_action_alerts_pending on public.admin_action_alerts(next_attempt_at)
where status in ('pending','dispatched','failed');

create function public.enqueue_admin_action_alert(p_type text,p_source text,p_version text,p_title text,p_path text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare alert_id uuid;
begin
 insert into public.admin_action_alerts(event_type,source_id,source_version,title,admin_path)
 values(p_type,p_source,coalesce(p_version,''),p_title,p_path)
 on conflict(event_type,source_id,source_version) do nothing returning id into alert_id;
 if alert_id is not null then
  insert into public.notifications(id,recipient_type,recipient_email,notification_type,title,message,channel,status)
  values(alert_id,'admin','onlinkwith@gmail.com',p_type,p_title,
   '관리자 확인이 필요한 새 항목이 있습니다. '||'https://onli-platform.vercel.app'||p_path,'email','pending');
 end if;
 return alert_id;
end;
$$;
revoke all on function public.enqueue_admin_action_alert(text,text,text,text,text) from public,anon,authenticated;

create function public.queue_admin_action_alerts() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare j jsonb:=to_jsonb(new); previous jsonb:='{}'; entity text;
begin
 if tg_op='UPDATE' then previous:=to_jsonb(old); end if;
 entity:=j->>'id';
 if tg_table_name='interpreters' then
  if tg_op='INSERT' then
   perform public.enqueue_admin_action_alert('admin_action_interpreter',entity,'','신규 통역사 등록 · 승인 필요','/admin?subTab=new_interpreters');
  end if;
  if nullif(j->>'resume_file_url','') is not null and
   (j->>'resume_file_url' is distinct from previous->>'resume_file_url' or j->>'resume_uploaded_at' is distinct from previous->>'resume_uploaded_at') then
   perform public.enqueue_admin_action_alert('admin_action_resume',entity,
    md5(concat_ws('|',j->>'resume_file_url',j->>'resume_uploaded_at')),'통역사 이력서 제출 · 검수 필요','/admin?subTab=verification_pending');
  end if;
  if tg_op='UPDATE' and (j->>'bankbook_file_url' is distinct from previous->>'bankbook_file_url' or
   j->>'business_license_file_url' is distinct from previous->>'business_license_file_url') and
   (nullif(j->>'bankbook_file_url','') is not null or nullif(j->>'business_license_file_url','') is not null) then
   perform public.enqueue_admin_action_alert('admin_action_documents',entity,
    md5(concat_ws('|',j->>'bankbook_file_url',j->>'business_license_file_url')),
    '통역사 정산 서류 변경 · 확인 필요','/admin?subTab=registered_interpreters');
  end if;
 elsif tg_table_name='businesses' and tg_op='INSERT' then
  perform public.enqueue_admin_action_alert('admin_action_company',entity,'','신규 기업 등록 · 승인 필요','/admin?subTab=all_businesses');
 elsif tg_table_name='requests' then
  if tg_op='INSERT' then
   perform public.enqueue_admin_action_alert('admin_action_request',entity,'','신규 기업 의뢰 · 접수 확인 필요','/admin?subTab=new_requests');
  elsif j->>'estimate_status' in ('estimate_approved','company_approved','approved','승인완료') and
   j->>'estimate_status' is distinct from previous->>'estimate_status' then
   perform public.enqueue_admin_action_alert('admin_action_estimate',entity,coalesce(j->>'estimate_approved_at',''),
    '기업 견적 승인 · 운영 확인 필요','/admin?subTab=all_requests');
  end if;
 elsif tg_table_name='job_applications' and tg_op='INSERT' then
  perform public.enqueue_admin_action_alert('admin_action_application',entity,'','신규 공고 지원자 · 검토 필요','/admin?subTab=applications');
 end if;
 return new;
end;
$$;
revoke all on function public.queue_admin_action_alerts() from public,anon,authenticated;
create trigger automatic_admin_interpreter_alert after insert or update on public.interpreters
for each row execute function public.queue_admin_action_alerts();
create trigger automatic_admin_company_alert after insert on public.businesses
for each row execute function public.queue_admin_action_alerts();
create trigger automatic_admin_request_alert after insert or update on public.requests
for each row execute function public.queue_admin_action_alerts();
create trigger automatic_admin_application_alert after insert on public.job_applications
for each row execute function public.queue_admin_action_alerts();

create function public.dispatch_admin_action_alerts() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare item record; dispatched integer:=0;
begin
 update public.admin_action_alerts a set status='sent',nonce=null,sent_at=n.sent_at,provider_message_id=n.provider_message_id
 from public.notifications n where n.id=a.id and n.status='sent' and n.provider_message_id is not null and a.status<>'sent';
 update public.admin_action_alerts set status='failed',error_message='자동 발송 재시도 한도 도달: 관리자 확인 필요'
 where status in ('pending','dispatched','failed') and (attempts>=5 or dispatch_attempts>=10);
 update public.notifications n set status='failed',error_message=a.error_message
 from public.admin_action_alerts a where n.id=a.id and a.status='failed'
 and (a.attempts>=5 or a.dispatch_attempts>=10) and n.status not in ('sent','sending');
 -- An interrupted SMTP send is ambiguous: never automatically resend it.
 update public.admin_action_alerts set status='uncertain',error_message='발송 결과 확인 필요: 자동 재발송 중지'
 where status='sending' and next_attempt_at<now()-interval '5 minutes';
 update public.notifications n set status='failed',error_message=a.error_message
 from public.admin_action_alerts a where n.id=a.id and a.status='uncertain' and n.status<>'sent';
 for item in select * from public.admin_action_alerts
 where status in ('pending','dispatched','failed') and attempts<5 and dispatch_attempts<10
 and next_attempt_at<=now() order by created_at limit 25 for update skip locked loop
  begin
   update public.admin_action_alerts set nonce=gen_random_uuid(),status='dispatched',
    dispatch_attempts=dispatch_attempts+1,next_attempt_at=now()+interval '1 minute'
   where id=item.id returning * into item;
   perform net.http_post(url:='https://mhtxknpdpakjvhlhrgwq.supabase.co/functions/v1/admin-action-alert',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:=jsonb_build_object('id',item.id,'nonce',item.nonce),timeout_milliseconds:=30000);
   dispatched:=dispatched+1;
  exception when others then
   update public.admin_action_alerts set status='failed',dispatch_attempts=dispatch_attempts+1,
    error_message='백그라운드 호출 실패',next_attempt_at=now()+interval '1 minute' where id=item.id;
  end;
 end loop;
 return dispatched;
end;
$$;
revoke all on function public.dispatch_admin_action_alerts() from public,anon,authenticated;

create function public.claim_admin_action_alert(p_id uuid,p_nonce uuid)
returns setof public.admin_action_alerts language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.admin_action_alerts; mail_status text;
begin
 select * into item from public.admin_action_alerts
 where id=p_id and nonce=p_nonce and status='dispatched' and attempts<5 for update;
 if item.id is null then return; end if;
 select status into mail_status from public.notifications where id=p_id for update;
 -- Share the existing manual sender's notification lease, preventing double sends.
 if mail_status is null or mail_status in ('sent','sending') then return; end if;
 update public.notifications set status='sending',attempt_count=item.attempts+1,last_attempt_at=now() where id=p_id;
 return query update public.admin_action_alerts set status='sending',nonce=null,attempts=attempts+1,next_attempt_at=now()
 where id=p_id returning *;
end;
$$;
revoke all on function public.claim_admin_action_alert(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_admin_action_alert(uuid,uuid) to service_role;

create function public.finish_admin_action_alert(p_id uuid,p_status text,p_message_id text default null,p_error text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.admin_action_alerts;
begin
 if p_status not in ('sent','failed','uncertain') then raise exception 'Invalid result'; end if;
 if p_status='sent' and nullif(p_message_id,'') is null then raise exception 'Provider confirmation required'; end if;
 update public.admin_action_alerts set status=p_status,provider_message_id=p_message_id,error_message=p_error,
  sent_at=case when p_status='sent' then now() end,next_attempt_at=now()+interval '2 minutes'
 where id=p_id and status='sending' returning * into item;
 if item.id is not null then
  update public.notifications set status=case when p_status='uncertain' then 'failed' else p_status end,
   provider_message_id=p_message_id,error_message=p_error,sent_at=item.sent_at,
   attempt_count=item.attempts,last_attempt_at=now() where id=p_id;
 end if;
end;
$$;
revoke all on function public.finish_admin_action_alert(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_admin_action_alert(uuid,text,text,text) to service_role;

-- Queue one connection test without creating fake members or business requests.
create function public.test_admin_action_alert() returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_active_admin() then raise exception 'Admin required'; end if;
 return public.enqueue_admin_action_alert('admin_action_test','connection',current_date::text,
  '관리자 자동 알림 연결 테스트','/admin?subTab=notification_history');
end;
$$;
revoke all on function public.test_admin_action_alert() from public,anon;
grant execute on function public.test_admin_action_alert() to authenticated;

select cron.schedule('onli-admin-action-alerts','* * * * *','select public.dispatch_admin_action_alerts();');
commit;
notify pgrst,'reload schema';
