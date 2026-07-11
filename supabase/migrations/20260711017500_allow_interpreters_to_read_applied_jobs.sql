-- Let an authenticated interpreter read only jobs referenced by their own
-- job_applications, including closed jobs shown in application history.
create or replace function public.current_user_has_job_application(
  target_job_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.job_applications ja
    join public.interpreters i on i.id = ja.interpreter_id
    where ja.job_id = target_job_id
      and i.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.current_user_has_job_application(uuid) from public;
grant execute on function public.current_user_has_job_application(uuid) to authenticated;

drop policy if exists "Interpreters can read applied jobs" on public.jobs;
create policy "Interpreters can read applied jobs"
on public.jobs
for select
to authenticated
using (public.current_user_has_job_application(id));

notify pgrst, 'reload schema';
