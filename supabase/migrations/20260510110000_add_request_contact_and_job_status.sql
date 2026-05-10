alter table public.requests
add column if not exists contact_name text;

alter table public.requests
add column if not exists contact_email_or_phone text;

alter table public.requests
add column if not exists interpretation_field text;

alter table public.requests
add column if not exists request_details text;

update public.jobs
set status = case
  when status = '마감' then 'closed'
  when status = '마감임박' then 'closing_soon'
  when status = '배정완료' then 'assigned'
  when status = '숨김' then 'hidden'
  when status is null or status = '' or status = '모집중' then
    case when coalesce(is_urgent, false) then 'closing_soon' else 'open' end
  else status
end;

alter table public.jobs
alter column status set default 'open';
