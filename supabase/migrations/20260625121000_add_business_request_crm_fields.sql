-- Business request CRM fields for internal ON-LI operations.

alter table public.requests
add column if not exists event_start_time text,
add column if not exists event_end_time text,
add column if not exists language_direction text not null default '양방향',
add column if not exists materials_available boolean not null default false,
add column if not exists estimate_status text not null default 'estimate_pending',
add column if not exists company_internal_memo text;

create index if not exists requests_company_name_idx
on public.requests(company_name);

create index if not exists requests_estimate_status_idx
on public.requests(estimate_status);

alter table public.requests
drop constraint if exists requests_estimate_status_check;

alter table public.requests
add constraint requests_estimate_status_check
check (
  estimate_status in (
    'estimate_pending',
    'estimate_sent',
    'company_approved',
    'recruiting_interpreters',
    'assigned'
  )
);

drop policy if exists "Secure request reference reads" on storage.objects;
create policy "Secure request reference reads"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('request-files', 'request-reference-files')
  and (
    public.is_admin()
    or exists (
      select 1
      from public.requests r
      join public.interpreters i
        on i.auth_user_id = auth.uid()
      where
        (
          r.reference_file_path = storage.objects.name
          or r.reference_file_url = storage.objects.name
        )
        and (
          r.assigned_interpreter_id = i.id
          or r.matched_interpreter_id = i.id
          or exists (
            select 1
            from public.matchings m
            where m.request_id = r.id
              and m.interpreter_id = i.id
          )
          or exists (
            select 1
            from public.request_interpreters ri
            where ri.request_id = r.id
              and ri.interpreter_id = i.id
          )
        )
    )
  )
);
