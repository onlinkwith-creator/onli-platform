-- Remove only the obsolete 13-argument overload.
-- Keep the existing production 14-argument implementation unchanged.

drop function if exists public.enqueue_notification_event_v2(
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid
);

do $$
declare
  overload_count integer;
  canonical_count integer;
begin
  select count(*)
  into overload_count
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'enqueue_notification_event_v2';

  select count(*)
  into canonical_count
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'enqueue_notification_event_v2'
    and pg_get_function_identity_arguments(p.oid) =
      'event_type text, target_type text, target_id text, recipient_type text, recipient_email text, recipient_phone text, payload jsonb, channel text, title text, message text, related_request_id uuid, related_document_id uuid, recipient_id uuid, recipient_name text';

  if overload_count <> 1 or canonical_count <> 1 then
    raise exception
      'Expected exactly one canonical 14-argument enqueue_notification_event_v2 function; overload_count=%, canonical_count=%',
      overload_count,
      canonical_count;
  end if;
end
$$;

notify pgrst, 'reload schema';
