-- Keep the application insert contract consistent across environments and let
-- PostgreSQL allocate collision-free management numbers.
alter table public.job_applications
  add column if not exists agreed_terms boolean not null default false,
  add column if not exists agreed_policy boolean not null default false,
  add column if not exists agreed_cancel_policy boolean not null default false,
  add column if not exists agreed_at timestamptz,
  add column if not exists cancel_policy_agreed_at timestamptz,
  add column if not exists application_no text;

update public.job_applications
set agreed_terms = false
where agreed_terms is null;

update public.job_applications
set agreed_policy = false
where agreed_policy is null;

update public.job_applications
set agreed_cancel_policy = false
where agreed_cancel_policy is null;

alter table public.job_applications
  alter column agreed_terms set default false,
  alter column agreed_terms set not null,
  alter column agreed_policy set default false,
  alter column agreed_policy set not null,
  alter column agreed_cancel_policy set default false,
  alter column agreed_cancel_policy set not null;

create sequence if not exists public.job_application_no_seq;

do $$
declare
  current_max bigint;
begin
  lock table public.job_applications in share row exclusive mode;

  select coalesce(max((regexp_match(application_no, '^ONLI-APP-([0-9]+)$'))[1]::bigint), 0)
    into current_max
  from public.job_applications
  where application_no ~ '^ONLI-APP-[0-9]+$';

  if current_max = 0 then
    perform setval('public.job_application_no_seq', 1, false);
  else
    perform setval('public.job_application_no_seq', current_max, true);
  end if;
end
$$;

alter sequence public.job_application_no_seq owned by public.job_applications.application_no;

alter table public.job_applications
  alter column application_no set default
    ('ONLI-APP-' || lpad(nextval('public.job_application_no_seq')::text, 3, '0'));

create unique index if not exists job_applications_job_interpreter_unique
on public.job_applications(job_id, interpreter_id)
where interpreter_id is not null
  and coalesce(status, 'pending') <> 'cancelled';
