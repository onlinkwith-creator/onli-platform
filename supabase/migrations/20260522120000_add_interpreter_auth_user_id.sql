alter table public.interpreters
add column if not exists auth_user_id uuid;
