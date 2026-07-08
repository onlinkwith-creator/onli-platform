-- Read interpreter preparation company contact only through:
-- assignment row -> request_id -> requests.company_id -> businesses.id.

alter table public.requests
add column if not exists company_id bigint references public.businesses(id) on delete set null;

create index if not exists requests_company_id_idx
on public.requests(company_id);

update public.requests r
set company_id = b.id
from public.businesses b
where r.company_id is null
  and r.company_auth_user_id is not null
  and b.auth_user_id = r.company_auth_user_id;

create or replace function public.set_request_company_id_from_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null and new.company_auth_user_id is not null then
    select b.id
    into new.company_id
    from public.businesses b
    where b.auth_user_id = new.company_auth_user_id
    limit 1;
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
  )
  or exists (
    select 1
    from public.requests r
    join public.matchings m
      on m.request_id = r.id
    join public.interpreters i
      on i.id = m.interpreter_id
    where r.company_id = businesses.id
      and i.auth_user_id = auth.uid()
      and m.status in ('assigned', 'confirmed', 'in_progress', 'completed', 'settlement_pending', 'settled')
  )
);

drop function if exists public.get_my_assignments();
create or replace function public.get_my_assignments()
returns table (
  assignment_id text,
  assignment_code text,
  public_status text,
  assigned_at timestamptz,
  job_id uuid,
  request_id bigint,
  company_id bigint,
  assignment_status text,
  public_job_code text,
  title text,
  event_name text,
  work_date text,
  start_date date,
  end_date date,
  location text,
  language_pair text,
  level_required text,
  field text,
  number_of_interpreters integer,
  request_assignment_status text,
  is_contact_visible boolean,
  is_company_contact_readable boolean,
  company_name text,
  company_contact_name text,
  company_contact_phone text,
  company_contact_email text,
  company_contact_messenger text,
  reference_file_name text,
  reference_file_path text,
  reference_file_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.id::text as assignment_id,
    m.matching_no as assignment_code,
    m.status as public_status,
    m.created_at as assigned_at,
    m.job_id,
    m.request_id,
    r.company_id,
    case
      when m.status in ('assigned', 'confirmed', 'in_progress', 'completed', 'settlement_pending', 'settled')
        then 'assigned'
      else coalesce(m.status, 'draft')
    end as assignment_status,
    coalesce(j.job_no, r.request_no) as public_job_code,
    coalesce(j.title, r.event_name, '배정된 통역') as title,
    coalesce(j.event_name, r.event_name, j.title) as event_name,
    coalesce(j.date, r.event_date::text) as work_date,
    coalesce(
      m.start_date,
      j.start_date,
      r.start_date,
      case when j.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(j.event_date::text, 10)::date end,
      case when r.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.event_date::text, 10)::date end
    ) as start_date,
    coalesce(
      m.end_date,
      j.end_date,
      r.end_date,
      case when j.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(j.event_date::text, 10)::date end,
      case when r.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.event_date::text, 10)::date end
    ) as end_date,
    coalesce(j.event_location, j.location, r.event_location) as location,
    j.language as language_pair,
    coalesce(j.requested_level, j.level, r.requested_level) as level_required,
    coalesce(j.field, r.interpretation_field) as field,
    coalesce(j.people_count, r.requested_people_count, r.required_count) as number_of_interpreters,
    coalesce(r.assignment_status, 'assigned') as request_assignment_status,
    coalesce((
      select coalesce(ri.is_contact_visible, ri.contact_visible, false)
      from public.request_interpreters ri
      where ri.request_id = m.request_id
        and ri.interpreter_id = m.interpreter_id
      order by ri.assigned_at desc nulls last
      limit 1
    ), false) as is_contact_visible,
    (r.company_id is not null and b.id is not null) as is_company_contact_readable,
    nullif(b.company_name, '') as company_name,
    nullif(b.contact_name, '') as company_contact_name,
    nullif(b.contact_phone, '') as company_contact_phone,
    nullif(b.contact_email, '') as company_contact_email,
    coalesce(
      nullif(to_jsonb(r)->>'kakao_or_line', ''),
      nullif(to_jsonb(r)->>'kakao_id', ''),
      nullif(to_jsonb(r)->>'messenger_contact', ''),
      nullif(to_jsonb(r)->>'kakao_talk_id', ''),
      nullif(to_jsonb(r)->>'kakao', ''),
      nullif(to_jsonb(r)->>'line_id', '')
    ) as company_contact_messenger,
    nullif(to_jsonb(r)->>'reference_file_name', '') as reference_file_name,
    nullif(to_jsonb(r)->>'reference_file_path', '') as reference_file_path,
    nullif(to_jsonb(r)->>'reference_file_url', '') as reference_file_url
  from public.matchings m
  join public.interpreters i
    on i.id = m.interpreter_id
  left join public.jobs j
    on j.id = m.job_id
  left join public.requests r
    on r.id = m.request_id
  left join public.businesses b
    on b.id = r.company_id
  where
    auth.uid() is not null
    and (
      public.is_admin()
      or i.auth_user_id = auth.uid()
    )

  union all

  select
    ('request-interpreter-' || ri.id)::text as assignment_id,
    null::text as assignment_code,
    'assigned'::text as public_status,
    ri.assigned_at as assigned_at,
    r.job_id,
    ri.request_id,
    r.company_id,
    'assigned'::text as assignment_status,
    coalesce(j.job_no, r.request_no) as public_job_code,
    coalesce(j.title, r.event_name, '배정된 통역') as title,
    coalesce(j.event_name, r.event_name, j.title) as event_name,
    coalesce(j.date, r.event_date::text) as work_date,
    coalesce(
      j.start_date,
      r.start_date,
      case when j.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(j.event_date::text, 10)::date end,
      case when r.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.event_date::text, 10)::date end
    ) as start_date,
    coalesce(
      j.end_date,
      r.end_date,
      case when j.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(j.event_date::text, 10)::date end,
      case when r.event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.event_date::text, 10)::date end
    ) as end_date,
    coalesce(j.event_location, j.location, r.event_location) as location,
    j.language as language_pair,
    coalesce(j.requested_level, j.level, r.requested_level) as level_required,
    coalesce(j.field, r.interpretation_field) as field,
    coalesce(j.people_count, r.requested_people_count, r.required_count) as number_of_interpreters,
    coalesce(r.assignment_status, 'assigned') as request_assignment_status,
    coalesce(ri.is_contact_visible, ri.contact_visible, false) as is_contact_visible,
    (r.company_id is not null and b.id is not null) as is_company_contact_readable,
    nullif(b.company_name, '') as company_name,
    nullif(b.contact_name, '') as company_contact_name,
    nullif(b.contact_phone, '') as company_contact_phone,
    nullif(b.contact_email, '') as company_contact_email,
    coalesce(
      nullif(to_jsonb(r)->>'kakao_or_line', ''),
      nullif(to_jsonb(r)->>'kakao_id', ''),
      nullif(to_jsonb(r)->>'messenger_contact', ''),
      nullif(to_jsonb(r)->>'kakao_talk_id', ''),
      nullif(to_jsonb(r)->>'kakao', ''),
      nullif(to_jsonb(r)->>'line_id', '')
    ) as company_contact_messenger,
    nullif(to_jsonb(r)->>'reference_file_name', '') as reference_file_name,
    nullif(to_jsonb(r)->>'reference_file_path', '') as reference_file_path,
    nullif(to_jsonb(r)->>'reference_file_url', '') as reference_file_url
  from public.request_interpreters ri
  join public.interpreters i
    on i.id = ri.interpreter_id
  join public.requests r
    on r.id = ri.request_id
  left join public.jobs j
    on j.id = r.job_id
  left join public.businesses b
    on b.id = r.company_id
  where
    auth.uid() is not null
    and (
      public.is_admin()
      or i.auth_user_id = auth.uid()
    )
  order by assigned_at desc;
$$;

revoke all on function public.get_my_assignments() from public;
revoke all on function public.get_my_assignments() from anon;
grant execute on function public.get_my_assignments() to authenticated;

notify pgrst, 'reload schema';
