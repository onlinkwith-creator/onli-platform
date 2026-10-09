begin;
do $$
begin
 if not exists(select 1 from public.policy_revisions where version='2026-10-09-v2'
  and content_sha256='53da22727e7aa415977cec7bbfad293237b1a270abd756526a1a605f67117f9b') then
  raise exception 'POLICY_FINAL_SOURCE_MISMATCH';
 end if;
end;
$$;
update public.policy_revisions set published_at=now(),effective_at=now()
where version='2026-10-09-v2' and published_at is null and effective_at is null;
commit;
