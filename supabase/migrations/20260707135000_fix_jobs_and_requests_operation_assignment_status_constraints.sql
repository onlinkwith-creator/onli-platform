alter table public.requests
add column if not exists operation_status text default 'operation_before';

alter table public.jobs
add column if not exists operation_status text default 'operation_before';

alter table public.requests
add column if not exists assignment_status text default 'assignment_pending';

alter table public.jobs
add column if not exists assignment_status text default 'assignment_pending';

alter table public.requests
drop constraint if exists requests_operation_status_check;

alter table public.jobs
drop constraint if exists jobs_operation_status_check;

alter table public.requests
drop constraint if exists requests_assignment_status_check;

alter table public.jobs
drop constraint if exists jobs_assignment_status_check;

alter table public.requests
disable trigger prevent_non_admin_request_operation_fields;

update public.requests
set operation_status = case
  when operation_status in ('before', 'before_operation', 'pending', 'operation_before', '운영전') then 'operation_before'
  when operation_status in ('preparing', 'operation_preparing', '업무준비중', '업무 준비중', '운영준비중', '운영 준비중') then 'operation_preparing'
  when operation_status in ('ready', 'scheduled', 'operation_scheduled', '진행예정', '진행 예정', '운영예정', '운영 예정') then 'operation_scheduled'
  when operation_status in ('in_progress', 'operating', 'matching', 'operation_in_progress', '운영중', '진행중') then 'operation_in_progress'
  when operation_status in ('completed', 'done', 'finished', 'settled', 'operation_completed', '업무완료', '업무 완료', '운영완료') then 'operation_completed'
  else 'operation_before'
end;

update public.jobs
set operation_status = case
  when operation_status in ('before', 'before_operation', 'pending', 'operation_before', '운영전') then 'operation_before'
  when operation_status in ('preparing', 'operation_preparing', '업무준비중', '업무 준비중', '운영준비중', '운영 준비중') then 'operation_preparing'
  when operation_status in ('ready', 'scheduled', 'operation_scheduled', '진행예정', '진행 예정', '운영예정', '운영 예정') then 'operation_scheduled'
  when operation_status in ('in_progress', 'operating', 'matching', 'operation_in_progress', '운영중', '진행중') then 'operation_in_progress'
  when operation_status in ('completed', 'done', 'finished', 'settled', 'operation_completed', '업무완료', '업무 완료', '운영완료') then 'operation_completed'
  else 'operation_before'
end;

update public.requests
set assignment_status = case
  when assignment_status in ('assigned', 'confirmed', 'preparing', 'ready', '배정', '배정완료', '매칭완료', '업무준비중', '업무 준비중', '진행예정', '진행 예정') then 'assigned'
  else 'assignment_pending'
end;

alter table public.requests
enable trigger prevent_non_admin_request_operation_fields;

update public.jobs
set assignment_status = case
  when assignment_status in ('assigned', 'confirmed', 'preparing', 'ready', '배정', '배정완료', '매칭완료', '업무준비중', '업무 준비중', '진행예정', '진행 예정') then 'assigned'
  else 'assignment_pending'
end;

alter table public.requests
alter column operation_status set default 'operation_before';

alter table public.jobs
alter column operation_status set default 'operation_before';

alter table public.requests
alter column assignment_status set default 'assignment_pending';

alter table public.jobs
alter column assignment_status set default 'assignment_pending';

alter table public.requests
add constraint requests_operation_status_check
check (
  operation_status in (
    'operation_before',
    'operation_preparing',
    'operation_scheduled',
    'operation_in_progress',
    'operation_completed'
  )
);

alter table public.jobs
add constraint jobs_operation_status_check
check (
  operation_status in (
    'operation_before',
    'operation_preparing',
    'operation_scheduled',
    'operation_in_progress',
    'operation_completed'
  )
);

alter table public.requests
add constraint requests_assignment_status_check
check (
  assignment_status in (
    'assignment_pending',
    'assigned'
  )
);

alter table public.jobs
add constraint jobs_assignment_status_check
check (
  assignment_status in (
    'assignment_pending',
    'assigned'
  )
);

notify pgrst, 'reload schema';
