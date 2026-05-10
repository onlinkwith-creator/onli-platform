create extension if not exists pgcrypto;

alter table public.jobs
add column if not exists company_name text;

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  applicant_name text,
  phone text,
  email text,
  message text,
  status text not null default '지원완료',
  created_at timestamp with time zone not null default now()
);

create index if not exists job_applications_job_id_idx
on public.job_applications(job_id);

create index if not exists job_applications_created_at_idx
on public.job_applications(created_at desc);

do $$
begin
  if to_regclass('public.applications') is not null then
    execute $copy$
      insert into public.job_applications (
        job_id,
        applicant_name,
        phone,
        email,
        message,
        status,
        created_at
      )
      select
        old_app.job_id,
        old_app.name,
        old_app.phone,
        old_app.email,
        concat_ws(
          E'\n\n',
          nullif(old_app.message, ''),
          case when nullif(old_app.gender, '') is not null then '성별: ' || old_app.gender end,
          case when nullif(old_app.japanese_level, '') is not null then '일본어 수준: ' || old_app.japanese_level end,
          case when nullif(old_app.experience, '') is not null then '통역 경험: ' || old_app.experience end
        ),
        '지원완료',
        old_app.created_at
      from public.applications old_app
      where old_app.job_id is not null
        and not exists (
          select 1
          from public.job_applications existing
          where existing.job_id = old_app.job_id
            and coalesce(existing.email, '') = coalesce(old_app.email, '')
            and coalesce(existing.phone, '') = coalesce(old_app.phone, '')
        )
    $copy$;
  end if;
end $$;

alter table public.job_applications enable row level security;

-- TODO: 실서비스 전에는 관리자 인증 기준으로 select/update/delete 권한을 제한해야 함.
-- TODO: 실서비스 전에는 통역사 인증 또는 검증된 공개 지원 경로 기준으로 insert 권한을 제한해야 함.
drop policy if exists "TEMP public insert job applications" on public.job_applications;
create policy "TEMP public insert job applications"
on public.job_applications
for insert
to anon
with check (true);

drop policy if exists "TEMP admin read job applications" on public.job_applications;
create policy "TEMP admin read job applications"
on public.job_applications
for select
to anon
using (true);

drop policy if exists "TEMP admin update job applications" on public.job_applications;
create policy "TEMP admin update job applications"
on public.job_applications
for update
to anon
using (true)
with check (true);
