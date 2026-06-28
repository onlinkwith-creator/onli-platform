-- Backoffice documents, notifications, and payments hardening.
-- This migration is additive and keeps ON-LI's existing bigint request/business/interpreter ids.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('onli-documents', 'onli-documents', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

create table if not exists public.document_counters (
  document_type text primary key,
  prefix text not null,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.document_counters
  alter column last_number type integer using last_number::integer,
  alter column last_number set default 0;

insert into public.document_counters (document_type, prefix, last_number)
values
  ('estimate', 'ONLI-EST-', 0),
  ('completion', 'ONLI-COM-', 0),
  ('payout', 'ONLI-PAY-', 0)
on conflict (document_type) do update
set prefix = excluded.prefix;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  document_no text not null,
  request_id bigint null references public.requests(id) on delete set null,
  company_id bigint null references public.businesses(id) on delete set null,
  company_auth_user_id uuid null references auth.users(id) on delete set null,
  interpreter_id bigint null references public.interpreters(id) on delete set null,
  interpreter_auth_user_id uuid null references auth.users(id) on delete set null,
  settlement_id text null,
  status text not null default 'issued',
  version integer not null default 1,
  title text null,
  storage_bucket text not null default 'onli-documents',
  file_path text null,
  amount numeric null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  voided_at timestamptz null,
  voided_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents
  add column if not exists request_id bigint null references public.requests(id) on delete set null,
  add column if not exists company_id bigint null references public.businesses(id) on delete set null,
  add column if not exists company_auth_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists interpreter_id bigint null references public.interpreters(id) on delete set null,
  add column if not exists interpreter_auth_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists settlement_id text null,
  add column if not exists storage_bucket text not null default 'onli-documents',
  add column if not exists amount numeric null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid null references auth.users(id) on delete set null,
  add column if not exists voided_at timestamptz null,
  add column if not exists voided_by uuid null references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.documents
  alter column title drop not null,
  alter column status set default 'issued',
  alter column version set default 1,
  alter column metadata set default '{}'::jsonb;

alter table public.documents drop constraint if exists documents_document_no_key;
alter table public.documents drop constraint if exists documents_document_no_version_key;
alter table public.documents add constraint documents_document_no_version_key unique (document_no, version);

alter table public.documents drop constraint if exists documents_document_type_check;
alter table public.documents add constraint documents_document_type_check
check (document_type in ('estimate', 'completion', 'payout'));

alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents add constraint documents_status_check
check (status in ('draft', 'issued', 'voided'));

create index if not exists documents_request_idx
on public.documents(request_id, document_type, version desc);

create index if not exists documents_company_id_idx
on public.documents(company_id, document_type, created_at desc);

create index if not exists documents_interpreter_id_idx
on public.documents(interpreter_id, document_type, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  request_id bigint not null references public.requests(id) on delete cascade,
  company_id bigint references public.businesses(id) on delete set null,
  estimate_document_id uuid null references public.documents(id) on delete set null,
  amount numeric not null default 0,
  payment_status text not null default 'unpaid',
  payment_method text null,
  paid_at timestamptz null,
  due_date date null,
  admin_memo text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payments
  add column if not exists estimate_document_id uuid null references public.documents(id) on delete set null,
  add column if not exists payment_method text null,
  add column if not exists paid_at timestamptz null,
  add column if not exists due_date date null,
  add column if not exists admin_memo text null,
  add column if not exists created_by uuid null references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.payments drop constraint if exists payments_payment_status_check;
alter table public.payments add constraint payments_payment_status_check
check (payment_status in ('unpaid', 'invoice_sent', 'paid', 'overdue', 'refunded'));

alter table public.payments drop constraint if exists payments_payment_method_check;
alter table public.payments add constraint payments_payment_method_check
check (payment_method is null or payment_method in ('bank_transfer', 'cash', 'other'));

create unique index if not exists payments_request_key
on public.payments(request_id);

create index if not exists payments_company_idx
on public.payments(company_id, created_at desc);

create index if not exists payments_status_idx
on public.payments(payment_status, due_date, created_at desc);

create table if not exists public.payment_logs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  previous_status text null,
  new_status text not null,
  changed_by uuid null references auth.users(id) on delete set null,
  memo text null,
  created_at timestamptz not null default now()
);

create index if not exists payment_logs_payment_idx
on public.payment_logs(payment_id, created_at desc);

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'notifications'
      and c.relkind in ('v', 'm')
  ) then
    drop view if exists public.notifications;
  end if;
end;
$$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null,
  recipient_id uuid null,
  recipient_email text null,
  recipient_phone text null,
  notification_type text not null,
  title text not null,
  message text not null,
  related_request_id text null,
  related_document_id uuid null,
  channel text not null default 'email',
  status text not null default 'pending',
  sent_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists recipient_id uuid null,
  add column if not exists recipient_email text null,
  add column if not exists recipient_phone text null,
  add column if not exists related_request_id text null,
  add column if not exists related_document_id uuid null,
  add column if not exists channel text not null default 'email',
  add column if not exists status text not null default 'pending',
  add column if not exists sent_at timestamptz null,
  add column if not exists error_message text null;

alter table public.notifications drop constraint if exists notifications_recipient_type_check;
alter table public.notifications add constraint notifications_recipient_type_check
check (recipient_type in ('company', 'interpreter', 'admin'));

alter table public.notifications drop constraint if exists notifications_channel_check;
alter table public.notifications add constraint notifications_channel_check
check (channel in ('email', 'kakao', 'internal'));

alter table public.notifications drop constraint if exists notifications_status_check;
alter table public.notifications add constraint notifications_status_check
check (status in ('pending', 'sent', 'failed'));

create index if not exists notifications_recipient_idx
on public.notifications(recipient_type, recipient_id, recipient_email, created_at desc);

create index if not exists notifications_status_idx
on public.notifications(status, channel, created_at desc);

alter table public.requests
add column if not exists estimate_status text not null default 'estimate_preparing';

alter table public.requests
alter column estimate_status set default 'estimate_preparing';

alter table public.requests drop constraint if exists requests_estimate_status_check;
alter table public.requests add constraint requests_estimate_status_check
check (
  estimate_status in (
    'estimate_preparing',
    'estimate_required',
    'estimate_approved',
    'estimate_pending',
    'estimate_sent',
    'company_approved',
    'recruiting_interpreters',
    'assigned'
  )
);

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at
before update on public.documents
for each row
execute function public.update_updated_at();

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at
before update on public.payments
for each row
execute function public.update_updated_at();

drop trigger if exists document_counters_updated_at on public.document_counters;
create trigger document_counters_updated_at
before update on public.document_counters
for each row
execute function public.update_updated_at();

create or replace function public.get_next_document_no(p_document_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_last_number integer;
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
      when 'estimate' then 'ONLI-EST-'
      when 'completion' then 'ONLI-COM-'
      when 'payout' then 'ONLI-PAY-'
    end,
    0
  )
  on conflict (document_type) do nothing;

  select prefix, last_number
  into v_prefix, v_last_number
  from public.document_counters
  where document_type = p_document_type
  for update;

  v_last_number := v_last_number + 1;

  update public.document_counters
  set last_number = v_last_number,
      updated_at = now()
  where document_type = p_document_type;

  return v_prefix || lpad(v_last_number::text, 4, '0');
end;
$$;

revoke all on function public.get_next_document_no(text) from public;
grant execute on function public.get_next_document_no(text) to authenticated;

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
  p_channel text default 'email'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  insert into public.notification_events (
    event_type,
    notification_type,
    target_type,
    target_id,
    recipient_type,
    recipient_id,
    recipient_email,
    recipient_phone,
    payload,
    channel,
    title,
    message,
    related_request_id,
    related_document_id,
    status
  )
  values (
    p_notification_type,
    p_notification_type,
    coalesce(
      case when p_related_document_id is not null then 'document' end,
      case when p_related_request_id is not null then 'request' end,
      'operation'
    ),
    coalesce(p_related_document_id::text, p_related_request_id, gen_random_uuid()::text),
    p_recipient_type,
    p_recipient_id,
    p_recipient_email,
    p_recipient_phone,
    jsonb_build_object(
      'related_request_id', p_related_request_id,
      'related_document_id', p_related_document_id
    ),
    coalesce(nullif(p_channel, ''), 'email'),
    p_title,
    p_message,
    null,
    p_related_document_id,
    'pending'
  )
  returning id into v_event_id;

  insert into public.notifications (
    id,
    recipient_type,
    recipient_id,
    recipient_email,
    recipient_phone,
    notification_type,
    title,
    message,
    related_request_id,
    related_document_id,
    channel,
    status,
    created_at
  )
  values (
    v_event_id,
    p_recipient_type,
    p_recipient_id,
    p_recipient_email,
    p_recipient_phone,
    p_notification_type,
    coalesce(p_title, p_notification_type),
    coalesce(p_message, ''),
    p_related_request_id,
    p_related_document_id,
    coalesce(nullif(p_channel, ''), 'email'),
    'pending',
    now()
  )
  on conflict (id) do nothing;

  return v_event_id;
exception
  when others then
    raise warning 'enqueue_backoffice_notification failed: %', sqlerrm;
    return null;
end;
$$;

create or replace function public.sync_notification_event_to_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    id,
    recipient_type,
    recipient_id,
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
    new.recipient_type,
    new.recipient_id,
    new.recipient_email,
    new.recipient_phone,
    coalesce(new.notification_type, new.event_type),
    coalesce(new.title, coalesce(new.notification_type, new.event_type)),
    coalesce(new.message, ''),
    coalesce(new.related_request_id::text, new.target_id),
    new.related_document_id,
    coalesce(new.channel, 'email'),
    case when new.status in ('sent', 'failed') then new.status else 'pending' end,
    new.sent_at,
    new.error_message,
    new.created_at
  )
  on conflict (id) do update
  set recipient_type = excluded.recipient_type,
      recipient_id = excluded.recipient_id,
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

drop trigger if exists sync_notification_event_to_notifications on public.notification_events;
create trigger sync_notification_event_to_notifications
after insert or update on public.notification_events
for each row
execute function public.sync_notification_event_to_notifications();

create or replace function public.notify_document_issued()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_company record;
  v_interpreter record;
  v_email text;
  v_recipient_id uuid;
begin
  if new.status <> 'issued' then
    return new;
  end if;

  begin
    select * into v_request from public.requests where id = new.request_id;

    if new.document_type in ('estimate', 'completion') then
      if new.company_id is not null then
        select * into v_company from public.businesses where id = new.company_id;
      elsif v_request.company_auth_user_id is not null then
        select * into v_company from public.businesses where auth_user_id = v_request.company_auth_user_id limit 1;
      end if;

      v_email := coalesce(v_company.contact_email, to_jsonb(v_request)->>'email', to_jsonb(v_request)->>'contact_email');
      v_recipient_id := coalesce(v_company.auth_user_id, new.company_auth_user_id, v_request.company_auth_user_id);

      perform public.enqueue_backoffice_notification(
        case new.document_type
          when 'estimate' then 'company_estimate_issued'
          else 'company_completion_document_issued'
        end,
        'company',
        case new.document_type
          when 'estimate' then '견적서 확인 요청'
          else '업무확인서 발급'
        end,
        case new.document_type
          when 'estimate' then '견적서가 발급되었습니다. 내용을 확인해주세요.'
          else '업무확인서가 발급되었습니다.'
        end,
        v_recipient_id,
        v_email,
        coalesce(v_company.contact_phone, to_jsonb(v_request)->>'phone'),
        new.request_id::text,
        new.id,
        'email'
      );
    elsif new.document_type = 'payout' then
      if new.interpreter_id is not null then
        select * into v_interpreter from public.interpreters where id = new.interpreter_id;
      end if;

      perform public.enqueue_backoffice_notification(
        'interpreter_payout_issued',
        'interpreter',
        '정산서 확인 요청',
        '정산서가 발급되었습니다. 내용을 확인해주세요.',
        coalesce(v_interpreter.auth_user_id, new.interpreter_auth_user_id),
        v_interpreter.email,
        v_interpreter.phone,
        new.request_id::text,
        new.id,
        'email'
      );
    end if;
  exception
    when others then
      raise warning 'document notification skipped: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists notify_document_issued on public.documents;
create trigger notify_document_issued
after insert on public.documents
for each row
execute function public.notify_document_issued();

create or replace function public.log_payment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_company record;
  v_email text;
  v_phone text;
  v_recipient_id uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.payment_logs (payment_id, previous_status, new_status, changed_by, memo)
    values (new.id, null, new.payment_status, auth.uid(), new.admin_memo);
    return new;
  end if;

  if coalesce(old.payment_status, '') = coalesce(new.payment_status, '') then
    return new;
  end if;

  insert into public.payment_logs (payment_id, previous_status, new_status, changed_by, memo)
  values (new.id, old.payment_status, new.payment_status, auth.uid(), new.admin_memo);

  select * into v_request from public.requests where id = new.request_id;

  if new.company_id is not null then
    select * into v_company from public.businesses where id = new.company_id;
  elsif v_request.company_auth_user_id is not null then
    select * into v_company from public.businesses where auth_user_id = v_request.company_auth_user_id limit 1;
  end if;

  v_email := coalesce(v_company.contact_email, to_jsonb(v_request)->>'email', to_jsonb(v_request)->>'contact_email');
  v_phone := coalesce(v_company.contact_phone, to_jsonb(v_request)->>'phone');
  v_recipient_id := coalesce(v_company.auth_user_id, v_request.company_auth_user_id);

  if new.payment_status = 'invoice_sent' then
    perform public.enqueue_backoffice_notification(
      'company_payment_invoice_sent',
      'company',
      '입금 안내',
      '입금 안내가 발송되었습니다.',
      v_recipient_id,
      v_email,
      v_phone,
      new.request_id::text,
      new.estimate_document_id,
      'email'
    );
  elsif new.payment_status = 'paid' then
    perform public.enqueue_backoffice_notification(
      'company_payment_paid',
      'company',
      '입금 확인',
      '입금이 확인되었습니다.',
      v_recipient_id,
      v_email,
      v_phone,
      new.request_id::text,
      new.estimate_document_id,
      'email'
    );
  elsif new.payment_status = 'overdue' then
    perform public.enqueue_backoffice_notification(
      'company_payment_overdue',
      'company',
      '입금 기한 초과',
      '입금 기한이 지났습니다.',
      v_recipient_id,
      v_email,
      v_phone,
      new.request_id::text,
      new.estimate_document_id,
      'email'
    );

    perform public.enqueue_backoffice_notification(
      'admin_payment_overdue',
      'admin',
      '결제 연체 확인 필요',
      '연체 상태의 결제 건을 확인해주세요.',
      null,
      null,
      null,
      new.request_id::text,
      new.estimate_document_id,
      'email'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists log_payment_status_insert on public.payments;
create trigger log_payment_status_insert
after insert on public.payments
for each row
execute function public.log_payment_status_change();

drop trigger if exists log_payment_status_update on public.payments;
create trigger log_payment_status_update
after update on public.payments
for each row
execute function public.log_payment_status_change();

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
  v_business record;
  v_request record;
  v_document record;
  v_payment record;
begin
  select * into v_business
  from public.businesses
  where id = p_company_id;

  if v_business.id is null then
    raise exception '기업 정보를 찾을 수 없습니다.';
  end if;

  if not (public.is_active_admin() or v_business.auth_user_id = auth.uid()) then
    raise exception '해당 기업 의뢰를 승인할 권한이 없습니다.';
  end if;

  select * into v_request
  from public.requests
  where id = p_request_id
    and (
      company_auth_user_id = v_business.auth_user_id
      or company_name = v_business.company_name
      or public.is_active_admin()
    );

  if v_request.id is null then
    raise exception '의뢰 정보를 찾을 수 없습니다.';
  end if;

  select * into v_document
  from public.documents
  where id = p_document_id
    and document_type = 'estimate'
    and status = 'issued'
    and request_id = p_request_id;

  if v_document.id is null then
    raise exception '승인 가능한 견적서를 찾을 수 없습니다.';
  end if;

  update public.documents
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'approved_at', now(),
        'approved_by', auth.uid()
      )
  where id = p_document_id;

  update public.requests
  set estimate_status = 'estimate_approved'
  where id = p_request_id;

  insert into public.payments (
    request_id,
    company_id,
    estimate_document_id,
    amount,
    payment_status,
    created_by
  )
  values (
    p_request_id,
    p_company_id,
    p_document_id,
    coalesce(v_document.amount, 0),
    'unpaid',
    auth.uid()
  )
  on conflict (request_id) do update
  set company_id = coalesce(public.payments.company_id, excluded.company_id),
      estimate_document_id = coalesce(public.payments.estimate_document_id, excluded.estimate_document_id),
      amount = case
        when public.payments.amount is null or public.payments.amount = 0 then excluded.amount
        else public.payments.amount
      end
  returning * into v_payment;

  perform public.enqueue_backoffice_notification(
    'admin_estimate_approved',
    'admin',
    '견적 승인 완료',
    '기업이 견적서를 승인했습니다.',
    null,
    null,
    null,
    p_request_id::text,
    p_document_id,
    'email'
  );

  return jsonb_build_object(
    'request_id', p_request_id,
    'estimate_status', 'estimate_approved',
    'payment_id', v_payment.id,
    'payment_status', v_payment.payment_status
  );
end;
$$;

revoke all on function public.approve_estimate_and_create_payment(bigint, bigint, uuid) from public;
grant execute on function public.approve_estimate_and_create_payment(bigint, bigint, uuid) to authenticated;

alter table public.documents enable row level security;
alter table public.payments enable row level security;
alter table public.payment_logs enable row level security;
alter table public.notifications enable row level security;

drop policy if exists documents_admin_all on public.documents;
create policy documents_admin_all
on public.documents
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists documents_company_select_own_ids on public.documents;
create policy documents_company_select_own_ids
on public.documents
for select
to authenticated
using (
  document_type in ('estimate', 'completion')
  and (
    company_auth_user_id = auth.uid()
    or exists (
      select 1
      from public.businesses b
      where b.id = documents.company_id
        and b.auth_user_id = auth.uid()
    )
  )
);

drop policy if exists documents_interpreter_select_own_ids on public.documents;
create policy documents_interpreter_select_own_ids
on public.documents
for select
to authenticated
using (
  document_type = 'payout'
  and (
    interpreter_auth_user_id = auth.uid()
    or exists (
      select 1
      from public.interpreters i
      where i.id = documents.interpreter_id
        and i.auth_user_id = auth.uid()
    )
  )
);

drop policy if exists payments_admin_all on public.payments;
create policy payments_admin_all
on public.payments
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists payments_company_select_own on public.payments;
create policy payments_company_select_own
on public.payments
for select
to authenticated
using (
  exists (
    select 1
    from public.businesses b
    where b.id = payments.company_id
      and b.auth_user_id = auth.uid()
  )
);

drop policy if exists payment_logs_admin_select on public.payment_logs;
create policy payment_logs_admin_select
on public.payment_logs
for select
to authenticated
using (public.is_active_admin());

drop policy if exists notifications_admin_all on public.notifications;
create policy notifications_admin_all
on public.notifications
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists notifications_company_interpreter_select_own on public.notifications;
create policy notifications_company_interpreter_select_own
on public.notifications
for select
to authenticated
using (
  recipient_id = auth.uid()
  or recipient_email = auth.email()
);

drop policy if exists notifications_system_insert on public.notifications;
create policy notifications_system_insert
on public.notifications
for insert
to authenticated
with check (public.is_active_admin());

drop policy if exists documents_admin_storage_all on storage.objects;
create policy documents_admin_storage_all
on storage.objects
for all
to authenticated
using (bucket_id = 'onli-documents' and public.is_active_admin())
with check (bucket_id = 'onli-documents' and public.is_active_admin());

drop policy if exists documents_signed_url_owner_read on storage.objects;
create policy documents_signed_url_owner_read
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
          d.document_type in ('estimate', 'completion')
          and (
            d.company_auth_user_id = auth.uid()
            or exists (
              select 1
              from public.businesses b
              where b.id = d.company_id
                and b.auth_user_id = auth.uid()
            )
          )
        )
        or (
          d.document_type = 'payout'
          and (
            d.interpreter_auth_user_id = auth.uid()
            or exists (
              select 1
              from public.interpreters i
              where i.id = d.interpreter_id
                and i.auth_user_id = auth.uid()
            )
          )
        )
      )
  )
);

insert into public.notifications (
  id,
  recipient_type,
  recipient_id,
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
select
  ne.id,
  ne.recipient_type,
  ne.recipient_id,
  ne.recipient_email,
  ne.recipient_phone,
  coalesce(ne.notification_type, ne.event_type),
  coalesce(ne.title, coalesce(ne.notification_type, ne.event_type)),
  coalesce(ne.message, ''),
  coalesce(ne.related_request_id::text, ne.target_id),
  ne.related_document_id,
  coalesce(ne.channel, 'email'),
  case when ne.status in ('sent', 'failed') then ne.status else 'pending' end,
  ne.sent_at,
  ne.error_message,
  ne.created_at
from public.notification_events ne
on conflict (id) do nothing;

notify pgrst, 'reload schema';
