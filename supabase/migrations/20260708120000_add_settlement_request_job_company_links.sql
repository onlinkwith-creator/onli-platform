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

create index if not exists settlements_job_idx
on public.settlements(job_id, created_at desc);

create index if not exists settlements_company_idx
on public.settlements(company_id, created_at desc);

notify pgrst, 'reload schema';
