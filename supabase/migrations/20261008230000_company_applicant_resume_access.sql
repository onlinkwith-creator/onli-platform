begin;

update storage.buckets set public=false where id='resume-files';

-- Access follows an application to the approved company's own request.
create or replace function public.company_can_read_applicant_resume(p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and nullif(p_path,'') is not null and exists (
    select 1 from public.interpreters i
    join public.public_interpreters pi on pi.id=i.id
    join public.job_applications a on a.interpreter_id=i.id
    join public.requests r on r.job_id=a.job_id
    join storage.objects o on o.bucket_id='resume-files' and o.name=i.resume_file_url
    where i.resume_file_url=p_path and public.portal_owns_request(r.id)
  );
$$;
revoke all on function public.company_can_read_applicant_resume(text) from public,anon;
grant execute on function public.company_can_read_applicant_resume(text) to authenticated;

create or replace function public.get_company_applicant_resume(p_application_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('bucket','resume-files','file_path',i.resume_file_url)
  from public.job_applications a
  join public.requests r on r.job_id=a.job_id
  join public.interpreters i on i.id=a.interpreter_id
  where a.id=p_application_id and public.portal_owns_request(r.id)
    and public.company_can_read_applicant_resume(i.resume_file_url);
$$;
revoke all on function public.get_company_applicant_resume(uuid) from public,anon;
grant execute on function public.get_company_applicant_resume(uuid) to authenticated;

-- Preserve compatibility with older policies, not with separate resume copies.
create or replace function public.company_can_read_published_resume(p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.company_can_read_applicant_resume(p_path);
$$;
revoke all on function public.company_can_read_published_resume(text) from public,anon;
grant execute on function public.company_can_read_published_resume(text) to authenticated;
create or replace function public.company_can_read_reviewed_resume(p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.is_active_admin();
$$;

drop policy if exists company_applicant_resume_read on storage.objects;
create policy company_applicant_resume_read on storage.objects for select to authenticated
using(bucket_id='resume-files' and public.company_can_read_applicant_resume(name));
drop policy if exists original_resume_read_boundary on storage.objects;
create policy original_resume_read_boundary on storage.objects as restrictive for select to authenticated
using(bucket_id<>'resume-files' or public.is_active_admin()
  or name like (auth.uid()::text || '/%')
  or name like ('interpreter-documents/' || auth.uid()::text || '/%')
  or public.company_can_read_applicant_resume(name));

commit;
notify pgrst,'reload schema';
