-- Normalize ON-LI operational data so the admin/company/interpreter screens
-- read from real Supabase tables instead of UI-only request fields.

alter table public.documents
add column if not exists voided_at timestamptz,
add column if not exists voided_by uuid references auth.users(id) on delete set null;

alter table public.documents
drop constraint if exists documents_document_type_check;

alter table public.documents
add constraint documents_document_type_check
check (document_type in ('estimate', 'completion', 'confirmation', 'payout'));

alter table public.documents
drop constraint if exists documents_status_check;

alter table public.documents
add constraint documents_status_check
check (status in ('draft', 'issued', 'voided'));

alter table public.documents
drop constraint if exists documents_document_no_key;

alter table public.documents
drop constraint if exists documents_document_no_version_key;

drop index if exists public.documents_document_no_version_key;

alter table public.documents
add constraint documents_document_no_version_key unique (document_no, version);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  request_id bigint not null references public.requests(id) on delete cascade,
  company_id bigint references public.businesses(id) on delete set null,
  company_auth_user_id uuid references auth.users(id) on delete set null,
  estimate_document_id uuid references public.documents(id) on delete set null,
  amount numeric not null default 0,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'invoice_sent', 'paid', 'overdue', 'refunded')),
  payment_method text,
  paid_at timestamptz,
  due_date date,
  admin_memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id)
);

create index if not exists payments_company_idx
on public.payments(company_id, created_at desc);

create index if not exists payments_company_auth_user_idx
on public.payments(company_auth_user_id, created_at desc);

create index if not exists payments_status_idx
on public.payments(payment_status, created_at desc);

create table if not exists public.payment_logs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid default auth.uid(),
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists payment_logs_payment_idx
on public.payment_logs(payment_id, created_at desc);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  request_id bigint not null references public.requests(id) on delete cascade,
  interpreter_id bigint not null references public.interpreters(id) on delete cascade,
  interpreter_auth_user_id uuid references auth.users(id) on delete set null,
  assignment_id text,
  payout_document_id uuid references public.documents(id) on delete set null,
  amount numeric not null default 0,
  payout_status text not null default 'pending'
    check (payout_status in ('pending', 'confirmed', 'paid', 'withheld', 'cancelled')),
  work_days integer not null default 1,
  daily_rate numeric not null default 0,
  extra_amount numeric not null default 0,
  deduction_amount numeric not null default 0,
  paid_at timestamptz,
  payment_method text,
  admin_memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, interpreter_id)
);

create index if not exists settlements_request_idx
on public.settlements(request_id, created_at desc);

create index if not exists settlements_interpreter_idx
on public.settlements(interpreter_id, created_at desc);

create index if not exists settlements_interpreter_auth_user_idx
on public.settlements(interpreter_auth_user_id, created_at desc);

create index if not exists settlements_status_idx
on public.settlements(payout_status, created_at desc);

create table if not exists public.settlement_logs (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid default auth.uid(),
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists settlement_logs_settlement_idx
on public.settlement_logs(settlement_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null check (recipient_type in ('company', 'interpreter', 'admin')),
  recipient_id uuid,
  recipient_email text,
  recipient_phone text,
  notification_type text not null,
  title text not null default 'ON-LI 알림',
  message text not null default '',
  related_request_id bigint references public.requests(id) on delete set null,
  related_document_id uuid references public.documents(id) on delete set null,
  channel text not null default 'internal' check (channel in ('email', 'kakao', 'internal')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
on public.notifications(recipient_type, recipient_id, created_at desc);

create index if not exists notifications_related_request_idx
on public.notifications(related_request_id, created_at desc);

create index if not exists notifications_status_idx
on public.notifications(status, created_at desc);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  description text not null,
  user_id uuid default auth.uid(),
  related_table text,
  related_id text,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_related_idx
on public.activity_logs(related_table, related_id, created_at desc);

alter table public.payments enable row level security;
alter table public.payment_logs enable row level security;
alter table public.settlements enable row level security;
alter table public.settlement_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "Admins can manage payments" on public.payments;
create policy "Admins can manage payments"
on public.payments
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Companies can read own payments" on public.payments;
create policy "Companies can read own payments"
on public.payments
for select
to authenticated
using (
  company_auth_user_id = auth.uid()
  or exists (
    select 1 from public.businesses b
    where b.id = payments.company_id
      and b.auth_user_id = auth.uid()
  )
);

drop policy if exists "Admins can read payment logs" on public.payment_logs;
create policy "Admins can read payment logs"
on public.payment_logs
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can insert payment logs" on public.payment_logs;
create policy "Admins can insert payment logs"
on public.payment_logs
for insert
to authenticated
with check (public.is_active_admin() or auth.role() = 'service_role');

drop policy if exists "Admins can manage settlements" on public.settlements;
create policy "Admins can manage settlements"
on public.settlements
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Interpreters can read own settlements" on public.settlements;
create policy "Interpreters can read own settlements"
on public.settlements
for select
to authenticated
using (
  interpreter_auth_user_id = auth.uid()
  or exists (
    select 1 from public.interpreters i
    where i.id = settlements.interpreter_id
      and i.auth_user_id = auth.uid()
  )
);

drop policy if exists "Admins can read settlement logs" on public.settlement_logs;
create policy "Admins can read settlement logs"
on public.settlement_logs
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can insert settlement logs" on public.settlement_logs;
create policy "Admins can insert settlement logs"
on public.settlement_logs
for insert
to authenticated
with check (public.is_active_admin() or auth.role() = 'service_role');

drop policy if exists "Admins can manage notifications" on public.notifications;
create policy "Admins can manage notifications"
on public.notifications
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Companies can read own notifications" on public.notifications;
create policy "Companies can read own notifications"
on public.notifications
for select
to authenticated
using (
  recipient_type = 'company'
  and (
    recipient_id = auth.uid()
    or exists (
      select 1 from public.requests r
      where r.id = notifications.related_request_id
        and r.company_auth_user_id = auth.uid()
    )
  )
);

drop policy if exists "Interpreters can read own notifications" on public.notifications;
create policy "Interpreters can read own notifications"
on public.notifications
for select
to authenticated
using (
  recipient_type = 'interpreter'
  and (
    recipient_id = auth.uid()
    or exists (
      select 1 from public.interpreters i
      where i.auth_user_id = auth.uid()
        and i.auth_user_id = notifications.recipient_id
    )
  )
);

drop policy if exists "Admins can manage activity logs" on public.activity_logs;
create policy "Admins can manage activity logs"
on public.activity_logs
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin() or auth.role() = 'service_role');

create or replace function public.touch_operational_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_payments_updated_at on public.payments;
create trigger touch_payments_updated_at
before update on public.payments
for each row
execute function public.touch_operational_updated_at();

drop trigger if exists touch_settlements_updated_at on public.settlements;
create trigger touch_settlements_updated_at
before update on public.settlements
for each row
execute function public.touch_operational_updated_at();

create or replace function public.map_legacy_payment_status(p_status text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(nullif(trim(p_status), ''), 'unpaid'))
    when 'paid' then 'paid'
    when '결제완료' then 'paid'
    when 'invoice_sent' then 'invoice_sent'
    when 'invoice' then 'invoice_sent'
    when 'overdue' then 'overdue'
    when 'refunded' then 'refunded'
    else 'unpaid'
  end;
$$;

create or replace function public.map_legacy_payout_status(p_status text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(nullif(trim(p_status), ''), 'pending'))
    when 'confirmed' then 'confirmed'
    when 'settlement_confirmed' then 'confirmed'
    when '정산확정' then 'confirmed'
    when 'completed' then 'paid'
    when 'settlement_completed' then 'paid'
    when 'paid' then 'paid'
    when 'settled' then 'paid'
    when '정산완료' then 'paid'
    when 'withheld' then 'withheld'
    when 'on_hold' then 'withheld'
    when 'hold' then 'withheld'
    when 'cancelled' then 'cancelled'
    else 'pending'
  end;
$$;

create or replace function public.ensure_payment_for_request(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.requests%rowtype;
  business_id bigint;
  estimate_doc_id uuid;
begin
  select * into request_row
  from public.requests
  where id = p_request_id;

  if not found then
    return;
  end if;

  select b.id into business_id
  from public.businesses b
  where b.auth_user_id = request_row.company_auth_user_id
  limit 1;

  select d.id into estimate_doc_id
  from public.documents d
  where d.request_id = request_row.id
    and d.document_type = 'estimate'
    and d.status = 'issued'
  order by d.version desc, d.created_at desc
  limit 1;

  insert into public.payments (
    request_id,
    company_id,
    company_auth_user_id,
    estimate_document_id,
    amount,
    payment_status,
    paid_at
  )
  values (
    request_row.id,
    business_id,
    request_row.company_auth_user_id,
    estimate_doc_id,
    coalesce(request_row.company_amount, request_row.client_price, request_row.estimated_price, 0),
    public.map_legacy_payment_status(request_row.payment_status),
    case
      when public.map_legacy_payment_status(request_row.payment_status) = 'paid'
      then coalesce(request_row.updated_at, now())
      else null
    end
  )
  on conflict (request_id) do update
  set company_id = coalesce(excluded.company_id, public.payments.company_id),
      company_auth_user_id = coalesce(excluded.company_auth_user_id, public.payments.company_auth_user_id),
      estimate_document_id = coalesce(excluded.estimate_document_id, public.payments.estimate_document_id),
      amount = greatest(coalesce(excluded.amount, 0), coalesce(public.payments.amount, 0)),
      payment_status = excluded.payment_status,
      paid_at = coalesce(public.payments.paid_at, excluded.paid_at);
end;
$$;

create or replace function public.ensure_settlements_for_request(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.requests%rowtype;
  assignment_row record;
  fallback_interpreter_id bigint;
  payout_doc_id uuid;
  work_day_count integer;
  total_amount numeric;
  day_rate numeric;
begin
  select * into request_row
  from public.requests
  where id = p_request_id;

  if not found then
    return;
  end if;

  work_day_count := greatest(coalesce(request_row.settlement_work_days, 1), 1);
  total_amount := coalesce(
    request_row.settlement_final_amount,
    request_row.interpreter_payment,
    request_row.interpreter_price,
    request_row.interpreter_pay,
    0
  );
  day_rate := case when work_day_count > 0 then total_amount / work_day_count else total_amount end;

  for assignment_row in
    select
      ('request_interpreters:' || ri.id::text) as assignment_id,
      ri.interpreter_id,
      i.auth_user_id as interpreter_auth_user_id
    from public.request_interpreters ri
    join public.interpreters i on i.id = ri.interpreter_id
    where ri.request_id = request_row.id
    union
    select
      ('matchings:' || m.id::text) as assignment_id,
      m.interpreter_id,
      i.auth_user_id as interpreter_auth_user_id
    from public.matchings m
    join public.interpreters i on i.id = m.interpreter_id
    where m.request_id = request_row.id
  loop
    select d.id into payout_doc_id
    from public.documents d
    where d.request_id = request_row.id
      and d.interpreter_id = assignment_row.interpreter_id
      and d.document_type = 'payout'
      and d.status = 'issued'
    order by d.version desc, d.created_at desc
    limit 1;

    insert into public.settlements (
      request_id,
      interpreter_id,
      interpreter_auth_user_id,
      assignment_id,
      payout_document_id,
      amount,
      payout_status,
      work_days,
      daily_rate,
      extra_amount,
      deduction_amount,
      paid_at,
      admin_memo
    )
    values (
      request_row.id,
      assignment_row.interpreter_id,
      assignment_row.interpreter_auth_user_id,
      assignment_row.assignment_id,
      payout_doc_id,
      total_amount,
      public.map_legacy_payout_status(request_row.settlement_status),
      work_day_count,
      day_rate,
      coalesce(request_row.settlement_extra_amount, 0),
      coalesce(request_row.settlement_deduction_amount, 0),
      case
        when public.map_legacy_payout_status(request_row.settlement_status) = 'paid'
        then coalesce(request_row.settlement_completed_at, request_row.updated_at, now())
        else null
      end,
      request_row.settlement_memo
    )
    on conflict (request_id, interpreter_id) do update
    set interpreter_auth_user_id = coalesce(excluded.interpreter_auth_user_id, public.settlements.interpreter_auth_user_id),
        assignment_id = coalesce(public.settlements.assignment_id, excluded.assignment_id),
        payout_document_id = coalesce(excluded.payout_document_id, public.settlements.payout_document_id),
        amount = excluded.amount,
        payout_status = excluded.payout_status,
        work_days = excluded.work_days,
        daily_rate = excluded.daily_rate,
        extra_amount = excluded.extra_amount,
        deduction_amount = excluded.deduction_amount,
        paid_at = coalesce(public.settlements.paid_at, excluded.paid_at),
        admin_memo = coalesce(excluded.admin_memo, public.settlements.admin_memo);
  end loop;

  if not exists (select 1 from public.settlements s where s.request_id = request_row.id) then
  fallback_interpreter_id := coalesce(request_row.assigned_interpreter_id, request_row.matched_interpreter_id);
    if fallback_interpreter_id is not null then
      insert into public.settlements (
        request_id,
        interpreter_id,
        interpreter_auth_user_id,
        amount,
        payout_status,
        work_days,
        daily_rate,
        extra_amount,
        deduction_amount,
        admin_memo
      )
      select
        request_row.id,
        i.id,
        i.auth_user_id,
        total_amount,
        public.map_legacy_payout_status(request_row.settlement_status),
        work_day_count,
        day_rate,
        coalesce(request_row.settlement_extra_amount, 0),
        coalesce(request_row.settlement_deduction_amount, 0),
        request_row.settlement_memo
      from public.interpreters i
      where i.id = fallback_interpreter_id
      on conflict (request_id, interpreter_id) do nothing;
    end if;
  end if;
end;
$$;

create or replace function public.log_payment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.payment_status is distinct from old.payment_status then
    insert into public.payment_logs (payment_id, previous_status, new_status, changed_by, memo)
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.payment_status end,
      new.payment_status,
      auth.uid(),
      new.admin_memo
    );

    insert into public.activity_logs (action_type, description, user_id, related_table, related_id)
    values (
      'payment_status_changed',
      '결제 상태가 ' || coalesce(case when tg_op = 'INSERT' then null else old.payment_status end, '-') || '에서 ' || new.payment_status || '(으)로 변경되었습니다.',
      auth.uid(),
      'payments',
      new.id::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists log_payment_status_change on public.payments;
create trigger log_payment_status_change
after insert or update of payment_status on public.payments
for each row
execute function public.log_payment_status_change();

create or replace function public.log_settlement_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.payout_status is distinct from old.payout_status then
    insert into public.settlement_logs (settlement_id, previous_status, new_status, changed_by, memo)
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.payout_status end,
      new.payout_status,
      auth.uid(),
      new.admin_memo
    );

    insert into public.activity_logs (action_type, description, user_id, related_table, related_id)
    values (
      'settlement_status_changed',
      '정산 상태가 ' || coalesce(case when tg_op = 'INSERT' then null else old.payout_status end, '-') || '에서 ' || new.payout_status || '(으)로 변경되었습니다.',
      auth.uid(),
      'settlements',
      new.id::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists log_settlement_status_change on public.settlements;
create trigger log_settlement_status_change
after insert or update of payout_status on public.settlements
for each row
execute function public.log_settlement_status_change();

create or replace function public.sync_operational_tables_from_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
    or new.estimate_status is distinct from old.estimate_status
    or new.payment_status is distinct from old.payment_status
    or new.company_amount is distinct from old.company_amount
    or new.client_price is distinct from old.client_price
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

drop trigger if exists sync_operational_tables_from_request on public.requests;
create trigger sync_operational_tables_from_request
after insert or update on public.requests
for each row
execute function public.sync_operational_tables_from_request();

create or replace function public.sync_settlements_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.requests r
    where r.id = new.request_id
      and (
        coalesce(r.operation_status, '') in ('completed', 'operation_completed', 'done', '업무완료', '운영완료')
        or coalesce(r.settlement_status, '') in ('pending', 'confirmed', 'completed', 'on_hold', 'settlement_pending', 'settlement_confirmed', 'settlement_completed', '정산대기', '정산확정', '정산완료')
      )
  ) then
    perform public.ensure_settlements_for_request(new.request_id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_settlements_from_request_interpreters on public.request_interpreters;
create trigger sync_settlements_from_request_interpreters
after insert on public.request_interpreters
for each row
execute function public.sync_settlements_from_assignment();

create or replace function public.create_operational_notification(
  p_recipient_type text,
  p_recipient_id uuid,
  p_recipient_email text,
  p_recipient_phone text,
  p_notification_type text,
  p_title text,
  p_message text,
  p_related_request_id bigint default null,
  p_related_document_id uuid default null,
  p_channel text default 'internal'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
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
    status
  )
  values (
    p_recipient_type,
    p_recipient_id,
    p_recipient_email,
    p_recipient_phone,
    p_notification_type,
    p_title,
    p_message,
    p_related_request_id,
    p_related_document_id,
    p_channel,
    'pending'
  );
end;
$$;

create or replace function public.mirror_notification_event_to_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
  request_id bigint;
  mapped_status text;
  notification_title text;
  notification_message text;
begin
  payload := coalesce(new.payload, '{}'::jsonb);
  request_id := nullif(coalesce(payload->>'request_id', new.target_id), '')::bigint;
  mapped_status := case new.status when 'sent' then 'sent' when 'failed' then 'failed' else 'pending' end;
  notification_title := coalesce(payload->>'title', new.event_type, 'ON-LI 알림');
  notification_message := coalesce(payload->>'message', payload->>'memo', payload->>'event_name', new.event_type, '');

  insert into public.notifications (
    recipient_type,
    recipient_email,
    recipient_phone,
    notification_type,
    title,
    message,
    related_request_id,
    channel,
    status,
    sent_at,
    error_message,
    created_at
  )
  values (
    case when new.recipient_type in ('company', 'interpreter', 'admin') then new.recipient_type else 'admin' end,
    new.recipient_email,
    new.recipient_phone,
    new.event_type,
    notification_title,
    notification_message,
    case when new.target_type = 'request' then request_id else null end,
    'internal',
    mapped_status,
    new.sent_at,
    new.error_message,
    new.created_at
  );

  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists mirror_notification_event_to_notifications on public.notification_events;
create trigger mirror_notification_event_to_notifications
after insert on public.notification_events
for each row
execute function public.mirror_notification_event_to_notifications();

insert into public.payments (
  request_id,
  company_id,
  company_auth_user_id,
  estimate_document_id,
  amount,
  payment_status,
  paid_at,
  created_at,
  updated_at
)
select
  r.id,
  b.id,
  r.company_auth_user_id,
  d.id,
  coalesce(r.company_amount, r.client_price, r.estimated_price, 0),
  public.map_legacy_payment_status(r.payment_status),
  case
    when public.map_legacy_payment_status(r.payment_status) = 'paid'
    then coalesce(r.updated_at, now())
    else null
  end,
  coalesce(r.created_at, now()),
  coalesce(r.updated_at, now())
from public.requests r
left join public.businesses b on b.auth_user_id = r.company_auth_user_id
left join lateral (
  select id
  from public.documents d
  where d.request_id = r.id
    and d.document_type = 'estimate'
    and d.status = 'issued'
  order by d.version desc, d.created_at desc
  limit 1
) d on true
where coalesce(r.estimate_status, '') in ('estimate_approved', 'company_approved')
   or public.map_legacy_payment_status(r.payment_status) <> 'unpaid'
   or coalesce(r.company_amount, r.client_price, 0) > 0
on conflict (request_id) do update
set company_id = coalesce(excluded.company_id, public.payments.company_id),
    company_auth_user_id = coalesce(excluded.company_auth_user_id, public.payments.company_auth_user_id),
    estimate_document_id = coalesce(excluded.estimate_document_id, public.payments.estimate_document_id),
    amount = greatest(coalesce(excluded.amount, 0), coalesce(public.payments.amount, 0)),
    payment_status = excluded.payment_status,
    paid_at = coalesce(public.payments.paid_at, excluded.paid_at),
    updated_at = now();

insert into public.settlements (
  request_id,
  interpreter_id,
  interpreter_auth_user_id,
  assignment_id,
  payout_document_id,
  amount,
  payout_status,
  work_days,
  daily_rate,
  extra_amount,
  deduction_amount,
  paid_at,
  admin_memo,
  created_at,
  updated_at
)
select
  r.id,
  source.interpreter_id,
  i.auth_user_id,
  source.assignment_id,
  d.id,
  coalesce(r.settlement_final_amount, r.interpreter_payment, r.interpreter_price, r.interpreter_pay, 0),
  public.map_legacy_payout_status(r.settlement_status),
  greatest(coalesce(r.settlement_work_days, 1), 1),
  coalesce(r.settlement_base_amount, r.interpreter_payment, r.interpreter_price, r.interpreter_pay, 0) / greatest(coalesce(r.settlement_work_days, 1), 1),
  coalesce(r.settlement_extra_amount, 0),
  coalesce(r.settlement_deduction_amount, 0),
  case
    when public.map_legacy_payout_status(r.settlement_status) = 'paid'
    then coalesce(r.settlement_completed_at, r.updated_at, now())
    else null
  end,
  r.settlement_memo,
  coalesce(r.created_at, now()),
  coalesce(r.updated_at, now())
from public.requests r
join lateral (
  select distinct on (assignment_source.interpreter_id)
    assignment_source.assignment_id,
    assignment_source.interpreter_id
  from (
    select
      ('request_interpreters:' || ri.id::text) as assignment_id,
      ri.interpreter_id,
      1 as source_priority
    from public.request_interpreters ri
    where ri.request_id = r.id
    union all
    select
      ('matchings:' || m.id::text) as assignment_id,
      m.interpreter_id,
      2 as source_priority
    from public.matchings m
    where m.request_id = r.id
  ) assignment_source
  order by assignment_source.interpreter_id, assignment_source.source_priority
) source on true
join public.interpreters i on i.id = source.interpreter_id
left join lateral (
  select id
  from public.documents d
  where d.request_id = r.id
    and d.interpreter_id = source.interpreter_id
    and d.document_type = 'payout'
    and d.status = 'issued'
  order by d.version desc, d.created_at desc
  limit 1
) d on true
where coalesce(r.operation_status, '') in ('completed', 'operation_completed', 'done', '업무완료', '운영완료')
   or coalesce(r.settlement_status, '') in ('pending', 'confirmed', 'completed', 'on_hold', 'settlement_pending', 'settlement_confirmed', 'settlement_completed', '정산대기', '정산확정', '정산완료')
on conflict (request_id, interpreter_id) do update
set interpreter_auth_user_id = coalesce(excluded.interpreter_auth_user_id, public.settlements.interpreter_auth_user_id),
    assignment_id = coalesce(public.settlements.assignment_id, excluded.assignment_id),
    payout_document_id = coalesce(excluded.payout_document_id, public.settlements.payout_document_id),
    amount = excluded.amount,
    payout_status = excluded.payout_status,
    work_days = excluded.work_days,
    daily_rate = excluded.daily_rate,
    extra_amount = excluded.extra_amount,
    deduction_amount = excluded.deduction_amount,
    paid_at = coalesce(public.settlements.paid_at, excluded.paid_at),
    admin_memo = coalesce(excluded.admin_memo, public.settlements.admin_memo),
    updated_at = now();

update public.requests r
set settlement_status = 'pending'
where coalesce(r.settlement_status, '') in ('', 'unsettled', 'not_required')
  and coalesce(r.operation_status, '') in ('completed', 'operation_completed', 'done', '업무완료', '운영완료')
  and exists (
    select 1 from public.settlements s
    where s.request_id = r.id
      and s.payout_status = 'pending'
  );

insert into public.notifications (
  recipient_type,
  recipient_email,
  recipient_phone,
  notification_type,
  title,
  message,
  related_request_id,
  channel,
  status,
  sent_at,
  error_message,
  created_at
)
select
  case when ne.recipient_type in ('company', 'interpreter', 'admin') then ne.recipient_type else 'admin' end,
  ne.recipient_email,
  ne.recipient_phone,
  ne.event_type,
  coalesce(ne.payload->>'title', ne.event_type, 'ON-LI 알림'),
  coalesce(ne.payload->>'message', ne.payload->>'memo', ne.payload->>'event_name', ne.event_type, ''),
  case
    when ne.target_type = 'request' and ne.target_id ~ '^[0-9]+$' then ne.target_id::bigint
    when (ne.payload->>'request_id') ~ '^[0-9]+$' then (ne.payload->>'request_id')::bigint
    else null
  end,
  'internal',
  case ne.status when 'sent' then 'sent' when 'failed' then 'failed' else 'pending' end,
  ne.sent_at,
  ne.error_message,
  ne.created_at
from public.notification_events ne
where not exists (
  select 1 from public.notifications n
  where n.notification_type = ne.event_type
    and n.created_at = ne.created_at
    and coalesce(n.recipient_email, '') = coalesce(ne.recipient_email, '')
);

insert into public.activity_logs (action_type, description, user_id, related_table, related_id, created_at)
select
  action_type,
  coalesce(
    target_type || ' ' || target_id || ' 변경',
    '운영 변경'
  ),
  actor_user_id,
  target_type,
  target_id,
  created_at
from public.admin_activity_logs aal
where not exists (
  select 1 from public.activity_logs al
  where al.related_table = aal.target_type
    and al.related_id = aal.target_id
    and al.action_type = aal.action_type
    and al.created_at = aal.created_at
);

drop policy if exists "Allow request materials storage inserts" on storage.objects;
create policy "Allow request materials storage inserts"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'request-files'
  and exists (
    select 1
    from public.requests r
    where name like ('requests/reference_files/materials/' || r.id::text || '/%')
      and (
        r.company_auth_user_id = auth.uid()
        or public.is_active_admin()
      )
  )
);

drop policy if exists "Admins can read all generated document rows" on public.documents;
create policy "Admins can read all generated document rows"
on public.documents
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Companies can read own documents by company id" on public.documents;
create policy "Companies can read own documents by company id"
on public.documents
for select
to authenticated
using (
  document_type in ('estimate', 'completion', 'confirmation')
  and (
    company_auth_user_id = auth.uid()
    or exists (
      select 1 from public.businesses b
      where b.id = documents.company_id
        and b.auth_user_id = auth.uid()
    )
  )
);

drop policy if exists "Interpreters can read own payout documents by interpreter id" on public.documents;
create policy "Interpreters can read own payout documents by interpreter id"
on public.documents
for select
to authenticated
using (
  document_type = 'payout'
  and (
    interpreter_auth_user_id = auth.uid()
    or exists (
      select 1 from public.interpreters i
      where i.id = documents.interpreter_id
        and i.auth_user_id = auth.uid()
    )
  )
);

notify pgrst, 'reload schema';
