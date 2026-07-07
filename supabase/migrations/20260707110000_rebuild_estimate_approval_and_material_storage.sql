-- Rebuild company estimate approval and material storage around request-owned folders.

insert into storage.buckets (id, name, public)
values ('reference_files', 'reference_files', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

alter table public.requests
add column if not exists storage_folder_id text;

create table if not exists public.request_storage_folders (
  id text primary key,
  request_id bigint not null references public.requests(id) on delete cascade,
  bucket_id text not null default 'reference_files',
  folder_path text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id),
  unique (bucket_id, folder_path)
);

create index if not exists request_storage_folders_request_idx
on public.request_storage_folders(request_id);

alter table public.payments
add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.notification_events
add column if not exists channel text not null default 'internal',
add column if not exists notification_type text,
add column if not exists title text,
add column if not exists message text,
add column if not exists recipient_id uuid,
add column if not exists recipient_name text,
add column if not exists target_role text,
add column if not exists related_request_id bigint references public.requests(id) on delete set null,
add column if not exists related_document_id uuid references public.documents(id) on delete set null;

alter table public.request_materials
add column if not exists original_file_name text,
add column if not exists file_size bigint,
add column if not exists mime_type text,
add column if not exists material_type text,
add column if not exists company_id bigint references public.businesses(id) on delete set null,
add column if not exists uploaded_by uuid references auth.users(id) on delete set null;

alter table public.requests disable trigger prevent_non_admin_request_operation_fields;

update public.requests
set storage_folder_id = id::text
where storage_folder_id is null
   or btrim(storage_folder_id) = '';

insert into public.request_storage_folders (
  id,
  request_id,
  bucket_id,
  folder_path,
  created_by
)
select
  r.storage_folder_id,
  r.id,
  'reference_files',
  'requests/materials/' || r.storage_folder_id,
  r.company_auth_user_id
from public.requests r
where r.storage_folder_id is not null
  and btrim(r.storage_folder_id) <> ''
on conflict (request_id) do update
set id = excluded.id,
    bucket_id = excluded.bucket_id,
    folder_path = excluded.folder_path,
    updated_at = now();

alter table public.requests enable trigger prevent_non_admin_request_operation_fields;

create or replace function public.assign_request_storage_folder_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.storage_folder_id is null or btrim(new.storage_folder_id) = '' then
    new.storage_folder_id := new.id::text;
  end if;

  return new;
end;
$$;

create or replace function public.upsert_request_storage_folder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.request_storage_folders (
    id,
    request_id,
    bucket_id,
    folder_path,
    created_by
  )
  values (
    new.storage_folder_id,
    new.id,
    'reference_files',
    'requests/materials/' || new.storage_folder_id,
    coalesce(new.company_auth_user_id, auth.uid())
  )
  on conflict (request_id) do update
  set id = excluded.id,
      bucket_id = excluded.bucket_id,
      folder_path = excluded.folder_path,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists ensure_request_storage_folder on public.requests;
drop trigger if exists assign_request_storage_folder_id on public.requests;
create trigger assign_request_storage_folder_id
before insert or update of storage_folder_id on public.requests
for each row
execute function public.assign_request_storage_folder_id();

drop trigger if exists upsert_request_storage_folder on public.requests;
create trigger upsert_request_storage_folder
after insert or update of storage_folder_id, company_auth_user_id on public.requests
for each row
execute function public.upsert_request_storage_folder();

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
  if current_setting('app.approve_estimate_rpc', true) = 'on' then
    return new;
  end if;

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

create or replace function public.sync_operational_tables_from_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.approve_estimate_rpc', true) is distinct from 'on'
    and (
      tg_op = 'INSERT'
      or new.estimate_status is distinct from old.estimate_status
      or new.payment_status is distinct from old.payment_status
      or new.company_amount is distinct from old.company_amount
      or new.client_price is distinct from old.client_price
    )
  then
    if coalesce(new.estimate_status, '') in ('estimate_approved', 'company_approved')
      or coalesce(new.company_amount, new.client_price, 0) > 0
      or public.map_legacy_payment_status(new.payment_status) <> 'unpaid'
    then
      perform public.ensure_payment_for_request(new.id);
    end if;
  end if;

  if tg_op = 'INSERT'
    or new.operation_status is distinct from old.operation_status
    or new.settlement_status is distinct from old.settlement_status
    or new.settlement_final_amount is distinct from old.settlement_final_amount
    or new.interpreter_payment is distinct from old.interpreter_payment
    or new.interpreter_price is distinct from old.interpreter_price
  then
    if coalesce(new.operation_status, '') in ('completed', 'operation_completed', 'done', '업무완료', '운영완료')
      or coalesce(new.settlement_status, '') in ('pending', 'confirmed', 'completed', 'on_hold', 'settlement_pending', 'settlement_confirmed', 'settlement_completed', '정산대기', '정산확정', '정산완료')
    then
      perform public.ensure_settlements_for_request(new.id);
    end if;
  end if;

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
  v_actor uuid := auth.uid();
  v_business public.businesses%rowtype;
  v_request public.requests%rowtype;
  v_document public.documents%rowtype;
  v_payment public.payments%rowtype;
  v_amount numeric;
  v_storage_folder_id text;
begin
  if v_actor is null then
    raise exception '로그인이 필요합니다.';
  end if;

  perform set_config('app.approve_estimate_rpc', 'on', true);

  select *
  into v_business
  from public.businesses
  where id = p_company_id;

  if not found then
    raise exception '기업 정보를 찾을 수 없습니다.';
  end if;

  select *
  into v_request
  from public.requests
  where id = p_request_id
    and (
      public.is_active_admin()
      or (
        v_business.auth_user_id = v_actor
        and (
          company_auth_user_id = v_actor
          or (
            company_auth_user_id is null
            and company_name = v_business.company_name
          )
        )
      )
    )
  for update;

  if not found then
    raise exception '의뢰 정보를 찾을 수 없거나 승인 권한이 없습니다.';
  end if;

  select *
  into v_document
  from public.documents
  where id = p_document_id
    and request_id = p_request_id
    and document_type = 'estimate'
    and status = 'issued'
  for update;

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

  v_storage_folder_id := coalesce(nullif(v_request.storage_folder_id, ''), v_request.id::text);

  -- 1. estimate approval
  update public.documents
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'approved_at', now(),
        'approved_by', v_actor,
        'quote_status', 'approved'
      ),
      updated_at = now()
  where id = p_document_id;

  -- 2. payment creation
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
    v_actor
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

  -- 3. request status change
  update public.requests
  set estimate_status = 'estimate_approved',
      payment_status = 'unpaid',
      storage_folder_id = v_storage_folder_id,
      updated_at = now()
  where id = p_request_id;

  -- 4. storage folder creation
  insert into public.request_storage_folders (
    id,
    request_id,
    bucket_id,
    folder_path,
    created_by
  )
  values (
    v_storage_folder_id,
    p_request_id,
    'reference_files',
    'requests/materials/' || v_storage_folder_id,
    v_actor
  )
  on conflict (request_id) do update
  set id = excluded.id,
      bucket_id = excluded.bucket_id,
      folder_path = excluded.folder_path,
      updated_at = now();

  -- 5. request.storage_folder_id is saved by the request update above.

  -- 6. notification creation
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

  -- 7. history creation
  insert into public.activity_logs (
    action_type,
    description,
    user_id,
    related_table,
    related_id
  )
  values (
    'estimate_approved',
    '기업이 견적서를 승인하고 결제 대기와 자료 저장소를 생성했습니다.',
    v_actor,
    'requests',
    p_request_id::text
  );

  return jsonb_build_object(
    'request_id', p_request_id,
    'quote_status', 'approved',
    'estimate_status', 'estimate_approved',
    'payment_status', v_payment.payment_status,
    'created_payment_id', v_payment.id,
    'storage_folder_id', v_storage_folder_id,
    'storage_bucket', 'reference_files',
    'storage_folder_path', 'requests/materials/' || v_storage_folder_id
  );
end;
$$;

revoke all on function public.approve_estimate_and_create_payment(bigint, bigint, uuid) from public;
revoke all on function public.approve_estimate_and_create_payment(bigint, bigint, uuid) from anon;
grant execute on function public.approve_estimate_and_create_payment(bigint, bigint, uuid) to authenticated;

drop policy if exists "Allow reference material storage uploads" on storage.objects;
drop policy if exists "Allow request materials storage uploads" on storage.objects;
drop policy if exists "Allow request materials storage inserts" on storage.objects;
drop policy if exists "Authenticated users can upload reference files" on storage.objects;
drop policy if exists "Allow company material uploads by storage folder" on storage.objects;
create policy "Allow company material uploads by storage folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'reference_files'
  and exists (
    select 1
    from public.requests r
    where r.storage_folder_id is not null
      and name like ('requests/materials/' || r.storage_folder_id || '/%')
      and (
        r.company_auth_user_id = auth.uid()
        or public.is_active_admin()
      )
  )
);

drop policy if exists "Allow reference material storage reads" on storage.objects;
drop policy if exists "Authenticated users can read reference files" on storage.objects;
drop policy if exists "Allow request material reads by storage folder" on storage.objects;
create policy "Allow request material reads by storage folder"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'reference_files'
  and exists (
    select 1
    from public.requests r
    left join public.request_materials rm
      on rm.request_id = r.id
      and rm.file_path = storage.objects.name
    where r.storage_folder_id is not null
      and storage.objects.name like ('requests/materials/' || r.storage_folder_id || '/%')
      and (
        r.company_auth_user_id = auth.uid()
        or public.is_active_admin()
        or exists (
          select 1
          from public.request_interpreters ri
          join public.interpreters i on i.id = ri.interpreter_id
          where ri.request_id = r.id
            and i.auth_user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "Authenticated users can update reference files" on storage.objects;
drop policy if exists "Allow company material updates by storage folder" on storage.objects;
create policy "Allow company material updates by storage folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'reference_files'
  and exists (
    select 1
    from public.requests r
    where r.storage_folder_id is not null
      and name like ('requests/materials/' || r.storage_folder_id || '/%')
      and (
        r.company_auth_user_id = auth.uid()
        or public.is_active_admin()
      )
  )
)
with check (
  bucket_id = 'reference_files'
  and exists (
    select 1
    from public.requests r
    where r.storage_folder_id is not null
      and name like ('requests/materials/' || r.storage_folder_id || '/%')
      and (
        r.company_auth_user_id = auth.uid()
        or public.is_active_admin()
      )
  )
);

drop policy if exists "Allow reference material storage deletes" on storage.objects;
drop policy if exists "Authenticated users can delete reference files" on storage.objects;
drop policy if exists "Allow company material deletes by storage folder" on storage.objects;
create policy "Allow company material deletes by storage folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'reference_files'
  and exists (
    select 1
    from public.requests r
    where r.storage_folder_id is not null
      and name like ('requests/materials/' || r.storage_folder_id || '/%')
      and (
        r.company_auth_user_id = auth.uid()
        or public.is_active_admin()
      )
  )
);

notify pgrst, 'reload schema';
