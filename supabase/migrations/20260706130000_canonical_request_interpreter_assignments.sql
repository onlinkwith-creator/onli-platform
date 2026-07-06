-- Canonicalize assignment state on request_interpreters.
-- The app treats this table as the single assignment source.

alter table public.request_interpreters
add column if not exists status text not null default 'assigned',
add column if not exists contact_visible boolean not null default false;

update public.request_interpreters
set
  status = coalesce(nullif(status, ''), 'assigned'),
  contact_visible = coalesce(contact_visible, false);

create index if not exists request_interpreters_assigned_request_idx
on public.request_interpreters(request_id)
where status = 'assigned';

create index if not exists request_interpreters_assigned_interpreter_idx
on public.request_interpreters(interpreter_id)
where status = 'assigned';

create or replace function public.sync_request_interpreter_contact_visibility()
returns trigger
language plpgsql
as $$
begin
  new.contact_visible := coalesce(new.contact_visible, false);

  -- Legacy columns follow the canonical contact_visible value only.
  if to_jsonb(new) ? 'is_contact_visible' then
    new.is_contact_visible := new.contact_visible;
  end if;

  if to_jsonb(new) ? 'contact_revealed' then
    new.contact_revealed := new.contact_visible;
  end if;

  if new.contact_visible = true and old.contact_visible is distinct from true then
    new.contact_revealed_at := coalesce(new.contact_revealed_at, now());
    new.contact_revealed_by := coalesce(new.contact_revealed_by, auth.uid());
  end if;

  if new.contact_visible = false then
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

drop function if exists public.get_company_assignment_interpreter_contacts(bigint[]);

create or replace function public.get_company_assignment_interpreter_contacts(
  p_request_ids bigint[] default null
)
returns table (
  assignment_id bigint,
  request_id bigint,
  interpreter_id bigint,
  contact_visible boolean,
  contact_revealed_at timestamptz,
  phone text,
  email text,
  kakao_or_line text,
  interpreter_name text,
  interpreter_user_id uuid,
  profile_id bigint,
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
    ri.contact_revealed_at,
    coalesce(nullif(ip.phone, ''), to_jsonb(i)->>'phone', to_jsonb(i)->>'phone_number', to_jsonb(i)->>'contact_phone', to_jsonb(i)->>'mobile') as phone,
    coalesce(nullif(ip.email, ''), to_jsonb(i)->>'email', to_jsonb(i)->>'user_email') as email,
    coalesce(
      nullif(ip.kakao_id, ''),
      to_jsonb(i)->>'kakao_or_line',
      to_jsonb(i)->>'kakao_id',
      to_jsonb(i)->>'kakao',
      to_jsonb(i)->>'kakao_talk_id',
      to_jsonb(i)->>'line_id'
    ) as kakao_or_line,
    i.name as interpreter_name,
    coalesce(ip.auth_user_id, ip.user_id, public.safe_uuid(to_jsonb(i)->>'auth_user_id'), public.safe_uuid(to_jsonb(i)->>'user_id')) as interpreter_user_id,
    ip.id as profile_id,
    case
      when nullif(ip.phone, '') is not null or nullif(ip.email, '') is not null or nullif(ip.kakao_id, '') is not null
        then 'interpreter_profiles'
      when i.id is not null
        then 'interpreters'
      else null
    end as contact_source
  from public.request_interpreters ri
  join public.requests r
    on r.id = ri.request_id
  left join public.interpreters i
    on i.id = ri.interpreter_id
  left join public.interpreter_profiles ip
    on ip.interpreter_id = ri.interpreter_id
  where
    auth.uid() is not null
    and ri.status = 'assigned'
    and coalesce(ri.contact_visible, false) = true
    and (
      r.company_auth_user_id = auth.uid()
      or exists (
        select 1
        from public.businesses b
        where b.auth_user_id = auth.uid()
          and nullif(to_jsonb(r)->>'company_id', '')::bigint = b.id
      )
    )
    and (p_request_ids is null or ri.request_id = any(p_request_ids));
$$;

grant execute on function public.get_company_assignment_interpreter_contacts(bigint[]) to authenticated;

drop policy if exists "Companies can read own revealed interpreter contact profiles" on public.interpreter_profiles;
create policy "Companies can read own revealed interpreter contact profiles"
on public.interpreter_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.request_interpreters ri
    join public.requests r on r.id = ri.request_id
    where ri.interpreter_id = interpreter_profiles.interpreter_id
      and ri.status = 'assigned'
      and coalesce(ri.contact_visible, false) = true
      and (
        r.company_auth_user_id = auth.uid()
        or exists (
          select 1
          from public.businesses b
          where b.auth_user_id = auth.uid()
            and nullif(to_jsonb(r)->>'company_id', '')::bigint = b.id
        )
      )
  )
);

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
      and ri.status = 'assigned'
      and coalesce(ri.contact_visible, false) = true
      and (
        r.company_auth_user_id = auth.uid()
        or exists (
          select 1
          from public.businesses b
          where b.auth_user_id = auth.uid()
            and nullif(to_jsonb(r)->>'company_id', '')::bigint = b.id
        )
      )
  )
);

drop policy if exists "Companies can read own request assignments" on public.request_interpreters;
create policy "Companies can read own request assignments"
on public.request_interpreters
for select
to authenticated
using (
  status = 'assigned'
  and exists (
    select 1
    from public.requests r
    where r.id = request_interpreters.request_id
      and (
        r.company_auth_user_id = auth.uid()
        or exists (
          select 1
          from public.businesses b
          where b.auth_user_id = auth.uid()
            and nullif(to_jsonb(r)->>'company_id', '')::bigint = b.id
        )
      )
  )
);

notify pgrst, 'reload schema';
