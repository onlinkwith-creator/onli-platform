alter table public.requests
add column if not exists reference_file_name text;

alter table public.requests
add column if not exists reference_file_path text;

alter table public.requests
add column if not exists reference_file_url text;
