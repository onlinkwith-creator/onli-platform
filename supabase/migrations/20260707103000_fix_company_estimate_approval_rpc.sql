-- Keep company estimate approval away from admin-only operation fields.

alter table public.payments
add column if not exists created_by uuid references auth.users(id) on delete set null;

create or replace function public.prevent_non_admin_request_operation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row jsonb := coalesce(to_jsonb(old), '{}'::jsonb);
  new_row jsonb := coalesce(to_jsonb(new), '{}'::jsonb);
  protected_field text;
  protected_fields text[] := array[
    'operation_status',
    'assignment_status',
    'admin_status',
    'internal_status',
    'request_stage',
    'settlement_status',
    'operation_step',
    'payment_status',
    'contact_status',
    'client_price',
    'interpreter_price',
    'profit',
    'interpreter_fee',
    'assigned_interpreter_id',
    'assigned_interpreter_name',
    'matched_interpreter_id',
    'matched_interpreter_name',
    'admin_checked'
  ];
begin
  if public.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  foreach protected_field in array protected_fields loop
    if tg_op = 'INSERT' then
      if protected_field = 'payment_status'
        and coalesce(new_row->>protected_field, 'unpaid') is distinct from 'unpaid'
      then
        raise exception 'Only admins can set request operation fields.';
      elsif protected_field = 'contact_status'
        and coalesce(new_row->>protected_field, 'not_contacted') is distinct from 'not_contacted'
      then
        raise exception 'Only admins can set request operation fields.';
      elsif protected_field in ('client_price', 'interpreter_price', 'profit', 'interpreter_fee')
        and coalesce(nullif(new_row->>protected_field, '')::numeric, 0) <> 0
      then
        raise exception 'Only admins can set request operation fields.';
      elsif protected_field in ('assigned_interpreter_id', 'assigned_interpreter_name', 'matched_interpreter_id', 'matched_interpreter_name')
        and new_row->>protected_field is not null
      then
        raise exception 'Only admins can set request operation fields.';
      elsif protected_field = 'admin_checked'
        and coalesce((new_row->>protected_field)::boolean, false) is distinct from false
      then
        raise exception 'Only admins can set request operation fields.';
      elsif protected_field = 'operation_status'
        and coalesce(new_row->>protected_field, 'before_operation') not in ('', 'before_operation')
      then
        raise exception 'Only admins can set request operation fields.';
      elsif protected_field = 'assignment_status'
        and coalesce(new_row->>protected_field, 'waiting') not in ('', 'waiting')
      then
        raise exception 'Only admins can set request operation fields.';
      elsif protected_field = 'settlement_status'
        and coalesce(new_row->>protected_field, 'not_required') not in ('', 'not_required')
      then
        raise exception 'Only admins can set request operation fields.';
      end if;
    elsif old_row->protected_field is distinct from new_row->protected_field then
      raise exception 'Only admins can set request operation fields.';
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.approve_estimate_and_create_payment(
  p_request_id bigint,
  p_company_id bigint,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_request public.requests%rowtype;
  v_document public.documents%rowtype;
  v_payment public.payments%rowtype;
  v_amount numeric;
begin
  select *
  into v_business
  from public.businesses
  where id = p_company_id;

  if not found then
    raise exception '기업 정보를 찾을 수 없습니다.';
  end if;

  if not (
    public.is_active_admin()
    or (
      auth.uid() is not null
      and v_business.auth_user_id = auth.uid()
    )
  ) then
    raise exception '해당 기업 의뢰를 승인할 권한이 없습니다.';
  end if;

  select *
  into v_request
  from public.requests
  where id = p_request_id
    and (
      public.is_active_admin()
      or company_auth_user_id = v_business.auth_user_id
      or (
        company_auth_user_id is null
        and company_name = v_business.company_name
      )
    );

  if not found then
    raise exception '의뢰 정보를 찾을 수 없습니다.';
  end if;

  select *
  into v_document
  from public.documents
  where id = p_document_id
    and request_id = p_request_id
    and document_type = 'estimate'
    and status = 'issued';

  if not found then
    raise exception '승인 가능한 견적서를 찾을 수 없습니다.';
  end if;

  v_amount := coalesce(
    v_document.amount,
    nullif(v_document.metadata->>'totalAmount', '')::numeric,
    nullif(v_document.metadata->>'total_amount', '')::numeric,
    nullif(to_jsonb(v_request)->>'company_amount', '')::numeric,
    nullif(to_jsonb(v_request)->>'client_price', '')::numeric,
    nullif(to_jsonb(v_request)->>'estimated_price', '')::numeric,
    0
  );

  update public.documents
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'approved_at', now(),
        'approved_by', auth.uid(),
        'quote_status', 'approved'
      ),
      updated_at = now()
  where id = p_document_id;

  update public.requests
  set estimate_status = 'estimate_approved',
      updated_at = now()
  where id = p_request_id;

  insert into public.payments (
    request_id,
    company_id,
    company_auth_user_id,
    estimate_document_id,
    amount,
    payment_status,
    created_by
  )
  values (
    p_request_id,
    p_company_id,
    v_business.auth_user_id,
    p_document_id,
    v_amount,
    'unpaid',
    auth.uid()
  )
  on conflict (request_id) do update
  set company_id = coalesce(public.payments.company_id, excluded.company_id),
      company_auth_user_id = coalesce(public.payments.company_auth_user_id, excluded.company_auth_user_id),
      estimate_document_id = coalesce(public.payments.estimate_document_id, excluded.estimate_document_id),
      amount = case
        when public.payments.amount is null or public.payments.amount = 0 then excluded.amount
        else public.payments.amount
      end,
      payment_status = case
        when public.payments.payment_status is null or public.payments.payment_status = '' then 'unpaid'
        else public.payments.payment_status
      end,
      updated_at = now()
  returning * into v_payment;

  begin
    insert into public.notifications (
      recipient_type,
      notification_type,
      title,
      message,
      related_request_id,
      related_document_id,
      channel,
      status
    )
    values (
      'admin',
      'admin_estimate_approved',
      '견적 승인 완료',
      '기업이 견적서를 승인했습니다.',
      p_request_id,
      p_document_id,
      'internal',
      'pending'
    );
  exception
    when others then
      raise warning 'approve_estimate_and_create_payment notification skipped: %', sqlerrm;
  end;

  return jsonb_build_object(
    'request_id', p_request_id,
    'quote_status', 'approved',
    'estimate_status', 'estimate_approved',
    'payment_status', v_payment.payment_status,
    'created_payment_id', v_payment.id
  );
end;
$$;

revoke all on function public.approve_estimate_and_create_payment(bigint, bigint, uuid) from public;
revoke all on function public.approve_estimate_and_create_payment(bigint, bigint, uuid) from anon;
grant execute on function public.approve_estimate_and_create_payment(bigint, bigint, uuid) to authenticated;

notify pgrst, 'reload schema';
