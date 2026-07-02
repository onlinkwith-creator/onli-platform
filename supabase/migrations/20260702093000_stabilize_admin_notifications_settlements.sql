-- Stabilize admin reads for notifications and settlements without disabling RLS.

alter table public.notifications
add column if not exists deleted_at timestamptz;

create index if not exists notifications_deleted_at_idx
on public.notifications(deleted_at, created_at desc);

drop policy if exists "Admins can manage notifications" on public.notifications;
drop policy if exists "Admins can select notifications" on public.notifications;
drop policy if exists "Admins can update notifications" on public.notifications;

create policy "Admins can select notifications"
on public.notifications
for select
to authenticated
using (public.is_active_admin());

create policy "Admins can update notifications"
on public.notifications
for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Companies can read own notifications" on public.notifications;
drop policy if exists "Interpreters can read own notifications" on public.notifications;

drop policy if exists "Admins can manage settlements" on public.settlements;
drop policy if exists "Admins can select settlements" on public.settlements;
drop policy if exists "Admins can update settlements" on public.settlements;
drop policy if exists "Admins can insert settlements" on public.settlements;
drop policy if exists "Interpreters can read own settlements" on public.settlements;

create policy "Admins can select settlements"
on public.settlements
for select
to authenticated
using (public.is_active_admin());

create policy "Admins can update settlements"
on public.settlements
for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create policy "Admins can insert settlements"
on public.settlements
for insert
to authenticated
with check (public.is_active_admin());

create policy "Interpreters can read own settlements"
on public.settlements
for select
to authenticated
using (
  interpreter_auth_user_id = auth.uid()
  or exists (
    select 1
    from public.interpreters i
    where i.id = settlements.interpreter_id
      and i.auth_user_id = auth.uid()
  )
);

create or replace function public.backfill_pending_settlements()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.requests%rowtype;
begin
  for request_row in
    select *
    from public.requests r
    where (
      coalesce(r.operation_status, '') in ('completed', 'operation_completed', 'done', '업무완료', '운영완료')
      or coalesce(r.settlement_status, '') in ('pending', 'confirmed', 'completed', 'on_hold', 'settlement_pending', 'settlement_confirmed', 'settlement_completed', '정산대기', '정산확정', '정산완료')
    )
    and exists (
      select 1 from public.request_interpreters ri where ri.request_id = r.id
      union all
      select 1 from public.matchings m where m.request_id = r.id
    )
  loop
    perform public.ensure_settlements_for_request(request_row.id);
  end loop;
end;
$$;

select public.backfill_pending_settlements();

notify pgrst, 'reload schema';
