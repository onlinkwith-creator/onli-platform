-- Remove the recursive path introduced by direct cross-table policy joins:
-- request_interpreters -> requests -> request_interpreters, and direct
-- request_interpreters -> interpreters policy evaluation.

create or replace function public.current_company_owns_request(target_request_id bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1 from public.requests r
    where r.id=target_request_id and (
      r.company_auth_user_id=auth.uid() or exists (
        select 1 from public.businesses b
        where b.auth_user_id=auth.uid() and b.id=r.company_id
      )
    )
  );
$$;

create or replace function public.current_interpreter_assigned_to_request(target_request_id bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1 from public.request_interpreters ri
    join public.interpreters i on i.id=ri.interpreter_id
    where ri.request_id=target_request_id and ri.status='assigned' and i.auth_user_id=auth.uid()
  );
$$;

create or replace function public.is_active_request_assignment(target_request_id bigint,target_interpreter_id bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1 from public.request_interpreters ri
    where ri.request_id=target_request_id and ri.interpreter_id=target_interpreter_id and ri.status='assigned'
  );
$$;

revoke all on function public.current_company_owns_request(bigint) from public;
revoke all on function public.current_interpreter_assigned_to_request(bigint) from public;
revoke all on function public.is_active_request_assignment(bigint,bigint) from public;
grant execute on function public.current_company_owns_request(bigint) to authenticated;
grant execute on function public.current_interpreter_assigned_to_request(bigint) to authenticated;
grant execute on function public.is_active_request_assignment(bigint,bigint) to authenticated;

drop policy if exists "Interpreters read own active assignments" on public.request_interpreters;
drop policy if exists "Interpreters can read own request assignments" on public.request_interpreters;
drop policy if exists "Companies can read own request assignments" on public.request_interpreters;

create policy "Interpreters can read own request assignments"
on public.request_interpreters for select to authenticated
using (status='assigned' and public.current_user_owns_interpreter(interpreter_id));

create policy "Companies can read own request assignments"
on public.request_interpreters for select to authenticated
using (status='assigned' and public.current_company_owns_request(request_id));

drop policy if exists "Interpreters read actively assigned requests" on public.requests;
create policy "Interpreters read actively assigned requests"
on public.requests for select to authenticated
using (public.current_interpreter_assigned_to_request(id));

drop policy if exists "Interpreters read own actively assigned settlements" on public.settlements;
create policy "Interpreters read own actively assigned settlements"
on public.settlements for select to authenticated using (
  public.current_user_owns_interpreter(interpreter_id)
  and public.is_active_request_assignment(request_id,interpreter_id)
);

create index if not exists request_interpreters_request_interpreter_idx
on public.request_interpreters(request_id,interpreter_id);
create index if not exists settlements_request_interpreter_idx
on public.settlements(request_id,interpreter_id);

notify pgrst,'reload schema';
