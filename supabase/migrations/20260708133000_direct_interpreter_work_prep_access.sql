-- Support direct interpreter work preparation reads through:
-- interpreters.auth_user_id -> request_interpreters.interpreter_id
-- -> requests.company_id -> businesses.id.

alter table public.requests
add column if not exists company_id bigint references public.businesses(id) on delete set null,
add column if not exists title text,
add column if not exists event_start_date date,
add column if not exists event_end_date date,
add column if not exists contact_phone text,
add column if not exists contact_email text,
add column if not exists contact_kakao text;

alter table public.businesses
add column if not exists kakao_id text;

alter table public.documents
add column if not exists file_name text,
add column if not exists file_url text,
add column if not exists storage_path text;

alter table public.request_interpreters
add column if not exists status text not null default 'assigned',
add column if not exists assignment_status text not null default 'assigned',
add column if not exists contact_visible boolean not null default false,
add column if not exists is_contact_visible boolean not null default false,
add column if not exists contact_revealed boolean not null default false;

update public.requests r
set company_id = b.id
from public.businesses b
where r.company_id is null
  and r.company_auth_user_id is not null
  and b.auth_user_id = r.company_auth_user_id;

update public.requests
set event_start_date = coalesce(
      event_start_date,
      start_date,
      case when event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(event_date::text, 10)::date end
    ),
    event_end_date = coalesce(
      event_end_date,
      end_date,
      start_date,
      case when event_date::text ~ '^\d{4}-\d{2}-\d{2}' then left(event_date::text, 10)::date end
    ),
    contact_phone = coalesce(nullif(contact_phone, ''), nullif(contact_email_or_phone, '')),
    contact_email = coalesce(nullif(contact_email, ''), nullif(contact_email_or_phone, '')),
    title = coalesce(nullif(title, ''), nullif(event_name, ''), '의뢰 ' || id::text)
where event_start_date is null
   or event_end_date is null
   or nullif(contact_phone, '') is null
   or nullif(contact_email, '') is null
   or nullif(title, '') is null;

update public.documents
set file_name = coalesce(nullif(file_name, ''), nullif(title, ''), nullif(file_path, '')),
    file_url = coalesce(nullif(file_url, ''), nullif(file_path, '')),
    storage_path = coalesce(nullif(storage_path, ''), nullif(file_path, ''))
where nullif(file_name, '') is null
   or nullif(file_url, '') is null
   or nullif(storage_path, '') is null;

update public.request_interpreters
set status = coalesce(nullif(status, ''), 'assigned'),
    assignment_status = case
      when assignment_status in ('assigned', 'confirmed', '배정완료') then assignment_status
      when nullif(assignment_status, '') is null then 'assigned'
      else assignment_status
    end;

drop policy if exists "assigned_interpreters_can_read_request_interpreters" on public.request_interpreters;
create policy "assigned_interpreters_can_read_request_interpreters"
on public.request_interpreters
for select
to authenticated
using (
  exists (
    select 1
    from public.interpreters i
    where i.id = request_interpreters.interpreter_id
      and i.auth_user_id = auth.uid()
  )
);

drop policy if exists "assigned_interpreters_can_read_assigned_requests" on public.requests;
create policy "assigned_interpreters_can_read_assigned_requests"
on public.requests
for select
to authenticated
using (
  exists (
    select 1
    from public.request_interpreters ri
    join public.interpreters i on i.id = ri.interpreter_id
    where ri.request_id = requests.id
      and i.auth_user_id = auth.uid()
  )
);

drop policy if exists "assigned_interpreters_can_read_company_contact" on public.businesses;
create policy "assigned_interpreters_can_read_company_contact"
on public.businesses
for select
to authenticated
using (
  exists (
    select 1
    from public.requests r
    join public.request_interpreters ri on ri.request_id = r.id
    join public.interpreters i on i.id = ri.interpreter_id
    where r.company_id = businesses.id
      and i.auth_user_id = auth.uid()
  )
);

drop policy if exists "assigned_interpreters_can_read_request_documents" on public.documents;
create policy "assigned_interpreters_can_read_request_documents"
on public.documents
for select
to authenticated
using (
  exists (
    select 1
    from public.request_interpreters ri
    join public.interpreters i on i.id = ri.interpreter_id
    where ri.request_id = documents.request_id
      and i.auth_user_id = auth.uid()
  )
);

notify pgrst, 'reload schema';
