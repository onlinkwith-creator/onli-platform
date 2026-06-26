-- Lock down the raw jobs table for anonymous users.
-- Public job pages must read only the curated public_jobs view.

alter table public.jobs enable row level security;

drop policy if exists "TEMP public read jobs" on public.jobs;
drop policy if exists "Allow public read public jobs" on public.jobs;
drop policy if exists "Anyone can read public jobs" on public.jobs;
drop policy if exists "Allow public read public recruiting jobs" on public.jobs;
drop policy if exists "Allow public read public jobs through public view" on public.jobs;
drop policy if exists "Allow anon read jobs" on public.jobs;
drop policy if exists "Public can read jobs" on public.jobs;
drop policy if exists "Enable read access for all users" on public.jobs;
drop policy if exists "Anyone can view jobs" on public.jobs;
drop policy if exists "TEMP authenticated read jobs" on public.jobs;
drop policy if exists "Admins can read jobs" on public.jobs;
drop policy if exists "Admins can insert jobs" on public.jobs;
drop policy if exists "Admins can update jobs" on public.jobs;
drop policy if exists "Admins can delete jobs" on public.jobs;
drop policy if exists "TEMP authenticated admin insert jobs" on public.jobs;
drop policy if exists "TEMP authenticated admin update jobs" on public.jobs;
drop policy if exists "TEMP authenticated admin delete jobs" on public.jobs;

revoke all on public.jobs from anon;
revoke select on public.jobs from anon;
grant select, insert, update, delete on public.jobs to authenticated;

create policy "Admins can read jobs"
on public.jobs
for select
to authenticated
using (public.is_admin() or auth.role() = 'service_role');

create policy "Admins can insert jobs"
on public.jobs
for insert
to authenticated
with check (public.is_admin() or auth.role() = 'service_role');

create policy "Admins can update jobs"
on public.jobs
for update
to authenticated
using (public.is_admin() or auth.role() = 'service_role')
with check (public.is_admin() or auth.role() = 'service_role');

create policy "Admins can delete jobs"
on public.jobs
for delete
to authenticated
using (public.is_admin() or auth.role() = 'service_role');

drop view if exists public.public_jobs;

create view public.public_jobs
with (security_invoker = false) as
select
  id,
  title,
  event_name,
  null::text as event_type,
  date as work_date,
  date,
  start_date,
  end_date,
  nullif(regexp_replace(coalesce(event_location, location, ''), '[[:space:]].*$', ''), '') as location,
  nullif(regexp_replace(coalesce(event_location, location, ''), '[[:space:]].*$', ''), '') as event_location,
  nullif(regexp_replace(coalesce(event_location, location, ''), '[[:space:]].*$', ''), '') as region,
  language as language_pair,
  language,
  field,
  requested_level as level_required,
  requested_level,
  level,
  people_count as number_of_interpreters,
  people_count,
  people,
  null::text as public_description,
  null::text as preference,
  status as public_status,
  status,
  event_date,
  deadline,
  created_at
from public.jobs
where coalesce(visibility, 'public') = 'public'
  and lower(trim(coalesce(status, ''))) not in (
    'cancelled',
    'canceled',
    '취소',
    'hidden',
    '숨김'
  );

revoke all on public.public_jobs from public;
grant select on public.public_jobs to anon;
grant select on public.public_jobs to authenticated;

notify pgrst, 'reload schema';
