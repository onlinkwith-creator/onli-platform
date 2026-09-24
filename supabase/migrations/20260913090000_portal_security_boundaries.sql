begin;

-- An allowlist is deliberate: newly added columns must not become portal data.
create or replace function public.portal_pick(row_data jsonb, allowed text[])
returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
  from jsonb_each(row_data) where key=any(allowed);
$$;

create or replace function public.portal_owns_request(request_key bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.requests r join public.businesses b on b.auth_user_id=auth.uid()
    where r.id=request_key and b.status='승인 완료'
      and (r.company_auth_user_id=auth.uid() or r.company_id=b.id)
  );
$$;

create or replace function public.portal_owns_interpreter(interpreter_key bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.interpreters where id=interpreter_key and auth_user_id=auth.uid()
  );
$$;

create or replace function public.portal_assigned(request_key bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.request_interpreters ri
    join public.interpreters i on i.id=ri.interpreter_id
    where ri.request_id=request_key and ri.status='assigned' and i.auth_user_id=auth.uid()
  );
$$;

create or replace function public.get_portal_requests(p_request_ids bigint[] default null)
returns setof jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select public.portal_pick(to_jsonb(r), array[
    'id','request_no','request_code','request_type','company_name','event_name','title',
    'event_date','start_date','end_date','event_start_time','event_end_time','event_location',
    'location','language','language_direction','interpretation_field','work_hours',
    'requested_level','required_level','requested_people_count','required_count',
    'preferred_gender','urgency','request_details','request_detail','job_description',
    'job_field','materials_available','reference_file_name','reference_file_path',
    'reference_file_url','storage_folder_id','interpreter_id','interpreter_name',
    'status','matching_status','assignment_status',
    'operation_status','estimate_status','job_id','created_at','updated_at'
  ]) || case when public.portal_owns_request(r.id) then
    public.portal_pick(to_jsonb(r),array['company_id','company_auth_user_id','company_amount',
      'payment_status','contact_name','manager_name','email','phone','contact_email_or_phone',
      'selected_interpreter_id','selected_interpreter_name'])
  else public.portal_pick(to_jsonb(r),array['settlement_status','settlement_completed_at']) end
  || jsonb_build_object('business_profile',public.portal_pick(to_jsonb(b),
    array['company_name','contact_name','contact_phone','contact_email']))
  from public.requests r
  left join public.businesses b on b.auth_user_id=r.company_auth_user_id
  where auth.uid() is not null and (p_request_ids is null or r.id=any(p_request_ids))
    and (public.portal_owns_request(r.id) or public.portal_assigned(r.id))
  order by r.created_at desc;
$$;

-- Return an assignment's public profile even if it was removed from the listing.
create or replace function public.get_company_portal_assignments(p_request_ids bigint[] default null)
returns setof jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',ri.id,'request_id',ri.request_id,'interpreter_id',ri.interpreter_id,
    'contact_visible',coalesce(ri.contact_visible,false),
    'interpreter',public.portal_pick(to_jsonb(i),array['id','name','level','specialties','experience_count'])
      || case when ri.contact_visible then public.portal_pick(to_jsonb(i),array['phone','email','kakao_or_line'])
         else '{}'::jsonb end)
  from public.request_interpreters ri join public.interpreters i on i.id=ri.interpreter_id
  where ri.status='assigned' and public.portal_owns_request(ri.request_id)
    and (p_request_ids is null or ri.request_id=any(p_request_ids));
$$;

create or replace function public.portal_can_read_document(document_key uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.is_active_admin() or exists (
    select 1 from public.documents d where d.id=document_key and d.status='issued'
      and ((d.document_type in ('estimate','completion','settlement_statement')
              and public.portal_owns_request(d.request_id))
        or (d.document_type in ('payout','payout_statement')
              and public.portal_assigned(d.request_id)
              and exists(select 1 from public.interpreters i
                where i.id=d.interpreter_id and i.auth_user_id=auth.uid())))
  );
$$;

-- Restrictive policies constrain all legacy permissive policies as well.
drop policy if exists portal_requests_private on public.requests;
create policy portal_requests_private on public.requests as restrictive
  for select to anon,authenticated using(public.is_active_admin());
drop policy if exists portal_requests_write on public.requests;
create policy portal_requests_write on public.requests as restrictive
  for update to authenticated using(public.is_active_admin()) with check(public.is_active_admin());
drop policy if exists portal_requests_insert on public.requests;
create policy portal_requests_insert on public.requests as restrictive
  for insert to anon,authenticated with check(public.is_active_admin());
drop policy if exists portal_requests_delete on public.requests;
create policy portal_requests_delete on public.requests as restrictive
  for delete to anon,authenticated using(public.is_active_admin());

drop policy if exists portal_interpreters_private on public.interpreters;
create policy portal_interpreters_private on public.interpreters as restrictive
  for select to anon,authenticated using(public.is_active_admin() or auth_user_id=auth.uid());
drop policy if exists portal_businesses_private on public.businesses;
create policy portal_businesses_private on public.businesses as restrictive
  for select to anon,authenticated using(public.is_active_admin() or auth_user_id=auth.uid());

drop policy if exists portal_documents_private on public.documents;
create policy portal_documents_private on public.documents as restrictive
  for select to anon,authenticated using(public.portal_can_read_document(id));
drop policy if exists portal_documents_read on public.documents;
create policy portal_documents_read on public.documents for select to authenticated
  using(public.portal_can_read_document(id));

drop policy if exists portal_assignments_read on public.request_interpreters;
create policy portal_assignments_read on public.request_interpreters for select to authenticated
  using(status='assigned' and public.portal_owns_interpreter(interpreter_id));
drop policy if exists portal_assignments_private on public.request_interpreters;
create policy portal_assignments_private on public.request_interpreters as restrictive for select to anon,authenticated
  using(public.is_active_admin() or (status='assigned' and public.portal_owns_interpreter(interpreter_id)));
drop policy if exists portal_materials_read on public.request_materials;
create policy portal_materials_read on public.request_materials for select to authenticated
  using(public.portal_owns_request(request_id) or public.portal_assigned(request_id));
drop policy if exists portal_materials_private on public.request_materials;
create policy portal_materials_private on public.request_materials as restrictive for select to anon,authenticated
  using(public.is_active_admin() or public.portal_owns_request(request_id) or public.portal_assigned(request_id));
drop policy if exists portal_materials_write on public.request_materials;
create policy portal_materials_write on public.request_materials for all to authenticated
  using(public.portal_owns_request(request_id))
  with check(public.portal_owns_request(request_id) and uploaded_by=auth.uid());
drop policy if exists portal_materials_insert on public.request_materials;
create policy portal_materials_insert on public.request_materials as restrictive for insert to anon,authenticated
  with check(public.is_active_admin() or (public.portal_owns_request(request_id) and uploaded_by=auth.uid()));
drop policy if exists portal_materials_update on public.request_materials;
create policy portal_materials_update on public.request_materials as restrictive for update to anon,authenticated
  using(public.is_active_admin() or (public.portal_owns_request(request_id) and uploaded_by=auth.uid()))
  with check(public.is_active_admin() or (public.portal_owns_request(request_id) and uploaded_by=auth.uid()));
drop policy if exists portal_materials_delete on public.request_materials;
create policy portal_materials_delete on public.request_materials as restrictive for delete to anon,authenticated
  using(public.is_active_admin() or (public.portal_owns_request(request_id) and uploaded_by=auth.uid()));
drop policy if exists portal_payments_read on public.payments;
create policy portal_payments_read on public.payments for select to authenticated
  using(public.portal_owns_request(request_id));
drop policy if exists portal_payments_private on public.payments;
create policy portal_payments_private on public.payments as restrictive for select to anon,authenticated
  using(public.is_active_admin() or public.portal_owns_request(request_id));

-- Client data never chooses operational state or money values on submission.
create or replace function public.submit_company_request(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare safe jsonb; cols text; vals text; result_id bigint; business public.businesses;
  selected_interpreter public.interpreters;
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception using errcode='42501',message='이메일 인증 후 로그인해주세요.';
  end if;
  select * into business from public.businesses where auth_user_id=auth.uid() and status='승인 완료';
  if not found then raise exception using errcode='42501',message='승인된 기업 계정이 필요합니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('request:'||auth.uid()::text,0));
  if (select count(*) from public.requests where company_auth_user_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then
    raise exception using errcode='P0001',message='접수 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.';
  end if;
  safe:=public.portal_pick(p_payload,array['event_name','event_date','start_date','end_date',
    'event_start_time','event_end_time','event_location','language_direction','work_hours',
    'requested_level','requested_people_count','preferred_gender','interpretation_field','urgency',
    'request_details','request_detail','reference_file_name','reference_file_path','reference_file_url',
    'materials_available','request_type','job_description','job_field','required_level','required_count',
    'agreed_terms','agreed_policy']);
  if coalesce((safe->>'agreed_terms')::boolean,false) is not true or coalesce((safe->>'agreed_policy')::boolean,false) is not true then
    raise exception using errcode='22023',message='약관 동의가 필요합니다.';
  end if;
  if nullif(safe->>'event_name','') is null or nullif(safe->>'start_date','') is null
    or nullif(safe->>'end_date','') is null or (safe->>'end_date')::date<(safe->>'start_date')::date then
    raise exception using errcode='22023',message='행사명과 일정을 확인해주세요.';
  end if;
  if coalesce((safe->>'requested_people_count')::integer,0) not between 1 and 100 then
    raise exception using errcode='22023',message='인원은 1명 이상 100명 이하로 입력해주세요.';
  end if;
  if nullif(safe->>'reference_file_path','') is not null and
    (left(safe->>'reference_file_path',length(auth.uid()::text||'/requests/reference_files/'))
      <> auth.uid()::text||'/requests/reference_files/'
      or safe->>'reference_file_url' is distinct from safe->>'reference_file_path') then
    raise exception using errcode='22023',message='참고자료 경로가 올바르지 않습니다.';
  end if;
  safe:=safe||jsonb_build_object('request_type',coalesce(safe->>'request_type','general'));
  if safe->>'request_type' not in ('general','urgent','designated') then
    raise exception using errcode='22023',message='의뢰 유형이 올바르지 않습니다.';
  end if;
  if safe->>'request_type'='designated' then
    if nullif(p_payload->>'interpreter_id','') is null then
      raise exception using errcode='22023',message='지정 통역사를 선택해주세요.';
    end if;
    select * into selected_interpreter from public.interpreters
      where id=(p_payload->>'interpreter_id')::bigint
        and approved is true and is_public is true and withdrawn_at is null;
    if not found then
      raise exception using errcode='22023',message='선택한 통역사를 의뢰할 수 없습니다.';
    end if;
    safe:=safe||jsonb_build_object('interpreter_id',selected_interpreter.id,
      'interpreter_name',selected_interpreter.name);
  end if;
  safe:=safe||jsonb_build_object('company_auth_user_id',auth.uid(),'company_id',business.id,
    'company_name',business.company_name,'contact_name',business.contact_name,'manager_name',business.contact_name,
    'email',business.contact_email,'phone',business.contact_phone,
    'contact_email_or_phone',business.contact_phone||' / '||business.contact_email,'agreed_at',now());
  select string_agg(format('%I',key),','),string_agg(format('v.%I',key),',') into cols,vals
    from jsonb_object_keys(safe) key join information_schema.columns c
    on c.table_schema='public' and c.table_name='requests' and c.column_name=key;
  execute format('insert into public.requests (%s) select %s from jsonb_populate_record(null::public.requests,$1) v returning id',cols,vals)
    into result_id using safe;
  return jsonb_build_object('id',result_id);
end;
$$;

revoke all on function public.portal_pick(jsonb,text[]) from public,anon;
revoke all on function public.portal_owns_request(bigint) from public,anon;
revoke all on function public.portal_assigned(bigint) from public,anon;
revoke all on function public.portal_owns_interpreter(bigint) from public,anon;
revoke all on function public.get_portal_requests(bigint[]) from public,anon;
revoke all on function public.get_company_portal_assignments(bigint[]) from public,anon;
revoke all on function public.portal_can_read_document(uuid) from public;
revoke all on function public.submit_company_request(jsonb) from public,anon;
grant execute on function public.portal_owns_request(bigint),public.portal_assigned(bigint),
  public.portal_owns_interpreter(bigint),
  public.get_portal_requests(bigint[]),public.get_company_portal_assignments(bigint[]),
  public.portal_can_read_document(uuid),public.submit_company_request(jsonb) to authenticated;
grant execute on function public.portal_can_read_document(uuid) to anon;

commit;
notify pgrst,'reload schema';
