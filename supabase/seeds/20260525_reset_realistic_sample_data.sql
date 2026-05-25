-- Reset test/sample data and recreate realistic records.
-- Preserve the real interpreter record for 강상인 and any jobs directly tied to that record.

begin;

create extension if not exists pgcrypto;

create temp table preserved_interpreter_ids (id bigint primary key) on commit drop;
create temp table preserved_job_ids (id uuid primary key) on commit drop;
create temp table reset_interpreter_ids (id bigint primary key) on commit drop;
create temp table reset_job_ids (id uuid primary key) on commit drop;

insert into preserved_interpreter_ids (id)
select id
from public.interpreters
where name = '강상인'
   or email = 'hyundle69@gmail.com'
   or interpreter_no = 'ONLI-INT-005';

insert into preserved_job_ids (id)
select distinct job_id
from public.job_applications
where job_id is not null
  and (
    interpreter_id in (select id from preserved_interpreter_ids)
    or email = 'hyundle69@gmail.com'
  );

insert into preserved_job_ids (id)
select distinct job_id
from public.matchings
where job_id is not null
  and interpreter_id in (select id from preserved_interpreter_ids)
on conflict do nothing;

insert into reset_interpreter_ids (id)
select id
from public.interpreters
where id not in (select id from preserved_interpreter_ids);

insert into reset_job_ids (id)
select id
from public.jobs
where id not in (select id from preserved_job_ids);

delete from public.matchings
where job_id in (select id from reset_job_ids)
   or interpreter_id in (select id from reset_interpreter_ids)
   or matching_no like 'ONLI-DEMO-MAT-%'
   or matching_no like 'ONLI-DEMO-MAT-%';

delete from public.job_applications
where job_id in (select id from reset_job_ids)
   or application_no like 'ONLI-DEMO-APP-%'
   or application_no like 'ONLI-DEMO-APP-%'
   or email like '%@onli-demo.local'
   or email like '%@onli-demo.local'
   or (
     coalesce(email, '') <> 'hyundle69@gmail.com'
     and coalesce(interpreter_id, 0) not in (select id from preserved_interpreter_ids)
   );

do $$
begin
  if to_regclass('public.applications') is not null then
    execute $sql$
      delete from public.applications
      where job_id in (select id from reset_job_ids)
         or application_no like 'ONLI-DEMO-APP-%'
         or application_no like 'ONLI-DEMO-APP-%'
         or email like '%@onli-demo.local'
         or email like '%@onli-demo.local'
         or (
           coalesce(email, '') <> 'hyundle69@gmail.com'
           and coalesce(interpreter_id, 0) not in (select id from preserved_interpreter_ids)
         )
    $sql$;
  end if;

  if to_regclass('public.notifications') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notifications'
        and column_name = 'job_id'
    ) then
      execute $sql$
        delete from public.notifications
        where job_id in (select id from reset_job_ids)
      $sql$;
    end if;
  end if;
end $$;

delete from public.jobs
where id in (select id from reset_job_ids);

delete from public.interpreters
where id in (select id from reset_interpreter_ids);

with interpreter_rows as (
  select *
  from (
    values
      ('ONLI-DEMO-INT-001', '김하린', '여성', '29', '도쿄', 'harin.kim@onli-demo.local', '080-4102-7301', '와세다대학교 국제교양학부', '@harin_onli', 'N1', '6년', true, '42', 'Lv4', true, '뷰티', array['뷰티', '전시회 운영', 'B2B 상담']::text[], array['도쿄', '요코하마', '치바']::text[], '코스메틱 전시 부스 상담, 바이어 미팅, 제품 데모 통역 가능', '일본 주요 뷰티 전시회에서 브랜드 런칭과 바이어 상담을 다수 지원했습니다. 제품 톤앤매너를 살려 자연스럽게 전달합니다.', 'active', 'active', 'approved'),
      ('ONLI-DEMO-INT-002', '佐藤ミナ', '여성', '34', '오사카', 'mina.sato@onli-demo.local', '080-5521-8840', '간사이대학교 상학부', 'mina_sato_line', 'N1', '일본 거주', true, '31', 'Lv3', true, '식품', array['식품', '무역', 'B2B 상담']::text[], array['오사카', '교토', '고베']::text[], '식품 박람회 상담, 수입 유통 미팅, 공장 견학 통역', '한국 식품 브랜드의 일본 유통 상담을 꾸준히 맡아왔습니다. 가격, MOQ, 납기 조건을 꼼꼼히 확인합니다.', 'active', 'active', 'approved'),
      ('ONLI-DEMO-INT-003', '박준서', '남성', '31', '도쿄', 'junseo.park@onli-demo.local', '070-9214-1103', '게이오대학교 미디어디자인 연구과', 'junseo_tokyo', 'N1', '8년', true, '55', 'Lv4', true, 'IT', array['IT', '게임', '스타트업']::text[], array['도쿄', '사이타마']::text[], 'SaaS 데모, 기술 미팅, 스타트업 피칭, 게임 퍼블리싱 상담', '개발팀과 비즈니스팀 사이의 기술 맥락을 빠르게 잡아 통역합니다. XR, AI, 클라우드 미팅 경험이 많습니다.', 'active', 'active', 'approved'),
      ('ONLI-DEMO-INT-004', '이소연', '여성', '27', '후쿠오카', 'soyeon.lee@onli-demo.local', '080-6720-4922', '규슈대학교 관광학 전공', 'soyeon_fukuoka', 'N1', '4년', true, '18', 'Lv2', true, '관광', array['관광', '전시회 운영', 'B2B 상담']::text[], array['후쿠오카', '사가', '나가사키']::text[], '관광 설명회, 지자체 상담회, 현장 안내 및 순차 통역', '지자체 관광 PR 행사와 팸투어 통역 경험이 있습니다. 현장 동선 안내와 고객 응대가 안정적입니다.', 'active', 'active', 'review_pending'),
      ('ONLI-DEMO-INT-005', '中村ユウキ', '남성', '38', '나고야', 'yuki.nakamura@onli-demo.local', '090-1183-6405', '나고야공업대학교', 'yuki_nagoya', 'N1', '일본 거주', true, '47', 'Lv3', true, '무역', array['무역', '제조', 'B2B 상담']::text[], array['나고야', '시즈오카', '도쿄']::text[], '제조/부품 상담, 무역 조건 협의, 공장 방문 통역', '자동차 부품과 산업재 상담 경험이 많습니다. 수치, 사양, 납품 조건을 정확하게 확인하는 편입니다.', 'active', 'active', 'approved'),
      ('ONLI-DEMO-INT-006', '최유나', '여성', '25', '도쿄', 'yuna.choi@onli-demo.local', '080-7342-2198', '릿쿄대학교 커뮤니케이션학부', 'yuna_line', 'N2', '3년', true, '12', 'Lv1', false, '패션', array['패션', '뷰티', '전시회 운영']::text[], array['도쿄', '요코하마']::text[], '팝업스토어 고객 응대, SNS 이벤트 안내, 전시 부스 운영 보조', '브랜드 팝업과 소비자 응대 중심의 현장 경험이 있습니다. 밝고 빠른 응대가 강점입니다.', 'active', 'active', 'review_pending'),
      ('ONLI-DEMO-INT-007', '정다은', '여성', '32', '교토', 'daeun.jung@onli-demo.local', '080-9011-3044', '도시샤대학교 생명의료학부', 'daeun_med', 'N1', '7년', true, '36', 'Lv4', true, '의료', array['의료', '전시회 운영', 'B2B 상담']::text[], array['교토', '오사카', '고베']::text[], '의료기기 전시, 병원 관계자 상담, 제품 교육 세션 통역', '의료기기와 헬스케어 분야 용어에 익숙합니다. 규제와 임상 관련 표현을 차분하게 전달합니다.', 'active', 'active', 'approved'),
      ('ONLI-DEMO-INT-008', '山本アキラ', '남성', '30', '도쿄', 'akira.yamamoto@onli-demo.local', '090-7740-1882', '도쿄공예대학교 게임학과', 'akira_games', 'N1', '일본 거주', true, '24', 'Lv2', true, '게임', array['게임', 'IT', '전시회 운영']::text[], array['도쿄', '치바', '요코하마']::text[], '게임쇼 부스 운영, 퍼블리셔 미팅, 시연 안내 통역', '인디게임부터 모바일 퍼블리싱 상담까지 경험했습니다. 유저 반응과 피드백을 자연스럽게 정리합니다.', 'active', 'active', 'approved'),
      ('ONLI-DEMO-INT-009', '한지민', '여성', '41', '요코하마', 'jimin.han@onli-demo.local', '080-3328-7751', '한국외국어대학교 일본어통번역학과', 'jimin_b2b', 'N1', '12년', true, '68', 'Lv4', true, 'B2B 상담', array['B2B 상담', '무역', '전시회 운영']::text[], array['도쿄', '요코하마', '치바']::text[], '임원 미팅, 계약 전 상담, 전시회 VIP 의전 및 순차 통역', 'B2B 상담과 임원 수행 통역을 오래 했습니다. 논의 흐름을 정리해 다음 액션까지 명확히 만드는 것을 중시합니다.', 'active', 'active', 'approved'),
      ('ONLI-DEMO-INT-010', '오세훈', '남성', '28', '삿포로', 'sehun.oh@onli-demo.local', '080-6147-9032', '홋카이도대학교 농학부', 'sehun_food', 'N2', '5년', true, '20', 'Lv1', false, '식품', array['식품', '관광', '전시회 운영']::text[], array['삿포로', '도쿄']::text[], '식품 시식 행사, 관광 설명회, 현장 고객 응대 통역', '식품과 지역 관광 행사에서 현장 운영을 함께 지원했습니다. 친절하고 안정적인 응대가 가능합니다.', 'active', 'active', 'review_pending')
  ) as rows(
    interpreter_no,
    name,
    gender,
    age,
    region,
    email,
    phone,
    school,
    kakao_or_line,
    jlpt,
    stay_period,
    has_experience,
    experience_count,
    level,
    approved,
    specialty,
    specialties,
    available_regions,
    available_tasks,
    short_intro,
    status,
    activity_status,
    badge_review_status
  )
)
insert into public.interpreters (
  interpreter_no,
  name,
  gender,
  age,
  region,
  email,
  phone,
  school,
  kakao_or_line,
  jlpt,
  stay_period,
  has_experience,
  experience_count,
  level,
  approved,
  specialties,
  available_regions,
  available_tasks,
  short_intro,
  strength,
  status,
  activity_status,
  badge_review_status,
  warning_count,
  agreed_terms,
  agreed_policy,
  agreed_at,
  resume_submitted_at
)
select
  interpreter_no,
  name,
  gender,
  age,
  region,
  email,
  phone,
  school,
  kakao_or_line,
  jlpt,
  stay_period,
  has_experience,
  experience_count,
  level,
  approved,
  specialties,
  available_regions,
  available_tasks,
  short_intro,
  specialty || ' 분야 현장 대응 및 상담 통역',
  status,
  activity_status,
  badge_review_status,
  0,
  true,
  true,
  now() - interval '10 days',
  case when badge_review_status = 'approved' then now() - interval '9 days' else now() - interval '2 days' end
from interpreter_rows;

with job_rows as (
  select *
  from (
    values
      ('ONLI-DEMO-JOB-001', 'Beautyworld Japan 2026 K-Beauty 부스 통역', 'Beautyworld Japan 2026', '라비앙코스메틱', '도쿄 빅사이트', '2026-06-15', '2026-06-17', '일급 32,000엔', '한일', 'Lv3', '뷰티 · 일본 바이어 상담 경험 우대', '2명', 2, '뷰티', '부스 방문 바이어 응대, 제품 라인업 소개, 샘플 발주 상담 지원', 'recruiting', 'waiting', 'before_operation', 'not_required', false, '2026-06-07'),
      ('ONLI-DEMO-JOB-002', 'XR EXPO Tokyo 기술 상담 통역', 'XR EXPO Tokyo', '넥스트리얼랩스', '마쿠하리 멧세', '2026-07-01', '2026-07-03', '일급 38,000엔', '한일', 'Lv4', 'XR/AI/SaaS 기술 미팅 경험자', '1명', 1, 'IT', 'XR 솔루션 데모, 파트너사 기술 미팅, 투자자 질의응답 통역', 'assigning', 'assigning', 'before_operation', 'not_required', false, '2026-06-20'),
      ('ONLI-DEMO-JOB-003', 'K-Food Premium Fair 오사카 상담회', 'K-Food Premium Fair Osaka', '한담푸드', '인텍스 오사카', '2026-06-22', '2026-06-23', '일급 30,000엔', '한일', 'Lv2', '식품 유통 상담 경험 우대', '3명', 3, '식품', '시식 부스 운영, 유통사 상담, 발주 조건 확인 및 현장 기록', 'recruiting', 'waiting', 'before_operation', 'not_required', true, '2026-06-10'),
      ('ONLI-DEMO-JOB-004', 'K-Beauty 시부야 팝업스토어 운영 통역', 'K-Beauty Shibuya Pop-up', '모어글로우', '도쿄 시부야', '2026-06-08', '2026-06-12', '일급 26,000엔', '한일', 'Lv1', '소비자 응대 가능자', '2명', 2, '뷰티', '팝업 방문객 응대, SNS 이벤트 안내, 매장 운영 보조', 'assigned', 'assigned', 'before_operation', 'not_required', false, '2026-05-31'),
      ('ONLI-DEMO-JOB-005', 'Medical Japan 의료기기 전시 상담 통역', 'Medical Japan Tokyo', '메디코어솔루션', '마쿠하리 멧세', '2026-10-07', '2026-10-09', '일급 42,000엔', '한일', 'Lv4', '의료기기 또는 헬스케어 경험 필수', '1명', 1, '의료', '의료기기 제품 설명, 병원 관계자 상담, 규제 관련 질의 통역', 'recruiting', 'waiting', 'before_operation', 'not_required', false, '2026-09-15'),
      ('ONLI-DEMO-JOB-006', '한국 관광 설명회 후쿠오카 로드쇼', 'Korea Tourism Roadshow Fukuoka', '한국관광 스타트업 협의체', '후쿠오카 국제회의장', '2026-06-28', '2026-06-28', '일급 28,000엔', '한일', 'Lv2', '관광/지자체 행사 경험자', '2명', 2, '관광', '관광 상품 발표, 여행사 상담, 현장 참가자 안내', 'completed', 'assigned', 'completed', 'completed', false, '2026-06-05'),
      ('ONLI-DEMO-JOB-007', 'Tokyo Game Show 인디게임 퍼블리싱 상담', 'Tokyo Game Show 2026', '플레이웨이브스튜디오', '마쿠하리 멧세', '2026-09-24', '2026-09-27', '일급 35,000엔', '한일', 'Lv3', '게임 전시/퍼블리싱 상담 경험자', '2명', 2, '게임', '게임 시연 안내, 퍼블리셔 미팅, 유저 피드백 전달', 'assigning', 'assigning', 'before_operation', 'not_required', true, '2026-09-05'),
      ('ONLI-DEMO-JOB-008', '나고야 제조 무역상담회 B2B 통역', 'Nagoya Manufacturing Trade Meeting', '에이치엠테크', '나고야 국제전시장', '2026-07-16', '2026-07-17', '일급 36,000엔', '한일', 'Lv3', '제조/무역 조건 협의 경험 우대', '1명', 1, '무역', '부품 사양 상담, 견적 조건 협의, 공장 방문 일정 조율', 'assigned', 'assigned', 'before_operation', 'not_required', false, '2026-07-01'),
      ('ONLI-DEMO-JOB-009', '도쿄 스타트업 피칭 데이 통역', 'Tokyo Startup Pitch Day', '브릿지벤처스코리아', '도쿄 미나토구', '2026-08-05', '2026-08-05', '일급 40,000엔', '한일', 'Lv4', '투자 미팅 및 IR 통역 경험자', '1명', 1, 'IT', '피칭 리허설, 투자자 질의응답, 네트워킹 통역', 'recruiting', 'waiting', 'before_operation', 'not_required', false, '2026-07-20'),
      ('ONLI-DEMO-JOB-010', 'Fashion World Tokyo 브랜드 상담 통역', 'Fashion World Tokyo', '누아르서울', '도쿄 빅사이트', '2026-10-13', '2026-10-15', '일급 31,000엔', '한일', 'Lv2', '패션/리테일 바이어 상담 경험 우대', '2명', 2, '패션', '바이어 상담, 룩북 설명, 샘플 오더 및 납기 조건 확인', 'recruiting', 'waiting', 'before_operation', 'not_required', false, '2026-09-25')
  ) as rows(
    job_no,
    title,
    event_name,
    company_name,
    location,
    start_date,
    end_date,
    pay,
    language,
    level,
    preference,
    people,
    people_count,
    field,
    description,
    status,
    assignment_status,
    operation_status,
    settlement_status,
    is_urgent,
    deadline
  )
)
insert into public.jobs (
  job_no,
  title,
  event_name,
  company_name,
  location,
  event_location,
  date,
  event_date,
  start_date,
  end_date,
  pay,
  language,
  level,
  requested_level,
  preference,
  people,
  people_count,
  field,
  visibility,
  status,
  assignment_status,
  operation_status,
  settlement_status,
  is_urgent,
  deadline,
  created_at
)
select
  job_no,
  title,
  event_name,
  company_name,
  location,
  location,
  case when start_date = end_date then start_date else start_date || ' ~ ' || end_date end,
  start_date,
  start_date::date,
  end_date::date,
  pay,
  language,
  level,
  level,
  preference || E'\n' || description,
  people,
  people_count,
  field,
  'public',
  status,
  assignment_status,
  operation_status,
  settlement_status,
  is_urgent,
  deadline::date,
  now() - interval '1 day' * row_number() over ()
from job_rows;

insert into public.job_applications (
  application_no,
  job_id,
  applicant_name,
  phone,
  applicant_phone,
  email,
  message,
  status,
  agreed_terms,
  agreed_policy,
  agreed_at,
  created_at
)
select
  app.application_no,
  job.id,
  interpreter.name,
  app.phone,
  regexp_replace(app.phone, '[\s\-\(\)]', '', 'g'),
  interpreter.email,
  app.message,
  app.status,
  true,
  true,
  now() - interval '4 days',
  now() - app.created_offset
from (
  values
    ('ONLI-DEMO-APP-001', 'ONLI-DEMO-JOB-001', 'ONLI-DEMO-INT-001', '080-4102-7301', '뷰티 바이어 상담 경험이 있어 제품 라인 설명과 샘플 발주 상담까지 대응 가능합니다.', 'accepted', interval '9 days'),
    ('ONLI-DEMO-APP-002', 'ONLI-DEMO-JOB-001', 'ONLI-DEMO-INT-006', '080-7342-2198', '팝업 운영 경험을 살려 소비자 응대와 부스 운영을 함께 지원하겠습니다.', 'reviewing', interval '8 days'),
    ('ONLI-DEMO-APP-003', 'ONLI-DEMO-JOB-002', 'ONLI-DEMO-INT-003', '070-9214-1103', 'XR 데모와 기술 미팅 통역 경험이 많아 사전 자료 확인 후 바로 투입 가능합니다.', 'accepted', interval '7 days'),
    ('ONLI-DEMO-APP-004', 'ONLI-DEMO-JOB-003', 'ONLI-DEMO-INT-002', '080-5521-8840', '오사카 식품 유통 상담회 경험이 있어 현장 기록까지 꼼꼼히 지원할 수 있습니다.', 'pending', interval '6 days'),
    ('ONLI-DEMO-APP-005', 'ONLI-DEMO-JOB-003', 'ONLI-DEMO-INT-010', '080-6147-9032', '식품 시식 행사 운영 경험이 있습니다. 고객 응대와 간단한 상담 통역 가능합니다.', 'reviewing', interval '5 days'),
    ('ONLI-DEMO-APP-006', 'ONLI-DEMO-JOB-004', 'ONLI-DEMO-INT-006', '080-7342-2198', '시부야 팝업 일정 전체 참여 가능합니다. SNS 이벤트 안내도 가능합니다.', 'accepted', interval '15 days'),
    ('ONLI-DEMO-APP-007', 'ONLI-DEMO-JOB-005', 'ONLI-DEMO-INT-007', '080-9011-3044', '의료기기 전시 상담 통역 경험이 있어 제품 교육 세션도 지원 가능합니다.', 'pending', interval '3 days'),
    ('ONLI-DEMO-APP-008', 'ONLI-DEMO-JOB-006', 'ONLI-DEMO-INT-004', '080-6720-4922', '후쿠오카 관광 설명회 현장 진행 경험이 있습니다. 참가자 안내까지 지원하겠습니다.', 'accepted', interval '20 days'),
    ('ONLI-DEMO-APP-009', 'ONLI-DEMO-JOB-007', 'ONLI-DEMO-INT-008', '090-7740-1882', '게임쇼 부스 운영과 퍼블리셔 상담 경험이 있어 적합합니다.', 'accepted', interval '4 days'),
    ('ONLI-DEMO-APP-010', 'ONLI-DEMO-JOB-007', 'ONLI-DEMO-INT-003', '070-9214-1103', '게임/IT 양쪽 미팅 모두 대응 가능합니다. 일정 전일 참여 가능합니다.', 'reviewing', interval '4 days'),
    ('ONLI-DEMO-APP-011', 'ONLI-DEMO-JOB-008', 'ONLI-DEMO-INT-005', '090-1183-6405', '나고야 제조 상담 경험이 많아 사양과 납기 조건 통역에 강점이 있습니다.', 'accepted', interval '12 days'),
    ('ONLI-DEMO-APP-012', 'ONLI-DEMO-JOB-009', 'ONLI-DEMO-INT-009', '080-3328-7751', 'IR 질의응답과 임원 미팅 통역을 안정적으로 진행할 수 있습니다.', 'pending', interval '2 days'),
    ('ONLI-DEMO-APP-013', 'ONLI-DEMO-JOB-010', 'ONLI-DEMO-INT-006', '080-7342-2198', '패션 팝업과 룩북 설명 경험이 있습니다. 바이어 응대 가능합니다.', 'pending', interval '1 day')
) as app(application_no, job_no, interpreter_no, phone, message, status, created_offset)
join public.jobs job on job.job_no = app.job_no
join public.interpreters interpreter on interpreter.interpreter_no = app.interpreter_no;

insert into public.matchings (
  matching_no,
  job_id,
  interpreter_id,
  start_date,
  end_date,
  status,
  created_at
)
select
  matching.matching_no,
  job.id,
  interpreter.id,
  matching.start_date::date,
  matching.end_date::date,
  matching.status,
  now() - matching.created_offset
from (
  values
    ('ONLI-DEMO-MAT-001', 'ONLI-DEMO-JOB-001', 'ONLI-DEMO-INT-001', '2026-06-15', '2026-06-17', 'pending', interval '8 days'),
    ('ONLI-DEMO-MAT-002', 'ONLI-DEMO-JOB-002', 'ONLI-DEMO-INT-003', '2026-07-01', '2026-07-03', 'assigned', interval '6 days'),
    ('ONLI-DEMO-MAT-003', 'ONLI-DEMO-JOB-004', 'ONLI-DEMO-INT-006', '2026-06-08', '2026-06-12', 'confirmed', interval '13 days'),
    ('ONLI-DEMO-MAT-004', 'ONLI-DEMO-JOB-006', 'ONLI-DEMO-INT-004', '2026-06-28', '2026-06-28', 'completed', interval '18 days'),
    ('ONLI-DEMO-MAT-005', 'ONLI-DEMO-JOB-007', 'ONLI-DEMO-INT-008', '2026-09-24', '2026-09-27', 'assigned', interval '3 days'),
    ('ONLI-DEMO-MAT-006', 'ONLI-DEMO-JOB-008', 'ONLI-DEMO-INT-005', '2026-07-16', '2026-07-17', 'confirmed', interval '10 days')
) as matching(matching_no, job_no, interpreter_no, start_date, end_date, status, created_offset)
join public.jobs job on job.job_no = matching.job_no
join public.interpreters interpreter on interpreter.interpreter_no = matching.interpreter_no;

commit;
