-- Let companies read contact fields only for their own revealed assignments.

drop function if exists public.get_company_assignment_interpreter_contacts(bigint[]);

create or replace function public.get_company_assignment_interpreter_contacts(
  p_request_ids bigint[] default null
)
returns table (
  assignment_id bigint,
  request_id bigint,
  interpreter_id bigint,
  contact_revealed boolean,
  contact_revealed_at timestamptz,
  phone text,
  email text,
  kakao_or_line text,
  interpreter_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ri.id as assignment_id,
    ri.request_id,
    ri.interpreter_id,
    (coalesce(ri.contact_revealed, false) or coalesce(ri.is_contact_visible, false)) as contact_revealed,
    ri.contact_revealed_at,
    i.phone,
    i.email,
    i.kakao_or_line,
    i.name as interpreter_name
  from public.request_interpreters ri
  join public.requests r
    on r.id = ri.request_id
  join public.interpreters i
    on i.id = ri.interpreter_id
  where
    auth.uid() is not null
    and r.company_auth_user_id = auth.uid()
    and (p_request_ids is null or ri.request_id = any(p_request_ids))
    and (coalesce(ri.contact_revealed, false) = true or coalesce(ri.is_contact_visible, false) = true)
    and exists (
      select 1
      from unnest(array[
        r.assignment_status,
        r.matching_status,
        r.status,
        r.operation_status
      ]) as status_value(value)
      where lower(trim(coalesce(status_value.value, ''))) in (
        'assigned',
        'confirmed',
        'completed',
        'matched',
        '배정',
        '배정완료',
        '매칭완료',
        '확정',
        '완료',
        '업무완료'
      )
    );
$$;

grant execute on function public.get_company_assignment_interpreter_contacts(bigint[]) to authenticated;

drop policy if exists "Companies can read own revealed interpreter contacts" on public.interpreters;
create policy "Companies can read own revealed interpreter contacts"
on public.interpreters
for select
to authenticated
using (
  exists (
    select 1
    from public.request_interpreters ri
    join public.requests r on r.id = ri.request_id
    where ri.interpreter_id = interpreters.id
      and r.company_auth_user_id = auth.uid()
      and (coalesce(ri.contact_revealed, false) = true or coalesce(ri.is_contact_visible, false) = true)
      and exists (
        select 1
        from unnest(array[
          r.assignment_status,
          r.matching_status,
          r.status,
          r.operation_status
        ]) as status_value(value)
        where lower(trim(coalesce(status_value.value, ''))) in (
          'assigned',
          'confirmed',
          'completed',
          'matched',
          '배정',
          '배정완료',
          '매칭완료',
          '확정',
          '완료',
          '업무완료'
        )
      )
  )
);

notify pgrst, 'reload schema';
