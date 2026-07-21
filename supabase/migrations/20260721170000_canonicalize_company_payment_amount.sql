begin;

-- requests.company_amount is the single source of truth for the amount billed
-- to a company. Keep the denormalized payments.amount value synchronized for
-- status/due-date workflows and for existing API consumers.
create or replace function public.set_payment_amount_from_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_amount numeric;
begin
  select company_amount
  into v_company_amount
  from public.requests
  where id = new.request_id;

  if not found then
    raise exception using errcode = '23503', message = '의뢰 정보를 찾을 수 없습니다.';
  end if;

  new.amount := coalesce(v_company_amount, 0);
  return new;
end;
$$;

drop trigger if exists set_payment_amount_from_request on public.payments;
create trigger set_payment_amount_from_request
before insert or update of request_id, amount on public.payments
for each row
execute function public.set_payment_amount_from_request();

update public.payments p
set amount = coalesce(r.company_amount, 0),
    updated_at = now()
from public.requests r
where r.id = p.request_id
  and p.amount is distinct from coalesce(r.company_amount, 0);

commit;
notify pgrst, 'reload schema';
