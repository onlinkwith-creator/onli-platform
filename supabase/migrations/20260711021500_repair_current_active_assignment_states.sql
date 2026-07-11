-- Repair active rows that were left inconsistent by the former multi-request
-- client workflow. Completed and cancelled work is intentionally untouched.
-- Use the migration transaction's service-role claim so the existing request
-- operation guard remains enabled and explicitly authorizes this backfill.
select set_config('request.jwt.claim.role', 'service_role', true);

with assignment_counts as (
  select
    r.id as request_id,
    r.job_id,
    greatest(coalesce(r.requested_people_count, r.required_count, 1), 1) as required_count,
    count(ri.id)::integer as assigned_count,
    (array_agg(ri.interpreter_id order by ri.assigned_at desc, ri.id desc)
      filter (where ri.id is not null))[1] as primary_interpreter_id
  from public.requests r
  left join public.request_interpreters ri on ri.request_id = r.id
  where r.status not in ('completed', 'settled', 'cancelled')
  group by r.id, r.job_id, r.requested_people_count, r.required_count
), normalized as (
  select ac.*, i.name as primary_interpreter_name
  from assignment_counts ac
  left join public.interpreters i on i.id = ac.primary_interpreter_id
)
update public.requests r
set status = case when n.assigned_count = 0 then 'draft' else 'assigned' end,
    matching_status = case when n.assigned_count = 0 then 'draft' else 'assigned' end,
    assignment_status = case
      when n.assigned_count = 0 then 'assignment_pending'
      when n.assigned_count < n.required_count then 'assignment_in_progress'
      else 'assignment_completed'
    end,
    assigned_interpreter_id = n.primary_interpreter_id,
    assigned_interpreter_name = n.primary_interpreter_name,
    matched_interpreter_id = n.primary_interpreter_id,
    matched_interpreter_name = n.primary_interpreter_name,
    updated_at = now()
from normalized n
where r.id = n.request_id;

with assignment_counts as (
  select
    r.job_id,
    greatest(coalesce(r.requested_people_count, r.required_count, 1), 1) as required_count,
    count(ri.id)::integer as assigned_count
  from public.requests r
  left join public.request_interpreters ri on ri.request_id = r.id
  where r.job_id is not null
    and r.status not in ('completed', 'settled', 'cancelled')
  group by r.job_id, r.requested_people_count, r.required_count
)
update public.jobs j
set status = case when ac.assigned_count >= ac.required_count then 'assigned' else 'open' end,
    assignment_status = case
      when ac.assigned_count = 0 then 'assignment_pending'
      when ac.assigned_count < ac.required_count then 'assignment_in_progress'
      else 'assignment_completed'
    end
from assignment_counts ac
where j.id = ac.job_id
  and j.status not in ('completed', '완료', '운영완료', 'cancelled');

update public.job_applications ja
set status = 'pending'
from public.requests r
where r.job_id = ja.job_id
  and ja.status = 'accepted'
  and r.status not in ('completed', 'settled', 'cancelled')
  and not exists (
    select 1
    from public.request_interpreters ri
    where ri.request_id = r.id
      and ri.interpreter_id = ja.interpreter_id
  );

notify pgrst, 'reload schema';
