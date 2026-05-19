do $$
begin
  alter table public.jobs drop constraint if exists jobs_status_check;
  alter table public.jobs
  add constraint jobs_status_check
  check (
    status in (
      'open',
      '모집중',
      'recruiting',
      'assigning',
      '배정중',
      'closing_soon',
      '마감임박',
      'closed',
      '마감',
      '모집마감',
      'assigned',
      '배정완료',
      'completed',
      '완료',
      '운영완료',
      'cancelled'
    )
  );
end $$;
