alter table public.interpreters
add column if not exists specialties text[] not null default '{}';

alter table public.interpreters
add column if not exists available_tasks text;

alter table public.interpreters
add column if not exists short_intro text;
