create or replace function public.sync_request_interpreter_assignment_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
  v_interpreter_id bigint;
  v_job_id uuid;
  v_required_count integer;
  v_assigned_count integer;
  v_primary_interpreter_id bigint;
  v_primary_interpreter_name text;
begin
  v_request_id := case when tg_op = 'DELETE' then old.request_id else new.request_id end;
  v_interpreter_id := case when tg_op = 'DELETE' then old.interpreter_id else new.interpreter_id end;

  select r.job_id, greatest(coalesce(r.requested_people_count, r.required_count, 1), 1)
  into v_job_id, v_required_count
  from public.requests r
  where r.id = v_request_id
  for update;

  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if v_job_id is not null then
    update public.job_applications
    set status = case when tg_op = 'DELETE' then 'pending' else 'accepted' end
    where job_id = v_job_id
      and interpreter_id = v_interpreter_id
      and status not in ('rejected', 'cancelled');
  end if;

  if tg_op = 'DELETE' then
    update public.matchings
    set status = 'cancelled'
    where request_id = v_request_id
      and interpreter_id = v_interpreter_id
      and status in ('pending', 'accepted', 'assigned', 'confirmed', 'in_progress');
  end if;

  select count(*)::integer into v_assigned_count
  from public.request_interpreters ri where ri.request_id = v_request_id;

  select ri.interpreter_id, i.name
  into v_primary_interpreter_id, v_primary_interpreter_name
  from public.request_interpreters ri
  join public.interpreters i on i.id = ri.interpreter_id
  where ri.request_id = v_request_id
  order by ri.assigned_at desc, ri.id desc limit 1;

  update public.requests
  set status = case when v_assigned_count = 0 then 'draft' else 'assigned' end,
      matching_status = case when v_assigned_count = 0 then 'draft' else 'assigned' end,
      assignment_status = case
        when v_assigned_count = 0 then 'assignment_pending'
        when v_assigned_count < v_required_count then 'assignment_in_progress'
        else 'assignment_completed'
      end,
      assigned_interpreter_id = v_primary_interpreter_id,
      assigned_interpreter_name = v_primary_interpreter_name,
      matched_interpreter_id = v_primary_interpreter_id,
      matched_interpreter_name = v_primary_interpreter_name,
      updated_at = now()
  where id = v_request_id;

  if v_job_id is not null then
    update public.jobs
    set status = case when v_assigned_count >= v_required_count then 'assigned' else 'open' end,
        assignment_status = case
          when v_assigned_count = 0 then 'assignment_pending'
          when v_assigned_count < v_required_count then 'assignment_in_progress'
          else 'assignment_completed'
        end
    where id = v_job_id;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists sync_request_interpreter_assignment_lifecycle on public.request_interpreters;
create trigger sync_request_interpreter_assignment_lifecycle
after insert or delete on public.request_interpreters
for each row execute function public.sync_request_interpreter_assignment_lifecycle();

notify pgrst, 'reload schema';
