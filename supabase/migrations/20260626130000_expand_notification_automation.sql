-- ON-LI notification automation: queue metadata, templates, and operational triggers.

alter table public.notification_events
add column if not exists recipient_id uuid,
add column if not exists notification_type text,
add column if not exists title text,
add column if not exists message text,
add column if not exists related_request_id uuid,
add column if not exists related_document_id uuid,
add column if not exists channel text not null default 'email',
add column if not exists error_message text,
add column if not exists recipient_phone text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notification_events_channel_check'
      and conrelid = 'public.notification_events'::regclass
  ) then
    alter table public.notification_events
    add constraint notification_events_channel_check
    check (channel in ('email', 'kakao', 'internal'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'notification_events_status_check'
      and conrelid = 'public.notification_events'::regclass
  ) then
    alter table public.notification_events
    add constraint notification_events_status_check
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped'));
  end if;
end;
$$;

create index if not exists notification_events_channel_status_idx
on public.notification_events(channel, status, created_at desc);

create index if not exists notification_events_type_idx
on public.notification_events(notification_type, created_at desc);

create or replace view public.notifications as
select
  id,
  recipient_type,
  recipient_id,
  recipient_email,
  recipient_phone,
  coalesce(notification_type, event_type) as notification_type,
  title,
  message,
  related_request_id,
  related_document_id,
  channel,
  status,
  sent_at,
  error_message,
  created_at
from public.notification_events;

alter view public.notifications set (security_invoker = true);
grant select on public.notifications to authenticated;
revoke all on public.notifications from anon;

create or replace function public.enqueue_notification_event_v2(
  event_type text,
  target_type text,
  target_id text,
  recipient_type text,
  recipient_email text default null,
  recipient_phone text default null,
  payload jsonb default '{}'::jsonb,
  channel text default 'email',
  title text default null,
  message text default null,
  related_request_id uuid default null,
  related_document_id uuid default null,
  recipient_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
    event_type,
    event_type,
    target_type,
    target_id,
    recipient_type,
    recipient_id,
    recipient_email,
    recipient_phone,
    coalesce(payload, '{}'::jsonb),
    coalesce(nullif(channel, ''), 'email'),
    title,
    message,
    related_request_id,
    related_document_id,
    'pending'
  );
end;
$$;

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
    notification_type,
    target_type,
    target_id,
    recipient_type,
    recipient_email,
    recipient_phone,
    payload,
    channel,
    status
  )
  values (
    event_type,
    event_type,
    target_type,
    target_id,
    recipient_type,
    recipient_email,
    recipient_phone,
    coalesce(payload, '{}'::jsonb),
    'email',
    'pending'
  );
end;
$$;

create or replace function public.notify_new_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification_event_v2(
    'admin_new_company',
    'business',
    new.id::text,
    'admin',
    null,
    null,
    jsonb_build_object(
      'business_id', new.id,
      'company_name', new.company_name,
      'contact_name', new.contact_name
    ),
    'email',
    '신규 기업 등록',
    '신규 기업 계정이 등록되었습니다.'
  );
  return new;
end;
$$;

drop trigger if exists notify_new_business on public.businesses;
create trigger notify_new_business
after insert on public.businesses
for each row
execute function public.notify_new_business();

create or replace function public.notify_new_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_email text;
begin
  perform public.enqueue_notification_event_v2(
    'admin_new_request',
    'request',
    new.id::text,
    'admin',
    null,
    null,
    jsonb_build_object(
      'request_id', new.id,
      'request_no', to_jsonb(new)->>'request_no',
      'event_name', to_jsonb(new)->>'event_name',
      'company_name', to_jsonb(new)->>'company_name'
    ),
    'email',
    '신규 의뢰 접수',
    '신규 기업 의뢰가 접수되었습니다.'
  );

  recipient_email := coalesce(to_jsonb(new)->>'email', '');
  if recipient_email = '' then
    select contact_email into recipient_email
    from public.businesses
    where auth_user_id = new.company_auth_user_id;
  end if;

  if recipient_email is not null and recipient_email <> '' then
    perform public.enqueue_notification_event_v2(
      'company_request_received',
      'request',
      new.id::text,
      'company',
      recipient_email,
      null,
      jsonb_build_object(
        'request_id', new.id,
        'request_no', to_jsonb(new)->>'request_no',
        'company_name', to_jsonb(new)->>'company_name',
        'event_name', to_jsonb(new)->>'event_name',
        'recipient_email', recipient_email
      ),
      'email',
      '의뢰 접수 완료',
      '통역 의뢰가 정상 접수되었습니다.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_new_request on public.requests;
create trigger notify_new_request
after insert on public.requests
for each row
execute function public.notify_new_request();

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
    null,
    null,
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
      coalesce(to_jsonb(new)->>'phone', to_jsonb(new)->>'applicant_phone'),
      jsonb_build_object(
        'application_id', new.id,
        'job_id', to_jsonb(new)->>'job_id',
        'applicant_name', coalesce(to_jsonb(new)->>'applicant_name', to_jsonb(new)->>'name')
      ),
      'email',
      '지원 접수 완료',
      '지원이 정상 접수되었습니다.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_new_job_application on public.job_applications;
create trigger notify_new_job_application
after insert on public.job_applications
for each row
execute function public.notify_new_job_application();

create or replace function public.notify_request_estimate_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_email text;
begin
  if new.estimate_status = 'estimate_approved'
    and coalesce(old.estimate_status, '') <> 'estimate_approved' then
    perform public.enqueue_notification_event_v2(
      'admin_estimate_approved',
      'request',
      new.id::text,
      'admin',
      null,
      null,
      jsonb_build_object(
        'request_id', new.id,
        'request_no', new.request_no,
        'company_name', new.company_name,
        'event_name', new.event_name
      ),
      'email',
      '견적 승인 완료',
      '기업이 견적을 승인했습니다.'
    );

    recipient_email := coalesce(to_jsonb(new)->>'email', '');
    if recipient_email = '' then
      select contact_email into recipient_email
      from public.businesses
      where auth_user_id = new.company_auth_user_id;
    end if;

    if recipient_email is not null and recipient_email <> '' then
      perform public.enqueue_notification_event_v2(
        'company_estimate_approved',
        'request',
        new.id::text,
        'company',
        recipient_email,
        null,
        jsonb_build_object(
          'request_id', new.id,
          'request_no', new.request_no,
          'company_name', new.company_name,
          'event_name', new.event_name
        ),
        'email',
        '견적 승인 완료',
        '견적 승인 처리가 완료되었습니다.'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_request_estimate_approved on public.requests;
create trigger notify_request_estimate_approved
after update on public.requests
for each row
execute function public.notify_request_estimate_approved();

create or replace function public.notify_request_payout_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_record record;
begin
  if new.settlement_status not in ('completed', 'settlement_completed', 'settled', '정산완료')
    or coalesce(old.settlement_status, '') = coalesce(new.settlement_status, '') then
    return new;
  end if;

  for assignment_record in
    select
      ri.id as assignment_id,
      to_jsonb(ri)->>'matching_no' as assignment_code,
      i.email as interpreter_email,
      i.phone as interpreter_phone,
      i.name as interpreter_name
    from public.request_interpreters ri
    join public.interpreters i on i.id = ri.interpreter_id
    where ri.request_id = new.id
  loop
    if assignment_record.interpreter_email is not null and assignment_record.interpreter_email <> '' then
      perform public.enqueue_notification_event_v2(
        'interpreter_payout_completed',
        'settlement',
        new.id::text,
        'interpreter',
        assignment_record.interpreter_email,
        assignment_record.interpreter_phone,
        jsonb_build_object(
          'assignment_id', assignment_record.assignment_id,
          'assignment_code', assignment_record.assignment_code,
          'request_id', new.id,
          'request_no', to_jsonb(new)->>'request_no',
          'interpreter_name', assignment_record.interpreter_name,
          'event_name', to_jsonb(new)->>'event_name'
        ),
        'email',
        '정산 완료',
        '배정 건의 정산 완료 처리가 되었습니다.'
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_request_payout_completed on public.requests;
create trigger notify_request_payout_completed
after update on public.requests
for each row
execute function public.notify_request_payout_completed();

create or replace function public.notify_document_issued()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record record;
  interpreter_record record;
  company_email text;
begin
  if new.status <> 'issued' then
    return new;
  end if;

  if new.request_id is not null then
    select *
    into request_record
    from public.requests
    where id = new.request_id;

    company_email := coalesce(
      to_jsonb(request_record)->>'email',
      to_jsonb(request_record)->>'contact_email',
      to_jsonb(request_record)->>'contact_email_or_phone'
    );
  end if;

  if new.document_type = 'estimate' and company_email is not null and company_email <> '' then
    perform public.enqueue_notification_event_v2(
      'company_estimate_issued',
      'document',
      new.id::text,
      'company',
      company_email,
      null,
      jsonb_build_object(
        'document_id', new.id,
        'document_no', new.document_no,
        'request_id', new.request_id,
        'request_no', to_jsonb(request_record)->>'request_no',
        'company_name', to_jsonb(request_record)->>'company_name',
        'event_name', to_jsonb(request_record)->>'event_name'
      ),
      'email',
      '견적서가 발급되었습니다',
      '마이페이지에서 견적서를 확인해주세요.',
      null,
      new.id
    );
  elsif new.document_type = 'completion' and company_email is not null and company_email <> '' then
    perform public.enqueue_notification_event_v2(
      'company_completion_document_issued',
      'document',
      new.id::text,
      'company',
      company_email,
      null,
      jsonb_build_object(
        'document_id', new.id,
        'document_no', new.document_no,
        'request_id', new.request_id,
        'request_no', to_jsonb(request_record)->>'request_no',
        'company_name', to_jsonb(request_record)->>'company_name',
        'event_name', to_jsonb(request_record)->>'event_name'
      ),
      'email',
      '업무확인서가 발급되었습니다',
      '마이페이지에서 업무확인서를 확인해주세요.',
      null,
      new.id
    );
  elsif new.document_type = 'payout' then
    if new.interpreter_id is not null then
      select *
      into interpreter_record
      from public.interpreters
      where id = new.interpreter_id;
    end if;

    if coalesce(to_jsonb(interpreter_record)->>'email', '') <> '' then
      perform public.enqueue_notification_event_v2(
        'interpreter_payout_issued',
        'document',
        new.id::text,
        'interpreter',
        to_jsonb(interpreter_record)->>'email',
        to_jsonb(interpreter_record)->>'phone',
        jsonb_build_object(
          'document_id', new.id,
          'document_no', new.document_no,
          'request_id', new.request_id,
          'interpreter_id', new.interpreter_id,
          'interpreter_name', to_jsonb(interpreter_record)->>'name',
          'title', new.title
        ),
        'email',
        '정산서가 발급되었습니다',
        '마이페이지에서 정산서를 확인해주세요.',
        null,
        new.id
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_document_issued on public.documents;
create trigger notify_document_issued
after insert on public.documents
for each row
execute function public.notify_document_issued();

revoke all on function public.enqueue_notification_event_v2(text, text, text, text, text, text, jsonb, text, text, text, uuid, uuid, uuid) from public;

notify pgrst, 'reload schema';
