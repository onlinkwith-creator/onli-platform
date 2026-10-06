begin;
create table public.admin_alert_preferences (
 id boolean primary key default true check(id),
 enabled boolean not null default true,
 event_types jsonb not null default '{"admin_action_interpreter":true,"admin_action_company":true,"admin_action_request":true,"admin_action_application":true,"admin_action_resume":true,"admin_action_documents":true,"admin_action_estimate":true}',
 updated_at timestamptz not null default now(),
 updated_by uuid
);
insert into public.admin_alert_preferences(id) values(true);
alter table public.admin_alert_preferences enable row level security;
revoke all on public.admin_alert_preferences from public,anon,authenticated;
grant all on public.admin_alert_preferences to service_role;

create function public.admin_action_alert_enabled(p_type text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare preference public.admin_alert_preferences;
begin
 select * into preference from public.admin_alert_preferences where id=true for share;
 return coalesce(preference.enabled,false) and
  (p_type='admin_action_test' or coalesce(preference.event_types->p_type,'false'::jsonb)='true'::jsonb);
end;
$$;
revoke all on function public.admin_action_alert_enabled(text) from public,anon,authenticated;

create function public.guard_admin_action_alert_preference() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.admin_action_alert_enabled(new.event_type) then return null; end if;
 return new;
end;
$$;
revoke all on function public.guard_admin_action_alert_preference() from public,anon,authenticated;
create trigger guard_admin_action_alert_preference before insert on public.admin_action_alerts
for each row execute function public.guard_admin_action_alert_preference();

alter table public.admin_action_alerts drop constraint admin_action_alerts_status_check;
alter table public.admin_action_alerts add constraint admin_action_alerts_status_check
check(status in ('pending','dispatched','sending','sent','failed','uncertain','muted'));

create function public.get_admin_alert_preferences() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare preferences jsonb;
begin
 if not public.is_active_admin() then raise exception 'Admin required'; end if;
 select jsonb_build_object('enabled',enabled,'event_types',event_types,'recipient_email','onlinkwith@gmail.com')
 into preferences from public.admin_alert_preferences where id=true;
 return preferences;
end;
$$;
create function public.set_admin_alert_preferences(p_enabled boolean,p_event_types jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare known_keys jsonb; entry record;
begin
 if not public.is_active_admin() then raise exception 'Admin required'; end if;
 if p_enabled is null or jsonb_typeof(p_event_types) is distinct from 'object' then raise exception 'Invalid preferences'; end if;
 select event_types into known_keys from public.admin_alert_preferences where id=true for update;
 if (select count(*) from jsonb_object_keys(p_event_types))<>(select count(*) from jsonb_object_keys(known_keys)) then raise exception 'All alert types required'; end if;
 for entry in select * from jsonb_each(p_event_types) loop
  if not known_keys ? entry.key or jsonb_typeof(entry.value)<>'boolean' then raise exception 'Invalid alert type'; end if;
 end loop;
 update public.admin_alert_preferences set enabled=p_enabled,event_types=p_event_types,
  updated_at=now(),updated_by=auth.uid() where id=true;
 -- Drop only unclaimed automatic jobs. Re-enabling never drains a muted backlog.
 update public.admin_action_alerts set status='muted',nonce=null,error_message='관리자 알림 설정으로 미발송'
 where status in ('pending','dispatched','failed') and not public.admin_action_alert_enabled(event_type);
 update public.notifications n set channel='internal',recipient_email=null,status='pending',error_message=a.error_message
 from public.admin_action_alerts a where n.id=a.id and a.status='muted' and n.status not in ('sent','sending');
 return public.get_admin_alert_preferences();
end;
$$;
revoke all on function public.get_admin_alert_preferences() from public,anon;
revoke all on function public.set_admin_alert_preferences(boolean,jsonb) from public,anon;
grant execute on function public.get_admin_alert_preferences() to authenticated;
grant execute on function public.set_admin_alert_preferences(boolean,jsonb) to authenticated;

create or replace function public.claim_admin_action_alert(p_id uuid,p_nonce uuid)
returns setof public.admin_action_alerts language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.admin_action_alerts; mail_status text; alert_type text;
begin
 select event_type into alert_type from public.admin_action_alerts where id=p_id and nonce=p_nonce and status='dispatched';
 if alert_type is null or not public.admin_action_alert_enabled(alert_type) then return; end if;
 select * into item from public.admin_action_alerts
 where id=p_id and nonce=p_nonce and status='dispatched' and attempts<5 for update;
 if item.id is null then return; end if;
 select status into mail_status from public.notifications where id=p_id for update;
 if mail_status is null or mail_status in ('sent','sending') then return; end if;
 update public.notifications set status='sending',attempt_count=item.attempts+1,last_attempt_at=now() where id=p_id;
 return query update public.admin_action_alerts set status='sending',nonce=null,attempts=attempts+1,next_attempt_at=now()
 where id=p_id returning *;
end;
$$;
commit;
notify pgrst,'reload schema';
