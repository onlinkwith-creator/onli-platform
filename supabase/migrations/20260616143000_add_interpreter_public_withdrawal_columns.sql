alter table public.interpreters
add column if not exists is_public boolean default true;

alter table public.interpreters
add column if not exists withdrawn_at timestamptz;

update public.interpreters
set is_public = true
where is_public is null;
