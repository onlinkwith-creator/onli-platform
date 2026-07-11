-- Evaluate assignment ownership behind SECURITY DEFINER boundaries so RLS
-- policies do not recursively enter requests, request_interpreters or
-- businesses while checking another table's row.
create or replace function public.current_user_has_request_assignment(
  target_request_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.request_interpreters ri
    join public.interpreters i on i.id = ri.interpreter_id
    where ri.request_id = target_request_id
      and i.auth_user_id = auth.uid()
  );
$$;

create or replace function public.current_user_has_business_assignment(
  target_business_auth_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.requests r
    join public.request_interpreters ri on ri.request_id = r.id
    join public.interpreters i on i.id = ri.interpreter_id
    where r.company_auth_user_id = target_business_auth_user_id
      and i.auth_user_id = auth.uid()
  );
$$;

revoke all on function public.current_user_has_request_assignment(bigint) from public;
revoke all on function public.current_user_has_business_assignment(uuid) from public;
grant execute on function public.current_user_has_request_assignment(bigint) to authenticated;
grant execute on function public.current_user_has_business_assignment(uuid) to authenticated;

drop policy if exists "Assigned interpreters can read linked requests" on public.requests;
create policy "Assigned interpreters can read linked requests"
on public.requests
for select
to authenticated
using (public.current_user_has_request_assignment(id));

drop policy if exists "Assigned interpreters can read linked businesses" on public.businesses;
create policy "Assigned interpreters can read linked businesses"
on public.businesses
for select
to authenticated
using (public.current_user_has_business_assignment(auth_user_id));

drop policy if exists "Assigned interpreters can read linked documents" on public.documents;
create policy "Assigned interpreters can read linked documents"
on public.documents
for select
to authenticated
using (public.current_user_has_request_assignment(request_id));

drop policy if exists "Assigned interpreters can read linked materials" on public.request_materials;
create policy "Assigned interpreters can read linked materials"
on public.request_materials
for select
to authenticated
using (public.current_user_has_request_assignment(request_id));

notify pgrst, 'reload schema';
