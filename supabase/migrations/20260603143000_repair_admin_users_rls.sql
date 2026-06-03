alter table public.admin_users enable row level security;

alter table public.admin_users
add column if not exists status text not null default 'active';

alter table public.admin_users
drop constraint if exists admin_users_role_check;

alter table public.admin_users
add constraint admin_users_role_check
check (role in ('owner', 'admin', 'staff'));

alter table public.admin_users
drop constraint if exists admin_users_status_check;

alter table public.admin_users
add constraint admin_users_status_check
check (status in ('active', 'inactive'));

insert into public.admin_users (email, role, status)
values
  ('onlinkwith@gmail.com', 'owner', 'active'),
  ('onlinkcp@gmail.com', 'admin', 'active')
on conflict (email) do update
set
  role = excluded.role,
  status = excluded.status,
  updated_at = now();

create or replace function public.can_read_admin_users()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where lower(au.email) = lower(auth.email())
      and au.status = 'active'
      and au.role in ('owner', 'admin')
  );
$$;

create or replace function public.can_write_admin_users()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where lower(au.email) = lower(auth.email())
      and au.status = 'active'
      and au.role = 'owner'
  );
$$;

drop policy if exists admin_users_select on public.admin_users;
drop policy if exists admin_users_insert on public.admin_users;
drop policy if exists admin_users_update on public.admin_users;
drop policy if exists admin_users_delete on public.admin_users;
drop policy if exists "Active admins can read admin users" on public.admin_users;
drop policy if exists "Active admins can insert admin users" on public.admin_users;
drop policy if exists "Active admins can update admin users" on public.admin_users;

create policy admin_users_select
on public.admin_users
for select
to authenticated
using (
  auth.role() = 'authenticated'
  and public.can_read_admin_users()
);

create policy admin_users_insert
on public.admin_users
for insert
to authenticated
with check (
  auth.role() = 'authenticated'
  and public.can_write_admin_users()
);

create policy admin_users_update
on public.admin_users
for update
to authenticated
using (
  auth.role() = 'authenticated'
  and public.can_write_admin_users()
)
with check (
  auth.role() = 'authenticated'
);

notify pgrst, 'reload schema';
