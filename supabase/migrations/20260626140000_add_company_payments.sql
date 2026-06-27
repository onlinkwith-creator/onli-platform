-- ON-LI company payment management for approved estimates.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  request_id bigint not null references public.requests(id) on delete cascade,
  company_id bigint references public.businesses(id) on delete set null,
  estimate_document_id uuid references public.documents(id) on delete set null,
  amount numeric not null default 0,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'invoice_sent', 'paid', 'overdue', 'refunded')),
  payment_method text
    check (payment_method is null or payment_method in ('bank_transfer', 'cash', 'other')),
  paid_at timestamptz,
  due_date date,
  admin_memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payments_request_key
on public.payments(request_id);

create index if not exists payments_company_idx
on public.payments(company_id, created_at desc);

create index if not exists payments_status_idx
on public.payments(payment_status, due_date, created_at desc);

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

alter table public.payments enable row level security;
alter table public.payment_logs enable row level security;

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

drop policy if exists payment_logs_company_select_own on public.payment_logs;
create policy payment_logs_company_select_own
on public.payment_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.payments p
    join public.businesses b on b.id = p.company_id
    where p.id = payment_logs.payment_id
      and b.auth_user_id = auth.uid()
  )
);

drop policy if exists notification_events_company_payment_select on public.notification_events;
create policy notification_events_company_payment_select
on public.notification_events
for select
to authenticated
using (
  recipient_type = 'company'
  and target_type = 'payment'
  and exists (
    select 1
    from public.payments p
    join public.businesses b on b.id = p.company_id
    where p.id::text = notification_events.target_id
      and b.auth_user_id = auth.uid()
  )
);

create or replace function public.touch_payments_updated_at()
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
execute function public.touch_payments_updated_at();

create or replace function public.create_payment_for_approved_estimate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  business_id bigint;
  estimate_record record;
begin
  if new.estimate_status not in ('estimate_approved', 'company_approved')
    or coalesce(old.estimate_status, '') = coalesce(new.estimate_status, '') then
    return new;
  end if;

  select id
  into business_id
  from public.businesses
  where auth_user_id = new.company_auth_user_id
  limit 1;

  select id, amount
  into estimate_record
  from public.documents
  where request_id = new.id
    and document_type = 'estimate'
    and status = 'issued'
  order by version desc, created_at desc
  limit 1;

  insert into public.payments (
    request_id,
    company_id,
    estimate_document_id,
    amount,
    payment_status
  )
  values (
    new.id,
    business_id,
    estimate_record.id,
    coalesce(
      estimate_record.amount,
      nullif(to_jsonb(new)->>'company_amount', '')::numeric,
      nullif(to_jsonb(new)->>'client_price', '')::numeric,
      nullif(to_jsonb(new)->>'price', '')::numeric,
      0
    ),
    'unpaid'
  )
  on conflict (request_id) do update
  set
    company_id = coalesce(public.payments.company_id, excluded.company_id),
    estimate_document_id = coalesce(public.payments.estimate_document_id, excluded.estimate_document_id),
    amount = case
      when public.payments.amount is null or public.payments.amount = 0 then excluded.amount
      else public.payments.amount
    end;

  return new;
end;
$$;

drop trigger if exists create_payment_for_approved_estimate on public.requests;
create trigger create_payment_for_approved_estimate
after update on public.requests
for each row
execute function public.create_payment_for_approved_estimate();

insert into public.payments (
  request_id,
  company_id,
  estimate_document_id,
  amount,
  payment_status
)
select
  r.id,
  b.id,
  d.id,
  coalesce(
    d.amount,
    nullif(to_jsonb(r)->>'company_amount', '')::numeric,
    nullif(to_jsonb(r)->>'client_price', '')::numeric,
    nullif(to_jsonb(r)->>'price', '')::numeric,
    0
  ),
  'unpaid'
from public.requests r
left join public.businesses b on b.auth_user_id = r.company_auth_user_id
left join lateral (
  select id, amount
  from public.documents
  where request_id = r.id
    and document_type = 'estimate'
    and status = 'issued'
  order by version desc, created_at desc
  limit 1
) d on true
where to_jsonb(r)->>'estimate_status' in ('estimate_approved', 'company_approved')
on conflict (request_id) do nothing;

create or replace function public.log_payment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record record;
  company_email text;
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

  select *
  into request_record
  from public.requests
  where id = new.request_id;

  company_email := coalesce(
    to_jsonb(request_record)->>'email',
    to_jsonb(request_record)->>'contact_email',
    to_jsonb(request_record)->>'contact_email_or_phone'
  );

  if (company_email is null or company_email = '') and new.company_id is not null then
    select contact_email
    into company_email
    from public.businesses
    where id = new.company_id;
  end if;

  if new.payment_status = 'invoice_sent' and company_email is not null and company_email <> '' then
    perform public.enqueue_notification_event_v2(
      'company_payment_invoice_sent',
      'payment',
      new.id::text,
      'company',
      company_email,
      null,
      jsonb_build_object(
        'payment_id', new.id,
        'request_id', new.request_id,
        'request_no', to_jsonb(request_record)->>'request_no',
        'company_name', to_jsonb(request_record)->>'company_name',
        'event_name', to_jsonb(request_record)->>'event_name',
        'amount', new.amount,
        'due_date', new.due_date
      ),
      'email',
      '입금 안내',
      '입금 안내가 발송되었습니다.'
    );
  elsif new.payment_status = 'paid' and company_email is not null and company_email <> '' then
    perform public.enqueue_notification_event_v2(
      'company_payment_paid',
      'payment',
      new.id::text,
      'company',
      company_email,
      null,
      jsonb_build_object(
        'payment_id', new.id,
        'request_id', new.request_id,
        'request_no', to_jsonb(request_record)->>'request_no',
        'company_name', to_jsonb(request_record)->>'company_name',
        'event_name', to_jsonb(request_record)->>'event_name',
        'amount', new.amount,
        'paid_at', new.paid_at
      ),
      'email',
      '입금 확인',
      '입금이 확인되었습니다.'
    );
  elsif new.payment_status = 'overdue' then
    if company_email is not null and company_email <> '' then
      perform public.enqueue_notification_event_v2(
        'company_payment_overdue',
        'payment',
        new.id::text,
        'company',
        company_email,
        null,
        jsonb_build_object(
          'payment_id', new.id,
          'request_id', new.request_id,
          'request_no', to_jsonb(request_record)->>'request_no',
          'company_name', to_jsonb(request_record)->>'company_name',
          'event_name', to_jsonb(request_record)->>'event_name',
          'amount', new.amount,
          'due_date', new.due_date
        ),
        'email',
        '입금 기한 초과',
        '입금 기한이 지났습니다.'
      );
    end if;

    perform public.enqueue_notification_event_v2(
      'admin_payment_overdue',
      'payment',
      new.id::text,
      'admin',
      null,
      null,
      jsonb_build_object(
        'payment_id', new.id,
        'request_id', new.request_id,
        'request_no', to_jsonb(request_record)->>'request_no',
        'company_name', to_jsonb(request_record)->>'company_name',
        'event_name', to_jsonb(request_record)->>'event_name',
        'amount', new.amount,
        'due_date', new.due_date
      ),
      'email',
      '결제 연체 확인 필요',
      '연체 상태의 결제 건을 확인해주세요.'
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

revoke all on public.payments from anon;
revoke all on public.payment_logs from anon;

notify pgrst, 'reload schema';
