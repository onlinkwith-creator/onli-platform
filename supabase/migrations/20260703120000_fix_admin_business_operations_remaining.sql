-- Fix remaining admin/business operation issues without disabling RLS.

alter table public.request_interpreters
add column if not exists contact_revealed boolean not null default false,
add column if not exists contact_revealed_at timestamptz,
add column if not exists contact_revealed_by uuid references auth.users(id) on delete set null;

update public.request_interpreters
set contact_revealed = true
where coalesce(is_contact_visible, false) = true
  and coalesce(contact_revealed, false) = false;

create or replace function public.sync_request_interpreter_contact_visibility()
returns trigger
language plpgsql
as $$
begin
  new.contact_revealed := coalesce(new.contact_revealed, false) or coalesce(new.is_contact_visible, false);
  new.is_contact_visible := coalesce(new.is_contact_visible, false) or coalesce(new.contact_revealed, false);

  if new.contact_revealed = true and old.contact_revealed is distinct from true then
    new.contact_revealed_at := coalesce(new.contact_revealed_at, now());
    new.contact_revealed_by := coalesce(new.contact_revealed_by, auth.uid());
  end if;

  if new.contact_revealed = false then
    new.contact_revealed_at := null;
    new.contact_revealed_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_request_interpreter_contact_visibility on public.request_interpreters;
create trigger sync_request_interpreter_contact_visibility
before update on public.request_interpreters
for each row
execute function public.sync_request_interpreter_contact_visibility();

drop policy if exists "Admins can select requests" on public.requests;
create policy "Admins can select requests"
on public.requests
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update requests" on public.requests;
create policy "Admins can update requests"
on public.requests
for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Admins can manage request assignments" on public.request_interpreters;
create policy "Admins can manage request assignments"
on public.request_interpreters
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Companies can read own revealed interpreter contacts" on public.interpreters;
create policy "Companies can read own revealed interpreter contacts"
on public.interpreters
for select
to authenticated
using (
  exists (
    select 1
    from public.request_interpreters ri
    join public.requests r on r.id = ri.request_id
    where ri.interpreter_id = interpreters.id
      and r.company_auth_user_id = auth.uid()
      and (coalesce(ri.contact_revealed, false) = true or coalesce(ri.is_contact_visible, false) = true)
  )
);

drop policy if exists "Companies can read own request assignments" on public.request_interpreters;
create policy "Companies can read own request assignments"
on public.request_interpreters
for select
to authenticated
using (
  exists (
    select 1
    from public.requests r
    where r.id = request_interpreters.request_id
      and r.company_auth_user_id = auth.uid()
  )
);

notify pgrst, 'reload schema';
