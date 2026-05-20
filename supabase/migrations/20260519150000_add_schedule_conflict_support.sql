create extension if not exists pgcrypto;

create table if not exists public.matchings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  request_id bigint references public.requests(id) on delete cascade,
  interpreter_id bigint references public.interpreters(id) on delete cascade,
  start_date date,
  end_date date,
  status text default 'assigned',
  created_at timestamptz default now()
);

alter table public.matchings
add column if not exists job_id uuid references public.jobs(id) on delete set null;

alter table public.matchings
add column if not exists request_id bigint references public.requests(id) on delete cascade;

alter table public.matchings
add column if not exists interpreter_id bigint references public.interpreters(id) on delete cascade;

alter table public.matchings
add column if not exists start_date date;

alter table public.matchings
add column if not exists end_date date;

alter table public.matchings
add column if not exists status text default 'assigned';

update public.matchings
set status = 'assigned'
where status is null or status = '';

alter table public.matchings
drop constraint if exists matchings_status_check;

alter table public.matchings
add constraint matchings_status_check
check (status in (
  'pending',
  'accepted',
  'rejected',
  'assigned',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'settled'
));

create index if not exists matchings_interpreter_date_idx
on public.matchings(interpreter_id, start_date, end_date);

alter table public.matchings enable row level security;

drop policy if exists "TEMP admin read matchings" on public.matchings;
create policy "TEMP admin read matchings"
on public.matchings
for select
to anon
using (true);

drop policy if exists "TEMP admin insert matchings" on public.matchings;
create policy "TEMP admin insert matchings"
on public.matchings
for insert
to anon
with check (true);

drop policy if exists "TEMP admin update matchings" on public.matchings;
create policy "TEMP admin update matchings"
on public.matchings
for update
to anon
using (true)
with check (true);

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_type text,
  target_id uuid,
  memo text,
  created_at timestamptz default now()
);

alter table public.admin_logs enable row level security;

drop policy if exists "TEMP admin insert admin logs" on public.admin_logs;
create policy "TEMP admin insert admin logs"
on public.admin_logs
for insert
to anon
with check (true);
