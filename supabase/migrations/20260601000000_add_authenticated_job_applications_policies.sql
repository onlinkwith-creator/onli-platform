-- Add authenticated-only policies for job_applications insert/select.
-- This prevents anon/public inserts and limits applications to own approved interpreter profile.

alter table public.job_applications
  enable row level security;

-- Remove the temporary public insert/read policies if present.
drop policy if exists "TEMP public insert job applications" on public.job_applications;
drop policy if exists "TEMP admin read job applications" on public.job_applications;

create policy "Allow authenticated interpreter job application insert"
  on public.job_applications
  for insert
  to authenticated
  with check (
    status = '지원완료'
    and job_id is not null
    and interpreter_id in (
      select id from public.interpreters
      where approved = true
        and (
          auth_user_id = auth.uid()
          or lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
        )
    )
  );

create policy "Allow authenticated interpreter job application read own records"
  on public.job_applications
  for select
  to authenticated
  using (
    auth.uid() is not null
    and (
      interpreter_id in (
        select id from public.interpreters
        where approved = true
          and (
            auth_user_id = auth.uid()
            or lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
          )
      )
      or lower(trim(applicant_email)) = lower(trim(auth.jwt() ->> 'email'))
      or lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
    )
  );
