-- A cancelled application is historical data, not an active duplicate.
-- A hard-deleted row is naturally released by these indexes as well.
drop index if exists public.job_applications_job_applicant_email_uidx;
drop index if exists public.job_applications_job_applicant_phone_uidx;
drop index if exists public.job_applications_job_interpreter_uidx;

create unique index job_applications_job_applicant_email_uidx
on public.job_applications(job_id, applicant_email)
where applicant_email is not null
  and applicant_email <> ''
  and coalesce(status, 'pending') <> 'cancelled';

create unique index job_applications_job_applicant_phone_uidx
on public.job_applications(job_id, applicant_phone)
where applicant_phone is not null
  and applicant_phone <> ''
  and coalesce(status, 'pending') <> 'cancelled';

create unique index job_applications_job_interpreter_uidx
on public.job_applications(job_id, interpreter_id)
where interpreter_id is not null
  and coalesce(status, 'pending') <> 'cancelled';

-- The old 13-argument function has defaults and overlaps every short call to
-- the current 14-argument function. PostgreSQL therefore raises 42725 from
-- requests UPDATE triggers. Keep one canonical overload only.
drop function if exists public.enqueue_notification_event_v2(
  text, text, text, text, text, text, jsonb, text, text, text, uuid, uuid, uuid
);

-- Use all canonical arguments with explicit types in the status audit trigger.
-- This trigger runs for every requests status PATCH, so it must never rely on
-- default-argument overload resolution.
create or replace function public.capture_status_change_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  before_status jsonb;
  after_status jsonb;
  target_type text;
begin
  before_status := jsonb_strip_nulls(jsonb_build_object(
    'status', to_jsonb(old)->>'status',
    'assignment_status', to_jsonb(old)->>'assignment_status',
    'operation_status', to_jsonb(old)->>'operation_status',
    'settlement_status', to_jsonb(old)->>'settlement_status',
    'payment_status', to_jsonb(old)->>'payment_status',
    'activity_status', to_jsonb(old)->>'activity_status',
    'approved', to_jsonb(old)->>'approved'
  ));
  after_status := jsonb_strip_nulls(jsonb_build_object(
    'status', to_jsonb(new)->>'status',
    'assignment_status', to_jsonb(new)->>'assignment_status',
    'operation_status', to_jsonb(new)->>'operation_status',
    'settlement_status', to_jsonb(new)->>'settlement_status',
    'payment_status', to_jsonb(new)->>'payment_status',
    'activity_status', to_jsonb(new)->>'activity_status',
    'approved', to_jsonb(new)->>'approved'
  ));

  if before_status = after_status then
    return new;
  end if;

  target_type := tg_argv[0];
  perform public.log_admin_status_change(
    target_type, new.id::text, before_status, after_status
  );
  perform public.enqueue_notification_event_v2(
    'status_changed'::text,
    target_type::text,
    new.id::text,
    'admin'::text,
    null::text,
    null::text,
    jsonb_build_object('before', before_status, 'after', after_status)::jsonb,
    'internal'::text,
    '상태 변경 알림'::text,
    '관리 항목의 상태가 변경되었습니다.'::text,
    null::uuid,
    null::uuid,
    null::uuid,
    '관리자'::text
  );

  if after_status ? 'settlement_status' then
    perform public.enqueue_notification_event_v2(
      'settlement_ready'::text,
      target_type::text,
      new.id::text,
      'admin'::text,
      null::text,
      null::text,
      jsonb_build_object('before', before_status, 'after', after_status)::jsonb,
      'internal'::text,
      '정산 상태 변경'::text,
      '정산 상태가 변경되었습니다.'::text,
      null::uuid,
      null::uuid,
      null::uuid,
      '관리자'::text
    );
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
