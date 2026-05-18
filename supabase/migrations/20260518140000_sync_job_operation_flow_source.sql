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

update public.jobs
set
  assignment_status = case
    when assignment_status in ('waiting', 'assigning', 'assigned') then assignment_status
    when status in ('assigned', 'confirmed', '배정완료', '확정') then 'assigned'
    when status in ('assigning', '배정중') then 'assigning'
    else coalesce(nullif(assignment_status, ''), 'waiting')
  end,
  operation_status = case
    when operation_status in ('before_operation', 'in_progress', 'completed') then operation_status
    when status in ('in_progress', '운영중', '진행중') then 'in_progress'
    when status in ('completed', '운영완료', '완료') then 'completed'
    else coalesce(nullif(operation_status, ''), 'before_operation')
  end,
  settlement_status = case
    when settlement_status in ('not_required', 'pending', 'completed') then settlement_status
    when status in ('settlement_pending', '정산대기') then 'pending'
    when status in ('settled', '정산완료') then 'completed'
    else coalesce(nullif(settlement_status, ''), 'not_required')
  end;

update public.jobs
set
  assignment_status = case
    when operation_status in ('in_progress', 'completed')
      or settlement_status in ('pending', 'completed')
      then 'assigned'
    else assignment_status
  end,
  operation_status = case
    when settlement_status in ('pending', 'completed') then 'completed'
    else operation_status
  end;

update public.requests as r
set
  assignment_status = j.assignment_status,
  operation_status = j.operation_status,
  settlement_status = j.settlement_status,
  status = case
    when j.settlement_status = 'completed' then 'settled'
    when j.settlement_status = 'pending' then 'settlement_pending'
    when j.operation_status = 'completed' then 'completed'
    when j.operation_status = 'in_progress' then 'in_progress'
    when j.assignment_status = 'assigned' then 'assigned'
    else coalesce(nullif(r.status, ''), 'draft')
  end,
  matching_status = case
    when j.settlement_status = 'completed' then 'settled'
    when j.settlement_status = 'pending' then 'settlement_pending'
    when j.operation_status = 'completed' then 'completed'
    when j.operation_status = 'in_progress' then 'in_progress'
    when j.assignment_status = 'assigned' then 'assigned'
    else coalesce(nullif(r.matching_status, ''), nullif(r.status, ''), 'draft')
  end
from public.jobs as j
where r.job_id = j.id;

do $$
begin
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
