alter table public.requests
add column if not exists preferred_gender text not null default '성별 무관';
