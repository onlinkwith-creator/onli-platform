-- Add resume submission columns to the interpreters table
alter table public.interpreters
add column if not exists resume_url text,
add column if not exists resume_submitted_at timestamptz;
