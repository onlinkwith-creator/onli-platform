alter table public.jobs
add column if not exists visibility text not null default 'public';

update public.jobs
set visibility = case
  when status in ('hidden', '숨김') then 'private'
  else coalesce(nullif(visibility, ''), 'public')
end;

update public.jobs
set status = case
  when status in ('hidden', '숨김') then 'open'
  when status = '마감' then 'closed'
  when status = '마감임박' then 'closing_soon'
  when status = '배정완료' then 'assigned'
  when status is null or status = '' or status = '모집중' then
    case when coalesce(is_urgent, false) then 'closing_soon' else 'open' end
  else status
end;

alter table public.jobs
alter column visibility set default 'public';

alter table public.jobs
alter column status set default 'open';
