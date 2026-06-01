-- Allow only approved, signed-in interpreters to submit job applications.
-- Keep RLS enabled and do not grant anon/public insert access.

alter table public.job_applications
  enable row level security;

drop policy if exists "TEMP public insert job applications" on public.job_applications;
drop policy if exists "Allow authenticated interpreter job application insert" on public.job_applications;
drop policy if exists "Approved interpreters can insert applications" on public.job_applications;

create policy "Approved interpreters can insert applications"
on public.job_applications
for insert
to authenticated
with check (
  auth.uid() is not null
  and job_id is not null
  and interpreter_id is not null
  and status = '지원완료'
  and exists (
    select 1
    from public.interpreters
    where interpreters.id = job_applications.interpreter_id
      and interpreters.approved = true
      and (
        interpreters.auth_user_id = auth.uid()
        or lower(trim(interpreters.email)) = lower(trim(auth.jwt() ->> 'email'))
      )
  )
);
