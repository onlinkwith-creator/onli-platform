alter table public.jobs
add column if not exists assignment_status text default 'waiting';

alter table public.jobs
add column if not exists operation_status text default 'before_operation';

alter table public.jobs
add column if not exists settlement_status text default 'not_required';

update public.jobs
set assignment_status = coalesce(assignment_status, 'waiting');

update public.jobs
set operation_status = coalesce(operation_status, 'before_operation');

update public.jobs
set settlement_status = coalesce(settlement_status, 'not_required');

update public.jobs
set assignment_status = case
  when status in ('assigned', 'confirmed', '배정완료', '확정') then 'assigned'
  when status in ('assigning', '배정중') then 'assigning'
  when status in ('draft', 'waiting', '대기', '배정대기') then 'waiting'
  else coalesce(assignment_status, 'waiting')
end;

update public.jobs
set operation_status = case
  when status in ('in_progress', '운영중', '진행중') then 'in_progress'
  when status in ('completed', '운영완료', '완료') then 'completed'
  when status in ('before_operation', '운영전') then 'before_operation'
  else coalesce(operation_status, 'before_operation')
end;

update public.jobs
set settlement_status = case
  when status in ('settlement_pending', '정산대기') then 'pending'
  when status in ('settled', '정산완료') then 'completed'
  when status in ('not_required', '정산없음') then 'not_required'
  else coalesce(settlement_status, 'not_required')
end;

alter table public.jobs
drop constraint if exists jobs_assignment_status_check;

alter table public.jobs
add constraint jobs_assignment_status_check
check (assignment_status in ('waiting', 'assigning', 'assigned'));

alter table public.jobs
drop constraint if exists jobs_operation_status_check;

alter table public.jobs
add constraint jobs_operation_status_check
check (operation_status in ('before_operation', 'in_progress', 'completed'));

alter table public.jobs
drop constraint if exists jobs_settlement_status_flow_check;

alter table public.jobs
drop constraint if exists jobs_settlement_status_check;

alter table public.jobs
add constraint jobs_settlement_status_check
check (settlement_status in ('not_required', 'pending', 'completed'));
