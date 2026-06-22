-- Hotfix: ensure the public interpreter view exists for PostgREST clients.
-- Keep sensitive interpreter columns out of public/anonymous payloads.

alter table public.interpreters enable row level security;

drop policy if exists "Anyone can read public interpreters" on public.interpreters;
revoke select on public.interpreters from anon;

create or replace view public.public_interpreters as
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
  status
from public.interpreters
where is_public = true
  and withdrawn_at is null
  and status in ('active', 'approved', 'verified');

grant select on public.public_interpreters to anon;
grant select on public.public_interpreters to authenticated;

notify pgrst, 'reload schema';
