-- Admin operations support: internal notes, activity logs, and pending notification events.

create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  note text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  action_type text not null,
  before_value jsonb,
  after_value jsonb,
  actor_user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  target_type text not null,
  target_id text not null,
  recipient_type text not null,
  recipient_email text,
  recipient_phone text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists admin_notes_target_idx
on public.admin_notes(target_type, target_id, created_at desc);

create index if not exists admin_activity_logs_target_idx
on public.admin_activity_logs(target_type, target_id, created_at desc);

create index if not exists notification_events_target_idx
on public.notification_events(target_type, target_id, created_at desc);

create index if not exists notification_events_status_idx
on public.notification_events(status, created_at desc);

alter table public.admin_notes enable row level security;
alter table public.admin_activity_logs enable row level security;
alter table public.notification_events enable row level security;

drop policy if exists admin_notes_admin_select on public.admin_notes;
drop policy if exists admin_notes_admin_insert on public.admin_notes;
drop policy if exists admin_notes_admin_update on public.admin_notes;
drop policy if exists admin_activity_logs_admin_select on public.admin_activity_logs;
drop policy if exists admin_activity_logs_admin_insert on public.admin_activity_logs;
drop policy if exists notification_events_admin_select on public.notification_events;
drop policy if exists notification_events_admin_insert on public.notification_events;
drop policy if exists notification_events_admin_update on public.notification_events;

create policy admin_notes_admin_select
on public.admin_notes
for select
to authenticated
using (public.is_admin());

create policy admin_notes_admin_insert
on public.admin_notes
for insert
to authenticated
with check (public.is_admin());

create policy admin_notes_admin_update
on public.admin_notes
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy admin_activity_logs_admin_select
on public.admin_activity_logs
for select
to authenticated
using (public.is_admin());

create policy admin_activity_logs_admin_insert
on public.admin_activity_logs
for insert
to authenticated
with check (public.is_admin() or auth.role() = 'service_role');

create policy notification_events_admin_select
on public.notification_events
for select
to authenticated
using (public.is_admin());

create policy notification_events_admin_insert
on public.notification_events
for insert
to authenticated
with check (public.is_admin() or auth.role() = 'service_role');

create policy notification_events_admin_update
on public.notification_events
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.touch_admin_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_admin_notes_updated_at on public.admin_notes;
create trigger touch_admin_notes_updated_at
before update on public.admin_notes
for each row
execute function public.touch_admin_notes_updated_at();

create or replace function public.enqueue_notification_event(
  event_type text,
  target_type text,
  target_id text,
  recipient_type text,
  recipient_email text default null,
  recipient_phone text default null,
  payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_events (
    event_type,
    target_type,
    target_id,
    recipient_type,
    recipient_email,
    recipient_phone,
    payload,
    status
  )
  values (
    event_type,
    target_type,
    target_id,
    recipient_type,
    recipient_email,
    recipient_phone,
    coalesce(payload, '{}'::jsonb),
    'pending'
  );
end;
$$;

create or replace function public.log_admin_status_change(
  target_type text,
  target_id text,
  before_value jsonb,
  after_value jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_activity_logs (
    target_type,
    target_id,
    action_type,
    before_value,
    after_value,
    actor_user_id
  )
  values (
    target_type,
    target_id,
    'status_changed',
    before_value,
    after_value,
    auth.uid()
  );
end;
$$;

create or replace function public.notify_new_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification_event(
    'new_request',
    'request',
    new.id::text,
    'admin',
    null,
    null,
    jsonb_build_object(
      'request_id', new.id,
      'event_name', to_jsonb(new)->>'event_name',
      'company_name', to_jsonb(new)->>'company_name'
    )
  );
  return new;
end;
$$;

drop trigger if exists notify_new_request on public.requests;
create trigger notify_new_request
after insert on public.requests
for each row
execute function public.notify_new_request();

create or replace function public.notify_new_interpreter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification_event(
    'new_interpreter',
    'interpreter',
    new.id::text,
    'admin',
    null,
    null,
    jsonb_build_object(
      'interpreter_id', new.id,
      'name', to_jsonb(new)->>'name',
      'email', to_jsonb(new)->>'email'
    )
  );
  return new;
end;
$$;

drop trigger if exists notify_new_interpreter on public.interpreters;
create trigger notify_new_interpreter
after insert on public.interpreters
for each row
execute function public.notify_new_interpreter();

create or replace function public.notify_new_job_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification_event(
    'application_created',
    'application',
    new.id::text,
    'admin',
    null,
    null,
    jsonb_build_object(
      'application_id', new.id,
      'job_id', to_jsonb(new)->>'job_id',
      'applicant_name', to_jsonb(new)->>'applicant_name'
    )
  );
  return new;
end;
$$;

drop trigger if exists notify_new_job_application on public.job_applications;
create trigger notify_new_job_application
after insert on public.job_applications
for each row
execute function public.notify_new_job_application();

create or replace function public.notify_assignment_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  interpreter_record record;
begin
  select email, phone
  into interpreter_record
  from public.interpreters
  where id = new.interpreter_id;

  perform public.enqueue_notification_event(
    'assignment_created',
    'assignment',
    new.id::text,
    'interpreter',
    interpreter_record.email,
    interpreter_record.phone,
    jsonb_build_object(
      'assignment_id', new.id,
      'request_id', new.request_id,
      'interpreter_id', new.interpreter_id
    )
  );
  return new;
end;
$$;

drop trigger if exists notify_assignment_created on public.request_interpreters;
create trigger notify_assignment_created
after insert on public.request_interpreters
for each row
execute function public.notify_assignment_created();

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
  before_status = jsonb_strip_nulls(jsonb_build_object(
    'status', to_jsonb(old)->>'status',
    'assignment_status', to_jsonb(old)->>'assignment_status',
    'operation_status', to_jsonb(old)->>'operation_status',
    'settlement_status', to_jsonb(old)->>'settlement_status',
    'payment_status', to_jsonb(old)->>'payment_status',
    'activity_status', to_jsonb(old)->>'activity_status',
    'approved', to_jsonb(old)->>'approved'
  ));
  after_status = jsonb_strip_nulls(jsonb_build_object(
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

  target_type = tg_argv[0];
  perform public.log_admin_status_change(target_type, new.id::text, before_status, after_status);
  perform public.enqueue_notification_event(
    'status_changed',
    target_type,
    new.id::text,
    'admin',
    null,
    null,
    jsonb_build_object('before', before_status, 'after', after_status)
  );

  if after_status ? 'settlement_status' then
    perform public.enqueue_notification_event(
      'settlement_ready',
      target_type,
      new.id::text,
      'admin',
      null,
      null,
      jsonb_build_object('before', before_status, 'after', after_status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists capture_request_status_change_event on public.requests;
create trigger capture_request_status_change_event
after update on public.requests
for each row
execute function public.capture_status_change_event('request');

drop trigger if exists capture_job_application_status_change_event on public.job_applications;
create trigger capture_job_application_status_change_event
after update on public.job_applications
for each row
execute function public.capture_status_change_event('application');

drop trigger if exists capture_interpreter_status_change_event on public.interpreters;
create trigger capture_interpreter_status_change_event
after update on public.interpreters
for each row
execute function public.capture_status_change_event('interpreter');

drop trigger if exists capture_matching_status_change_event on public.matchings;
create trigger capture_matching_status_change_event
after update on public.matchings
for each row
execute function public.capture_status_change_event('assignment');

revoke all on public.admin_notes from anon;
revoke all on public.admin_activity_logs from anon;
revoke all on public.notification_events from anon;
revoke all on function public.enqueue_notification_event(text, text, text, text, text, text, jsonb) from public;
revoke all on function public.log_admin_status_change(text, text, jsonb, jsonb) from public;

notify pgrst, 'reload schema';
