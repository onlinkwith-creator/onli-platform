-- Canonical notification creation rules:
-- - company/interpreter notifications are email jobs.
-- - admin notifications are internal admin-screen records.
-- - email jobs without recipient_email are created as failed, never sent/internal.
-- - only one notification_events -> notifications mirror trigger should exist.

create or replace function public.notification_recipient_type_for_notifications(p_recipient_type text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_recipient_type, ''))) in ('company', 'client') then 'company'
    when lower(trim(coalesce(p_recipient_type, ''))) = 'interpreter' then 'interpreter'
    else 'admin'
  end;
$$;

create or replace function public.notification_channel_for_target(
  p_recipient_type text,
  p_channel text default null
)
returns text
language sql
immutable
as $$
  select case
    when public.notification_recipient_type_for_notifications(p_recipient_type) in ('company', 'interpreter')
      then 'email'
    when lower(trim(coalesce(p_channel, ''))) = 'email'
      then 'email'
    else 'internal'
  end;
$$;

create or replace function public.notification_status_for_target(
  p_recipient_type text,
  p_channel text,
  p_recipient_email text,
  p_status text default 'pending'
)
returns text
language sql
immutable
as $$
  select case
    when public.notification_channel_for_target(p_recipient_type, p_channel) = 'email'
      and nullif(trim(coalesce(p_recipient_email, '')), '') is null
      then 'failed'
    when p_status in ('sent', 'failed') then p_status
    else 'pending'
  end;
$$;

create or replace function public.notification_error_for_target(
  p_recipient_type text,
  p_channel text,
  p_recipient_email text,
  p_error_message text default null
)
returns text
language sql
immutable
as $$
  select case
    when public.notification_channel_for_target(p_recipient_type, p_channel) = 'email'
      and nullif(trim(coalesce(p_recipient_email, '')), '') is null
      then 'recipient_email is missing'
    else p_error_message
  end;
$$;

create or replace function public.create_operational_notification(
  p_recipient_type text,
  p_recipient_id uuid,
  p_recipient_email text,
  p_recipient_phone text,
  p_notification_type text,
  p_title text,
  p_message text,
  p_related_request_id bigint default null,
  p_related_document_id uuid default null,
  p_channel text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_type text;
  v_channel text;
  v_status text;
  v_error_message text;
begin
  v_recipient_type := public.notification_recipient_type_for_notifications(p_recipient_type);
  v_channel := public.notification_channel_for_target(v_recipient_type, p_channel);
  v_status := public.notification_status_for_target(v_recipient_type, v_channel, p_recipient_email, 'pending');
  v_error_message := public.notification_error_for_target(v_recipient_type, v_channel, p_recipient_email, null);

  insert into public.notifications (
    recipient_type,
    recipient_id,
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
    error_message
  )
  values (
    v_recipient_type,
    p_recipient_id,
    nullif(trim(coalesce(p_recipient_email, '')), ''),
    p_recipient_phone,
    p_notification_type,
    p_title,
    p_message,
    p_related_request_id,
    p_related_document_id,
    v_channel,
    v_status,
    null,
    v_error_message
  );
end;
$$;

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

  v_recipient_type := public.notification_recipient_type_for_notifications(new.recipient_type);
  v_channel := public.notification_channel_for_target(v_recipient_type, new.channel);
  v_status := public.notification_status_for_target(v_recipient_type, v_channel, new.recipient_email, new.status);
  v_error_message := public.notification_error_for_target(v_recipient_type, v_channel, new.recipient_email, new.error_message);
  v_title := coalesce(new.title, v_payload->>'title', coalesce(new.notification_type, new.event_type), 'ON-LI 알림');
  v_message := coalesce(new.message, v_payload->>'message', v_payload->>'memo', v_payload->>'event_name', '');

  insert into public.notifications (
    id,
    recipient_type,
    recipient_id,
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
    created_at
  )
  values (
    new.id,
    v_recipient_type,
    new.recipient_id,
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
    new.created_at
  )
  on conflict (id) do update
  set recipient_type = excluded.recipient_type,
      recipient_id = excluded.recipient_id,
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
      error_message = excluded.error_message;

  return new;
exception
  when others then
    raise warning 'sync notification event failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists mirror_notification_event_to_notifications on public.notification_events;
drop trigger if exists sync_notification_event_to_notifications on public.notification_events;

create trigger sync_notification_event_to_notifications
after insert or update on public.notification_events
for each row
execute function public.sync_notification_event_to_notifications();

create or replace function public.enqueue_backoffice_notification(
  p_notification_type text,
  p_recipient_type text,
  p_title text,
  p_message text,
  p_recipient_id uuid default null,
  p_recipient_email text default null,
  p_recipient_phone text default null,
  p_related_request_id text default null,
  p_related_document_id uuid default null,
  p_channel text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_recipient_type text;
  v_channel text;
  v_status text;
  v_error_message text;
begin
  v_recipient_type := public.notification_recipient_type_for_notifications(p_recipient_type);
  v_channel := public.notification_channel_for_target(v_recipient_type, p_channel);
  v_status := public.notification_status_for_target(v_recipient_type, v_channel, p_recipient_email, 'pending');
  v_error_message := public.notification_error_for_target(v_recipient_type, v_channel, p_recipient_email, null);

  insert into public.notification_events (
    event_type,
    notification_type,
    target_type,
    target_id,
    recipient_type,
    recipient_id,
    recipient_email,
    recipient_phone,
    payload,
    channel,
    title,
    message,
    related_request_id,
    related_document_id,
    status,
    error_message
  )
  values (
    p_notification_type,
    p_notification_type,
    coalesce(
      case when p_related_document_id is not null then 'document' end,
      case when p_related_request_id is not null then 'request' end,
      'operation'
    ),
    coalesce(p_related_document_id::text, p_related_request_id, gen_random_uuid()::text),
    v_recipient_type,
    p_recipient_id,
    nullif(trim(coalesce(p_recipient_email, '')), ''),
    p_recipient_phone,
    jsonb_build_object(
      'related_request_id', p_related_request_id,
      'related_document_id', p_related_document_id,
      'target_role', v_recipient_type,
      'channel', v_channel
    ),
    v_channel,
    p_title,
    p_message,
    null,
    p_related_document_id,
    v_status,
    v_error_message
  )
  returning id into v_event_id;

  return v_event_id;
exception
  when others then
    raise warning 'enqueue_backoffice_notification failed: %', sqlerrm;
    return null;
end;
$$;

-- Repair records that were mirrored as internal even though their target is external.
update public.notifications
set
  channel = 'email',
  status = case
    when nullif(trim(coalesce(recipient_email, '')), '') is null then 'failed'
    when status = 'sent' and nullif(trim(coalesce(provider_message_id, '')), '') is null then 'failed'
    when status = 'sent' then 'sent'
    else 'pending'
  end,
  sent_at = case
    when status = 'sent' and nullif(trim(coalesce(provider_message_id, '')), '') is not null then sent_at
    else null
  end,
  error_message = case
    when nullif(trim(coalesce(recipient_email, '')), '') is null then 'recipient_email is missing'
    when status = 'sent' and nullif(trim(coalesce(provider_message_id, '')), '') is null then 'provider success response is missing'
    else error_message
  end
where recipient_type in ('company', 'interpreter')
  and channel <> 'email';

update public.notifications
set
  channel = 'internal',
  recipient_email = null,
  provider_message_id = null
where recipient_type = 'admin'
  and notification_type like 'admin_%'
  and channel <> 'internal';

notify pgrst, 'reload schema';
