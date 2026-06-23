-- Recreate the public jobs view as SECURITY INVOKER so public reads cannot
-- bypass the caller's RLS context through the view owner.

drop view if exists public.public_jobs;

create view public.public_jobs
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
  and lower(trim(coalesce(status, ''))) in (
    'open',
    'recruiting',
    'published',
    'closing_soon',
    '모집중',
    '모집 중',
    '공개'
  );

revoke all on public.public_jobs from public;
revoke select on public.jobs from anon;
grant select on public.public_jobs to anon;
grant select on public.public_jobs to authenticated;

notify pgrst, 'reload schema';
