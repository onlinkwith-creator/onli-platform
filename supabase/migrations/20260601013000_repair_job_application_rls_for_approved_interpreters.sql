-- Repair job application RLS for the current admin approval model.
-- Admin approval sets interpreters.status = 'active'. The approved column is a verified-badge flag.

alter table public.interpreters
  enable row level security;

alter table public.job_applications
  enable row level security;

drop policy if exists "Users can read own interpreter profile" on public.interpreters;
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

drop policy if exists "Approved interpreters can insert applications" on public.job_applications;
drop policy if exists "Allow authenticated interpreter job application insert" on public.job_applications;
drop policy if exists "TEMP public insert job applications" on public.job_applications;

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
      and (
        interpreters.approved = true
        or lower(trim(interpreters.status)) in (
          'active',
          'approved',
          '승인',
          '승인 완료',
          '승인완료',
          '활동중'
        )
      )
      and (
        interpreters.auth_user_id = auth.uid()
        or lower(trim(interpreters.email)) = lower(trim(auth.jwt() ->> 'email'))
      )
  )
);

drop policy if exists "Users can read own job applications" on public.job_applications;
create policy "Users can read own job applications"
on public.job_applications
for select
to authenticated
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.interpreters
    where interpreters.id = job_applications.interpreter_id
      and (
        interpreters.auth_user_id = auth.uid()
        or lower(trim(interpreters.email)) = lower(trim(auth.jwt() ->> 'email'))
      )
  )
);
