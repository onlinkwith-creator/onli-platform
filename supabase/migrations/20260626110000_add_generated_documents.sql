-- ON-LI documents: estimates, completion confirmations, and interpreter payout statements.

insert into storage.buckets (id, name, public)
values ('onli-documents', 'onli-documents', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

alter table public.requests
alter column estimate_status set default 'estimate_preparing';

alter table public.requests
drop constraint if exists requests_estimate_status_check;

alter table public.requests
add constraint requests_estimate_status_check
check (
  estimate_status in (
    'estimate_preparing',
    'estimate_required',
    'estimate_approved',
    -- legacy values kept readable during rollout
    'estimate_pending',
    'estimate_sent',
    'company_approved',
    'recruiting_interpreters',
    'assigned'
  )
);

create table if not exists public.document_counters (
  document_type text primary key check (document_type in ('estimate', 'completion', 'payout')),
  prefix text not null,
  last_number bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.document_counters (document_type, prefix, last_number)
values
  ('estimate', 'ONLI-EST', 0),
  ('completion', 'ONLI-COM', 0),
  ('payout', 'ONLI-PAY', 0)
on conflict (document_type) do nothing;

create or replace function public.allocate_onli_document_number(p_document_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value bigint;
  document_prefix text;
begin
  if not public.is_active_admin() then
    raise exception 'Only admins can allocate ON-LI document numbers.';
  end if;

  if p_document_type not in ('estimate', 'completion', 'payout') then
    raise exception 'Unsupported document type: %', p_document_type;
  end if;

  insert into public.document_counters (document_type, prefix, last_number)
  values (
    p_document_type,
    case p_document_type
      when 'estimate' then 'ONLI-EST'
      when 'completion' then 'ONLI-COM'
      when 'payout' then 'ONLI-PAY'
    end,
    0
  )
  on conflict (document_type) do nothing;

  update public.document_counters
  set last_number = last_number + 1,
      updated_at = now()
  where document_type = p_document_type
  returning last_number, prefix into next_value, document_prefix;

  return document_prefix || '-' || lpad(next_value::text, 4, '0');
end;
$$;

revoke all on function public.allocate_onli_document_number(text) from public;
grant execute on function public.allocate_onli_document_number(text) to authenticated;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('estimate', 'completion', 'payout')),
  document_no text not null unique,
  status text not null default 'issued' check (status in ('draft', 'issued', 'voided')),
  version integer not null default 1 check (version > 0),
  request_id bigint references public.requests(id) on delete set null,
  company_id bigint references public.businesses(id) on delete set null,
  company_auth_user_id uuid references auth.users(id) on delete set null,
  interpreter_id bigint references public.interpreters(id) on delete set null,
  interpreter_auth_user_id uuid references auth.users(id) on delete set null,
  settlement_id text,
  title text not null,
  amount numeric,
  storage_bucket text not null default 'onli-documents',
  file_path text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_request_idx
on public.documents(request_id, document_type, version desc);

create index if not exists documents_company_idx
on public.documents(company_auth_user_id, document_type, created_at desc);

create index if not exists documents_interpreter_idx
on public.documents(interpreter_auth_user_id, document_type, created_at desc);

alter table public.documents enable row level security;

drop policy if exists "Admins can manage documents" on public.documents;
create policy "Admins can manage documents"
on public.documents
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Companies can read own documents" on public.documents;
create policy "Companies can read own documents"
on public.documents
for select
to authenticated
using (
  auth.uid() is not null
  and company_auth_user_id = auth.uid()
  and document_type in ('estimate', 'completion')
);

drop policy if exists "Interpreters can read own payout documents" on public.documents;
create policy "Interpreters can read own payout documents"
on public.documents
for select
to authenticated
using (
  auth.uid() is not null
  and interpreter_auth_user_id = auth.uid()
  and document_type = 'payout'
);

drop policy if exists "Admins can upload generated document files" on storage.objects;
create policy "Admins can upload generated document files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'onli-documents'
  and public.is_active_admin()
);

drop policy if exists "Admins can manage generated document files" on storage.objects;
create policy "Admins can manage generated document files"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'onli-documents'
  and public.is_active_admin()
)
with check (
  bucket_id = 'onli-documents'
  and public.is_active_admin()
);

drop policy if exists "Owners can read generated document files" on storage.objects;
create policy "Owners can read generated document files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'onli-documents'
  and exists (
    select 1
    from public.documents d
    where d.storage_bucket = storage.objects.bucket_id
      and d.file_path = storage.objects.name
      and (
        public.is_active_admin()
        or (
          d.company_auth_user_id = auth.uid()
          and d.document_type in ('estimate', 'completion')
        )
        or (
          d.interpreter_auth_user_id = auth.uid()
          and d.document_type = 'payout'
        )
      )
  )
);

notify pgrst, 'reload schema';
