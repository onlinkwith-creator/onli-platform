-- TODO: 실서비스 전에는 Supabase Auth 관리자 권한으로 delete 정책을 제한해야 함.
-- 개발 단계의 /admin 통역 공고 삭제 기능 검증을 위해 anon role에 임시 삭제 권한을 엽니다.

drop policy if exists "TEMP admin delete job applications" on public.job_applications;
create policy "TEMP admin delete job applications"
on public.job_applications
for delete
to anon
using (true);
