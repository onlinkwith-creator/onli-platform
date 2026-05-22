drop policy if exists "TEMP authenticated read jobs" on public.jobs;
create policy "TEMP authenticated read jobs"
on public.jobs
for select
to authenticated
using (true);

drop policy if exists "TEMP authenticated read job applications" on public.job_applications;
create policy "TEMP authenticated read job applications"
on public.job_applications
for select
to authenticated
using (true);

drop policy if exists "TEMP authenticated read interpreters" on public.interpreters;
create policy "TEMP authenticated read interpreters"
on public.interpreters
for select
to authenticated
using (true);

drop policy if exists "TEMP authenticated read request interpreters" on public.request_interpreters;
create policy "TEMP authenticated read request interpreters"
on public.request_interpreters
for select
to authenticated
using (true);
