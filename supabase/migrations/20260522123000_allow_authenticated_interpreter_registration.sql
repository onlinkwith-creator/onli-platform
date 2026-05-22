alter table public.interpreters
add column if not exists auth_user_id uuid;

drop policy if exists "Allow authenticated interpreter registration" on public.interpreters;
create policy "Allow authenticated interpreter registration"
on public.interpreters
for insert
to authenticated
with check (
  auth.uid() is not null
  and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
);

drop policy if exists "Allow authenticated interpreter profile read" on public.interpreters;
create policy "Allow authenticated interpreter profile read"
on public.interpreters
for select
to authenticated
using (
  auth.uid() is not null
  and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
);

drop policy if exists "Allow authenticated interpreter profile link" on public.interpreters;
create policy "Allow authenticated interpreter profile link"
on public.interpreters
for update
to authenticated
using (
  auth.uid() is not null
  and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
)
with check (
  auth.uid() is not null
  and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'))
);
