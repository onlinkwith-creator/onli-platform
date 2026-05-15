alter table public.requests
add column if not exists assigned_interpreter_id bigint references public.interpreters(id) on delete set null;

alter table public.requests
add column if not exists assigned_interpreter_name text;

alter table public.requests
add column if not exists matched_interpreter_id bigint references public.interpreters(id) on delete set null;

alter table public.requests
add column if not exists matched_interpreter_name text;

alter table public.requests
add column if not exists matching_status text not null default 'pending';

alter table public.requests
add column if not exists settlement_status text not null default 'unsettled';

update public.requests
set matching_status = case
  when status in ('매칭완료', '배정완료', 'assigned', 'matched') then 'matched'
  when matching_status is null or matching_status = '' then 'pending'
  else matching_status
end;

create index if not exists requests_assigned_interpreter_id_idx
on public.requests(assigned_interpreter_id);

create index if not exists requests_matching_status_idx
on public.requests(matching_status);
