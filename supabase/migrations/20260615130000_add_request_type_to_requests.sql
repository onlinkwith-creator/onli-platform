alter table public.requests
add column if not exists request_type text default 'general';

update public.requests
set request_type = case
  when request_type in ('general', 'designated', 'urgent', 'private') then request_type
  when request_type in ('지정의뢰', '통역사 지정 의뢰') then 'designated'
  when request_type = '긴급의뢰' then 'urgent'
  when request_type = '비공개의뢰' then 'private'
  when interpreter_id is not null then 'designated'
  when urgency in ('D-1', 'D-3', 'D-7') then 'urgent'
  else 'general'
end
where request_type is null
  or request_type not in ('general', 'designated', 'urgent', 'private');

alter table public.requests
alter column request_type set default 'general';

alter table public.requests
drop constraint if exists requests_request_type_check;

alter table public.requests
add constraint requests_request_type_check
check (request_type in ('general', 'designated', 'urgent', 'private'));
