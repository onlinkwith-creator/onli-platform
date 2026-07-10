-- ============================================================
-- FIX: Remove ambiguous signature for enqueue_notification_event_v2
-- ============================================================

-- 1. Drop the old 13-argument version of enqueue_notification_event_v2 to resolve ambiguity.
-- This leaves only the latest 14-argument version (which includes recipient_name).
drop function if exists public.enqueue_notification_event_v2(
  text, text, text, text, text, text, jsonb, text, text, text, uuid, uuid, uuid
);

-- 2. Update notify_new_job_application to explicitly cast nulls to text for extra safety
create or replace function public.notify_new_job_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_email text;
begin
  perform public.enqueue_notification_event_v2(
    'application_created',
    'application',
    new.id::text,
    'admin',
    null::text,
    null::text,
    jsonb_build_object(
      'application_id', new.id,
      'job_id', to_jsonb(new)->>'job_id',
      'applicant_name', coalesce(to_jsonb(new)->>'applicant_name', to_jsonb(new)->>'name')
    ),
    'email',
    '신규 통역사 지원',
    '신규 통역사 지원이 접수되었습니다.'
  );

  recipient_email := coalesce(to_jsonb(new)->>'email', to_jsonb(new)->>'applicant_email', '');
  if recipient_email <> '' then
    perform public.enqueue_notification_event_v2(
      'interpreter_application_received',
      'application',
      new.id::text,
      'interpreter',
      recipient_email,
      null::text,
      jsonb_build_object(
        'application_id', new.id,
        'job_id', to_jsonb(new)->>'job_id'
      ),
      'email',
      '지원 완료 안내',
      '통역사 지원이 완료되었습니다.'
    );
  end if;

  return new;
end;
$$;
