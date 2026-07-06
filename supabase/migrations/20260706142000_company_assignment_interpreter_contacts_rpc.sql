create or replace function public.get_company_assignment_interpreter_contacts(
  p_request_ids bigint[] default null
)
returns table (
  assignment_id bigint,
  request_id bigint,
  interpreter_id bigint,
  contact_visible boolean,
  phone text,
  email text,
  kakao_or_line text,
  interpreter_name text,
  contact_source text
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
    coalesce(ri.contact_visible, false) as contact_visible,
    nullif(i.phone, '') as phone,
    nullif(i.email, '') as email,
    nullif(i.kakao_or_line, '') as kakao_or_line,
    i.name as interpreter_name,
    case
      when nullif(i.phone, '') is not null
        or nullif(i.email, '') is not null
        or nullif(i.kakao_or_line, '') is not null
        then 'interpreters'
      else null
    end as contact_source
  from public.request_interpreters ri
  join public.requests r
    on r.id = ri.request_id
  left join public.interpreters i
    on i.id = ri.interpreter_id
  where
    auth.uid() is not null
    and coalesce(ri.contact_visible, false) = true
    and (p_request_ids is null or ri.request_id = any(p_request_ids))
    and r.company_auth_user_id = auth.uid();
$$;

grant execute on function public.get_company_assignment_interpreter_contacts(bigint[]) to authenticated;

notify pgrst, 'reload schema';
