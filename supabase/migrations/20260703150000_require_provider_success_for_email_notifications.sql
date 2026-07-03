alter table public.notifications
add column if not exists provider_message_id text;

create index if not exists notifications_provider_message_id_idx
on public.notifications(provider_message_id)
where provider_message_id is not null;

-- Email notifications must only remain sent when a provider success id was recorded.
-- Internal notifications are admin-visible records and do not require a mail provider id.
update public.notifications
set
  status = 'failed',
  sent_at = null,
  error_message = coalesce(error_message, 'provider success response is missing')
where channel = 'email'
  and status = 'sent'
  and nullif(trim(coalesce(provider_message_id, '')), '') is null;

update public.notifications
set
  status = 'failed',
  sent_at = null,
  error_message = 'recipient_email is missing'
where channel = 'email'
  and (
    nullif(trim(coalesce(recipient_email, '')), '') is null
    or trim(coalesce(recipient_email, '')) = '-'
  );

notify pgrst, 'reload schema';
