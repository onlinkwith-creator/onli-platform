alter table public.job_applications
add column if not exists agreed_cancel_policy boolean default false,
add column if not exists cancel_policy_agreed_at timestamptz;
