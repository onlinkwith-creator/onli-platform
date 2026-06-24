-- Restore admin access to the raw jobs table without reopening anon reads.

create or replace function public.is_active_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users current_admin
    where current_admin.status = 'active'
      and current_admin.role in ('owner', 'admin', 'staff')
      and (
        current_admin.auth_user_id = auth.uid()
        or lower(trim(current_admin.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_active_admin();
$$;

update public.admin_users admin_user
set auth_user_id = auth_user.id,
    updated_at = now()
from auth.users auth_user
where admin_user.auth_user_id is null
  and lower(trim(admin_user.email)) = lower(trim(auth_user.email));

alter table public.jobs enable row level security;

drop policy if exists "Allow anon read jobs" on public.jobs;
drop policy if exists "Public can read jobs" on public.jobs;
drop policy if exists "Enable read access for all users" on public.jobs;
drop policy if exists "Anyone can view jobs" on public.jobs;
drop policy if exists "Anyone can read public jobs" on public.jobs;
drop policy if exists "Allow public read public jobs" on public.jobs;
drop policy if exists "Allow public read public recruiting jobs" on public.jobs;
drop policy if exists "Allow public read public jobs through public view" on public.jobs;
drop policy if exists "Admins can read jobs" on public.jobs;
drop policy if exists "Admins can insert jobs" on public.jobs;
drop policy if exists "Admins can update jobs" on public.jobs;
drop policy if exists "Admins can delete jobs" on public.jobs;

revoke all on public.jobs from anon;
grant select, insert, update, delete on public.jobs to authenticated;

create policy "Admins can read jobs"
on public.jobs
for select
to authenticated
using (public.is_admin());

create policy "Admins can insert jobs"
on public.jobs
for insert
to authenticated
with check (public.is_admin());

create policy "Admins can update jobs"
on public.jobs
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete jobs"
on public.jobs
for delete
to authenticated
using (public.is_admin());

notify pgrst, 'reload schema';
