-- TODO: 실서비스 전에는 Supabase Auth 또는 관리자 비밀번호 보호 필요.
-- 빠른 MVP 테스트를 위해 anon role이 /admin 화면에서 목록 조회와 승인 변경을 할 수 있게 여는 정책입니다.

alter table public.interpreters
add column if not exists approved boolean not null default false;

update public.interpreters
set approved = true
where status = 'approved';

alter table public.requests enable row level security;
alter table public.interpreters enable row level security;

drop policy if exists "TEMP admin read requests" on public.requests;
create policy "TEMP admin read requests"
on public.requests
for select
to anon
using (true);

drop policy if exists "Allow public interpreter registration" on public.interpreters;
create policy "Allow public interpreter registration"
on public.interpreters
for insert
to anon
with check (true);

drop policy if exists "TEMP admin read interpreters" on public.interpreters;
create policy "TEMP admin read interpreters"
on public.interpreters
for select
to anon
using (true);

drop policy if exists "TEMP admin update interpreter approval" on public.interpreters;
create policy "TEMP admin update interpreter approval"
on public.interpreters
for update
to anon
using (true)
with check (true);
