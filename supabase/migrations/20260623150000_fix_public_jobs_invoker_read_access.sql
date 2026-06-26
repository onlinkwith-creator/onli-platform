-- Keep public job pages on the public_jobs view while allowing the
-- SECURITY INVOKER view to pass the underlying table permission/RLS checks.
-- This does not disable RLS and does not expose non-public jobs.

alter table public.jobs enable row level security;

grant select on public.public_jobs to anon;
grant select on public.public_jobs to authenticated;

-- SECURITY INVOKER views require the caller to have privileges on the
-- referenced table. RLS below limits both view-backed and accidental direct
-- reads to the same public recruiting rows.
grant select on public.jobs to anon;
grant select on public.jobs to authenticated;

drop policy if exists "Allow public read public recruiting jobs" on public.jobs;
create policy "Allow public read public recruiting jobs"
on public.jobs
for select
to anon, authenticated
using (
  coalesce(visibility, 'public') = 'public'
  and lower(trim(coalesce(status, ''))) in (
    'open',
    'recruiting',
    'published',
    'closing_soon',
    '모집중',
    '모집 중',
    '공개'
  )
);

notify pgrst, 'reload schema';
