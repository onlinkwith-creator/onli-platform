alter table public.request_interpreters
add column if not exists contact_visible boolean not null default false;

notify pgrst, 'reload schema';
