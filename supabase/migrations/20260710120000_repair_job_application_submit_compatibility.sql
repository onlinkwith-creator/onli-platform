-- Keep job application submission compatible with both normalized and legacy
-- production data while preserving authenticated interpreter ownership checks.

alter table public.job_applications
  enable row level security;

alter table public.job_applications
  drop constraint if exists job_applications_status_check;

alter table public.job_applications
  add constraint job_applications_status_check
  check (status in ('pending', '지원완료', 'reviewing', 'accepted', 'rejected', 'cancelled'));

drop policy if exists "Interpreters can insert own job applications" on public.job_applications;
drop policy if exists "Approved interpreters can insert applications" on public.job_applications;
drop policy if exists "Allow authenticated interpreter job application insert" on public.job_applications;

create policy "Interpreters can insert own job applications"
on public.job_applications
for insert
to authenticated
with check (
  auth.uid() is not null
  and job_id is not null
  and interpreter_id is not null
  and coalesce(status, 'pending') in ('pending', '지원완료')
  and exists (
    select 1
    from public.interpreters i
    where i.id = job_applications.interpreter_id
      and (
        i.auth_user_id = auth.uid()
        or lower(trim(coalesce(i.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
      and (
        coalesce(i.approved, false) = true
        or lower(trim(coalesce(i.status, ''))) in (
          'active',
          'approved',
          'verified',
          '승인',
          '승인 완료',
          '승인완료',
          '활동중'
        )
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
      and (
        i.auth_user_id = auth.uid()
        or lower(trim(coalesce(i.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
  )
);

drop policy if exists "Interpreters can withdraw own job applications" on public.job_applications;

create policy "Interpreters can withdraw own job applications"
on public.job_applications
for delete
to authenticated
using (
  status in ('pending', '지원완료')
  and exists (
    select 1
    from public.interpreters i
    where i.id = job_applications.interpreter_id
      and (
        i.auth_user_id = auth.uid()
        or lower(trim(coalesce(i.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
  )
);

notify pgrst, 'reload schema';
