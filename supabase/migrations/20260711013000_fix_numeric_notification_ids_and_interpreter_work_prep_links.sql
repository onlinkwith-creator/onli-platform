-- Keep numeric business IDs in target_id/payload and pass only auth UUIDs to
-- enqueue_notification_event_v2 UUID parameters.
create or replace function public.capture_status_change_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  before_status jsonb;
  after_status jsonb;
  target_type text;
  v_company_email text;
  v_company_name text;
  v_contact_name text;
  v_recipient_name text;
  v_interpreter_email text;
  v_interpreter_name text;
  v_interpreter_id bigint;
  v_interpreter_auth_user_id uuid;
begin
  before_status = jsonb_strip_nulls(jsonb_build_object(
    'status', to_jsonb(old)->>'status',
    'assignment_status', to_jsonb(old)->>'assignment_status',
    'operation_status', to_jsonb(old)->>'operation_status',
    'settlement_status', to_jsonb(old)->>'settlement_status',
    'payment_status', to_jsonb(old)->>'payment_status',
    'activity_status', to_jsonb(old)->>'activity_status',
    'approved', to_jsonb(old)->>'approved'
  ));
  after_status = jsonb_strip_nulls(jsonb_build_object(
    'status', to_jsonb(new)->>'status',
    'assignment_status', to_jsonb(new)->>'assignment_status',
    'operation_status', to_jsonb(new)->>'operation_status',
    'settlement_status', to_jsonb(new)->>'settlement_status',
    'payment_status', to_jsonb(new)->>'payment_status',
    'activity_status', to_jsonb(new)->>'activity_status',
    'approved', to_jsonb(new)->>'approved'
  ));

  if before_status = after_status then
    return new;
  end if;

  target_type = tg_argv[0];
  perform public.log_admin_status_change(target_type, new.id::text, before_status, after_status);

  perform public.enqueue_notification_event_v2(
    'status_changed', target_type, new.id::text, 'admin', null, null,
    jsonb_build_object('before', before_status, 'after', after_status),
    'internal', '상태 변경 알림', '상태가 변경되었습니다.',
    null::uuid, null::uuid, null::uuid, '관리자'
  );

  if target_type = 'request' then
    v_company_email := coalesce(to_jsonb(new)->>'email', '');

    select contact_email, company_name, contact_name
    into v_company_email, v_company_name, v_contact_name
    from public.businesses
    where auth_user_id = new.company_auth_user_id;

    v_recipient_name := coalesce(v_company_name, v_contact_name, '기업 담당자');

    if nullif(trim(v_company_email), '') is not null then
      perform public.enqueue_notification_event_v2(
        'status_changed', 'request', new.id::text, 'company',
        v_company_email, null,
        jsonb_build_object(
          'before', before_status,
          'after', after_status,
          'request_id', new.id,
          'request_no', to_jsonb(new)->>'request_no',
          'company_name', v_recipient_name,
          'event_name', to_jsonb(new)->>'event_name'
        ),
        'email', '의뢰 상태 변경 안내',
        '의뢰하신 건의 진행 상태가 변경되었습니다.',
        null::uuid, null::uuid, null::uuid, v_recipient_name
      );
    end if;
  end if;

  if after_status ? 'settlement_status'
     and (to_jsonb(new)->>'settlement_status' in ('pending', 'settlement_pending', '정산대기')) then
    perform public.enqueue_notification_event_v2(
      'settlement_ready', target_type, new.id::text, 'admin', null, null,
      jsonb_build_object('before', before_status, 'after', after_status),
      'internal', '정산 대기 알림', '정산 대기 건이 발생했습니다.',
      null::uuid, null::uuid, null::uuid, '관리자'
    );

    if target_type = 'request' then
      select id, auth_user_id, email, name
      into v_interpreter_id, v_interpreter_auth_user_id,
           v_interpreter_email, v_interpreter_name
      from public.interpreters
      where id = new.assigned_interpreter_id;

      if v_interpreter_id is null then
        select i.id, i.auth_user_id, i.email, i.name
        into v_interpreter_id, v_interpreter_auth_user_id,
             v_interpreter_email, v_interpreter_name
        from public.request_interpreters ri
        join public.interpreters i on i.id = ri.interpreter_id
        where ri.request_id = new.id
        limit 1;
      end if;

      if nullif(trim(v_interpreter_email), '') is not null then
        perform public.enqueue_notification_event_v2(
          'settlement_ready', 'request', new.id::text, 'interpreter',
          v_interpreter_email, null,
          jsonb_build_object(
            'before', before_status,
            'after', after_status,
            'request_id', new.id,
            'request_no', to_jsonb(new)->>'request_no',
            'interpreter_id', v_interpreter_id,
            'interpreter_name', v_interpreter_name,
            'event_name', to_jsonb(new)->>'event_name'
          ),
          'email', '정산 대기 안내',
          '통역 건의 정산이 대기 상태로 전환되었습니다. 마이페이지에서 정산 서류를 업로드해주세요.',
          null::uuid, null::uuid, v_interpreter_auth_user_id, v_interpreter_name
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- An interpreter may read the operational data linked to their own numeric
-- assignment. This preserves the existing auth UUID -> interpreter bigint ->
-- request bigint relationship without casting numeric IDs to UUID.
drop policy if exists "Assigned interpreters can read linked requests" on public.requests;
create policy "Assigned interpreters can read linked requests"
on public.requests
for select
to authenticated
using (
  exists (
    select 1
    from public.request_interpreters ri
    join public.interpreters i on i.id = ri.interpreter_id
    where ri.request_id = requests.id
      and i.auth_user_id = auth.uid()
  )
);

drop policy if exists "Assigned interpreters can read linked businesses" on public.businesses;
create policy "Assigned interpreters can read linked businesses"
on public.businesses
for select
to authenticated
using (
  exists (
    select 1
    from public.requests r
    join public.request_interpreters ri on ri.request_id = r.id
    join public.interpreters i on i.id = ri.interpreter_id
    where r.company_auth_user_id = businesses.auth_user_id
      and i.auth_user_id = auth.uid()
  )
);

drop policy if exists "Assigned interpreters can read linked documents" on public.documents;
create policy "Assigned interpreters can read linked documents"
on public.documents
for select
to authenticated
using (
  exists (
    select 1
    from public.request_interpreters ri
    join public.interpreters i on i.id = ri.interpreter_id
    where ri.request_id = documents.request_id
      and i.auth_user_id = auth.uid()
  )
);

drop policy if exists "Assigned interpreters can read linked materials" on public.request_materials;
create policy "Assigned interpreters can read linked materials"
on public.request_materials
for select
to authenticated
using (
  exists (
    select 1
    from public.request_interpreters ri
    join public.interpreters i on i.id = ri.interpreter_id
    where ri.request_id = request_materials.request_id
      and i.auth_user_id = auth.uid()
  )
);

notify pgrst, 'reload schema';
