-- Hotfix: public_interpreters.verified must mirror the admin ON-LI badge flag.
--
-- Verified source confirmed in Admin.jsx:
--   updateInterpreter(interpreter.id, { approved: true | false }, ...)
--
-- Verification queries for production SQL Editor:
--   select id, name, approved from public.interpreters order by name limit 50;
--   select id, name, verified from public.public_interpreters order by name limit 50;

alter table public.interpreters enable row level security;

drop policy if exists "Anyone can read public interpreters" on public.interpreters;
revoke select on public.interpreters from anon;

drop view if exists public.public_interpreters;
create view public.public_interpreters as
select
  id,
  name,
  region,
  level,
  short_intro,
  specialties,
  available_regions,
  experience_count,
  is_public,
  status,
  coalesce(approved, false) as verified
from public.interpreters
where coalesce(is_public, false) = true
  and withdrawn_at is null
  and lower(trim(coalesce(status, ''))) in (
    'active',
    'warning',
    'approved',
    'verified',
    '승인',
    '승인 완료',
    '승인완료',
    '활동중'
  );

grant select on public.public_interpreters to anon, authenticated;

notify pgrst, 'reload schema';
