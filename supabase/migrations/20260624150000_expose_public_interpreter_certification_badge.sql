-- Recreate public interpreter view with the existing approved flag for ON-LI certification display.
-- This does not add a new column or change certification logic.

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
  approved
from public.interpreters
where coalesce(is_public, false) = true
  and withdrawn_at is null
  and lower(trim(coalesce(status, ''))) in ('active', 'warning', 'approved', 'verified', '승인', '승인완료', '활동중');

grant select on public.public_interpreters to anon, authenticated;

notify pgrst, 'reload schema';
