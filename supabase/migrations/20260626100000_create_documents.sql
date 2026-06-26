create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  document_no text not null,
  request_id uuid null,
  company_id uuid null,
  interpreter_id text null,
  settlement_id uuid null,
  status text not null default 'issued',
  version integer not null default 1,
  title text,
  file_path text,
  amount numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_document_type_check
    check (document_type in ('estimate', 'completion', 'payout')),
  constraint documents_status_check
    check (status in ('draft', 'issued', 'voided')),
  constraint documents_document_no_version_key
    unique (document_no, version)
);

create index if not exists documents_request_type_status_idx
on public.documents (request_id, document_type, status, version desc);

create index if not exists documents_company_idx
on public.documents (company_id, document_type, status);

create index if not exists documents_interpreter_idx
on public.documents (interpreter_id, document_type, status);

create table if not exists public.document_counters (
  document_type text primary key,
  prefix text not null,
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint document_counters_document_type_check
    check (document_type in ('estimate', 'completion', 'payout'))
);

insert into public.document_counters (document_type, prefix, last_number)
values
  ('estimate', 'ONLI-EST-', 0),
  ('completion', 'ONLI-COM-', 0),
  ('payout', 'ONLI-PAY-', 0)
on conflict (document_type) do update
set prefix = excluded.prefix;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_documents_updated_at on public.documents;
create trigger set_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists set_document_counters_updated_at on public.document_counters;
create trigger set_document_counters_updated_at
before update on public.document_counters
for each row execute function public.set_updated_at();

create or replace function public.get_next_document_no(p_document_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  counter_row public.document_counters%rowtype;
  next_number integer;
begin
  if p_document_type not in ('estimate', 'completion', 'payout') then
    raise exception 'Unsupported document type: %', p_document_type;
  end if;

  select *
  into counter_row
  from public.document_counters
  where document_type = p_document_type
  for update;

  if not found then
    raise exception 'Document counter not found for type: %', p_document_type;
  end if;

  next_number := counter_row.last_number + 1;

  update public.document_counters
  set last_number = next_number,
      updated_at = now()
  where document_type = p_document_type;

  return counter_row.prefix || lpad(next_number::text, 4, '0');
end;
$$;

insert into storage.buckets (id, name, public)
values ('onli-documents', 'onli-documents', false)
on conflict (id) do update
set public = false;

alter table public.requests
add column if not exists estimate_status text not null default 'not_issued',
add column if not exists estimate_amount numeric,
add column if not exists estimate_approved_at timestamptz,
add column if not exists estimate_approved_by uuid;

alter table public.documents enable row level security;
alter table public.document_counters enable row level security;

create or replace function public.can_access_request_document(p_request_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.requests r
    where r.id = p_request_id
      and lower(coalesce(r.company_email, r.contact_email, r.email, r.contact_email_or_phone, '')) = lower(auth.email())
  );
$$;

create or replace function public.can_access_interpreter_document(p_interpreter_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.interpreters i
    where i.id::text = p_interpreter_id
      and (
        i.auth_user_id = auth.uid()
        or lower(i.email) = lower(auth.email())
      )
  );
$$;

drop policy if exists documents_select on public.documents;
drop policy if exists documents_insert on public.documents;
drop policy if exists documents_update on public.documents;
drop policy if exists document_counters_select on public.document_counters;
drop policy if exists storage_onli_documents_select on storage.objects;
drop policy if exists storage_onli_documents_insert on storage.objects;
drop policy if exists storage_onli_documents_update on storage.objects;

create policy documents_select
on public.documents
for select
to authenticated
using (
  public.is_active_admin()
  or (
    status = 'issued'
    and request_id is not null
    and public.can_access_request_document(request_id)
  )
  or (
    status = 'issued'
    and document_type = 'payout'
    and interpreter_id is not null
    and public.can_access_interpreter_document(interpreter_id)
  )
);

create policy documents_insert
on public.documents
for insert
to authenticated
with check (public.is_active_admin());

create policy documents_update
on public.documents
for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create policy document_counters_select
on public.document_counters
for select
to authenticated
using (public.is_active_admin());

create policy storage_onli_documents_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'onli-documents'
  and (
    public.is_active_admin()
    or exists (
      select 1
      from public.documents d
      where d.file_path = storage.objects.name
        and d.status = 'issued'
        and d.request_id is not null
        and public.can_access_request_document(d.request_id)
    )
    or exists (
      select 1
      from public.documents d
      where d.file_path = storage.objects.name
        and d.status = 'issued'
        and d.document_type = 'payout'
        and d.interpreter_id is not null
        and public.can_access_interpreter_document(d.interpreter_id)
    )
  )
);

create policy storage_onli_documents_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'onli-documents'
  and public.is_active_admin()
);

create policy storage_onli_documents_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'onli-documents'
  and public.is_active_admin()
)
with check (
  bucket_id = 'onli-documents'
  and public.is_active_admin()
);

notify pgrst, 'reload schema';
