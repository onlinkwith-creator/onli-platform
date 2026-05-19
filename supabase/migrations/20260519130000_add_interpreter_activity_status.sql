alter table interpreters
add column if not exists activity_status text default 'active';

update interpreters
set activity_status = 'active'
where activity_status is null or activity_status = '';

alter table interpreters
drop constraint if exists interpreters_activity_status_check;

alter table interpreters
add constraint interpreters_activity_status_check
check (activity_status in ('active', 'inactive', 'paused', 'unavailable'));
