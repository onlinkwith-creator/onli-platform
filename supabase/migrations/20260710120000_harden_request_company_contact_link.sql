-- Harden the company contact path for interpreter work preparation.
-- Canonical relation: request_interpreters.request_id -> requests.company_id -> businesses.id.

alter table public.requests
add column if not exists company_id bigint references public.businesses(id) on delete set null,
add column if not exists contact_revealed boolean not null default false,
add column if not exists contact_revealed_at timestamptz,
add column if not exists contact_revealed_by uuid references auth.users(id) on delete set null;

alter table public.request_interpreters
add column if not exists contact_visible boolean not null default false,
add column if not exists is_contact_visible boolean not null default false,
add column if not exists contact_revealed boolean not null default false,
add column if not exists contact_revealed_at timestamptz,
add column if not exists contact_revealed_by uuid references auth.users(id) on delete set null;

create index if not exists requests_company_id_idx
on public.requests(company_id);

create index if not exists requests_company_auth_user_id_idx
on public.requests(company_auth_user_id);

with business_candidates as (
  select id as business_id, nullif(auth_user_id::text, '') as owner_user_id
  from public.businesses
  where auth_user_id is not null
  union all
  select id as business_id, nullif(to_jsonb(public.businesses)->>'user_id', '') as owner_user_id
  from public.businesses
  where nullif(to_jsonb(public.businesses)->>'user_id', '') is not null
),
unique_business_by_owner as (
  select owner_user_id, min(business_id) as business_id
  from business_candidates
  where owner_user_id is not null
  group by owner_user_id
  having count(distinct business_id) = 1
),
request_candidates as (
  select id as request_id, nullif(company_auth_user_id::text, '') as owner_user_id
  from public.requests
  where company_id is null and company_auth_user_id is not null
  union all
  select id as request_id, nullif(to_jsonb(public.requests)->>'user_id', '') as owner_user_id
  from public.requests
  where company_id is null and nullif(to_jsonb(public.requests)->>'user_id', '') is not null
  union all
  select id as request_id, nullif(to_jsonb(public.requests)->>'created_by', '') as owner_user_id
  from public.requests
  where company_id is null and nullif(to_jsonb(public.requests)->>'created_by', '') is not null
),
unique_request_match as (
  select rc.request_id, min(ubo.business_id) as business_id
  from request_candidates rc
  join unique_business_by_owner ubo
    on ubo.owner_user_id = rc.owner_user_id
  group by rc.request_id
  having count(distinct ubo.business_id) = 1
)
update public.requests r
set company_id = matched.business_id
from unique_request_match matched
where r.company_id is null
  and r.id = matched.request_id;

update public.requests r
set contact_revealed = true,
    contact_revealed_at = coalesce(r.contact_revealed_at, ri.visible_at, now()),
    contact_revealed_by = coalesce(r.contact_revealed_by, ri.visible_by)
from (
  select
    request_id,
    min(contact_revealed_at) filter (where contact_revealed_at is not null) as visible_at,
    (array_agg(contact_revealed_by) filter (where contact_revealed_by is not null))[1] as visible_by
  from public.request_interpreters
  where coalesce(contact_visible, false)
     or coalesce(is_contact_visible, false)
     or coalesce(contact_revealed, false)
  group by request_id
) ri
where r.id = ri.request_id
  and coalesce(r.contact_revealed, false) = false;

update public.request_interpreters ri
set contact_visible = coalesce(r.contact_revealed, false),
    is_contact_visible = coalesce(r.contact_revealed, false),
    contact_revealed = coalesce(r.contact_revealed, false),
    contact_revealed_at = r.contact_revealed_at,
    contact_revealed_by = r.contact_revealed_by
from public.requests r
where r.id = ri.request_id
  and (
    ri.contact_visible is distinct from coalesce(r.contact_revealed, false)
    or ri.is_contact_visible is distinct from coalesce(r.contact_revealed, false)
    or ri.contact_revealed is distinct from coalesce(r.contact_revealed, false)
    or ri.contact_revealed_at is distinct from r.contact_revealed_at
    or ri.contact_revealed_by is distinct from r.contact_revealed_by
  );

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

create or replace function public.sync_request_contact_revealed_to_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contact_revealed is distinct from old.contact_revealed
    or new.contact_revealed_at is distinct from old.contact_revealed_at
    or new.contact_revealed_by is distinct from old.contact_revealed_by
  then
    update public.request_interpreters
    set contact_visible = coalesce(new.contact_revealed, false),
        is_contact_visible = coalesce(new.contact_revealed, false),
        contact_revealed = coalesce(new.contact_revealed, false),
        contact_revealed_at = new.contact_revealed_at,
        contact_revealed_by = new.contact_revealed_by
    where request_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_request_contact_revealed_to_assignments on public.requests;
create trigger sync_request_contact_revealed_to_assignments
after update of contact_revealed, contact_revealed_at, contact_revealed_by on public.requests
for each row
execute function public.sync_request_contact_revealed_to_assignments();

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
      and coalesce(r.contact_revealed, ri.is_contact_visible, ri.contact_visible, ri.contact_revealed, false)
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
      coalesce(r.contact_revealed, ri.is_contact_visible, ri.contact_visible, ri.contact_revealed, false) as is_contact_visible
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
