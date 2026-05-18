alter table public.jobs
alter column status set default 'open';

update public.jobs
set status = case
  when status in ('모집중', 'open', 'OPEN') then 'open'
  when status in ('마감임박', 'closing_soon') then 'closing_soon'
  when status in ('마감', '모집마감', 'closed', 'CLOSED') then 'closed'
  when status in ('배정', '배정완료', 'assigned') then 'assigned'
  when status in ('완료', '운영완료', 'completed') then 'completed'
  when status in ('취소', 'cancelled', 'canceled') then 'cancelled'
  else 'open'
end;

alter table public.job_applications
alter column status set default 'pending';

update public.job_applications
set status = case
  when status in ('지원접수', '지원완료', '대기', 'pending') then 'pending'
  when status in ('검토중', '보류', 'reviewing') then 'reviewing'
  when status in ('합격', '승인', '매칭완료', 'accepted', 'approved') then 'accepted'
  when status in ('불합격', '거절', 'rejected') then 'rejected'
  when status in ('취소', 'cancelled', 'canceled') then 'cancelled'
  else 'pending'
end;

do $$
begin
  if to_regclass('public.applications') is not null then
    alter table public.applications
    add column if not exists status text default 'pending';

    update public.applications
    set status = case
      when status in ('지원접수', '지원완료', '대기', 'pending') then 'pending'
      when status in ('검토중', '보류', 'reviewing') then 'reviewing'
      when status in ('합격', '승인', '매칭완료', 'accepted', 'approved') then 'accepted'
      when status in ('불합격', '거절', 'rejected') then 'rejected'
      when status in ('취소', 'cancelled', 'canceled') then 'cancelled'
      else 'pending'
    end;
  end if;
end $$;

do $$
begin
  if to_regclass('public.matchings') is not null then
    alter table public.matchings
    alter column status set default 'draft';

    update public.matchings
    set status = case
      when status in ('임시배정', 'draft') then 'draft'
      when status in ('배정완료', '배정', '매칭완료', 'assigned', 'matched') then 'assigned'
      when status in ('확정', 'confirmed') then 'confirmed'
      when status in ('운영중', '진행중', 'in_progress', 'in progress') then 'in_progress'
      when status in ('완료', '운영완료', 'completed') then 'completed'
      when status in ('정산대기', 'settlement_pending') then 'settlement_pending'
      when status in ('정산완료', 'settled') then 'settled'
      when status in ('취소', 'cancelled', 'canceled') then 'cancelled'
      else 'draft'
    end;
  end if;
end $$;

update public.requests
set status = case
  when status in ('임시배정', '대기', 'pending', 'draft') then 'draft'
  when status in ('배정완료', '배정', '매칭완료', 'assigned', 'matched') then 'assigned'
  when status in ('확정', 'confirmed') then 'confirmed'
  when status in ('운영중', '진행중', 'matching', 'in_progress', 'in progress') then 'in_progress'
  when status in ('완료', '운영완료', 'completed') then 'completed'
  when status in ('정산대기', 'settlement_pending') then 'settlement_pending'
  when status in ('정산완료', 'settled') then 'settled'
  when status in ('취소', 'cancelled', 'canceled') then 'cancelled'
  else 'draft'
end;

update public.requests
set matching_status = case
  when matching_status in ('임시배정', '대기', 'pending', 'draft') then 'draft'
  when matching_status in ('배정완료', '배정', '매칭완료', 'assigned', 'matched') then 'assigned'
  when matching_status in ('확정', 'confirmed') then 'confirmed'
  when matching_status in ('운영중', '진행중', 'matching', 'in_progress', 'in progress') then 'in_progress'
  when matching_status in ('완료', '운영완료', 'completed') then 'completed'
  when matching_status in ('정산대기', 'settlement_pending') then 'settlement_pending'
  when matching_status in ('정산완료', 'settled') then 'settled'
  when matching_status in ('취소', 'cancelled', 'canceled') then 'cancelled'
  else 'draft'
end
where matching_status is not null;

alter table public.requests
alter column status set default 'draft';

do $$
begin
  alter table public.jobs drop constraint if exists jobs_status_check;
  alter table public.jobs
  add constraint jobs_status_check
  check (status in ('open', 'closing_soon', 'closed', 'assigned', 'completed', 'cancelled'));

  alter table public.job_applications drop constraint if exists job_applications_status_check;
  alter table public.job_applications
  add constraint job_applications_status_check
  check (status in ('pending', 'reviewing', 'accepted', 'rejected', 'cancelled'));

  if to_regclass('public.applications') is not null then
    alter table public.applications drop constraint if exists applications_status_check;
    alter table public.applications
    add constraint applications_status_check
    check (status in ('pending', 'reviewing', 'accepted', 'rejected', 'cancelled'));
  end if;

  if to_regclass('public.matchings') is not null then
    alter table public.matchings drop constraint if exists matchings_status_check;
    alter table public.matchings
    add constraint matchings_status_check
    check (status in (
      'draft',
      'assigned',
      'confirmed',
      'in_progress',
      'completed',
      'settlement_pending',
      'settled',
      'cancelled'
    ));
  end if;

  alter table public.requests drop constraint if exists requests_status_check;
  alter table public.requests
  add constraint requests_status_check
  check (status in (
    'draft',
    'assigned',
    'confirmed',
    'in_progress',
    'completed',
    'settlement_pending',
    'settled',
    'cancelled'
  ));
end $$;
