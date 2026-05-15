alter table public.requests
add column if not exists company_amount bigint not null default 0;

alter table public.requests
add column if not exists interpreter_payment bigint not null default 0;

alter table public.requests
add column if not exists platform_profit bigint not null default 0;

alter table public.requests
add column if not exists payment_status text not null default 'unpaid';

alter table public.requests
add column if not exists settlement_status text not null default 'unsettled';

update public.requests
set company_amount = case
      when coalesce(company_amount, 0) = 0 then coalesce(client_price, 0)
      else company_amount
    end,
    interpreter_payment = case
      when coalesce(interpreter_payment, 0) = 0 then coalesce(interpreter_price, 0)
      else interpreter_payment
    end,
    payment_status = coalesce(nullif(payment_status, ''), 'unpaid'),
    settlement_status = coalesce(nullif(settlement_status, ''), 'unsettled');

update public.requests
set platform_profit = coalesce(company_amount, 0) - coalesce(interpreter_payment, 0),
    client_price = coalesce(company_amount, 0),
    interpreter_price = coalesce(interpreter_payment, 0),
    profit = coalesce(company_amount, 0) - coalesce(interpreter_payment, 0);

create index if not exists requests_payment_status_idx
on public.requests(payment_status);

create index if not exists requests_settlement_status_idx
on public.requests(settlement_status);
