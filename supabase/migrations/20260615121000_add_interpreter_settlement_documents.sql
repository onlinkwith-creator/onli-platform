-- Add settlement document upload fields for interpreters.
alter table public.interpreters
add column if not exists bankbook_file_url text,
add column if not exists bankbook_file_name text,
add column if not exists business_license_file_url text,
add column if not exists business_license_file_name text;

-- Reuse the existing private resume bucket for interpreter settlement documents.
insert into storage.buckets (id, name, public)
values ('resume-files', 'resume-files', false)
on conflict (id) do nothing;
