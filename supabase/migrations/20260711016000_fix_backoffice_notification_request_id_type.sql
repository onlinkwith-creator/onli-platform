-- notifications.related_request_id is bigint while this compatibility
-- function accepts request IDs as text. Preserve the public signature and
-- payload, but convert numeric request IDs only at the bigint column boundary.
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
  p_channel text default 'email'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_related_request_id bigint;
begin
  v_related_request_id := case
    when trim(coalesce(p_related_request_id, '')) ~ '^[0-9]+$'
      then trim(p_related_request_id)::bigint
    else null
  end;

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
    status
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
    p_recipient_type,
    p_recipient_id,
    p_recipient_email,
    p_recipient_phone,
    jsonb_build_object(
      'related_request_id', p_related_request_id,
      'related_document_id', p_related_document_id
    ),
    coalesce(nullif(p_channel, ''), 'email'),
    p_title,
    p_message,
    null,
    p_related_document_id,
    'pending'
  )
  returning id into v_event_id;

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
    created_at
  )
  values (
    v_event_id,
    p_recipient_type,
    p_recipient_id,
    p_recipient_email,
    p_recipient_phone,
    p_notification_type,
    coalesce(p_title, p_notification_type),
    coalesce(p_message, ''),
    v_related_request_id,
    p_related_document_id,
    coalesce(nullif(p_channel, ''), 'email'),
    'pending',
    now()
  )
  on conflict (id) do nothing;

  return v_event_id;
exception
  when others then
    raise warning 'enqueue_backoffice_notification failed: %', sqlerrm;
    return null;
end;
$$;

notify pgrst, 'reload schema';
