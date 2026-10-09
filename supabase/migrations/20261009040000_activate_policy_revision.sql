begin;
do $$
begin
 if not exists(select 1 from public.policy_revisions where version='2026-10-09-v1'
  and content_sha256='715a2613bea56911ef44a580cdd45888d05a1ded726dd23ddc91493f597ccafe') then
  raise exception 'POLICY_FINAL_SOURCE_MISMATCH';
 end if;
end;
$$;
update public.policy_revisions set published_at=now(),effective_at=now()
where version='2026-10-09-v1' and published_at is null and effective_at is null;
commit;
