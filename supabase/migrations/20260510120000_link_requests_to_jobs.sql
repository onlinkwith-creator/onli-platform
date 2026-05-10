alter table public.jobs
add column if not exists event_name text;

alter table public.jobs
add column if not exists event_date text;

alter table public.jobs
add column if not exists event_location text;

alter table public.jobs
add column if not exists requested_level text;

alter table public.jobs
add column if not exists preferred_gender text;

alter table public.jobs
add column if not exists people_count integer;

alter table public.jobs
add column if not exists field text;

alter table public.jobs
add column if not exists deadline date;

alter table public.jobs
add column if not exists visibility text not null default 'public';

alter table public.requests
add column if not exists is_job_public boolean not null default false;

alter table public.requests
add column if not exists job_id uuid references public.jobs(id) on delete set null;

alter table public.requests
add column if not exists requested_level text;

alter table public.requests
add column if not exists requested_people_count integer;

alter table public.requests
add column if not exists preferred_gender text;

alter table public.requests
add column if not exists interpretation_field text;

update public.jobs
set visibility = case
  when status in ('hidden', '숨김') then 'private'
  when visibility in ('private', '비공개') then 'private'
  else 'public'
end;

update public.jobs
set status = case
  when status in ('모집중', 'open') then 'open'
  when status in ('마감임박', 'closing_soon') then 'closing_soon'
  when status in ('마감', '모집마감', 'closed') then 'closed'
  when status in ('배정완료', 'assigned') then 'assigned'
  when status in ('hidden', '숨김') then 'open'
  when coalesce(is_urgent, false) then 'closing_soon'
  else 'open'
end;

update public.requests
set is_job_public = coalesce(is_job_public, is_public, false);

drop policy if exists "Allow public read public jobs" on public.jobs;
create policy "Allow public read public jobs"
on public.jobs
for select
to anon
using (visibility = 'public');
