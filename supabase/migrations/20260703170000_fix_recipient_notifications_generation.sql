-- Add recipient_name column if they don't exist
alter table public.notification_events add column if not exists recipient_name text;
alter table public.notifications add column if not exists recipient_name text;

-- 1. Sync Trigger Function Update to mirror recipient_name
create or replace function public.sync_notification_event_to_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_request_id bigint;
  v_recipient_type text;
  v_recipient_name text;
  v_channel text;
  v_status text;
  v_error_message text;
  v_title text;
  v_message text;
begin
  v_payload := coalesce(new.payload, '{}'::jsonb);
  begin
    v_request_id := nullif(coalesce(new.related_request_id::text, v_payload->>'request_id', new.target_id), '')::bigint;
  exception
    when others then
      v_request_id := null;
  end;

  v_recipient_type := public.notification_recipient_type_for_notifications(new.recipient_type);
  v_channel := public.notification_channel_for_target(v_recipient_type, new.channel);
  v_status := public.notification_status_for_target(v_recipient_type, v_channel, new.recipient_email, new.status);
  v_error_message := public.notification_error_for_target(v_recipient_type, v_channel, new.recipient_email, new.error_message);
  v_title := coalesce(new.title, v_payload->>'title', coalesce(new.notification_type, new.event_type), 'ON-LI 알림');
  v_message := coalesce(new.message, v_payload->>'message', v_payload->>'memo', v_payload->>'event_name', '');
  
  -- recipient_name priority: new.recipient_name -> payload->>'recipient_name' -> role default
  v_recipient_name := coalesce(
    new.recipient_name,
    v_payload->>'recipient_name',
    case 
      when v_recipient_type = 'company' then '기업 담당자'
      when v_recipient_type = 'interpreter' then '통역사'
      when v_recipient_type = 'admin' then '관리자'
      else '대상 정보 없음'
    end
  );

  insert into public.notifications (
    id,
    recipient_type,
    recipient_id,
    recipient_name,
    recipient_email,
    recipient_phone,
    notification_type,
    title,
    message,
    related_request_id,
    related_document_id,
    channel,
    status,
    sent_at,
    error_message,
    created_at
  )
  values (
    new.id,
    v_recipient_type,
    new.recipient_id,
    v_recipient_name,
    nullif(trim(coalesce(new.recipient_email, '')), ''),
    new.recipient_phone,
    coalesce(new.notification_type, new.event_type),
    v_title,
    v_message,
    v_request_id,
    new.related_document_id,
    v_channel,
    v_status,
    case when v_status = 'sent' then new.sent_at else null end,
    v_error_message,
    new.created_at
  )
  on conflict (id) do update
  set recipient_type = excluded.recipient_type,
      recipient_id = excluded.recipient_id,
      recipient_name = excluded.recipient_name,
      recipient_email = excluded.recipient_email,
      recipient_phone = excluded.recipient_phone,
      notification_type = excluded.notification_type,
      title = excluded.title,
      message = excluded.message,
      related_request_id = excluded.related_request_id,
      related_document_id = excluded.related_document_id,
      channel = excluded.channel,
      status = excluded.status,
      sent_at = excluded.sent_at,
      error_message = excluded.error_message;

  return new;
exception
  when others then
    raise warning 'sync notification event failed: %', sqlerrm;
    return new;
end;
$$;

-- 2. enqueue_notification_event_v2 Update to include recipient_name
create or replace function public.enqueue_notification_event_v2(
  event_type text,
  target_type text,
  target_id text,
  recipient_type text,
  recipient_email text default null,
  recipient_phone text default null,
  payload jsonb default '{}'::jsonb,
  channel text default 'email',
  title text default null,
  message text default null,
  related_request_id uuid default null,
  related_document_id uuid default null,
  recipient_id uuid default null,
  recipient_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_recipient_type text;
  v_channel text;
  v_status text;
  v_error_message text;
begin
  v_event_id := gen_random_uuid();
  v_recipient_type := public.notification_recipient_type_for_notifications(recipient_type);
  v_channel := public.notification_channel_for_target(v_recipient_type, channel);
  v_status := public.notification_status_for_target(v_recipient_type, v_channel, recipient_email, 'pending');
  v_error_message := public.notification_error_for_target(v_recipient_type, v_channel, recipient_email, null);

  insert into public.notification_events (
    id,
    event_type,
    notification_type,
    target_type,
    target_id,
    recipient_type,
    recipient_id,
    recipient_name,
    recipient_email,
    recipient_phone,
    payload,
    channel,
    title,
    message,
    related_document_id,
    status,
    error_message
  )
  values (
    v_event_id,
    event_type,
    event_type,
    target_type,
    target_id,
    v_recipient_type,
    recipient_id,
    recipient_name,
    nullif(trim(coalesce(recipient_email, '')), ''),
    recipient_phone,
    coalesce(payload, '{}'::jsonb) || jsonb_build_object('recipient_name', recipient_name),
    v_channel,
    title,
    message,
    related_document_id,
    v_status,
    v_error_message
  );

  return v_event_id;
end;
$$;

-- 3. enqueue_notification_event Update
create or replace function public.enqueue_notification_event(
  event_type text,
  target_type text,
  target_id text,
  recipient_type text,
  recipient_email text default null,
  recipient_phone text default null,
  payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_notification_event_v2(
    event_type := event_type,
    target_type := target_type,
    target_id := target_id,
    recipient_type := recipient_type,
    recipient_email := recipient_email,
    recipient_phone := recipient_phone,
    payload := payload,
    channel := 'email'
  );
end;
$$;

-- 4. enqueue_backoffice_notification Update
create or replace function public.enqueue_backoffice_notification(
  p_notification_type text,
  p_recipient_type text,
  p_title text,
  p_message text,
  p_recipient_id uuid default null,
  p_recipient_email text default null,
  p_recipient_phone text default null,
  p_related_request_id text default null,
  p_related_document_id uuid default null,
  p_channel text default null,
  p_recipient_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_recipient_type text;
  v_channel text;
  v_status text;
  v_error_message text;
  v_recipient_name text;
begin
  v_recipient_type := public.notification_recipient_type_for_notifications(p_recipient_type);
  v_channel := public.notification_channel_for_target(v_recipient_type, p_channel);
  v_status := public.notification_status_for_target(v_recipient_type, v_channel, p_recipient_email, 'pending');
  v_error_message := public.notification_error_for_target(v_recipient_type, v_channel, p_recipient_email, null);
  
  v_recipient_name := coalesce(
    p_recipient_name,
    case 
      when v_recipient_type = 'company' then '기업 담당자'
      when v_recipient_type = 'interpreter' then '통역사'
      when v_recipient_type = 'admin' then '관리자'
      else '대상 정보 없음'
    end
  );

  insert into public.notification_events (
    id,
    event_type,
    notification_type,
    target_type,
    target_id,
    recipient_type,
    recipient_id,
    recipient_name,
    recipient_email,
    recipient_phone,
    payload,
    channel,
    title,
    message,
    related_request_id,
    related_document_id,
    status,
    error_message
  )
  values (
    gen_random_uuid(),
    p_notification_type,
    p_notification_type,
    coalesce(
      case when p_related_document_id is not null then 'document' end,
      case when p_related_request_id is not null then 'request' end,
      'operation'
    ),
    coalesce(p_related_document_id::text, p_related_request_id, gen_random_uuid()::text),
    v_recipient_type,
    p_recipient_id,
    v_recipient_name,
    nullif(trim(coalesce(p_recipient_email, '')), ''),
    p_recipient_phone,
    jsonb_build_object(
      'related_request_id', p_related_request_id,
      'related_document_id', p_related_document_id,
      'target_role', v_recipient_type,
      'channel', v_channel,
      'recipient_name', v_recipient_name
    ),
    v_channel,
    p_title,
    p_message,
    null,
    p_related_document_id,
    v_status,
    v_error_message
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- 5. notify_assignment_created Trigger Update
create or replace function public.notify_assignment_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  interpreter_record record;
begin
  select email, phone, name
  into interpreter_record
  from public.interpreters
  where id = new.interpreter_id;

  perform public.enqueue_notification_event_v2(
    'assignment_created',
    'assignment',
    new.id::text,
    'interpreter',
    interpreter_record.email,
    interpreter_record.phone,
    jsonb_build_object(
      'assignment_id', new.id,
      'request_id', new.request_id,
      'interpreter_id', new.interpreter_id,
      'interpreter_name', interpreter_record.name
    ),
    'email',
    '통역 배정 확정',
    '통역 배정이 확정되었습니다.',
    null,
    null,
    new.interpreter_id,
    interpreter_record.name
  );
  return new;
end;
$$;

-- 6. capture_status_change_event Trigger Update (Splitting targets & adding recipient_name)
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
  v_interpreter_id uuid;
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

  -- Log the status change (internal activity)
  perform public.log_admin_status_change(target_type, new.id::text, before_status, after_status);
  
  -- Create default admin internal log notification
  perform public.enqueue_notification_event_v2(
    'status_changed',
    target_type,
    new.id::text,
    'admin',
    null,
    null,
    jsonb_build_object('before', before_status, 'after', after_status),
    'internal',
    '상태 변경 알림',
    '상태가 변경되었습니다.',
    null,
    null,
    null,
    '관리자'
  );

  -- 기업 의뢰 상태 변경 시 이메일 알림 (company 대상)
  if target_type = 'request' then
    v_company_email := coalesce(to_jsonb(new)->>'email', '');
    
    select contact_email, company_name, contact_name 
    into v_company_email, v_company_name, v_contact_name
    from public.businesses
    where auth_user_id = new.company_auth_user_id;

    v_recipient_name := coalesce(v_company_name, v_contact_name, '기업 담당자');

    if nullif(trim(v_company_email), '') is not null then
      perform public.enqueue_notification_event_v2(
        'status_changed',
        'request',
        new.id::text,
        'company',
        v_company_email,
        null,
        jsonb_build_object(
          'before', before_status, 
          'after', after_status,
          'request_id', new.id,
          'request_no', to_jsonb(new)->>'request_no',
          'company_name', v_recipient_name,
          'event_name', to_jsonb(new)->>'event_name'
        ),
        'email',
        '의뢰 상태 변경 안내',
        '의뢰하신 건의 진행 상태가 변경되었습니다.',
        null,
        null,
        null,
        v_recipient_name
      );
    end if;
  end if;

  -- 정산 대기 상태 전환 시 이메일 알림 (interpreter 대상)
  if after_status ? 'settlement_status' 
     and (to_jsonb(new)->>'settlement_status' in ('pending', 'settlement_pending', '정산대기')) then
    
    -- Admin internal notification
    perform public.enqueue_notification_event_v2(
      'settlement_ready',
      target_type,
      new.id::text,
      'admin',
      null,
      null,
      jsonb_build_object('before', before_status, 'after', after_status),
      'internal',
      '정산 대기 알림',
      '정산 대기 건이 발생했습니다.',
      null,
      null,
      null,
      '관리자'
    );

    -- Interpreter email notification
    if target_type = 'request' then
      select id, email, name 
      into v_interpreter_id, v_interpreter_email, v_interpreter_name
      from public.interpreters
      where id = new.assigned_interpreter_id;

      if v_interpreter_id is null then
        select i.id, i.email, i.name 
        into v_interpreter_id, v_interpreter_email, v_interpreter_name
        from public.request_interpreters ri
        join public.interpreters i on i.id = ri.interpreter_id
        where ri.request_id = new.id
        limit 1;
      end if;

      if nullif(trim(v_interpreter_email), '') is not null then
        perform public.enqueue_notification_event_v2(
          'settlement_ready',
          'request',
          new.id::text,
          'interpreter',
          v_interpreter_email,
          null,
          jsonb_build_object(
            'before', before_status,
            'after', after_status,
            'request_id', new.id,
            'request_no', to_jsonb(new)->>'request_no',
            'interpreter_name', v_interpreter_name,
            'event_name', to_jsonb(new)->>'event_name'
          ),
          'email',
          '정산 대기 안내',
          '통역 건의 정산이 대기 상태로 전환되었습니다. 마이페이지에서 정산 서류를 업로드해주세요.',
          null,
          null,
          v_interpreter_id,
          v_interpreter_name
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
