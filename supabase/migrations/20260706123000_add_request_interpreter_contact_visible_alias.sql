-- Keep assignment contact visibility under a clear public column name while
-- preserving the existing request_interpreters visibility columns.

alter table public.request_interpreters
add column if not exists contact_visible boolean not null default false,
add column if not exists is_contact_visible boolean not null default false,
add column if not exists contact_revealed boolean not null default false,
add column if not exists contact_revealed_at timestamptz,
add column if not exists contact_revealed_by uuid references auth.users(id) on delete set null;

update public.request_interpreters
set
  contact_visible = coalesce(contact_visible, false) or coalesce(is_contact_visible, false) or coalesce(contact_revealed, false),
  is_contact_visible = coalesce(contact_visible, false) or coalesce(is_contact_visible, false) or coalesce(contact_revealed, false),
  contact_revealed = coalesce(contact_visible, false) or coalesce(is_contact_visible, false) or coalesce(contact_revealed, false);

create or replace function public.sync_request_interpreter_contact_visibility()
returns trigger
language plpgsql
as $$
declare
  next_visible boolean;
begin
  next_visible :=
    coalesce(new.contact_visible, false)
    or coalesce(new.is_contact_visible, false)
    or coalesce(new.contact_revealed, false);

  new.contact_visible := next_visible;
  new.is_contact_visible := next_visible;
  new.contact_revealed := next_visible;

  if next_visible = true and (
    coalesce(old.contact_visible, false) is distinct from true
    or coalesce(old.is_contact_visible, false) is distinct from true
    or coalesce(old.contact_revealed, false) is distinct from true
  ) then
    new.contact_revealed_at := coalesce(new.contact_revealed_at, now());
    new.contact_revealed_by := coalesce(new.contact_revealed_by, auth.uid());
  end if;

  if next_visible = false then
    new.contact_revealed_at := null;
    new.contact_revealed_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_request_interpreter_contact_visibility on public.request_interpreters;
create trigger sync_request_interpreter_contact_visibility
before update on public.request_interpreters
for each row
execute function public.sync_request_interpreter_contact_visibility();

drop policy if exists "Admins can manage request assignments" on public.request_interpreters;
create policy "Admins can manage request assignments"
on public.request_interpreters
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

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
    (
      coalesce(ri.contact_visible, false)
      or coalesce(ri.contact_revealed, false)
      or coalesce(ri.is_contact_visible, false)
    ) as contact_revealed,
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
    and (
      coalesce(ri.contact_visible, false) = true
      or coalesce(ri.contact_revealed, false) = true
      or coalesce(ri.is_contact_visible, false) = true
    )
    and exists (
      select 1
      from (
        values
          (to_jsonb(ri)->>'status'),
          (to_jsonb(r)->>'assignment_status'),
          (to_jsonb(r)->>'status'),
          (to_jsonb(r)->>'operation_status')
      ) as visible_statuses(status_value)
      where lower(coalesce(status_value, '')) in (
        'assigned',
        'confirmed',
        'completed',
        'matched',
        '배정완료',
        '배정 완료',
        '확정',
        '완료'
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
      and (
        r.company_auth_user_id = auth.uid()
        or exists (
          select 1
          from public.businesses b
          where b.auth_user_id = auth.uid()
            and nullif(to_jsonb(r)->>'company_id', '')::bigint = b.id
        )
      )
      and (
        coalesce(ri.contact_visible, false) = true
        or coalesce(ri.contact_revealed, false) = true
        or coalesce(ri.is_contact_visible, false) = true
      )
      and exists (
        select 1
        from (
          values
            (to_jsonb(ri)->>'status'),
            (to_jsonb(r)->>'assignment_status'),
            (to_jsonb(r)->>'status'),
            (to_jsonb(r)->>'operation_status')
        ) as visible_statuses(status_value)
        where lower(coalesce(status_value, '')) in (
          'assigned',
          'confirmed',
          'completed',
          'matched',
          '배정완료',
          '배정 완료',
          '확정',
          '완료'
        )
      )
  )
);

notify pgrst, 'reload schema';
