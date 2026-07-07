alter table public.requests
drop constraint if exists requests_assignment_status_check;

alter table public.jobs
drop constraint if exists jobs_assignment_status_check;

alter table public.requests
disable trigger prevent_non_admin_request_operation_fields;

update public.requests
set assignment_status = case
  when assignment_status in ('assignment_completed', 'assigned', 'confirmed', 'preparing', 'ready', '배정', '배정완료', '매칭완료', '업무준비중', '업무 준비중', '진행예정', '진행 예정') then 'assignment_completed'
  when assignment_status in ('assignment_in_progress', 'assigning', 'matching', 'in_progress', '배정중', '매칭중', '통역사 확인중', '확인중', '지정 요청중') then 'assignment_in_progress'
  else 'assignment_pending'
end;

alter table public.requests
enable trigger prevent_non_admin_request_operation_fields;

update public.jobs
set assignment_status = case
  when assignment_status in ('assignment_completed', 'assigned', 'confirmed', 'preparing', 'ready', '배정', '배정완료', '매칭완료', '업무준비중', '업무 준비중', '진행예정', '진행 예정') then 'assignment_completed'
  when assignment_status in ('assignment_in_progress', 'assigning', 'matching', 'in_progress', '배정중', '매칭중', '통역사 확인중', '확인중', '지정 요청중') then 'assignment_in_progress'
  else 'assignment_pending'
end;

alter table public.requests
alter column assignment_status set default 'assignment_pending';

alter table public.jobs
alter column assignment_status set default 'assignment_pending';

alter table public.requests
add constraint requests_assignment_status_check
check (
  assignment_status in (
    'assignment_pending',
    'assignment_in_progress',
    'assignment_completed'
  )
);

alter table public.jobs
add constraint jobs_assignment_status_check
check (
  assignment_status in (
    'assignment_pending',
    'assignment_in_progress',
    'assignment_completed'
  )
);

notify pgrst, 'reload schema';
