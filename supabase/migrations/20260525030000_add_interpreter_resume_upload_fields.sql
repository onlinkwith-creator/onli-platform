-- Add resume file upload columns to the interpreters table
alter table public.interpreters
add column if not exists resume_file_url text,
add column if not exists resume_file_name text,
add column if not exists resume_uploaded_at timestamptz;

-- Create resume-files bucket in Supabase storage if not exists
insert into storage.buckets (id, name, public)
values ('resume-files', 'resume-files', false)
on conflict (id) do nothing;
