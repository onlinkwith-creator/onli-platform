begin;

create or replace function public.portal_can_read_file(file_bucket text,file_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (
    public.is_active_admin()
    or exists (
      select 1 from public.requests r
      where file_bucket in ('request-files','request-reference-files')
        and file_path in (r.reference_file_path,r.reference_file_url)
        and (public.portal_owns_request(r.id) or public.portal_assigned(r.id))
    )
    or exists (
      select 1 from public.request_materials rm
      where file_bucket in ('request-files','reference_files') and rm.file_path=$2
        and (public.portal_owns_request(rm.request_id) or public.portal_assigned(rm.request_id))
    )
  );
$$;

create or replace function public.portal_can_insert_file(file_bucket text,file_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (
    public.is_active_admin()
    or (file_bucket='request-files'
      and left(file_path,length(auth.uid()::text||'/requests/reference_files/'))
        =auth.uid()::text||'/requests/reference_files/'
      and exists(select 1 from public.businesses b
        where b.auth_user_id=auth.uid() and b.status='승인 완료'))
    or (file_bucket='reference_files' and exists(
      select 1 from public.requests r
      where r.storage_folder_id is not null
        and left(file_path,length('requests/materials/'||r.storage_folder_id||'/'))
          ='requests/materials/'||r.storage_folder_id||'/'
        and public.portal_owns_request(r.id)))
  );
$$;

create or replace function public.portal_can_modify_file(file_bucket text,file_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (public.is_active_admin() or exists(
    select 1 from public.requests r
    where file_bucket in ('request-files','request-reference-files')
      and file_path in (r.reference_file_path,r.reference_file_url)
      and public.portal_owns_request(r.id)
  ) or exists(
    select 1 from public.request_materials rm
    where file_bucket in ('request-files','reference_files') and rm.file_path=$2
      and public.portal_owns_request(rm.request_id)
  ));
$$;

-- The old permissive policies directly join requests, which becomes admin-only.
-- These replacement grants keep legitimate portal file access available.
drop policy if exists portal_files_read on storage.objects;
create policy portal_files_read on storage.objects for select to authenticated
  using(bucket_id in ('request-files','request-reference-files','reference_files')
    and public.portal_can_read_file(bucket_id,name));
drop policy if exists portal_files_read_boundary on storage.objects;
create policy portal_files_read_boundary on storage.objects as restrictive for select to authenticated
  using(bucket_id not in ('request-files','request-reference-files','reference_files')
    or public.portal_can_read_file(bucket_id,name));

drop policy if exists portal_files_insert on storage.objects;
create policy portal_files_insert on storage.objects for insert to authenticated
  with check(bucket_id in ('request-files','request-reference-files','reference_files')
    and public.portal_can_insert_file(bucket_id,name));
drop policy if exists portal_files_insert_boundary on storage.objects;
create policy portal_files_insert_boundary on storage.objects as restrictive for insert to authenticated
  with check(bucket_id not in ('request-files','request-reference-files','reference_files')
    or public.portal_can_insert_file(bucket_id,name));

drop policy if exists portal_files_update on storage.objects;
create policy portal_files_update on storage.objects for update to authenticated
  using(bucket_id in ('request-files','request-reference-files','reference_files')
    and public.portal_can_modify_file(bucket_id,name))
  with check(bucket_id in ('request-files','request-reference-files','reference_files')
    and public.portal_can_modify_file(bucket_id,name));
drop policy if exists portal_files_update_boundary on storage.objects;
create policy portal_files_update_boundary on storage.objects as restrictive for update to authenticated
  using(bucket_id not in ('request-files','request-reference-files','reference_files')
    or public.portal_can_modify_file(bucket_id,name))
  with check(bucket_id not in ('request-files','request-reference-files','reference_files')
    or public.portal_can_modify_file(bucket_id,name));

drop policy if exists portal_files_delete on storage.objects;
create policy portal_files_delete on storage.objects for delete to authenticated
  using(bucket_id in ('request-files','request-reference-files','reference_files')
    and public.portal_can_modify_file(bucket_id,name));
drop policy if exists portal_files_delete_boundary on storage.objects;
create policy portal_files_delete_boundary on storage.objects as restrictive for delete to authenticated
  using(bucket_id not in ('request-files','request-reference-files','reference_files')
    or public.portal_can_modify_file(bucket_id,name));

revoke all on function public.portal_can_read_file(text,text) from public,anon;
revoke all on function public.portal_can_insert_file(text,text) from public,anon;
revoke all on function public.portal_can_modify_file(text,text) from public,anon;
grant execute on function public.portal_can_read_file(text,text),
  public.portal_can_insert_file(text,text),public.portal_can_modify_file(text,text) to authenticated;

commit;
