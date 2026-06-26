-- Show every public, non-cancelled job through the public_jobs view.
-- Keep SECURITY INVOKER and RLS; do not expose private/hidden/cancelled jobs.

create or replace view public.public_jobs
with (security_invoker = true) as
select
  id,
  title,
  event_name,
  null::text as event_type,
  date as work_date,
  start_date,
  end_date,
  location,
  coalesce(event_location, location) as region,
  language as language_pair,
  language,
  field,
  requested_level as level_required,
  requested_level,
  level,
  people_count as number_of_interpreters,
  people_count,
  people,
  preference as public_description,
  preference,
  status as public_status,
  status,
  event_date,
  event_location,
  preferred_gender,
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

grant select on public.public_jobs to anon;
grant select on public.public_jobs to authenticated;
grant select on public.jobs to anon;
grant select on public.jobs to authenticated;

drop policy if exists "Allow public read public recruiting jobs" on public.jobs;
create policy "Allow public read public jobs through public view"
on public.jobs
for select
to anon, authenticated
using (
  coalesce(visibility, 'public') = 'public'
  and lower(trim(coalesce(status, ''))) not in (
    'cancelled',
    'canceled',
    '취소',
    'hidden',
    '숨김'
  )
);

notify pgrst, 'reload schema';
