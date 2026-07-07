alter table public.requests
  add column if not exists operation_status text;

alter table public.requests
  alter column operation_status set default 'operation_before';

update public.requests
set operation_status = case
  when operation_status in ('operation_preparing', 'preparing', '업무준비중', '업무 준비중', '운영준비중', '운영 준비중') then 'operation_preparing'
  when operation_status in ('operation_scheduled', 'ready', 'scheduled', '진행예정', '진행 예정', '운영예정', '운영 예정') then 'operation_scheduled'
  when operation_status in ('operation_in_progress', 'in_progress', 'operating', 'matching', '운영중', '진행중') then 'operation_in_progress'
  when operation_status in ('operation_completed', 'completed', 'done', 'finished', 'settled', '업무완료', '운영완료', '완료', '정산완료') then 'operation_completed'
  when operation_status in ('operation_before', 'before_operation', 'before', 'pending', '운영전', '진행 전') then 'operation_before'
  when operation_status is null or btrim(operation_status) = '' then 'operation_before'
  else 'operation_before'
end;

alter table public.requests
  drop constraint if exists requests_operation_status_check;

alter table public.requests
  add constraint requests_operation_status_check
  check (
    operation_status in (
      'operation_preparing',
      'operation_scheduled',
      'operation_before',
      'operation_in_progress',
      'operation_completed'
    )
  );

alter table public.jobs
  add column if not exists operation_status text;

alter table public.jobs
  alter column operation_status set default 'operation_before';

update public.jobs
set operation_status = case
  when operation_status in ('operation_preparing', 'preparing', '업무준비중', '업무 준비중', '운영준비중', '운영 준비중') then 'operation_preparing'
  when operation_status in ('operation_scheduled', 'ready', 'scheduled', '진행예정', '진행 예정', '운영예정', '운영 예정') then 'operation_scheduled'
  when operation_status in ('operation_in_progress', 'in_progress', 'operating', 'matching', '운영중', '진행중') then 'operation_in_progress'
  when operation_status in ('operation_completed', 'completed', 'done', 'finished', 'settled', '업무완료', '운영완료', '완료', '정산완료') then 'operation_completed'
  when operation_status in ('operation_before', 'before_operation', 'before', 'pending', '운영전', '진행 전') then 'operation_before'
  when operation_status is null or btrim(operation_status) = '' then 'operation_before'
  else 'operation_before'
end;

alter table public.jobs
  drop constraint if exists jobs_operation_status_check;

alter table public.jobs
  add constraint jobs_operation_status_check
  check (
    operation_status in (
      'operation_preparing',
      'operation_scheduled',
      'operation_before',
      'operation_in_progress',
      'operation_completed'
    )
  );

create or replace function public.notify_corporate_request_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_email text;
begin
  recipient_email := coalesce(new.email, '');

  if recipient_email = '' then
    select contact_email into recipient_email
    from public.businesses
    where auth_user_id = new.company_auth_user_id;
  end if;

  if recipient_email is null or recipient_email = '' then
    return new;
  end if;

  if (coalesce(old.admin_checked, false) = false and new.admin_checked = true) then
    perform public.enqueue_notification_event(
      'client_review_started', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  if (new.estimate_status = 'estimate_sent' and coalesce(old.estimate_status, '') <> 'estimate_sent') then
    perform public.enqueue_notification_event(
      'client_estimate_ready', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  if (new.assignment_status = 'assigning' and coalesce(old.assignment_status, '') <> 'assigning') then
    perform public.enqueue_notification_event(
      'client_recruiting_started', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  if (new.assignment_status = 'assigned' and coalesce(old.assignment_status, '') <> 'assigned') then
    perform public.enqueue_notification_event(
      'assignment_confirmed_client', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  if (
    (
      new.operation_status = 'operation_preparing'
      and coalesce(old.operation_status, '') <> 'operation_preparing'
    )
    or (
      new.assignment_status = 'preparing'
      and coalesce(old.assignment_status, '') <> 'preparing'
    )
  ) then
    perform public.enqueue_notification_event(
      'client_work_preparing', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  if (
    (
      new.operation_status = 'operation_scheduled'
      and coalesce(old.operation_status, '') <> 'operation_scheduled'
    )
    or (
      new.assignment_status = 'ready'
      and coalesce(old.assignment_status, '') <> 'ready'
    )
  ) then
    perform public.enqueue_notification_event(
      'client_work_ready', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  if (
    new.operation_status in ('operation_completed', 'completed')
    and coalesce(old.operation_status, '') not in ('operation_completed', 'completed')
  ) then
    perform public.enqueue_notification_event(
      'client_work_completed', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  if (new.settlement_status = 'pending' and coalesce(old.settlement_status, '') <> 'pending') then
    perform public.enqueue_notification_event(
      'client_settlement_ready', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
