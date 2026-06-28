-- Soft delete support for admin notification history.

alter table public.notification_events
add column if not exists deleted_at timestamptz,
add column if not exists deleted_by uuid;

create index if not exists notification_events_not_deleted_created_idx
on public.notification_events(created_at desc)
where deleted_at is null;

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
from public.notification_events
where deleted_at is null;

alter view public.notifications set (security_invoker = true);
grant select on public.notifications to authenticated;
revoke all on public.notifications from anon;

drop policy if exists notification_events_admin_soft_delete on public.notification_events;
create policy notification_events_admin_soft_delete
on public.notification_events
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
