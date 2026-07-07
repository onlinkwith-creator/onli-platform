alter table public.requests
add column if not exists operation_status text default 'operation_before';

alter table public.requests
alter column operation_status set default 'operation_before';

alter table public.requests
drop constraint if exists requests_operation_status_check;

update public.requests
set operation_status = case
  when operation_status in ('before', 'pending', 'operation_before', 'before_operation', '운영전') then 'operation_before'
  when operation_status in ('preparing', 'operation_preparing', '업무준비중', '업무 준비중', '운영준비중', '운영 준비중') then 'operation_preparing'
  when operation_status in ('scheduled', 'ready', 'operation_scheduled', '진행예정', '진행 예정', '운영예정', '운영 예정') then 'operation_scheduled'
  when operation_status in ('in_progress', 'operating', 'matching', 'operation_in_progress', '운영중', '진행중') then 'operation_in_progress'
  when operation_status in ('completed', 'done', 'finished', 'settled', 'operation_completed', '업무완료', '업무 완료', '운영완료', '완료') then 'operation_completed'
  else 'operation_before'
end
where operation_status is not null;

update public.requests
set operation_status = 'operation_before'
where operation_status is null;

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

notify pgrst, 'reload schema';
