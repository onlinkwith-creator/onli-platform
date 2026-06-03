alter table public.admin_users
add column if not exists status text not null default 'active';

alter table public.admin_users
drop constraint if exists admin_users_status_check;

alter table public.admin_users
add constraint admin_users_status_check
check (status in ('active', 'inactive'));

update public.admin_users
set status = 'active'
where status is null;

create index if not exists admin_users_status_idx
on public.admin_users (status);

notify pgrst, 'reload schema';
