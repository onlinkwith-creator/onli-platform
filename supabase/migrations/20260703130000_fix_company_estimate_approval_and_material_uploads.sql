-- Allow company estimate approval and safe request material uploads without disabling RLS.

insert into storage.buckets (id, name, public)
values ('reference_files', 'reference_files', false)
on conflict (id) do update
set public = false;

alter table public.request_materials
add column if not exists original_file_name text,
add column if not exists file_size bigint,
add column if not exists mime_type text,
add column if not exists material_type text,
add column if not exists company_id bigint references public.businesses(id) on delete set null,
add column if not exists uploaded_by uuid references auth.users(id) on delete set null;

update public.request_materials
set original_file_name = coalesce(original_file_name, file_name),
    material_type = coalesce(material_type, file_type)
where original_file_name is null
   or material_type is null;

create index if not exists request_materials_request_created_idx
on public.request_materials(request_id, created_at desc);

create index if not exists request_materials_company_created_idx
on public.request_materials(company_id, created_at desc);

create or replace function public.prevent_non_admin_request_operation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and (
      old.company_auth_user_id = auth.uid()
      or (
        old.company_auth_user_id is null
        and exists (
          select 1
          from public.businesses b
          where b.auth_user_id = auth.uid()
            and b.company_name = old.company_name
        )
      )
    )
    and new.company_auth_user_id = old.company_auth_user_id
    and new.id = old.id
    and new.estimate_status in ('estimate_approved', 'company_approved')
    and coalesce(old.estimate_status, '') is distinct from coalesce(new.estimate_status, '')
    and (to_jsonb(new) - 'estimate_status' - 'updated_at')
        = (to_jsonb(old) - 'estimate_status' - 'updated_at')
  then
    return new;
  end if;

  if new.payment_status is distinct from 'unpaid'
    or new.contact_status is distinct from 'not_contacted'
    or coalesce(new.client_price, 0) <> 0
    or coalesce(new.interpreter_price, 0) <> 0
    or coalesce(new.profit, 0) <> 0
    or coalesce(new.interpreter_fee, 0) <> 0
    or new.assigned_interpreter_id is not null
    or new.assigned_interpreter_name is not null
    or new.matched_interpreter_id is not null
    or new.matched_interpreter_name is not null
    or new.admin_checked is distinct from false
  then
    raise exception 'Only admins can set request operation fields.';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Only admins can update requests.';
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
        'approved_by', auth.uid()
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
    payment_status
  )
  values (
    p_request_id,
    p_company_id,
    v_business.auth_user_id,
    p_document_id,
    v_amount,
    'unpaid'
  )
  on conflict (request_id) do update
  set company_id = coalesce(public.payments.company_id, excluded.company_id),
      company_auth_user_id = coalesce(public.payments.company_auth_user_id, excluded.company_auth_user_id),
      estimate_document_id = coalesce(public.payments.estimate_document_id, excluded.estimate_document_id),
      amount = case
        when public.payments.amount is null or public.payments.amount = 0 then excluded.amount
        else public.payments.amount
      end,
      payment_status = coalesce(nullif(public.payments.payment_status, ''), 'unpaid'),
      updated_at = now()
  returning * into v_payment;

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
  )
  on conflict do nothing;

  return jsonb_build_object(
    'request_id', p_request_id,
    'estimate_status', 'estimate_approved',
    'payment_id', v_payment.id,
    'payment_status', v_payment.payment_status
  );
end;
$$;

revoke all on function public.approve_estimate_and_create_payment(bigint, bigint, uuid) from public;
revoke all on function public.approve_estimate_and_create_payment(bigint, bigint, uuid) from anon;
grant execute on function public.approve_estimate_and_create_payment(bigint, bigint, uuid) to authenticated;

alter table public.request_materials enable row level security;

drop policy if exists "Companies can read own request materials" on public.request_materials;
create policy "Companies can read own request materials"
on public.request_materials
for select
to authenticated
using (
  exists (
    select 1
    from public.requests r
    where r.id = request_materials.request_id
      and r.company_auth_user_id = auth.uid()
  )
);

drop policy if exists "Companies can insert own request materials" on public.request_materials;
create policy "Companies can insert own request materials"
on public.request_materials
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.requests r
    where r.id = request_materials.request_id
      and r.company_auth_user_id = auth.uid()
  )
  and (
    request_materials.company_id is null
    or exists (
      select 1
      from public.businesses b
      where b.id = request_materials.company_id
        and b.auth_user_id = auth.uid()
    )
  )
);

drop policy if exists "Companies can delete own request materials" on public.request_materials;
create policy "Companies can delete own request materials"
on public.request_materials
for delete
to authenticated
using (
  exists (
    select 1
    from public.requests r
    where r.id = request_materials.request_id
      and r.company_auth_user_id = auth.uid()
  )
);

drop policy if exists "Interpreters can read assigned request materials" on public.request_materials;
create policy "Interpreters can read assigned request materials"
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

drop policy if exists "Admins can manage all materials" on public.request_materials;
create policy "Admins can manage all materials"
on public.request_materials
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Allow request materials storage uploads" on storage.objects;
drop policy if exists "Allow request materials storage inserts" on storage.objects;
create policy "Allow reference material storage uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'reference_files'
  and name like 'requests/materials/%'
  and name ~ '^requests/materials/[0-9]+/[A-Za-z0-9-]+[.](pdf|jpg|jpeg|png)$'
  and exists (
    select 1
    from public.requests r
    where r.company_auth_user_id = auth.uid()
      and name like ('requests/materials/' || r.id::text || '/%')
  )
);

drop policy if exists "Allow request materials storage reads" on storage.objects;
create policy "Allow reference material storage reads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'reference_files'
  and exists (
    select 1
    from public.request_materials rm
    join public.requests r on r.id = rm.request_id
    where rm.file_path = storage.objects.name
      and (
        r.company_auth_user_id = auth.uid()
        or public.is_active_admin()
        or exists (
          select 1
          from public.request_interpreters ri
          join public.interpreters i on i.id = ri.interpreter_id
          where ri.request_id = rm.request_id
            and i.auth_user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "Allow legacy request material storage reads" on storage.objects;
create policy "Allow legacy request material storage reads"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'request-files'
  and name like 'requests/reference_files/materials/%'
  and exists (
    select 1
    from public.request_materials rm
    join public.requests r on r.id = rm.request_id
    where rm.file_path = storage.objects.name
      and (
        r.company_auth_user_id = auth.uid()
        or public.is_active_admin()
        or exists (
          select 1
          from public.request_interpreters ri
          join public.interpreters i on i.id = ri.interpreter_id
          where ri.request_id = rm.request_id
            and i.auth_user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "Allow request materials storage deletes" on storage.objects;
create policy "Allow reference material storage deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'reference_files'
  and exists (
    select 1
    from public.request_materials rm
    join public.requests r on r.id = rm.request_id
    where rm.file_path = storage.objects.name
      and (
        r.company_auth_user_id = auth.uid()
        or public.is_active_admin()
      )
  )
);

drop policy if exists "Allow legacy request material storage deletes" on storage.objects;
create policy "Allow legacy request material storage deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'request-files'
  and name like 'requests/reference_files/materials/%'
  and exists (
    select 1
    from public.request_materials rm
    join public.requests r on r.id = rm.request_id
    where rm.file_path = storage.objects.name
      and (
        r.company_auth_user_id = auth.uid()
        or public.is_active_admin()
      )
  )
);

notify pgrst, 'reload schema';
