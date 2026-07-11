-- Queue application emails for manual admin sending. Event failures are
-- isolated so they never roll back the job application insert.
create or replace function public.notify_new_job_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job_record record;
  applicant_email text;
  applicant_phone text;
  applicant_name text;
  applicant_auth_user_id uuid;
  event_payload jsonb;
  admin_email text;
begin
  select job_no, title, event_name, start_date, end_date, event_date, date
  into job_record
  from public.jobs
  where id = new.job_id;

  select auth_user_id
  into applicant_auth_user_id
  from public.interpreters
  where id = new.interpreter_id;

  applicant_email := coalesce(to_jsonb(new)->>'email', '');
  applicant_phone := coalesce(to_jsonb(new)->>'phone', '');
  applicant_name := coalesce(to_jsonb(new)->>'applicant_name', '지원자');

  event_payload := jsonb_build_object(
    'application_id', new.id,
    'application_no', to_jsonb(new)->>'application_no',
    'job_id', new.job_id,
    'job_no', job_record.job_no,
    'job_title', coalesce(job_record.title, job_record.event_name, '공고 제목 미입력'),
    'applicant_name', applicant_name,
    'applicant_email', applicant_email,
    'submitted_at', new.created_at,
    'name', applicant_name,
    'email', applicant_email,
    'phone', applicant_phone,
    'jobTitle', coalesce(job_record.title, job_record.event_name, '공고 제목 미입력'),
    'date', concat_ws(' ~ ',
      coalesce(job_record.start_date::text, job_record.event_date, job_record.date),
      nullif(job_record.end_date::text, coalesce(job_record.start_date::text, job_record.event_date, job_record.date))
    ),
    'levelOrExperience', to_jsonb(new)->>'message'
  );

  if nullif(trim(applicant_email), '') is not null then
    begin
      perform public.enqueue_notification_event_v2(
        'job_applied_user'::text, 'application'::text, new.id::text,
        'interpreter'::text, applicant_email::text, applicant_phone::text,
        event_payload, 'email'::text,
        '[ON-LI] 통역 공고 지원이 접수되었습니다'::text,
        'ON-LI 통역 공고 지원이 정상 접수되었습니다.'::text,
        null::uuid, null::uuid, applicant_auth_user_id,
        applicant_name::text
      );
    exception when others then
      raise warning 'job_applied_user notification history skipped: %', sqlerrm;
    end;
  end if;

  foreach admin_email in array array['onlinkwith@gmail.com', 'onlinkcp@gmail.com']::text[]
  loop
    begin
      perform public.enqueue_notification_event_v2(
        'job_applied_admin'::text, 'application'::text, new.id::text,
        'admin'::text, admin_email::text, null::text,
        event_payload, 'email'::text,
        '[ON-LI 관리자 알림] 신규 공고 지원'::text,
        'ON-LI 공고에 신규 지원이 접수되었습니다.'::text,
        null::uuid, null::uuid, null::uuid, '관리자'::text
      );
    exception when others then
      raise warning 'job_applied_admin notification history skipped for %: %', admin_email, sqlerrm;
    end;
  end loop;

  return new;
end;
$$;

notify pgrst, 'reload schema';
