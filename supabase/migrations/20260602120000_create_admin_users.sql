create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null unique,
  role text not null default 'staff',
  status text not null default 'active',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint admin_users_role_check check (role in ('owner', 'admin', 'staff')),
  constraint admin_users_status_check check (status in ('active', 'inactive'))
);

create index if not exists admin_users_email_idx
on public.admin_users (lower(email));

create index if not exists admin_users_status_idx
on public.admin_users (status);

insert into public.admin_users (email, role, status)
values
  ('onlinkwith@gmail.com', 'owner', 'active'),
  ('onlinkcp@gmail.com', 'admin', 'active')
on conflict (email) do update
set
  role = excluded.role,
  status = excluded.status,
  updated_at = now();

alter table public.admin_users enable row level security;

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
      and (
        current_admin.auth_user_id = auth.uid()
        or lower(current_admin.email) = lower(auth.jwt() ->> 'email')
      )
  );
$$;

create or replace function public.is_admin_manager()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users current_admin
    where current_admin.status = 'active'
      and current_admin.role in ('owner', 'admin')
      and (
        current_admin.auth_user_id = auth.uid()
        or lower(current_admin.email) = lower(auth.jwt() ->> 'email')
      )
  );
$$;

drop policy if exists "Active admins can read admin users" on public.admin_users;
create policy "Active admins can read admin users"
on public.admin_users
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Active admins can insert admin users" on public.admin_users;
create policy "Active admins can insert admin users"
on public.admin_users
for insert
to authenticated
with check (public.is_admin_manager());

drop policy if exists "Active admins can update admin users" on public.admin_users;
create policy "Active admins can update admin users"
on public.admin_users
for update
to authenticated
using (public.is_admin_manager())
with check (public.is_admin_manager());
