alter table public.interpreters
add column if not exists agreed_terms boolean default false,
add column if not exists agreed_policy boolean default false,
add column if not exists agreed_at timestamp with time zone;

alter table public.requests
add column if not exists agreed_terms boolean default false,
add column if not exists agreed_policy boolean default false,
add column if not exists agreed_at timestamp with time zone;

alter table public.job_applications
add column if not exists agreed_terms boolean default false,
add column if not exists agreed_policy boolean default false,
add column if not exists agreed_at timestamp with time zone;

alter table public.applications
add column if not exists agreed_terms boolean default false,
add column if not exists agreed_policy boolean default false,
add column if not exists agreed_at timestamp with time zone;

alter table public.request_applications
add column if not exists agreed_terms boolean default false,
add column if not exists agreed_policy boolean default false,
add column if not exists agreed_at timestamp with time zone;
