-- TODO: 실서비스 전에는 Supabase Auth 기반으로 통역사 본인 계정만 지원 가능하게 해야 함.
-- 지원자 직접 연락처 교환을 줄이기 위해 이메일 중심의 운영팀 중개 구조로 전환합니다.

alter table public.request_applications
add column if not exists applicant_email text;

alter table public.request_applications
alter column applicant_contact drop not null;

drop index if exists request_applications_request_contact_uidx;

create unique index if not exists request_applications_request_email_uidx
on public.request_applications(request_id, applicant_email)
where applicant_email is not null and applicant_email <> '';
