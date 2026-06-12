alter table public.job_applications
  enable row level security;

drop policy if exists "TEMP admin delete job applications"
  on public.job_applications;
drop policy if exists "TEMP authenticated admin delete job applications"
  on public.job_applications;
drop policy if exists "Active admins can delete job applications"
  on public.job_applications;
drop policy if exists "Interpreters can withdraw own job applications"
  on public.job_applications;

create policy "Active admins can delete job applications"
on public.job_applications
for delete
to authenticated
using (
  public.is_active_admin()
);

create policy "Interpreters can withdraw own job applications"
on public.job_applications
for delete
to authenticated
using (
  auth.uid() is not null
  and status in ('pending', 'reviewing', '지원완료', '검토중', '보류')
  and exists (
    select 1
    from public.interpreters i
    where i.id = job_applications.interpreter_id
      and i.auth_user_id = auth.uid()
  )
);

notify pgrst, 'reload schema';
