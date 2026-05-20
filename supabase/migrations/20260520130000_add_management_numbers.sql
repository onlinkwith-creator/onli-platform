alter table public.requests
add column if not exists request_no text unique;

alter table public.jobs
add column if not exists job_no text unique;

alter table public.matchings
add column if not exists matching_no text unique;

alter table public.interpreters
add column if not exists interpreter_no text unique;

alter table public.job_applications
add column if not exists application_no text unique;

alter table public.applications
add column if not exists application_no text unique;
