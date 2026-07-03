-- Fix recipient_email values that contain placeholder text instead of real emails.
-- These were stored when the notification creation logic defaulted to admin/internal.

update public.notifications
set recipient_email = null
where nullif(trim(coalesce(recipient_email, '')), '') in (
  '관리자 정보 없음',
  '관리자',
  '정보 없음',
  '-',
  '없음',
  '이메일 없음',
  '수신자 없음'
);

-- Repair old notifications that were stored with recipient_type='admin' and channel='internal'
-- but actually belong to company recipients (can be identified by notification_type prefix).
update public.notifications
set
  recipient_type = 'company',
  channel = case
    when nullif(trim(coalesce(recipient_email, '')), '') is not null then 'email'
    else 'internal'
  end,
  status = case
    when nullif(trim(coalesce(recipient_email, '')), '') is null then 'failed'
    when status = 'sent' then 'sent'
    else 'pending'
  end,
  error_message = case
    when nullif(trim(coalesce(recipient_email, '')), '') is null then 'recipient_email is missing'
    else error_message
  end
where recipient_type = 'admin'
  and notification_type in (
    'company_request_received',
    'company_estimate_issued',
    'company_estimate_approved',
    'company_assignment_completed',
    'company_matching_confirmed',
    'company_completion_document_issued',
    'company_payment_invoice_sent',
    'company_payment_paid',
    'company_payment_overdue',
    'client_review_started',
    'client_estimate_ready',
    'client_recruiting_started',
    'assignment_confirmed_client',
    'client_work_completed',
    'client_settlement_ready',
    'request_created_client',
    'company_request_under_review'
  );

-- Repair old notifications that were stored with recipient_type='admin' and channel='internal'
-- but actually belong to interpreter recipients.
update public.notifications
set
  recipient_type = 'interpreter',
  channel = case
    when nullif(trim(coalesce(recipient_email, '')), '') is not null then 'email'
    else 'internal'
  end,
  status = case
    when nullif(trim(coalesce(recipient_email, '')), '') is null then 'failed'
    when status = 'sent' then 'sent'
    else 'pending'
  end,
  error_message = case
    when nullif(trim(coalesce(recipient_email, '')), '') is null then 'recipient_email is missing'
    else error_message
  end
where recipient_type = 'admin'
  and notification_type in (
    'interpreter_assignment_completed',
    'assignment_created',
    'interpreter_matching_confirmed',
    'interpreter_approved',
    'interpreter_payout_issued',
    'interpreter_payout_completed',
    'settlement_ready',
    'resume_verified',
    'application_status_changed'
  );

-- Ensure all company/interpreter notifications have channel=email (not internal).
update public.notifications
set
  channel = 'email',
  status = case
    when nullif(trim(coalesce(recipient_email, '')), '') is null then 'failed'
    when status = 'sent' then 'sent'
    else 'pending'
  end,
  error_message = case
    when nullif(trim(coalesce(recipient_email, '')), '') is null
      and (error_message is null or error_message = '')
      then 'recipient_email is missing'
    else error_message
  end
where recipient_type in ('company', 'interpreter')
  and channel = 'internal';

-- Try to backfill recipient_email for company notifications missing it.
update public.notifications n
set recipient_email = b.contact_email
from public.requests r
join public.businesses b on b.auth_user_id = r.company_auth_user_id
where n.recipient_type = 'company'
  and nullif(trim(coalesce(n.recipient_email, '')), '') is null
  and n.related_request_id = r.id
  and nullif(trim(coalesce(b.contact_email, '')), '') is not null;

-- Try to backfill recipient_email for interpreter notifications missing it.
update public.notifications n
set recipient_email = i.email
from public.interpreters i
where n.recipient_type = 'interpreter'
  and nullif(trim(coalesce(n.recipient_email, '')), '') is null
  and i.id::text = n.recipient_id::text
  and nullif(trim(coalesce(i.email, '')), '') is not null;

-- Re-evaluate status for email notifications that now have a recipient_email.
update public.notifications
set
  status = 'pending',
  error_message = null
where recipient_type in ('company', 'interpreter')
  and channel = 'email'
  and status = 'failed'
  and error_message = 'recipient_email is missing'
  and nullif(trim(coalesce(recipient_email, '')), '') is not null;

notify pgrst, 'reload schema';
