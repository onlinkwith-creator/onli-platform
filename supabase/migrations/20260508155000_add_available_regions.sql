alter table public.interpreters
add column if not exists specialties text[] not null default '{}';

alter table public.interpreters
add column if not exists available_regions text[] not null default '{}';
