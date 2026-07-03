-- Restore admin notification sending permissions and keep required columns present.

alter table public.notifications
add column if not exists recipient_phone text,
add column if not exists related_request_id bigint references public.requests(id) on delete set null,
add column if not exists related_document_id uuid references public.documents(id) on delete set null,
add column if not exists sent_at timestamptz,
add column if not exists error_message text,
add column if not exists deleted_at timestamptz;

alter table public.notifications enable row level security;

drop policy if exists "Admins can select notifications" on public.notifications;
create policy "Admins can select notifications"
on public.notifications
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can insert notifications" on public.notifications;
create policy "Admins can insert notifications"
on public.notifications
for insert
to authenticated
with check (public.is_active_admin());

drop policy if exists "Admins can update notifications" on public.notifications;
create policy "Admins can update notifications"
on public.notifications
for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Companies can read own notifications" on public.notifications;
create policy "Companies can read own notifications"
on public.notifications
for select
to authenticated
using (
  recipient_type = 'company'
  and deleted_at is null
  and (
    recipient_id = auth.uid()
    or exists (
      select 1
      from public.requests r
      where r.id = notifications.related_request_id
        and r.company_auth_user_id = auth.uid()
    )
  )
);

drop policy if exists "Interpreters can read own notifications" on public.notifications;
create policy "Interpreters can read own notifications"
on public.notifications
for select
to authenticated
using (
  recipient_type = 'interpreter'
  and deleted_at is null
  and exists (
    select 1
    from public.interpreters i
    where i.auth_user_id = auth.uid()
      and (
        notifications.recipient_id = auth.uid()
        or notifications.recipient_email = i.email
      )
  )
);

revoke all on public.notifications from anon;
grant select, insert, update on public.notifications to authenticated;

notify pgrst, 'reload schema';
