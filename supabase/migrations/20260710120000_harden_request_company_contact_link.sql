-- Harden the company contact path for interpreter work preparation.
-- Canonical relation: request_interpreters.request_id -> requests.company_id -> businesses.id.

alter table public.requests
add column if not exists company_id bigint references public.businesses(id) on delete set null;

create index if not exists requests_company_id_idx
on public.requests(company_id);

create index if not exists requests_company_auth_user_id_idx
on public.requests(company_auth_user_id);

with unique_business_by_auth as (
  select
    auth_user_id,
    min(id) as business_id
  from public.businesses
  where auth_user_id is not null
  group by auth_user_id
  having count(*) = 1
)
update public.requests r
set company_id = matched.business_id
from unique_business_by_auth matched
where r.company_id is null
  and r.company_auth_user_id is not null
  and matched.auth_user_id = r.company_auth_user_id;

create or replace function public.set_request_company_id_from_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_business_id bigint;
begin
  if new.company_id is null and new.company_auth_user_id is not null then
    select min(b.id)
    into matched_business_id
    from public.businesses b
    where b.auth_user_id = new.company_auth_user_id
    group by b.auth_user_id
    having count(*) = 1;

    new.company_id := matched_business_id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_request_company_id_from_business on public.requests;
create trigger set_request_company_id_from_business
before insert or update of company_auth_user_id, company_id on public.requests
for each row
execute function public.set_request_company_id_from_business();

drop policy if exists "assigned_interpreters_can_read_company_contact" on public.businesses;
create policy "assigned_interpreters_can_read_company_contact"
on public.businesses
for select
to authenticated
using (
  exists (
    select 1
    from public.requests r
    join public.request_interpreters ri
      on ri.request_id = r.id
    join public.interpreters i
      on i.id = ri.interpreter_id
    where r.company_id = businesses.id
      and i.auth_user_id = auth.uid()
      and coalesce(ri.is_contact_visible, ri.contact_visible, ri.contact_revealed, false)
  )
);

create or replace function public.get_assigned_request_company_contact(p_request_id bigint)
returns table (
  request_id bigint,
  company_id bigint,
  is_contact_visible boolean,
  company_name text,
  contact_name text,
  contact_phone text,
  contact_email text,
  kakao_id text
)
language sql
security definer
stable
set search_path = public
as $$
  with assigned_request as (
    select
      r.id as request_id,
      r.company_id,
      r.company_auth_user_id,
      r.company_name,
      coalesce(ri.is_contact_visible, ri.contact_visible, ri.contact_revealed, false) as is_contact_visible
    from public.requests r
    join public.request_interpreters ri
      on ri.request_id = r.id
    join public.interpreters i
      on i.id = ri.interpreter_id
    where r.id = p_request_id
      and auth.uid() is not null
      and (
        public.is_admin()
        or i.auth_user_id = auth.uid()
      )
    order by ri.assigned_at desc nulls last
    limit 1
  )
  select
    ar.request_id,
    b.id as company_id,
    ar.is_contact_visible,
    coalesce(nullif(b.company_name, ''), nullif(ar.company_name, '')) as company_name,
    case when ar.is_contact_visible then nullif(b.contact_name, '') end as contact_name,
    case when ar.is_contact_visible then nullif(b.contact_phone, '') end as contact_phone,
    case when ar.is_contact_visible then nullif(b.contact_email, '') end as contact_email,
    case when ar.is_contact_visible then nullif(b.kakao_id, '') end as kakao_id
  from assigned_request ar
  left join lateral (
    select biz.*
    from public.businesses biz
    where biz.id = ar.company_id
       or (
        ar.company_id is null
        and ar.company_auth_user_id is not null
        and biz.auth_user_id = ar.company_auth_user_id
      )
    order by case when biz.id = ar.company_id then 1 else 2 end
    limit 1
  ) b on true;
$$;

revoke all on function public.get_assigned_request_company_contact(bigint) from public;
revoke all on function public.get_assigned_request_company_contact(bigint) from anon;
grant execute on function public.get_assigned_request_company_contact(bigint) to authenticated;

notify pgrst, 'reload schema';
