alter table public.interpreters
add column if not exists short_intro text;

alter table public.interpreters
add column if not exists strength text;
