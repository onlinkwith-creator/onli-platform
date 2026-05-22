-- Allow authenticated users to perform all admin operations on the database
-- This ensures that logged-in users (role: authenticated) do not experience RLS permission issues on the Admin page.

-- 1. requests
drop policy if exists "TEMP authenticated admin read requests" on public.requests;
create policy "TEMP authenticated admin read requests"
on public.requests
for select
to authenticated
using (true);

drop policy if exists "TEMP authenticated admin update requests" on public.requests;
create policy "TEMP authenticated admin update requests"
on public.requests
for update
to authenticated
using (true)
with check (true);

drop policy if exists "TEMP authenticated admin delete requests" on public.requests;
create policy "TEMP authenticated admin delete requests"
on public.requests
for delete
to authenticated
using (true);


-- 2. interpreters
drop policy if exists "TEMP authenticated admin update interpreter approval" on public.interpreters;
create policy "TEMP authenticated admin update interpreter approval"
on public.interpreters
for update
to authenticated
using (true)
with check (true);

drop policy if exists "TEMP authenticated admin delete interpreters" on public.interpreters;
create policy "TEMP authenticated admin delete interpreters"
on public.interpreters
for delete
to authenticated
using (true);


-- 3. request_interpreters
drop policy if exists "TEMP authenticated admin insert request interpreters" on public.request_interpreters;
create policy "TEMP authenticated admin insert request interpreters"
on public.request_interpreters
for insert
to authenticated
with check (true);

drop policy if exists "TEMP authenticated admin delete request interpreters" on public.request_interpreters;
create policy "TEMP authenticated admin delete request interpreters"
on public.request_interpreters
for delete
to authenticated
using (true);


-- 4. matchings
drop policy if exists "TEMP authenticated admin read matchings" on public.matchings;
create policy "TEMP authenticated admin read matchings"
on public.matchings
for select
to authenticated
using (true);

drop policy if exists "TEMP authenticated admin insert matchings" on public.matchings;
create policy "TEMP authenticated admin insert matchings"
on public.matchings
for insert
to authenticated
with check (true);

drop policy if exists "TEMP authenticated admin update matchings" on public.matchings;
create policy "TEMP authenticated admin update matchings"
on public.matchings
for update
to authenticated
using (true)
with check (true);


-- 5. job_applications
drop policy if exists "TEMP authenticated admin update job applications" on public.job_applications;
create policy "TEMP authenticated admin update job applications"
on public.job_applications
for update
to authenticated
using (true)
with check (true);

drop policy if exists "TEMP authenticated admin delete job applications" on public.job_applications;
create policy "TEMP authenticated admin delete job applications"
on public.job_applications
for delete
to authenticated
using (true);


-- 6. jobs
drop policy if exists "TEMP authenticated admin insert jobs" on public.jobs;
create policy "TEMP authenticated admin insert jobs"
on public.jobs
for insert
to authenticated
with check (true);

drop policy if exists "TEMP authenticated admin update jobs" on public.jobs;
create policy "TEMP authenticated admin update jobs"
on public.jobs
for update
to authenticated
using (true)
with check (true);

drop policy if exists "TEMP authenticated admin delete jobs" on public.jobs;
create policy "TEMP authenticated admin delete jobs"
on public.jobs
for delete
to authenticated
using (true);


-- 7. request_applications
drop policy if exists "TEMP authenticated admin read request_applications" on public.request_applications;
create policy "TEMP authenticated admin read request_applications"
on public.request_applications
for select
to authenticated
using (true);

drop policy if exists "TEMP authenticated admin update request_applications" on public.request_applications;
create policy "TEMP authenticated admin update request_applications"
on public.request_applications
for update
to authenticated
using (true)
with check (true);

drop policy if exists "TEMP authenticated admin delete request_applications" on public.request_applications;
create policy "TEMP authenticated admin delete request_applications"
on public.request_applications
for delete
to authenticated
using (true);


-- 8. applications
drop policy if exists "TEMP authenticated admin read applications" on public.applications;
create policy "TEMP authenticated admin read applications"
on public.applications
for select
to authenticated
using (true);

drop policy if exists "TEMP authenticated admin insert applications" on public.applications;
create policy "TEMP authenticated admin insert applications"
on public.applications
for insert
to authenticated
with check (true);

drop policy if exists "TEMP authenticated admin update applications" on public.applications;
create policy "TEMP authenticated admin update applications"
on public.applications
for update
to authenticated
using (true)
with check (true);

drop policy if exists "TEMP authenticated admin delete applications" on public.applications;
create policy "TEMP authenticated admin delete applications"
on public.applications
for delete
to authenticated
using (true);


-- 9. admin_logs
drop policy if exists "TEMP authenticated admin insert admin logs" on public.admin_logs;
create policy "TEMP authenticated admin insert admin logs"
on public.admin_logs
for insert
to authenticated
with check (true);
