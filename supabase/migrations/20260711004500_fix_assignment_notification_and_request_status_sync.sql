-- ============================================================
-- FIX: Explicitly cast arguments and provide all 14 arguments for enqueue_notification_event_v2 
-- in request_interpreters INSERT trigger to prevent ambiguity (42883)
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_assignment_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  interpreter_record record;
begin
  select email, phone, name
  into interpreter_record
  from public.interpreters
  where id = new.interpreter_id;

  perform public.enqueue_notification_event_v2(
    ('assignment_created')::text,
    ('assignment')::text,
    (new.id)::text,
    ('interpreter')::text,
    (interpreter_record.email)::text,
    (interpreter_record.phone)::text,
    (jsonb_build_object(
      'assignment_id', new.id,
      'request_id', new.request_id,
      'interpreter_id', new.interpreter_id,
      'interpreter_name', interpreter_record.name
    ))::jsonb,
    ('email')::text,
    ('통역 배정 확정')::text,
    ('통역 배정이 확정 되었습니다.')::text,
    (null)::uuid,
    (null)::uuid,
    (null)::uuid,
    (interpreter_record.name)::text
  );
  return new;
end;
$function$;
