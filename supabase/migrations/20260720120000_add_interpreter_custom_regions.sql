-- Keep the existing available_regions array untouched and store user-entered
-- locations separately so legacy profile data remains fully compatible.
alter table public.interpreters
  add column if not exists custom_regions text[] not null default '{}';

comment on column public.interpreters.custom_regions is
  'User-entered activity regions; available_regions remains the prefecture selection array.';

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
  status,
  coalesce(approved, false) as verified,
  custom_regions
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
