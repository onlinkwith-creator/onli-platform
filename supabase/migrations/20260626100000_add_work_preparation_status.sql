-- Work Preparation System: expand assignment_status and add checklist table

-- 1. Expand assignment_status constraint to include 'preparing' and 'ready'

-- Drop old constraint on requests
alter table public.requests
drop constraint if exists requests_assignment_status_check;

-- Re-create with new values
alter table public.requests
add constraint requests_assignment_status_check
check (assignment_status in ('waiting', 'assigning', 'assigned', 'preparing', 'ready'));

-- Drop old constraint on jobs
alter table public.jobs
drop constraint if exists jobs_assignment_status_check;

-- Re-create with new values for jobs too (for consistency)
alter table public.jobs
add constraint jobs_assignment_status_check
check (assignment_status in ('waiting', 'assigning', 'assigned', 'preparing', 'ready'));

-- 2. Update get_my_assignments RPC to expose assignment_status and contact visibility
drop function if exists public.get_my_assignments();
create or replace function public.get_my_assignments()
returns table (
  assignment_id text,
  assignment_code text,
  public_status text,
  assigned_at timestamptz,
  job_id uuid,
  request_id bigint,
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
  is_contact_visible boolean
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
    false as is_contact_visible
  from public.matchings m
  join public.interpreters i
    on i.id = m.interpreter_id
  left join public.jobs j
    on j.id = m.job_id
  left join public.requests r
    on r.id = m.request_id
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
    coalesce(ri.is_contact_visible, false) as is_contact_visible
  from public.request_interpreters ri
  join public.interpreters i
    on i.id = ri.interpreter_id
  join public.requests r
    on r.id = ri.request_id
  left join public.jobs j
    on j.id = r.job_id
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


create table if not exists public.request_preparation_checklist (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.requests(id) on delete cascade,
  item_label text not null,
  is_done boolean not null default false,
  done_by uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.request_preparation_checklist enable row level security;

-- 3. RLS Policies for request_preparation_checklist

-- Admins can manage all checklist items
drop policy if exists "Admins can manage preparation checklists" on public.request_preparation_checklist;
create policy "Admins can manage preparation checklists"
on public.request_preparation_checklist
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

-- Companies can read checklist for their own requests
drop policy if exists "Companies can read own request checklists" on public.request_preparation_checklist;
create policy "Companies can read own request checklists"
on public.request_preparation_checklist
for select
to authenticated
using (
  exists (
    select 1
    from public.requests r
    where r.id = request_preparation_checklist.request_id
      and r.company_auth_user_id = auth.uid()
  )
);

-- Assigned interpreters can read preparation checklists for their assigned requests
drop policy if exists "Interpreters can read assigned request checklists" on public.request_preparation_checklist;
create policy "Interpreters can read assigned request checklists"
on public.request_preparation_checklist
for select
to authenticated
using (
  exists (
    select 1
    from public.request_interpreters ri
    join public.interpreters i on i.id = ri.interpreter_id
    where ri.request_id = request_preparation_checklist.request_id
      and i.auth_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.matchings m
    join public.interpreters i on i.id = m.interpreter_id
    where m.request_id = request_preparation_checklist.request_id
      and i.auth_user_id = auth.uid()
  )
);

-- 4. Extend notify_corporate_request_status_changed trigger to include preparing and ready
-- The trigger is in migration 20260625132400 and will be updated here:
create or replace function public.notify_corporate_request_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_email text;
begin
  recipient_email := coalesce(new.email, '');

  if recipient_email = '' then
    select contact_email into recipient_email
    from public.businesses
    where auth_user_id = new.company_auth_user_id;
  end if;

  if recipient_email is null or recipient_email = '' then
    return new;
  end if;

  -- 1) 관리자 검토 시작
  if (coalesce(old.admin_checked, false) = false and new.admin_checked = true) then
    perform public.enqueue_notification_event(
      'client_review_started', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  -- 2) 견적 안내
  if (new.estimate_status = 'estimate_sent' and coalesce(old.estimate_status, '') <> 'estimate_sent') then
    perform public.enqueue_notification_event(
      'client_estimate_ready', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  -- 3) 통역사 모집 시작
  if (new.assignment_status = 'assigning' and coalesce(old.assignment_status, '') <> 'assigning') then
    perform public.enqueue_notification_event(
      'client_recruiting_started', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  -- 4) 통역사 배정 완료
  if (new.assignment_status = 'assigned' and coalesce(old.assignment_status, '') <> 'assigned') then
    perform public.enqueue_notification_event(
      'assignment_confirmed_client', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  -- 5) 업무 준비 시작 (새로 추가)
  if (new.assignment_status = 'preparing' and coalesce(old.assignment_status, '') <> 'preparing') then
    perform public.enqueue_notification_event(
      'client_work_preparing', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  -- 6) 진행 예정 (새로 추가)
  if (new.assignment_status = 'ready' and coalesce(old.assignment_status, '') <> 'ready') then
    perform public.enqueue_notification_event(
      'client_work_ready', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  -- 7) 업무 완료
  if (new.operation_status = 'completed' and coalesce(old.operation_status, '') <> 'completed') then
    perform public.enqueue_notification_event(
      'client_work_completed', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  -- 8) 정산/결제 안내
  if (new.settlement_status = 'pending' and coalesce(old.settlement_status, '') <> 'pending') then
    perform public.enqueue_notification_event(
      'client_settlement_ready', 'request', new.id::text, 'client', recipient_email, null,
      jsonb_build_object('request_id', new.id, 'request_no', new.request_no, 'company_name', new.company_name, 'event_name', new.event_name, 'recipient_email', recipient_email)
    );
  end if;

  return new;
end;
$$;

-- Reload schema
notify pgrst, 'reload schema';

