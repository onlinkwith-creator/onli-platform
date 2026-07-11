alter table public.requests add column if not exists company_id bigint;

select set_config('request.jwt.claim.role', 'service_role', true);

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.requests'::regclass
      and conname = 'requests_company_id_fkey'
  ) then
    alter table public.requests add constraint requests_company_id_fkey
    foreign key (company_id) references public.businesses(id)
    on update cascade on delete restrict;
  end if;
end $$;

update public.requests r
set company_id = b.id
from public.businesses b
where r.company_id is null
  and r.company_auth_user_id = b.auth_user_id;

create or replace function public.set_request_company_id_from_business()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is null and new.company_auth_user_id is not null then
    select b.id into new.company_id from public.businesses b
    where b.auth_user_id = new.company_auth_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_request_company_id_from_business on public.requests;
create trigger set_request_company_id_from_business
before insert or update of company_auth_user_id, company_id on public.requests
for each row execute function public.set_request_company_id_from_business();

notify pgrst, 'reload schema';
