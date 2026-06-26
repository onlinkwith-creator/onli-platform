-- Email notification processing support for notification_events.

alter table public.notification_events
add column if not exists retry_count integer not null default 0,
add column if not exists error_message text,
add column if not exists processed_at timestamptz;

create index if not exists notification_events_processing_idx
on public.notification_events(status, retry_count, created_at);

create or replace function public.notify_application_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job_record record;
  recipient_email text;
begin
  if coalesce(to_jsonb(old)->>'status', '') = coalesce(to_jsonb(new)->>'status', '') then
    return new;
  end if;

  recipient_email = coalesce(
    to_jsonb(new)->>'email',
    to_jsonb(new)->>'applicant_email'
  );

  select
    j.id,
    to_jsonb(j)->>'title' as title,
    to_jsonb(j)->>'event_name' as event_name,
    to_jsonb(j)->>'date' as work_date,
    to_jsonb(j)->>'start_date' as start_date,
    to_jsonb(j)->>'end_date' as end_date,
    to_jsonb(j)->>'location' as location
  into job_record
  from public.jobs j
  where j.id = new.job_id;

  if recipient_email is null or recipient_email = '' then
    return new;
  end if;

  perform public.enqueue_notification_event(
    'application_status_changed',
    'application',
    new.id::text,
    'interpreter',
    recipient_email,
    null,
    jsonb_build_object(
      'application_id', new.id,
      'application_code', coalesce(to_jsonb(new)->>'application_no', new.id::text),
      'job_id', to_jsonb(new)->>'job_id',
      'interpreter_name', coalesce(to_jsonb(new)->>'applicant_name', to_jsonb(new)->>'name'),
      'event_name', coalesce(job_record.event_name, job_record.title),
      'date', coalesce(job_record.work_date, job_record.start_date),
      'location', job_record.location,
      'before_status', to_jsonb(old)->>'status',
      'status', to_jsonb(new)->>'status'
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_application_status_changed on public.job_applications;
create trigger notify_application_status_changed
after update on public.job_applications
for each row
execute function public.notify_application_status_changed();

create or replace function public.notify_request_settlement_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_record record;
begin
  if coalesce(to_jsonb(old)->>'settlement_status', '') = coalesce(to_jsonb(new)->>'settlement_status', '') then
    return new;
  end if;

  for assignment_record in
    select
      ri.id as assignment_id,
      to_jsonb(ri)->>'matching_no' as assignment_code,
      i.email as interpreter_email,
      i.name as interpreter_name
    from public.request_interpreters ri
    join public.interpreters i on i.id = ri.interpreter_id
    where ri.request_id = new.id
  loop
    if assignment_record.interpreter_email is not null and assignment_record.interpreter_email <> '' then
      perform public.enqueue_notification_event(
        'settlement_status_changed',
        'settlement',
        new.id::text,
        'interpreter',
        assignment_record.interpreter_email,
        null,
        jsonb_build_object(
          'assignment_id', assignment_record.assignment_id,
          'assignment_code', coalesce(assignment_record.assignment_code, assignment_record.assignment_id::text),
          'request_id', new.id,
          'request_code', coalesce(to_jsonb(new)->>'request_no', new.id::text),
          'interpreter_name', assignment_record.interpreter_name,
          'event_name', to_jsonb(new)->>'event_name',
          'date', coalesce(to_jsonb(new)->>'event_date', to_jsonb(new)->>'start_date'),
          'location', coalesce(to_jsonb(new)->>'event_location', to_jsonb(new)->>'location'),
          'before_status', to_jsonb(old)->>'settlement_status',
          'status', to_jsonb(new)->>'settlement_status'
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_request_settlement_status_changed on public.requests;
create trigger notify_request_settlement_status_changed
after update on public.requests
for each row
execute function public.notify_request_settlement_status_changed();

notify pgrst, 'reload schema';
