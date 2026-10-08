begin;

-- This queue is deliberately separate from historical pending notifications.
create table public.workflow_action_alerts (
 id uuid primary key default gen_random_uuid(), nonce uuid,
 event_type text not null,source_id text not null,source_version text not null default '',
 recipient_auth_user_id uuid not null,recipient_type text not null check(recipient_type in ('company','interpreter')),
 recipient_email text not null,title text not null,message text not null,portal_path text not null,
 status text not null default 'pending' check(status in ('pending','dispatched','sending','sent','failed','uncertain')),
 attempts integer not null default 0,dispatch_attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),created_at timestamptz not null default now(),
 sent_at timestamptz,provider_message_id text,error_message text,
 unique(event_type,source_id,source_version,recipient_auth_user_id)
);
alter table public.workflow_action_alerts enable row level security;
revoke all on public.workflow_action_alerts from public,anon,authenticated;
grant all on public.workflow_action_alerts to service_role;
create index workflow_action_alerts_pending on public.workflow_action_alerts(next_attempt_at)
where status in ('pending','dispatched','failed');

create function public.enqueue_workflow_action_alert(p_type text,p_source text,p_version text,p_user uuid,p_role text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient text; alert_id uuid; heading text; body text; path text;
begin
 select lower(trim(email)) into recipient from auth.users where id=p_user and email_confirmed_at is not null;
 if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return null; end if;
 path:=case when p_role='interpreter' then '/interpreter-mypage?tab=assignments' else '/business/mypage?tab=applicants' end;
 case p_type
 when 'workflow_offer_received' then heading:='새 배정 요청';body:='기업에서 배정 요청을 보냈습니다. 수락 기한 내에 일정과 보수를 확인하고 수락 또는 거절해 주세요.';
 when 'workflow_offer_accepted' then heading:='배정 확정';body:='통역사가 배정 요청을 수락하여 배정이 확정되었습니다.';
 when 'workflow_offer_declined' then heading:='배정 요청 거절';body:='통역사가 배정 요청을 거절했습니다. 다른 지원자를 확인해 주세요.';
 when 'workflow_offer_cancelled' then heading:='배정 요청 취소';body:='기업에서 아직 확정되지 않은 배정 요청을 취소했습니다.';
 when 'workflow_offer_expired' then heading:='배정 요청 만료';body:='수락 기한이 지나 배정 요청이 만료되었습니다. 진행 상태를 확인해 주세요.';
 when 'workflow_completion_submitted' then heading:='업무 완료 확인 요청';body:='통역사가 업무 완료 내용을 제출했습니다. 완료 확인 또는 수정 요청을 처리해 주세요.';path:='/business/mypage?tab=work';
 when 'workflow_completion_revision' then heading:='업무 완료 내용 수정 요청';body:='기업에서 업무 완료 내용 수정을 요청했습니다. 로그인 후 요청 내용을 확인해 주세요.';
 when 'workflow_completion_confirmed' then heading:='업무 완료 확인';body:='기업이 업무 완료를 확인했습니다. 실제 정산 금액과 지급 상태는 정산 화면에서 별도로 확인해 주세요.';
 when 'workflow_application_received' then heading:='새 통역 지원자';body:='의뢰 공고에 새로운 지원자가 있습니다. 프로필과 배정 가능 여부를 확인해 주세요.';
 when 'workflow_job_published' then heading:='통역 모집 공고 공개';body:='일반 의뢰의 모집 공고가 공개되었습니다. 지원자는 기업 마이페이지에서 확인할 수 있습니다.';
 else raise exception 'Invalid workflow alert';
 end case;
 if p_role not in ('company','interpreter') then raise exception 'Invalid recipient role'; end if;
 insert into public.workflow_action_alerts(event_type,source_id,source_version,recipient_auth_user_id,recipient_type,recipient_email,title,message,portal_path)
 values(p_type,p_source,coalesce(p_version,''),p_user,p_role,recipient,heading,body,path)
 on conflict(event_type,source_id,source_version,recipient_auth_user_id) do nothing returning id into alert_id;
 if alert_id is not null then
  insert into public.notifications(id,recipient_type,recipient_id,recipient_email,notification_type,title,message,channel,status)
  values(alert_id,p_role,p_user,recipient,p_type,heading,body||' https://onli-platform.vercel.app'||path,'email','pending');
 end if;
 return alert_id;
end;
$$;
revoke all on function public.enqueue_workflow_action_alert(text,text,text,uuid,text) from public,anon,authenticated;

create function public.queue_workflow_action_alerts() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid; interpreter_user uuid; r public.requests%rowtype; previous jsonb:='{}';
begin
 if tg_op='UPDATE' then previous:=to_jsonb(old); end if;
 if tg_table_name in ('assignment_offers','assignment_completions') then
  select * into r from public.requests where id=new.request_id;
  select b.auth_user_id into owner_id from public.businesses b where b.status='승인 완료'
   and (b.id=r.company_id or b.auth_user_id=r.company_auth_user_id) order by b.id limit 1;
  select auth_user_id into interpreter_user from public.interpreters where id=new.interpreter_id;
  if tg_table_name='assignment_offers' then
   if tg_op='INSERT' and new.status='pending' then
    perform public.enqueue_workflow_action_alert('workflow_offer_received',new.id::text,'',interpreter_user,'interpreter');
   elsif new.status is distinct from previous->>'status' then
    if new.status in ('accepted','declined','expired') then
     perform public.enqueue_workflow_action_alert('workflow_offer_'||new.status,new.id::text,'',owner_id,'company');
    end if;
    if new.status in ('accepted','cancelled','expired') then
     perform public.enqueue_workflow_action_alert('workflow_offer_'||new.status,new.id::text,'',interpreter_user,'interpreter');
    end if;
   end if;
  elsif new.status is distinct from previous->>'status' then
   if new.status='submitted' then
    perform public.enqueue_workflow_action_alert('workflow_completion_submitted',new.assignment_id::text,new.submitted_at::text,owner_id,'company');
   elsif new.status='revision_requested' then
    perform public.enqueue_workflow_action_alert('workflow_completion_revision',new.assignment_id::text,new.submitted_at::text,interpreter_user,'interpreter');
   elsif new.status='confirmed' then
    perform public.enqueue_workflow_action_alert('workflow_completion_confirmed',new.assignment_id::text,'',interpreter_user,'interpreter');
   end if;
  end if;
 elsif tg_table_name='job_applications' then
  for r in select * from public.requests where job_id=new.job_id loop
   select b.auth_user_id into owner_id from public.businesses b where b.status='승인 완료'
    and (b.id=r.company_id or b.auth_user_id=r.company_auth_user_id) order by b.id limit 1;
   perform public.enqueue_workflow_action_alert('workflow_application_received',new.id::text,r.id::text,owner_id,'company');
  end loop;
 elsif tg_table_name='requests' and new.job_id is not null and old.job_id is null
  and new.is_job_public and coalesce(new.request_type,'general')='general' then
  select b.auth_user_id into owner_id from public.businesses b where b.status='승인 완료'
   and (b.id=new.company_id or b.auth_user_id=new.company_auth_user_id) order by b.id limit 1;
  perform public.enqueue_workflow_action_alert('workflow_job_published',new.id::text,'',owner_id,'company');
 end if;
 return new;
end;
$$;
revoke all on function public.queue_workflow_action_alerts() from public,anon,authenticated;
create trigger workflow_offer_alert after insert or update on public.assignment_offers
for each row execute function public.queue_workflow_action_alerts();
create trigger workflow_completion_alert after insert or update on public.assignment_completions
for each row execute function public.queue_workflow_action_alerts();
create trigger workflow_application_alert after insert on public.job_applications
for each row execute function public.queue_workflow_action_alerts();
create trigger workflow_publication_alert after update on public.requests
for each row execute function public.queue_workflow_action_alerts();

create function public.dispatch_workflow_action_alerts() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare item record; parent record; dispatched integer:=0;
begin
 -- Match the request-first lock order used by offer acceptance and cancellation.
 for parent in select id from public.requests where id in
  (select request_id from public.assignment_offers where status='pending' and expires_at<=now())
  order by id limit 50 for update skip locked loop
  update public.assignment_offers set status='expired',responded_at=now()
   where request_id=parent.id and status='pending' and expires_at<=now();
 end loop;
 update public.workflow_action_alerts a set status='sent',nonce=null,sent_at=n.sent_at,provider_message_id=n.provider_message_id
 from public.notifications n where n.id=a.id and n.status='sent' and n.provider_message_id is not null and a.status<>'sent';
 update public.workflow_action_alerts set status='failed',nonce=null,error_message='자동 발송 재시도 한도 도달'
 where status in ('pending','dispatched','failed') and (attempts>=5 or dispatch_attempts>=10);
 update public.workflow_action_alerts set status='uncertain',nonce=null,error_message='발송 결과 불명확: 자동 재발송 중지'
 where status='sending' and next_attempt_at<now()-interval '5 minutes';
 update public.notifications n set status='failed',error_message=a.error_message
 from public.workflow_action_alerts a where n.id=a.id and (a.status='uncertain' or
 (a.status='failed' and (a.attempts>=5 or a.dispatch_attempts>=10))) and n.status<>'sent';
 for item in select * from public.workflow_action_alerts
  where status in ('pending','dispatched','failed') and attempts<5 and dispatch_attempts<10
  and next_attempt_at<=now() order by created_at limit 25 for update skip locked loop
  update public.workflow_action_alerts set nonce=gen_random_uuid(),status='dispatched',
   dispatch_attempts=dispatch_attempts+1,next_attempt_at=now()+interval '1 minute'
  where id=item.id returning * into item;
  begin
   perform net.http_post(url:='https://mhtxknpdpakjvhlhrgwq.supabase.co/functions/v1/admin-action-alert',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:=jsonb_build_object('scope','workflow','id',item.id,'nonce',item.nonce),timeout_milliseconds:=30000);
   dispatched:=dispatched+1;
  exception when others then
   update public.workflow_action_alerts set status='failed',nonce=null,
    error_message='백그라운드 호출 실패',next_attempt_at=now()+interval '1 minute' where id=item.id;
  end;
 end loop;
 return dispatched;
end;
$$;
revoke all on function public.dispatch_workflow_action_alerts() from public,anon,authenticated;

create function public.claim_workflow_action_alert(p_id uuid,p_nonce uuid)
returns setof public.workflow_action_alerts language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.workflow_action_alerts%rowtype; mail_status text; recipient text;
begin
 select * into item from public.workflow_action_alerts
 where id=p_id and nonce=p_nonce and status='dispatched' and attempts<5 for update;
 if not found then return; end if;
 select status into mail_status from public.notifications where id=p_id for update;
 if mail_status is null or mail_status in ('sent','sending') then return; end if;
 select lower(trim(email)) into recipient from auth.users where id=item.recipient_auth_user_id and email_confirmed_at is not null;
 if recipient is null then
  update public.workflow_action_alerts set status='uncertain',nonce=null,error_message='확인된 수신 계정 없음' where id=p_id;
  update public.notifications set status='failed',recipient_email=null,error_message='확인된 수신 계정 없음' where id=p_id;
  return;
 end if;
 update public.notifications set status='sending',recipient_email=recipient,attempt_count=item.attempts+1,last_attempt_at=now() where id=p_id;
 return query update public.workflow_action_alerts set status='sending',nonce=null,recipient_email=recipient,
 attempts=attempts+1,next_attempt_at=now() where id=p_id returning *;
end;
$$;
revoke all on function public.claim_workflow_action_alert(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_workflow_action_alert(uuid,uuid) to service_role;

create function public.finish_workflow_action_alert(p_id uuid,p_status text,p_message_id text default null,p_error text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.workflow_action_alerts%rowtype;
begin
 if p_status not in ('sent','failed','uncertain') or p_status is null then raise exception 'Invalid result'; end if;
 if p_status='sent' and nullif(p_message_id,'') is null then raise exception 'Provider confirmation required'; end if;
 update public.workflow_action_alerts set status=p_status,provider_message_id=p_message_id,error_message=p_error,
 sent_at=case when p_status='sent' then now() end,next_attempt_at=now()+interval '2 minutes'
 where id=p_id and status='sending' returning * into item;
 if found then
  update public.notifications set status=case when p_status='uncertain' then 'failed' else p_status end,
  provider_message_id=p_message_id,error_message=p_error,sent_at=item.sent_at,
  attempt_count=item.attempts,last_attempt_at=now() where id=p_id;
 end if;
end;
$$;
revoke all on function public.finish_workflow_action_alert(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_workflow_action_alert(uuid,text,text,text) to service_role;

select cron.schedule('onli-workflow-action-alerts','* * * * *','select public.dispatch_workflow_action_alerts();');
commit;
notify pgrst,'reload schema';
