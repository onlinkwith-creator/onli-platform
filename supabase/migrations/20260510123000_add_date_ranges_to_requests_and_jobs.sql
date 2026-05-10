alter table public.requests
add column if not exists start_date date,
add column if not exists end_date date;

alter table public.jobs
add column if not exists start_date date,
add column if not exists end_date date;

update public.requests
set start_date = event_date::date,
    end_date = event_date::date
where event_date is not null
  and event_date::text ~ '^\d{4}-\d{2}-\d{2}$'
  and start_date is null
  and end_date is null;

update public.jobs
set start_date = event_date::date,
    end_date = event_date::date
where event_date is not null
  and event_date::text ~ '^\d{4}-\d{2}-\d{2}$'
  and start_date is null
  and end_date is null;
