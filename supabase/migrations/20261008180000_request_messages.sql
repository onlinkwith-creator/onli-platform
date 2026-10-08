begin;

-- One private conversation per assignment and current account pair, never a group chat.
create table public.request_conversations (
 id uuid primary key default gen_random_uuid(),
 assignment_id bigint not null references public.request_interpreters(id) on delete cascade,
 company_user_id uuid not null,
 interpreter_user_id uuid not null,
 created_at timestamptz not null default now(),
 unique(assignment_id,company_user_id,interpreter_user_id),
 check(company_user_id<>interpreter_user_id)
);
create table public.request_messages (
 id bigint generated always as identity primary key,
 conversation_id uuid not null references public.request_conversations(id) on delete cascade,
 sender_user_id uuid not null,
 sender_role text not null check(sender_role in ('company','interpreter')),
 client_nonce uuid not null,
 body text not null check(length(body) between 1 and 2000),
 created_at timestamptz not null default now(),
 unique(sender_user_id,client_nonce)
);
create index request_messages_conversation on public.request_messages(conversation_id,id desc);
create index request_messages_sender on public.request_messages(sender_user_id,created_at desc);
create table public.request_message_reads (
 conversation_id uuid not null references public.request_conversations(id) on delete cascade,
 user_id uuid not null,
 last_message_id bigint not null default 0,
 primary key(conversation_id,user_id)
);
alter table public.request_conversations enable row level security;
alter table public.request_messages enable row level security;
alter table public.request_message_reads enable row level security;
revoke all on public.request_conversations,public.request_messages,public.request_message_reads from public,anon,authenticated;
revoke all on sequence public.request_messages_id_seq from public,anon,authenticated;

create function public.request_conversation_access(p_id uuid,p_user uuid,p_write boolean default false)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_user is not null and exists(
  select 1 from public.request_conversations c
  join public.request_interpreters a on a.id=c.assignment_id
  join public.requests r on r.id=a.request_id
  join public.interpreters i on i.id=a.interpreter_id and i.auth_user_id=c.interpreter_user_id
  join public.businesses b on b.auth_user_id=c.company_user_id and b.status='승인 완료'
  where c.id=p_id and p_user in (c.company_user_id,c.interpreter_user_id)
   and c.company_user_id=coalesce(r.company_auth_user_id,(select auth_user_id from public.businesses where id=r.company_id))
   and (r.company_id=b.id or r.company_auth_user_id=b.auth_user_id)
   and i.withdrawn_at is null
   and (not p_write or (a.status='assigned'
    and lower(coalesce(r.status,'')) not in ('cancelled','canceled','취소','취소됨')
    and lower(coalesce(r.operation_status,'')) not in ('cancelled','canceled','취소','취소됨')))
 );
$$;
revoke all on function public.request_conversation_access(uuid,uuid,boolean) from public,anon,authenticated;

create function public.get_my_request_conversations() returns setof jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'MESSAGE_FORBIDDEN' using errcode='42501'; end if;
 insert into public.request_conversations(assignment_id,company_user_id,interpreter_user_id)
 select a.id,b.auth_user_id,i.auth_user_id from public.request_interpreters a
 join public.requests r on r.id=a.request_id
 join public.interpreters i on i.id=a.interpreter_id and i.withdrawn_at is null
 join public.businesses b on b.auth_user_id=coalesce(r.company_auth_user_id,
  (select auth_user_id from public.businesses where id=r.company_id)) and b.status='승인 완료'
 where a.status='assigned' and i.auth_user_id is not null and b.auth_user_id<>i.auth_user_id
  and (r.company_id=b.id or r.company_auth_user_id=b.auth_user_id)
  and auth.uid() in (b.auth_user_id,i.auth_user_id)
  and lower(coalesce(r.status,'')) not in ('cancelled','canceled','취소','취소됨')
  and lower(coalesce(r.operation_status,'')) not in ('cancelled','canceled','취소','취소됨')
 on conflict(assignment_id,company_user_id,interpreter_user_id) do nothing;
 return query select jsonb_build_object('id',c.id,'request_id',r.id::text,'assignment_id',a.id::text,'request_no',r.request_no,'assignment_no',a.assignment_no,
  'event_name',r.event_name,'peer_name',case when auth.uid()=c.company_user_id then i.name else b.company_name end,
  'my_role',case when auth.uid()=c.company_user_id then 'company' else 'interpreter' end,
  'can_send',public.request_conversation_access(c.id,auth.uid(),true),
  'unread_count',(select count(*) from public.request_messages m where m.conversation_id=c.id
   and m.sender_user_id<>auth.uid() and m.id>coalesce(rd.last_message_id,0)),
  'last_message_at',(select max(created_at) from public.request_messages where conversation_id=c.id))
 from public.request_conversations c join public.request_interpreters a on a.id=c.assignment_id
 join public.requests r on r.id=a.request_id join public.interpreters i on i.id=a.interpreter_id
 join public.businesses b on b.auth_user_id=c.company_user_id
 left join public.request_message_reads rd on rd.conversation_id=c.id and rd.user_id=auth.uid()
 where public.request_conversation_access(c.id,auth.uid())
 order by (select max(id) from public.request_messages where conversation_id=c.id) desc nulls last,c.created_at desc,c.id;
end;$$;

create function public.get_request_messages(p_conversation_id uuid,p_before_id bigint default null)
returns setof jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.request_conversation_access(p_conversation_id,auth.uid()) then
  raise exception 'MESSAGE_FORBIDDEN' using errcode='42501'; end if;
 return query select jsonb_build_object('id',m.id::text,'body',m.body,'mine',m.sender_user_id=auth.uid(),
  'sender_role',m.sender_role,'created_at',m.created_at,'peer_read',exists(select 1 from public.request_message_reads rd
   where rd.conversation_id=m.conversation_id and rd.user_id<>auth.uid() and rd.last_message_id>=m.id))
 from public.request_messages m where m.conversation_id=p_conversation_id and (p_before_id is null or m.id<p_before_id)
 order by m.id desc limit 50;
end;$$;

create function public.send_request_message(p_conversation_id uuid,p_body text,p_client_nonce uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.request_messages%rowtype; message_id bigint; normalized text; my_role text;
begin
 -- Serialize account-wide rate checks and assignment cancellation against this send.
 if auth.uid() is null then raise exception 'MESSAGE_FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('request-message:'||auth.uid()::text,0));
 perform 1 from public.requests r join public.request_interpreters a on a.request_id=r.id
  join public.request_conversations c on c.assignment_id=a.id where c.id=p_conversation_id for update of r;
 perform 1 from public.request_interpreters a join public.request_conversations c on c.assignment_id=a.id
  where c.id=p_conversation_id for update of a;
 if not public.request_conversation_access(p_conversation_id,auth.uid(),true) then
  raise exception 'MESSAGE_CLOSED_OR_FORBIDDEN' using errcode='42501'; end if;
 normalized:=btrim(p_body,E' \t\n\r');
 if normalized is null or length(normalized) not between 1 and 2000 or p_client_nonce is null then
  raise exception 'MESSAGE_INVALID_BODY'; end if;
 select * into existing from public.request_messages where sender_user_id=auth.uid() and client_nonce=p_client_nonce;
 if found then
  if existing.conversation_id<>p_conversation_id or existing.body<>normalized then raise exception 'MESSAGE_NONCE_REUSED'; end if;
  return jsonb_build_object('id',existing.id::text);
 end if;
 if (select count(*) from public.request_messages where sender_user_id=auth.uid() and created_at>now()-interval '1 minute')>=20
  or (select count(*) from public.request_messages where sender_user_id=auth.uid() and created_at>now()-interval '1 day')>=200 then
  raise exception 'MESSAGE_RATE_LIMIT'; end if;
 select case when company_user_id=auth.uid() then 'company' else 'interpreter' end into my_role
  from public.request_conversations where id=p_conversation_id;
 insert into public.request_messages(conversation_id,sender_user_id,sender_role,client_nonce,body)
 values(p_conversation_id,auth.uid(),my_role,p_client_nonce,normalized) returning id into message_id;
 return jsonb_build_object('id',message_id::text);
end;$$;

create function public.read_request_messages(p_conversation_id uuid,p_last_message_id bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.request_conversation_access(p_conversation_id,auth.uid()) then raise exception 'MESSAGE_FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from public.request_messages where conversation_id=p_conversation_id and id=p_last_message_id) then
  raise exception 'MESSAGE_INVALID_CURSOR'; end if;
 insert into public.request_message_reads(conversation_id,user_id,last_message_id) values(p_conversation_id,auth.uid(),p_last_message_id)
 on conflict(conversation_id,user_id) do update set last_message_id=greatest(public.request_message_reads.last_message_id,excluded.last_message_id);
end;$$;

revoke all on function public.get_my_request_conversations(),public.get_request_messages(uuid,bigint),
 public.send_request_message(uuid,text,uuid),public.read_request_messages(uuid,bigint) from public,anon,authenticated;
grant execute on function public.get_my_request_conversations(),public.get_request_messages(uuid,bigint),
 public.send_request_message(uuid,text,uuid),public.read_request_messages(uuid,bigint) to authenticated;

-- Unread email nudges are coalesced; no conversation content or contact data leaves the portal.
create function public.queue_request_message_alerts() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare item record; alert_id uuid; mail text; portal text; queued integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('request-message-alerts',0));
 for item in select c.id,p.user_id,p.role,max(m.id) as latest_id,max(m.created_at) as latest_at
  from public.request_conversations c
  cross join lateral (values(c.company_user_id,'company'),(c.interpreter_user_id,'interpreter')) p(user_id,role)
  join public.request_messages m on m.conversation_id=c.id and m.sender_user_id<>p.user_id
  left join public.request_message_reads rd on rd.conversation_id=c.id and rd.user_id=p.user_id
  where m.id>coalesce(rd.last_message_id,0) and public.request_conversation_access(c.id,p.user_id,true)
  group by c.id,p.user_id,p.role
  having max(m.created_at)<=now()-interval '2 minutes' and max(m.created_at)>=now()-interval '7 days'
 loop
  if exists(select 1 from public.workflow_action_alerts where event_type='workflow_message_unread' and source_id=item.id::text
   and recipient_auth_user_id=item.user_id and (source_version=item.latest_id::text or created_at>now()-interval '30 minutes')) then continue; end if;
  select lower(trim(email)) into mail from auth.users where id=item.user_id and email_confirmed_at is not null;
  if mail is null or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then continue; end if;
  portal:=case when item.role='company' then '/business/mypage?tab=messages' else '/interpreter-mypage?tab=messages' end;
  alert_id:=null;
  insert into public.workflow_action_alerts(event_type,source_id,source_version,recipient_auth_user_id,recipient_type,recipient_email,title,message,portal_path)
  values('workflow_message_unread',item.id::text,item.latest_id::text,item.user_id,item.role,mail,'새 의뢰 메시지',
   '배정된 의뢰에 확인하지 않은 메시지가 있습니다. 로그인 후 대화를 확인해 주세요.',portal)
  on conflict(event_type,source_id,source_version,recipient_auth_user_id) do nothing returning id into alert_id;
  if alert_id is not null then
   insert into public.notifications(id,recipient_type,recipient_id,recipient_email,notification_type,title,message,channel,status)
   values(alert_id,item.role,item.user_id,mail,'workflow_message_unread','새 의뢰 메시지',
    '배정된 의뢰에 확인하지 않은 메시지가 있습니다. https://onli-platform.vercel.app'||portal,'email','pending');
   queued:=queued+1;
  end if;
 end loop;
 return queued;
end;$$;
revoke all on function public.queue_request_message_alerts() from public,anon,authenticated;

alter function public.workflow_followup_actionable(text,text,text,uuid) rename to workflow_followup_actionable_before_messages;
revoke all on function public.workflow_followup_actionable_before_messages(text,text,text,uuid) from public,anon,authenticated;
create function public.workflow_followup_actionable(p_type text,p_source text,p_version text,p_user uuid) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if p_type='workflow_message_unread' then return exists(select 1 from public.request_conversations c
  join public.request_messages m on m.conversation_id=c.id and m.id::text=p_version
  left join public.request_message_reads rd on rd.conversation_id=c.id and rd.user_id=p_user
  where c.id::text=p_source and public.request_conversation_access(c.id,p_user,true)
   and m.sender_user_id<>p_user and m.id>coalesce(rd.last_message_id,0)); end if;
 return public.workflow_followup_actionable_before_messages(p_type,p_source,p_version,p_user);
end;$$;
revoke all on function public.workflow_followup_actionable(text,text,text,uuid) from public,anon,authenticated;
select cron.schedule('onli-request-message-alerts','*/5 * * * *','select public.queue_request_message_alerts();');
commit;
