begin;

-- Companies see only applications to their own requests and published profiles.
create or replace function public.get_company_portal_applicants(p_request_id bigint)
returns setof jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'id',a.id,'request_id',r.id,'status',a.status,
    'application_no',to_jsonb(a)->'application_no',
    'created_at',to_jsonb(a)->'created_at',
    'profile',case when i.id is null then null else
      public.portal_pick(to_jsonb(i),array[
        'id','name','level','short_intro','specialties','region',
        'available_regions','custom_regions','experience_count','verified'
      ]) end)
  from public.requests r
  join public.job_applications a on a.job_id=r.job_id
  left join public.public_interpreters i on i.id=a.interpreter_id
  where r.id=p_request_id and public.portal_owns_request(r.id)
  order by a.created_at desc,a.id;
$$;
revoke all on function public.get_company_portal_applicants(bigint) from public,anon;
grant execute on function public.get_company_portal_applicants(bigint) to authenticated;

commit;
notify pgrst,'reload schema';
