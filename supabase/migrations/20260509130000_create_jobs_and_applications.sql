create extension if not exists pgcrypto;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text,
  location text,
  date text,
  pay text,
  language text,
  level text,
  preference text,
  people text,
  status text default '모집중',
  is_urgent boolean default false,
  created_at timestamp default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  name text,
  phone text,
  email text,
  gender text,
  japanese_level text,
  experience text,
  message text,
  created_at timestamp default now()
);

alter table public.jobs enable row level security;
alter table public.applications enable row level security;

drop policy if exists "TEMP public read jobs" on public.jobs;
create policy "TEMP public read jobs"
on public.jobs
for select
to anon
using (true);

drop policy if exists "TEMP public insert jobs" on public.jobs;
create policy "TEMP public insert jobs"
on public.jobs
for insert
to anon
with check (true);

drop policy if exists "TEMP public update jobs" on public.jobs;
create policy "TEMP public update jobs"
on public.jobs
for update
to anon
using (true)
with check (true);

drop policy if exists "TEMP public delete jobs" on public.jobs;
create policy "TEMP public delete jobs"
on public.jobs
for delete
to anon
using (true);

drop policy if exists "TEMP public read applications" on public.applications;
create policy "TEMP public read applications"
on public.applications
for select
to anon
using (true);

drop policy if exists "TEMP public insert applications" on public.applications;
create policy "TEMP public insert applications"
on public.applications
for insert
to anon
with check (true);

drop policy if exists "TEMP public update applications" on public.applications;
create policy "TEMP public update applications"
on public.applications
for update
to anon
using (true)
with check (true);

drop policy if exists "TEMP public delete applications" on public.applications;
create policy "TEMP public delete applications"
on public.applications
for delete
to anon
using (true);
