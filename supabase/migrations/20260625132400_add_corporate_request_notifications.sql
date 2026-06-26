-- Supabase Migration: Add corporate request status notification triggers and security policies

-- 1. Create a trigger function for corporate request status updates
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
    -- fallback to business contact email if available
    select contact_email into recipient_email
    from public.businesses
    where auth_user_id = new.company_auth_user_id;
  end if;

  if recipient_email is null or recipient_email = '' then
    return new;
  end if;

  -- 1) 관리자 검토 시작 (Review Started)
  -- admin_checked transitions from false/null to true
  if (coalesce(old.admin_checked, false) = false and new.admin_checked = true) then
    perform public.enqueue_notification_event(
      'client_review_started',
      'request',
      new.id::text,
      'client',
      recipient_email,
      null,
      jsonb_build_object(
        'request_id', new.id,
        'request_no', new.request_no,
        'company_name', new.company_name,
        'event_name', new.event_name,
        'recipient_email', recipient_email
      )
    );
  end if;

  -- 2) 견적 안내 필요 (Estimate Sent/Ready)
  -- estimate_status transitions to 'estimate_sent'
  if (new.estimate_status = 'estimate_sent' and coalesce(old.estimate_status, '') <> 'estimate_sent') then
    perform public.enqueue_notification_event(
      'client_estimate_ready',
      'request',
      new.id::text,
      'client',
      recipient_email,
      null,
      jsonb_build_object(
        'request_id', new.id,
        'request_no', new.request_no,
        'company_name', new.company_name,
        'event_name', new.event_name,
        'recipient_email', recipient_email
      )
    );
  end if;

  -- 3) 통역사 모집 시작 (Recruitment Started)
  -- assignment_status transitions to 'assigning'
  if (new.assignment_status = 'assigning' and coalesce(old.assignment_status, '') <> 'assigning') then
    perform public.enqueue_notification_event(
      'client_recruiting_started',
      'request',
      new.id::text,
      'client',
      recipient_email,
      null,
      jsonb_build_object(
        'request_id', new.id,
        'request_no', new.request_no,
        'company_name', new.company_name,
        'event_name', new.event_name,
        'recipient_email', recipient_email
      )
    );
  end if;

  -- 4) 통역사 배정 완료 (Assignment Confirmed)
  -- assignment_status transitions to 'assigned'
  if (new.assignment_status = 'assigned' and coalesce(old.assignment_status, '') <> 'assigned') then
    perform public.enqueue_notification_event(
      'assignment_confirmed_client',
      'request',
      new.id::text,
      'client',
      recipient_email,
      null,
      jsonb_build_object(
        'request_id', new.id,
        'request_no', new.request_no,
        'company_name', new.company_name,
        'event_name', new.event_name,
        'recipient_email', recipient_email
      )
    );
  end if;

  -- 5) 업무 완료 (Work Completed)
  -- operation_status transitions to 'completed'
  if (new.operation_status = 'completed' and coalesce(old.operation_status, '') <> 'completed') then
    perform public.enqueue_notification_event(
      'client_work_completed',
      'request',
      new.id::text,
      'client',
      recipient_email,
      null,
      jsonb_build_object(
        'request_id', new.id,
        'request_no', new.request_no,
        'company_name', new.company_name,
        'event_name', new.event_name,
        'recipient_email', recipient_email
      )
    );
  end if;

  -- 6) 정산/결제 안내 필요 (Settlement Pending)
  -- settlement_status transitions to 'pending'
  if (new.settlement_status = 'pending' and coalesce(old.settlement_status, '') <> 'pending') then
    perform public.enqueue_notification_event(
      'client_settlement_ready',
      'request',
      new.id::text,
      'client',
      recipient_email,
      null,
      jsonb_build_object(
        'request_id', new.id,
        'request_no', new.request_no,
        'company_name', new.company_name,
        'event_name', new.event_name,
        'recipient_email', recipient_email
      )
    );
  end if;

  return new;
end;
$$;

-- Drop update trigger if exists and create it
drop trigger if exists notify_corporate_request_status_changed on public.requests;
create trigger notify_corporate_request_status_changed
after update on public.requests
for each row
execute function public.notify_corporate_request_status_changed();

-- 2. Modify insert trigger function for new request notifications to also alert the corporate client
create or replace function public.notify_new_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_email text;
begin
  -- Original admin notification
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

  -- New client notification
  recipient_email := coalesce(new.email, '');
  if recipient_email = '' then
    select contact_email into recipient_email
    from public.businesses
    where auth_user_id = new.company_auth_user_id;
  end if;

  if recipient_email is not null and recipient_email <> '' then
    perform public.enqueue_notification_event(
      'request_created_client',
      'request',
      new.id::text,
      'client',
      recipient_email,
      null,
      jsonb_build_object(
        'request_id', new.id,
        'request_no', new.request_no,
        'company_name', new.company_name,
        'event_name', new.event_name,
        'recipient_email', recipient_email
      )
    );
  end if;

  return new;
end;
$$;

-- 3. Create security policy to allow corporate clients to fetch their own events
drop policy if exists notification_events_corporate_select on public.notification_events;
create policy notification_events_corporate_select
on public.notification_events
for select
to authenticated
using (
  public.is_admin()
  or (
    recipient_type = 'client'
    and (
      (target_type = 'request' and exists (
        select 1 from public.requests r
        where r.id::text = target_id and r.company_auth_user_id = auth.uid()
      ))
      or
      (target_type = 'settlement' and exists (
        select 1 from public.requests r
        where r.id::text = target_id and r.company_auth_user_id = auth.uid()
      ))
      or
      (target_type = 'assignment' and exists (
        select 1 from public.request_interpreters ri
        join public.requests r on r.id = ri.request_id
        where ri.id::text = target_id and r.company_auth_user_id = auth.uid()
      ))
    )
  )
);

-- Notify schema reload
notify pgrst, 'reload schema';
