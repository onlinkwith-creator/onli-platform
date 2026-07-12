-- Notification history is the notifications table. Allow only active admins to
-- hard-delete selected history rows, and support an atomic sending state.

alter table public.notifications drop constraint if exists notifications_status_check;
alter table public.notifications add constraint notifications_status_check
  check (status in ('pending','sending','sent','failed'));

drop policy if exists "Admins can delete notification history" on public.notifications;
create policy "Admins can delete notification history"
on public.notifications for delete to authenticated
using (public.is_active_admin());
grant delete on public.notifications to authenticated;

-- Repair rows that were successfully recorded before a stale pending status.
update public.notifications set status='sent',error_message=null
where sent_at is not null and status<>'sent';

notify pgrst,'reload schema';
