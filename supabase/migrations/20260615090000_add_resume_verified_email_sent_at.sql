-- Track the resume verification completion email to prevent duplicate sends.
alter table public.interpreters
add column if not exists resume_verified_email_sent_at timestamptz;
