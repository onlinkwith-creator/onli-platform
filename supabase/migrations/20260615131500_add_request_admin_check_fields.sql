alter table public.requests
add column if not exists admin_checked boolean;

alter table public.requests
add column if not exists checked_at timestamptz;

alter table public.requests
alter column admin_checked set default false;
