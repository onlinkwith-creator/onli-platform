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
    coalesce(to_jsonb(i)->>'phone', to_jsonb(i)->>'phone_number', to_jsonb(i)->>'contact_phone') as phone,
    coalesce(to_jsonb(i)->>'email', to_jsonb(i)->>'user_email') as email,
    coalesce(
      to_jsonb(i)->>'kakao_or_line',
      to_jsonb(i)->>'kakao_id',
      to_jsonb(i)->>'kakao',
      to_jsonb(i)->>'kakao_talk_id'
    ) as kakao_or_line,
    i.name as interpreter_name
  from public.request_interpreters ri
  join public.requests r
    on r.id = ri.request_id
  left join public.interpreters i
    on i.id = ri.interpreter_id
  where
    auth.uid() is not null
    and (
      r.company_auth_user_id = auth.uid()
      or exists (
        select 1
        from public.businesses b
        where b.auth_user_id = auth.uid()
          and nullif(to_jsonb(r)->>'company_id', '')::bigint = b.id
      )
    )
    and (p_request_ids is null or ri.request_id = any(p_request_ids))
    and (coalesce(ri.contact_revealed, false) = true or coalesce(ri.is_contact_visible, false) = true);
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
      and (
        r.company_auth_user_id = auth.uid()
        or exists (
          select 1
          from public.businesses b
          where b.auth_user_id = auth.uid()
            and nullif(to_jsonb(r)->>'company_id', '')::bigint = b.id
        )
      )
      and (coalesce(ri.contact_revealed, false) = true or coalesce(ri.is_contact_visible, false) = true)
  )
);

notify pgrst, 'reload schema';
