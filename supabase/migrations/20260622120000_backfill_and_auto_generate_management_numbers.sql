alter table public.requests
add column if not exists request_no text unique;

alter table public.jobs
add column if not exists job_no text unique;

create or replace function public.next_management_number(
  table_name regclass,
  column_name name,
  number_prefix text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  max_sequence integer;
begin
  perform pg_advisory_xact_lock(hashtext(table_name::text || '.' || column_name::text || ':' || number_prefix));

  execute format(
    'select coalesce(max(substring(%1$I from %2$L)::integer), 0)
       from %3$s
      where %1$I ~ %4$L',
    column_name,
    '^' || number_prefix || '-([0-9]+)$',
    table_name,
    '^' || number_prefix || '-[0-9]+$'
  )
  into max_sequence;

  return number_prefix || '-' || lpad((max_sequence + 1)::text, 3, '0');
end;
$$;

create or replace function public.generate_request_no()
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_management_number('public.requests'::regclass, 'request_no', 'ONLI-REQ');
$$;

create or replace function public.generate_job_no()
returns text
language sql
security definer
set search_path = public
as $$
  select public.next_management_number('public.jobs'::regclass, 'job_no', 'ONLI-JOB');
$$;

grant execute on function public.generate_request_no() to anon, authenticated, service_role;
grant execute on function public.generate_job_no() to anon, authenticated, service_role;

create or replace function public.set_request_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.request_no is null or btrim(new.request_no) = '' or new.request_no = '번호 미생성' then
    new.request_no := public.generate_request_no();
  end if;

  return new;
end;
$$;

create or replace function public.set_job_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.job_no is null or btrim(new.job_no) = '' or new.job_no = '번호 미생성' then
    new.job_no := public.generate_job_no();
  end if;

  return new;
end;
$$;

drop trigger if exists set_request_no_before_insert on public.requests;
create trigger set_request_no_before_insert
before insert on public.requests
for each row
execute function public.set_request_no();

drop trigger if exists set_job_no_before_insert on public.jobs;
create trigger set_job_no_before_insert
before insert on public.jobs
for each row
execute function public.set_job_no();

do $$
declare
  request_record record;
begin
  for request_record in
    select id
      from public.requests
     where request_no is null
        or btrim(request_no) = ''
        or request_no = '번호 미생성'
     order by created_at nulls first, id
  loop
    update public.requests
       set request_no = public.generate_request_no()
     where id = request_record.id
       and (
         request_no is null
         or btrim(request_no) = ''
         or request_no = '번호 미생성'
       );
  end loop;
end;
$$;

do $$
declare
  job_record record;
begin
  for job_record in
    select id
      from public.jobs
     where job_no is null
        or btrim(job_no) = ''
        or job_no = '번호 미생성'
     order by created_at nulls first, id
  loop
    update public.jobs
       set job_no = public.generate_job_no()
     where id = job_record.id
       and (
         job_no is null
         or btrim(job_no) = ''
         or job_no = '번호 미생성'
       );
  end loop;
end;
$$;
