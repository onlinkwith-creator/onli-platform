-- Standardize interpreter contact fields for company assignment contact display.

create or replace function public.safe_uuid(value text)
returns uuid
language sql
immutable
as $$
  select case
    when value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then value::uuid
    else null
  end
$$;

create table if not exists public.interpreter_profiles (
  id bigserial primary key,
  interpreter_id bigint unique references public.interpreters(id) on delete cascade,
  user_id uuid,
  auth_user_id uuid,
  phone text,
  email text,
  kakao_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interpreter_profiles_interpreter_id_idx
on public.interpreter_profiles(interpreter_id);

create index if not exists interpreter_profiles_user_id_idx
on public.interpreter_profiles(user_id);

insert into public.interpreter_profiles (
  interpreter_id,
  user_id,
  auth_user_id,
  phone,
  email,
  kakao_id,
  created_at,
  updated_at
)
select
  i.id,
  public.safe_uuid(to_jsonb(i)->>'user_id'),
  public.safe_uuid(to_jsonb(i)->>'auth_user_id'),
  coalesce(to_jsonb(i)->>'phone', to_jsonb(i)->>'phone_number', to_jsonb(i)->>'contact_phone', to_jsonb(i)->>'mobile'),
  coalesce(to_jsonb(i)->>'email', to_jsonb(i)->>'user_email'),
  coalesce(to_jsonb(i)->>'kakao_or_line', to_jsonb(i)->>'kakao_id', to_jsonb(i)->>'kakao', to_jsonb(i)->>'kakao_talk_id', to_jsonb(i)->>'line_id'),
  coalesce(i.created_at, now()),
  now()
from public.interpreters i
where not exists (
  select 1
  from public.interpreter_profiles ip
  where ip.interpreter_id = i.id
);

update public.interpreter_profiles ip
set
  user_id = coalesce(ip.user_id, public.safe_uuid(to_jsonb(i)->>'user_id')),
  auth_user_id = coalesce(ip.auth_user_id, public.safe_uuid(to_jsonb(i)->>'auth_user_id')),
  phone = coalesce(nullif(ip.phone, ''), to_jsonb(i)->>'phone', to_jsonb(i)->>'phone_number', to_jsonb(i)->>'contact_phone', to_jsonb(i)->>'mobile'),
  email = coalesce(nullif(ip.email, ''), to_jsonb(i)->>'email', to_jsonb(i)->>'user_email'),
  kakao_id = coalesce(nullif(ip.kakao_id, ''), to_jsonb(i)->>'kakao_or_line', to_jsonb(i)->>'kakao_id', to_jsonb(i)->>'kakao', to_jsonb(i)->>'kakao_talk_id', to_jsonb(i)->>'line_id'),
  updated_at = now()
from public.interpreters i
where ip.interpreter_id = i.id;

do $$
begin
  if to_regclass('public.profiles') is not null then
    execute $sql$
      update public.interpreter_profiles ip
      set
        phone = coalesce(nullif(ip.phone, ''), to_jsonb(p)->>'phone', to_jsonb(p)->>'phone_number', to_jsonb(p)->>'contact_phone', to_jsonb(p)->>'mobile'),
        email = coalesce(nullif(ip.email, ''), to_jsonb(p)->>'email', to_jsonb(p)->>'user_email'),
        kakao_id = coalesce(nullif(ip.kakao_id, ''), to_jsonb(p)->>'kakao_id', to_jsonb(p)->>'kakao', to_jsonb(p)->>'kakao_talk_id', to_jsonb(p)->>'line_id'),
        updated_at = now()
      from public.profiles p
      where (
          ip.user_id = public.safe_uuid(to_jsonb(p)->>'id')
          or ip.user_id = public.safe_uuid(to_jsonb(p)->>'user_id')
          or ip.auth_user_id = public.safe_uuid(to_jsonb(p)->>'id')
          or ip.auth_user_id = public.safe_uuid(to_jsonb(p)->>'user_id')
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.job_applications') is not null then
    execute $sql$
      update public.interpreter_profiles ip
      set
        phone = coalesce(nullif(ip.phone, ''), to_jsonb(ja)->>'phone', to_jsonb(ja)->>'applicant_phone', to_jsonb(ja)->>'contact_phone'),
        email = coalesce(nullif(ip.email, ''), to_jsonb(ja)->>'email', to_jsonb(ja)->>'applicant_email', to_jsonb(ja)->>'contact_email'),
        kakao_id = coalesce(nullif(ip.kakao_id, ''), to_jsonb(ja)->>'kakao_id', to_jsonb(ja)->>'kakao', to_jsonb(ja)->>'kakao_talk_id', to_jsonb(ja)->>'line_id'),
        updated_at = now()
      from public.job_applications ja
      where nullif(to_jsonb(ja)->>'interpreter_id', '')::bigint = ip.interpreter_id
    $sql$;
  end if;

  if to_regclass('public.applications') is not null then
    execute $sql$
      update public.interpreter_profiles ip
      set
        phone = coalesce(nullif(ip.phone, ''), to_jsonb(a)->>'phone', to_jsonb(a)->>'applicant_phone', to_jsonb(a)->>'contact_phone'),
        email = coalesce(nullif(ip.email, ''), to_jsonb(a)->>'email', to_jsonb(a)->>'applicant_email', to_jsonb(a)->>'contact_email'),
        kakao_id = coalesce(nullif(ip.kakao_id, ''), to_jsonb(a)->>'kakao_id', to_jsonb(a)->>'kakao', to_jsonb(a)->>'kakao_talk_id', to_jsonb(a)->>'line_id'),
        updated_at = now()
      from public.applications a
      where nullif(to_jsonb(a)->>'interpreter_id', '')::bigint = ip.interpreter_id
    $sql$;
  end if;
end $$;

alter table public.interpreter_profiles enable row level security;

drop policy if exists "Interpreters can read own contact profile" on public.interpreter_profiles;
create policy "Interpreters can read own contact profile"
on public.interpreter_profiles
for select
to authenticated
using (auth_user_id = auth.uid() or user_id = auth.uid());

drop policy if exists "Interpreters can upsert own contact profile" on public.interpreter_profiles;
create policy "Interpreters can upsert own contact profile"
on public.interpreter_profiles
for all
to authenticated
using (auth_user_id = auth.uid() or user_id = auth.uid() or public.is_active_admin())
with check (auth_user_id = auth.uid() or user_id = auth.uid() or public.is_active_admin());

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
    (
      coalesce(ri.contact_visible, false)
      or coalesce(ri.contact_revealed, false)
      or coalesce(ri.is_contact_visible, false)
    ) as contact_visible,
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

notify pgrst, 'reload schema';
