alter table public.requests enable row level security;

drop policy if exists "Allow public request submissions" on public.requests;

create policy "Allow public request submissions"
on public.requests
for insert
to anon
with check (true);
