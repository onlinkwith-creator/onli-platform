-- Allow signed-in, approved interpreters to insert their own job applications.
-- Admin approval is represented by interpreters.status = 'active' in the current app.

alter table public.interpreters
  enable row level security;

alter table public.job_applications
  enable row level security;

drop policy if exists "Users can read own interpreter profile" on public.interpreters;
drop policy if exists "Allow authenticated interpreter profile read" on public.interpreters;
create policy "Users can read own interpreter profile"
on public.interpreters
for select
to authenticated
using (
  auth.uid() is not null
  and (
    auth_user_id = auth.uid()
    or lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
  )
);

drop policy if exists "Allow authenticated interpreter profile link" on public.interpreters;
create policy "Allow authenticated interpreter profile link"
on public.interpreters
for update
to authenticated
using (
  auth.uid() is not null
  and (
    auth_user_id = auth.uid()
    or (
      auth_user_id is null
      and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
    )
  )
)
with check (
  auth.uid() is not null
  and auth_user_id = auth.uid()
  and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
);

drop policy if exists "Approved interpreters can insert applications" on public.job_applications;
drop policy if exists "Allow authenticated interpreter job application insert" on public.job_applications;
drop policy if exists "TEMP public insert job applications" on public.job_applications;
drop policy if exists "Interpreters can insert own job applications" on public.job_applications;

create policy "Interpreters can insert own job applications"
on public.job_applications
for insert
to authenticated
with check (
  auth.uid() is not null
  and job_id is not null
  and interpreter_id is not null
  and status in ('pending', '지원완료')
  and exists (
    select 1
    from public.interpreters i
    where i.id = job_applications.interpreter_id
      and i.auth_user_id = auth.uid()
      and lower(trim(i.status)) in (
        'active',
        'approved',
        '승인',
        '승인 완료',
        '승인완료',
        '활동중'
      )
  )
);

drop policy if exists "Users can read own job applications" on public.job_applications;
drop policy if exists "Allow authenticated interpreter job application read own records" on public.job_applications;
create policy "Users can read own job applications"
on public.job_applications
for select
to authenticated
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.interpreters i
    where i.id = job_applications.interpreter_id
      and i.auth_user_id = auth.uid()
  )
);
