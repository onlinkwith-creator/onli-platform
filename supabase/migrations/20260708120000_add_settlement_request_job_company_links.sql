alter table public.settlements
add column if not exists job_id uuid references public.jobs(id) on delete set null,
add column if not exists company_id bigint references public.businesses(id) on delete set null;

update public.settlements s
set
  job_id = coalesce(s.job_id, r.job_id),
  company_id = coalesce(s.company_id, r.company_id)
from public.requests r
where r.id = s.request_id
  and (s.job_id is null or s.company_id is null);

with ranked_settlements as (
  select
    ctid,
    row_number() over (
      partition by request_id, interpreter_id
      order by
        case when settlement_status = 'settlement_completed' then 0 else 1 end,
        updated_at desc nulls last,
        created_at desc nulls last,
        id desc
    ) as row_number
  from public.settlements
)
delete from public.settlements s
using ranked_settlements ranked
where s.ctid = ranked.ctid
  and ranked.row_number > 1;

create index if not exists settlements_job_idx
on public.settlements(job_id, created_at desc);

create index if not exists settlements_company_idx
on public.settlements(company_id, created_at desc);

create unique index if not exists settlements_request_interpreter_unique
on public.settlements(request_id, interpreter_id);

notify pgrst, 'reload schema';
