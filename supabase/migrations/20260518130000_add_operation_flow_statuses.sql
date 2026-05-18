alter table public.requests
add column if not exists assignment_status text not null default 'waiting';

alter table public.requests
add column if not exists operation_status text not null default 'before_operation';

alter table public.requests
add column if not exists settlement_status text not null default 'not_required';

alter table public.requests
alter column assignment_status set default 'waiting';

alter table public.requests
alter column operation_status set default 'before_operation';

alter table public.requests
alter column settlement_status set default 'not_required';

alter table public.jobs
add column if not exists assignment_status text not null default 'waiting';

alter table public.jobs
add column if not exists operation_status text not null default 'before_operation';

alter table public.jobs
add column if not exists settlement_status text not null default 'not_required';

alter table public.jobs
alter column assignment_status set default 'waiting';

alter table public.jobs
alter column operation_status set default 'before_operation';

alter table public.jobs
alter column settlement_status set default 'not_required';

update public.requests
set
  assignment_status = case
    when assignment_status in ('waiting', 'assigning', 'assigned') then assignment_status
    when status in ('assigned', 'confirmed', 'completed', 'settlement_pending', 'settled') then 'assigned'
    when status in ('in_progress') then 'assigning'
    else 'waiting'
  end,
  operation_status = case
    when operation_status in ('before_operation', 'in_progress', 'completed') then operation_status
    when status in ('completed', 'settlement_pending', 'settled') then 'completed'
    when status in ('in_progress') then 'in_progress'
    else 'before_operation'
  end,
  settlement_status = case
    when settlement_status in ('not_required', 'pending', 'completed') then settlement_status
    when status in ('settlement_pending') then 'pending'
    when status in ('settled') then 'completed'
    when settlement_status in ('settled', '정산완료') then 'completed'
    when settlement_status in ('unsettled', 'pending', '정산대기', '미정산') then 'pending'
    else 'not_required'
  end;

update public.jobs
set
  assignment_status = case
    when assignment_status in ('waiting', 'assigning', 'assigned') then assignment_status
    when status in ('assigned', 'completed') then 'assigned'
    else 'waiting'
  end,
  operation_status = case
    when operation_status in ('before_operation', 'in_progress', 'completed') then operation_status
    when status = 'completed' then 'completed'
    else 'before_operation'
  end,
  settlement_status = case
    when settlement_status in ('not_required', 'pending', 'completed') then settlement_status
    when settlement_status in ('settled', '정산완료') then 'completed'
    when settlement_status in ('unsettled', 'pending', '정산대기', '미정산') then 'pending'
    else 'not_required'
  end;

do $$
begin
  alter table public.requests drop constraint if exists requests_assignment_status_check;
  alter table public.requests
  add constraint requests_assignment_status_check
  check (assignment_status in ('waiting', 'assigning', 'assigned'));

  alter table public.requests drop constraint if exists requests_operation_status_check;
  alter table public.requests
  add constraint requests_operation_status_check
  check (operation_status in ('before_operation', 'in_progress', 'completed'));

  alter table public.requests drop constraint if exists requests_settlement_status_flow_check;
  alter table public.requests
  add constraint requests_settlement_status_flow_check
  check (settlement_status in ('not_required', 'pending', 'completed'));

  alter table public.jobs drop constraint if exists jobs_assignment_status_check;
  alter table public.jobs
  add constraint jobs_assignment_status_check
  check (assignment_status in ('waiting', 'assigning', 'assigned'));

  alter table public.jobs drop constraint if exists jobs_operation_status_check;
  alter table public.jobs
  add constraint jobs_operation_status_check
  check (operation_status in ('before_operation', 'in_progress', 'completed'));

  alter table public.jobs drop constraint if exists jobs_settlement_status_flow_check;
  alter table public.jobs
  add constraint jobs_settlement_status_flow_check
  check (settlement_status in ('not_required', 'pending', 'completed'));
end $$;
