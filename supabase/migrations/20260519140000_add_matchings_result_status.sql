do $$
begin
  if to_regclass('public.matchings') is not null then
    alter table public.matchings
    add column if not exists status text default 'pending';

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'matchings'
        and column_name = 'matching_status'
    ) then
      update public.matchings
      set status = matching_status
      where (status is null or status = '')
        and matching_status is not null;
    end if;

    update public.matchings
    set status = 'pending'
    where status is null or status = '';

    alter table public.matchings
    drop constraint if exists matchings_status_check;

    alter table public.matchings
    add constraint matchings_status_check
    check (status in ('pending', 'accepted', 'rejected', 'assigned', 'cancelled'));
  end if;
end $$;
