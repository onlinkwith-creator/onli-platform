begin;

-- Only separately reviewed, permanently redacted PDFs belong in this bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('company-resumes','company-resumes',false,10485760,array['application/pdf'])
on conflict(id) do nothing;

create table if not exists public.company_reviewed_resumes (
  interpreter_id bigint primary key references public.interpreters(id) on delete cascade,
  file_path text not null unique check(file_path ~ '^[0-9]+/[0-9a-f-]+\.pdf$'),
  source_resume_file_url text not null,
  source_resume_uploaded_at timestamptz,
  reviewed_by uuid not null default auth.uid(),
  reviewed_at timestamptz not null default now()
);
alter table public.company_reviewed_resumes enable row level security;
revoke all on public.company_reviewed_resumes from anon,authenticated;
grant select,insert,update,delete on public.company_reviewed_resumes to authenticated;
create policy company_reviewed_resumes_admin on public.company_reviewed_resumes
for all to authenticated using(public.is_active_admin()) with check(public.is_active_admin());

create or replace function public.company_can_read_reviewed_resume(p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (public.is_active_admin() or exists(
    select 1 from public.company_reviewed_resumes cr
    join public.interpreters i on i.id=cr.interpreter_id
    join public.public_interpreters pi on pi.id=i.id
    join public.job_applications a on a.interpreter_id=i.id
    join public.requests r on r.job_id=a.job_id
    where cr.file_path=p_path and public.portal_owns_request(r.id)
      and nullif(i.resume_file_url,'')=cr.source_resume_file_url
      and i.resume_uploaded_at is not distinct from cr.source_resume_uploaded_at
  ));
$$;
revoke all on function public.company_can_read_reviewed_resume(text) from public,anon;
grant execute on function public.company_can_read_reviewed_resume(text) to authenticated;

create or replace function public.get_company_applicant_resume(p_application_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('file_path',cr.file_path)
  from public.job_applications a
  join public.requests r on r.job_id=a.job_id
  join public.interpreters i on i.id=a.interpreter_id
  join public.public_interpreters pi on pi.id=i.id
  join public.company_reviewed_resumes cr on cr.interpreter_id=i.id
  where a.id=p_application_id and public.portal_owns_request(r.id)
    and nullif(i.resume_file_url,'')=cr.source_resume_file_url
    and i.resume_uploaded_at is not distinct from cr.source_resume_uploaded_at;
$$;
revoke all on function public.get_company_applicant_resume(uuid) from public,anon;
grant execute on function public.get_company_applicant_resume(uuid) to authenticated;

create policy company_resumes_read on storage.objects for select to authenticated
using(bucket_id='company-resumes' and public.company_can_read_reviewed_resume(name));
create policy company_resumes_read_boundary on storage.objects as restrictive for select to authenticated
using(bucket_id<>'company-resumes' or public.company_can_read_reviewed_resume(name));
create policy company_resumes_write on storage.objects for all to authenticated
using(bucket_id='company-resumes' and public.is_active_admin())
with check(bucket_id='company-resumes' and public.is_active_admin());
create policy company_resumes_insert_boundary on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'company-resumes' or public.is_active_admin());
create policy company_resumes_update_boundary on storage.objects as restrictive for update to authenticated
using(bucket_id<>'company-resumes' or public.is_active_admin())
with check(bucket_id<>'company-resumes' or public.is_active_admin());
create policy company_resumes_delete_boundary on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'company-resumes' or public.is_active_admin());

commit;
notify pgrst,'reload schema';
