alter table public.requests
add column if not exists updated_at timestamptz default now();

update public.requests
set updated_at = coalesce(created_at, now())
where updated_at is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_requests_updated_at on public.requests;

create trigger set_requests_updated_at
before update on public.requests
for each row
execute function public.set_updated_at();
