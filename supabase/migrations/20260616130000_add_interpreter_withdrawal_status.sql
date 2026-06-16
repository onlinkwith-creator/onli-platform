alter table public.interpreters
add column if not exists withdrawn_at timestamptz;

create index if not exists interpreters_withdrawn_at_idx
on public.interpreters(withdrawn_at);

create index if not exists interpreters_public_active_idx
on public.interpreters(status, is_public)
where coalesce(status, '') <> 'withdrawn';

drop policy if exists "Interpreters can withdraw own profile" on public.interpreters;
create policy "Interpreters can withdraw own profile"
on public.interpreters
for update
to authenticated
using (
  auth.uid() is not null
  and (
    auth_user_id = auth.uid()
    or lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
  )
)
with check (
  auth.uid() is not null
  and (
    auth_user_id = auth.uid()
    or lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
  )
);

do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles
      add column if not exists status text default 'active';
    alter table public.profiles
      add column if not exists withdrawn_at timestamptz;
  end if;

  if to_regclass('public.users') is not null then
    alter table public.users
      add column if not exists status text default 'active';
    alter table public.users
      add column if not exists withdrawn_at timestamptz;
  end if;
end $$;
