-- Canonical notification enqueue function.
--
-- Production accumulated the original 13-argument (returns void) function and
-- the current 14-argument (returns uuid) function. Because both versions had
-- defaults, PostgreSQL could not resolve short calls (42725). Deployments where
-- only the old version survived rejected explicit 14-argument calls (42883).
--
-- Recreate one exact signature in the same migration transaction. Existing
-- trigger functions call it at execution time, so their event conditions,
-- recipients, titles, messages and payloads remain unchanged.

drop function if exists public.enqueue_notification_event_v2(
  text, text, text, text, text, text, jsonb, text, text, text, uuid, uuid, uuid
);
drop function if exists public.enqueue_notification_event_v2(
  text, text, text, text, text, text, jsonb, text, text, text, uuid, uuid, uuid, text
);

create function public.enqueue_notification_event_v2(
  event_type text,
  target_type text,
  target_id text,
  recipient_type text,
  recipient_email text default null,
  recipient_phone text default null,
  event_payload jsonb default '{}'::jsonb,
  channel text default 'email',
  title text default null,
  message text default null,
  related_request_id uuid default null,
  related_document_id uuid default null,
  recipient_id uuid default null,
  recipient_name text default null
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
  v_event_id := gen_random_uuid();
  v_recipient_type := public.notification_recipient_type_for_notifications(recipient_type);
  v_channel := public.notification_channel_for_target(v_recipient_type, channel);
  v_status := public.notification_status_for_target(
    v_recipient_type,
    v_channel,
    recipient_email,
    'pending'
  );
  v_error_message := public.notification_error_for_target(
    v_recipient_type,
    v_channel,
    recipient_email,
    null
  );

  insert into public.notification_events (
    id,
    event_type,
    notification_type,
    target_type,
    target_id,
    recipient_type,
    recipient_id,
    recipient_name,
    recipient_email,
    recipient_phone,
    payload,
    channel,
    title,
    message,
    related_document_id,
    status,
    error_message
  )
  values (
    v_event_id,
    event_type,
    event_type,
    target_type,
    target_id,
    v_recipient_type,
    recipient_id,
    recipient_name,
    nullif(trim(coalesce(recipient_email, '')), ''),
    recipient_phone,
    coalesce(event_payload, '{}'::jsonb)
      || jsonb_build_object('recipient_name', recipient_name),
    v_channel,
    title,
    message,
    related_document_id,
    v_status,
    v_error_message
  );

  return v_event_id;
end;
$$;

revoke all on function public.enqueue_notification_event_v2(
  text, text, text, text, text, text, jsonb, text, text, text, uuid, uuid, uuid, text
) from public;

-- Abort deployment instead of leaving another ambiguous production schema.
do $$
declare
  overload_count integer;
  canonical_arguments text;
begin
  select count(*), min(pg_get_function_identity_arguments(p.oid))
  into overload_count, canonical_arguments
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'enqueue_notification_event_v2';

  if overload_count <> 1 then
    raise exception
      'enqueue_notification_event_v2 must have exactly one overload; found %',
      overload_count;
  end if;

  if canonical_arguments <> concat_ws(', ',
    'event_type text',
    'target_type text',
    'target_id text',
    'recipient_type text',
    'recipient_email text',
    'recipient_phone text',
    'event_payload jsonb',
    'channel text',
    'title text',
    'message text',
    'related_request_id uuid',
    'related_document_id uuid',
    'recipient_id uuid',
    'recipient_name text'
  ) then
    raise exception
      'unexpected enqueue_notification_event_v2 signature: %',
      canonical_arguments;
  end if;
end
$$;

notify pgrst, 'reload schema';
