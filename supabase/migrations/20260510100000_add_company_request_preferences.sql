alter table public.requests
add column if not exists requested_level text not null default '운영팀 추천받기';

alter table public.requests
add column if not exists requested_people_count integer not null default 1;

alter table public.requests
add column if not exists preferred_gender text not null default '성별 무관';

alter table public.requests
drop constraint if exists requests_requested_people_count_positive;

alter table public.requests
add constraint requests_requested_people_count_positive
check (requested_people_count >= 1);
