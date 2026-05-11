alter table public.interpreters
add column if not exists has_experience boolean default false;
