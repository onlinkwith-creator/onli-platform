-- ============================================================
-- FIX: Explicitly cast arguments and provide all 14 arguments for enqueue_notification_event_v2 
-- in job_applications INSERT trigger to prevent ambiguity with old 13-arg overload
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_new_job_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  recipient_email text;
begin
  perform public.enqueue_notification_event_v2(
    ('application_created')::text,
    ('application')::text,
    (new.id)::text,
    ('admin')::text,
    (null)::text,
    (null)::text,
    (jsonb_build_object(
      'application_id', new.id,
      'job_id', to_jsonb(new)->>'job_id',
      'applicant_name', coalesce(to_jsonb(new)->>'applicant_name', to_jsonb(new)->>'name')
    ))::jsonb,
    ('email')::text,
    ('신규 통역사 지원')::text,
    ('신규 통역사 지원이 접수되었습니다.')::text,
    (null)::uuid,
    (null)::uuid,
    (null)::uuid,
    (null)::text
  );

  recipient_email := coalesce(to_jsonb(new)->>'email', to_jsonb(new)->>'applicant_email', '');
  if recipient_email <> '' then
    perform public.enqueue_notification_event_v2(
      ('interpreter_application_received')::text,
      ('application')::text,
      (new.id)::text,
      ('interpreter')::text,
      (recipient_email)::text,
      (coalesce(to_jsonb(new)->>'phone', to_jsonb(new)->>'applicant_phone'))::text,
      (jsonb_build_object(
        'application_id', new.id,
        'job_id', to_jsonb(new)->>'job_id',
        'applicant_name', coalesce(to_jsonb(new)->>'applicant_name', to_jsonb(new)->>'name')
      ))::jsonb,
      ('email')::text,
      ('지원 접수 완료')::text,
      ('지원이 정상 접수되었습니다.')::text,
      (null)::uuid,
      (null)::uuid,
      (null)::uuid,
      (null)::text
    );
  end if;

  return new;
end;
$function$;
