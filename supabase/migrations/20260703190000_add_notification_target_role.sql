-- Store the intended notification audience separately from the transport channel.
alter table public.notification_events add column if not exists target_role text;
alter table public.notifications add column if not exists target_role text;
alter table public.notifications add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.notification_events drop constraint if exists notification_events_target_role_check;
alter table public.notification_events add constraint notification_events_target_role_check
check (target_role is null or target_role in ('admin', 'company', 'interpreter'));

alter table public.notifications drop constraint if exists notifications_target_role_check;
alter table public.notifications add constraint notifications_target_role_check
check (target_role is null or target_role in ('admin', 'company', 'interpreter'));

update public.notification_events
set target_role = public.notification_recipient_type_for_notifications(recipient_type)
where target_role is null;

update public.notifications
set target_role = public.notification_recipient_type_for_notifications(recipient_type)
where target_role is null;

update public.notifications
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('target_role', target_role)
where target_role is not null;

create or replace function public.sync_notification_event_to_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_request_id bigint;
  v_recipient_type text;
  v_target_role text;
  v_recipient_name text;
  v_channel text;
  v_status text;
  v_error_message text;
  v_title text;
  v_message text;
begin
  v_payload := coalesce(new.payload, '{}'::jsonb);
  begin
    v_request_id := nullif(coalesce(new.related_request_id::text, v_payload->>'request_id', new.target_id), '')::bigint;
  exception
    when others then
      v_request_id := null;
  end;

  v_target_role := public.notification_recipient_type_for_notifications(
    coalesce(nullif(trim(new.target_role), ''), v_payload->>'target_role', new.recipient_type)
  );
  v_recipient_type := v_target_role;
  v_channel := public.notification_channel_for_target(v_target_role, new.channel);
  v_status := public.notification_status_for_target(v_target_role, v_channel, new.recipient_email, new.status);
  v_error_message := public.notification_error_for_target(v_target_role, v_channel, new.recipient_email, new.error_message);
  v_title := coalesce(new.title, v_payload->>'title', coalesce(new.notification_type, new.event_type), 'ON-LI 알림');
  v_message := coalesce(new.message, v_payload->>'message', v_payload->>'memo', v_payload->>'event_name', '');
  v_recipient_name := coalesce(
    new.recipient_name,
    v_payload->>'recipient_name',
    case
      when v_target_role = 'company' then '기업'
      when v_target_role = 'interpreter' then '통역사'
      when v_target_role = 'admin' then '관리자'
      else '대상 정보 없음'
    end
  );

  insert into public.notifications (
    id,
    recipient_type,
    target_role,
    recipient_id,
    recipient_name,
    recipient_email,
    recipient_phone,
    notification_type,
    title,
    message,
    related_request_id,
    related_document_id,
    channel,
    status,
    sent_at,
    error_message,
    metadata,
    created_at
  )
  values (
    new.id,
    v_recipient_type,
    v_target_role,
    new.recipient_id,
    v_recipient_name,
    nullif(trim(coalesce(new.recipient_email, '')), ''),
    new.recipient_phone,
    coalesce(new.notification_type, new.event_type),
    v_title,
    v_message,
    v_request_id,
    new.related_document_id,
    v_channel,
    v_status,
    case when v_status = 'sent' then new.sent_at else null end,
    v_error_message,
    v_payload || jsonb_build_object(
      'target_role', v_target_role,
      'recipient_name', v_recipient_name
    ),
    new.created_at
  )
  on conflict (id) do update
  set recipient_type = excluded.recipient_type,
      target_role = excluded.target_role,
      recipient_id = excluded.recipient_id,
      recipient_name = excluded.recipient_name,
      recipient_email = excluded.recipient_email,
      recipient_phone = excluded.recipient_phone,
      notification_type = excluded.notification_type,
      title = excluded.title,
      message = excluded.message,
      related_request_id = excluded.related_request_id,
      related_document_id = excluded.related_document_id,
      channel = excluded.channel,
      status = excluded.status,
      sent_at = excluded.sent_at,
      error_message = excluded.error_message,
      metadata = excluded.metadata;

  return new;
exception
  when others then
    raise warning 'sync notification event failed: %', sqlerrm;
    return new;
end;
$$;

create or replace function public.set_notification_target_role()
returns trigger
language plpgsql
as $$
begin
  new.target_role := public.notification_recipient_type_for_notifications(
    coalesce(nullif(trim(new.target_role), ''), new.recipient_type)
  );
  new.recipient_type := new.target_role;

  if new.target_role = 'company' or new.target_role = 'interpreter' then
    new.channel := 'email';
  elsif new.target_role = 'admin' then
    new.channel := 'internal';
    new.recipient_email := null;
  end if;

  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'target_role', new.target_role,
    'recipient_name', new.recipient_name
  );

  return new;
end;
$$;

drop trigger if exists trg_set_notification_target_role on public.notifications;
create trigger trg_set_notification_target_role
before insert or update on public.notifications
for each row
execute function public.set_notification_target_role();
