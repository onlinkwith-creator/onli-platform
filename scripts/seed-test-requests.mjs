import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

async function readEnvFile(path) {
  try {
    const text = await readFile(path, "utf8");
    return Object.fromEntries(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [
            line.slice(0, index),
            line.slice(index + 1).replace(/^['"]|['"]$/g, ""),
          ];
        })
    );
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

const privateEnv = await readEnvFile(".env.private.local");
const dbUrl = (await readFile("supabase/.temp/pooler-url", "utf8")).trim();
const password = privateEnv.SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD;

if (!dbUrl || !password) {
  throw new Error("Supabase DB connection is missing. Check supabase/.temp/pooler-url and .env.private.local.");
}

const sql = String.raw`
\set ON_ERROR_STOP on

begin;

alter table public.requests disable trigger user;
alter table public.jobs disable trigger user;
alter table public.job_applications disable trigger user;
alter table public.request_interpreters disable trigger user;
alter table public.interpreters disable trigger user;
alter table public.settlements disable trigger user;

create temp table seed_companies (
  key text primary key,
  auth_user_id uuid not null,
  company_name text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  business_number text not null
) on commit drop;

insert into seed_companies values
  ('A', '11111111-1111-4111-8111-000000000001', 'TEST COMPANY A', '테스트 담당자 A', 'test-company-a@example.invalid', '000-1000-0001', 'TEST-BIZ-0001'),
  ('B', '11111111-1111-4111-8111-000000000002', 'TEST COMPANY B', '테스트 담당자 B', 'test-company-b@example.invalid', '000-1000-0002', 'TEST-BIZ-0002'),
  ('C', '11111111-1111-4111-8111-000000000003', 'TEST COMPANY C', '테스트 담당자 C', 'test-company-c@example.invalid', '000-1000-0003', 'TEST-BIZ-0003');

create temp table seed_interpreters (
  key text primary key,
  auth_user_id uuid not null,
  interpreter_no text not null,
  name text not null,
  region text not null,
  email text not null,
  phone text not null,
  level text not null
) on commit drop;

insert into seed_interpreters values
  ('I1', '22222222-2222-4222-8222-000000000001', 'TEST-INT-001', '테스트 도쿄 통역사 A', '도쿄', 'onli-auto-test-interpreter-a@example.invalid', '000-2000-0001', 'Lv1'),
  ('I2', '22222222-2222-4222-8222-000000000002', 'TEST-INT-002', '테스트 오사카 통역사 B', '오사카', 'onli-auto-test-interpreter-b@example.invalid', '000-2000-0002', 'Lv2'),
  ('I3', '22222222-2222-4222-8222-000000000003', 'TEST-INT-003', '테스트 나고야 통역사 C', '나고야', 'onli-auto-test-interpreter-c@example.invalid', '000-2000-0003', 'Lv3'),
  ('I4', '22222222-2222-4222-8222-000000000004', 'TEST-INT-004', '테스트 후쿠오카 통역사 D', '후쿠오카', 'onli-auto-test-interpreter-d@example.invalid', '000-2000-0004', 'Lv4'),
  ('I5', '22222222-2222-4222-8222-000000000005', 'TEST-INT-005', '테스트 삿포로 통역사 E', '삿포로', 'onli-auto-test-interpreter-e@example.invalid', '000-2000-0005', 'Lv2');

create temp table seed_requests (
  idx int primary key,
  event_name text not null,
  company_key text not null,
  interpreter_key text not null,
  location text not null,
  start_date date not null,
  end_date date not null,
  level text not null,
  daily_rate int not null,
  work_days int not null,
  estimate_status text not null,
  assignment_status text not null,
  operation_status text not null,
  settlement_status text not null,
  application_status text not null
) on commit drop;

insert into seed_requests values
  (1, '[TEST] 도쿄 전시회 통역', 'A', 'I1', '도쿄', '2026-07-12', '2026-07-12', 'Lv1', 180000, 1, 'estimate_preparing', 'assignment_pending', 'operation_before', 'settlement_waiting', 'pending'),
  (2, '[TEST] 오사카 상담회', 'B', 'I2', '오사카', '2026-07-20', '2026-07-21', 'Lv2', 200000, 2, 'estimate_required', 'assignment_in_progress', 'operation_preparing', 'settlement_confirmed', 'reviewing'),
  (3, '[TEST] 나고야 바이어 미팅', 'C', 'I3', '나고야', '2026-08-05', '2026-08-07', 'Lv3', 230000, 3, 'estimate_approved', 'assignment_completed', 'operation_scheduled', 'settlement_paying', 'accepted'),
  (4, '[TEST] 후쿠오카 식품 박람회', 'A', 'I4', '후쿠오카', '2026-08-18', '2026-08-22', 'Lv4', 245000, 5, 'estimate_preparing', 'assignment_pending', 'operation_in_progress', 'settlement_completed', 'accepted'),
  (5, '[TEST] 삿포로 관광 세미나', 'B', 'I5', '삿포로', '2026-09-03', '2026-09-03', 'Lv2', 200000, 1, 'estimate_required', 'assignment_in_progress', 'operation_completed', 'settlement_waiting', 'accepted'),
  (6, '[TEST] 도쿄 의료기기 상담회', 'C', 'I1', '도쿄', '2026-09-10', '2026-09-11', 'Lv1', 180000, 2, 'estimate_approved', 'assignment_completed', 'operation_before', 'settlement_confirmed', 'accepted'),
  (7, '[TEST] 오사카 게임 콘텐츠 미팅', 'A', 'I2', '오사카', '2026-09-24', '2026-09-26', 'Lv3', 230000, 3, 'estimate_preparing', 'assignment_pending', 'operation_preparing', 'settlement_paying', 'reviewing'),
  (8, '[TEST] 나고야 스타트업 피칭', 'B', 'I3', '나고야', '2026-10-02', '2026-10-06', 'Lv4', 245000, 5, 'estimate_required', 'assignment_in_progress', 'operation_scheduled', 'settlement_completed', 'accepted'),
  (9, '[TEST] 후쿠오카 제조업 바이어 미팅', 'C', 'I4', '후쿠오카', '2026-10-15', '2026-10-15', 'Lv2', 200000, 1, 'estimate_approved', 'assignment_completed', 'operation_in_progress', 'settlement_waiting', 'accepted'),
  (10, '[TEST] 삿포로 K-푸드 프로모션', 'A', 'I5', '삿포로', '2026-10-27', '2026-10-28', 'Lv1', 180000, 2, 'estimate_approved', 'assignment_completed', 'operation_completed', 'settlement_completed', 'accepted');

create temp table existing_test_requests as
select id, job_id
from public.requests
where event_name like '[TEST]%'
   or request_no like 'TEST-REQ-%'
   or company_internal_memo = 'AUTO GENERATED TEST DATA';

delete from public.payments where request_id in (select id from existing_test_requests);
delete from public.documents
where request_id in (select id from existing_test_requests)
   or metadata->>'marker' = 'AUTO GENERATED TEST DATA';
delete from public.settlements where request_id in (select id from existing_test_requests);
delete from public.request_interpreters where request_id in (select id from existing_test_requests);
delete from public.job_applications
where job_id in (select job_id from existing_test_requests where job_id is not null)
   or application_no like 'TEST-APP-%';
delete from public.requests where id in (select id from existing_test_requests);
delete from public.jobs
where job_no like 'TEST-JOB-%'
   or title like '[TEST]%'
   or company_name like 'TEST COMPANY%';
delete from public.businesses
where company_name like 'TEST COMPANY%'
   and notes = 'AUTO GENERATED TEST DATA';
delete from public.interpreters
where interpreter_no like 'TEST-INT-%'
   or admin_memo = 'AUTO GENERATED TEST DATA';

delete from auth.users
where id in (select auth_user_id from seed_companies)
   or id in (select auth_user_id from seed_interpreters)
   or email like 'test-company-%@example.invalid'
   or email like 'onli-auto-test-interpreter-%@example.invalid';

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  auth_user_id,
  'authenticated',
  'authenticated',
  contact_email,
  null,
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('role', 'business', 'company_name', company_name, 'marker', 'AUTO GENERATED TEST DATA'),
  now(),
  now()
from seed_companies
union all
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  auth_user_id,
  'authenticated',
  'authenticated',
  email,
  null,
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('role', 'interpreter', 'name', name, 'marker', 'AUTO GENERATED TEST DATA'),
  now(),
  now()
from seed_interpreters;

create temp table business_map as
with inserted as (
insert into public.businesses (
  auth_user_id,
  company_name,
  business_number,
  contact_name,
  contact_email,
  contact_phone,
  country,
  primary_fields,
  tax_invoice_required,
  notes,
  status
)
select
  auth_user_id,
  company_name,
  business_number,
  contact_name,
  contact_email,
  contact_phone,
  '일본',
  array['전시회', '상담회'],
  true,
  'AUTO GENERATED TEST DATA',
  '승인 완료'
from seed_companies
returning id, auth_user_id, company_name
) select * from inserted;

create temp table interpreter_map as
with inserted as (
insert into public.interpreters (
  auth_user_id,
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
  experience_count,
  status,
  approved,
  warning_count,
  level,
  specialties,
  available_regions,
  available_tasks,
  has_experience,
  agreed_terms,
  agreed_policy,
  agreed_at,
  activity_status,
  admin_memo,
  is_public
)
select
  auth_user_id,
  interpreter_no,
  name,
  '테스트',
  '29',
  region,
  email,
  phone,
  'ON-LI 테스트',
  'AUTO-TEST',
  'N1',
  '5년',
  '12',
  'active',
  true,
  0,
  level,
  array['테스트', '전시회'],
  array[region],
  'AUTO GENERATED TEST DATA',
  true,
  true,
  true,
  now(),
  'active',
  'AUTO GENERATED TEST DATA',
  true
from seed_interpreters
returning id, auth_user_id, interpreter_no, name, email, phone
) select * from inserted;

create temp table job_map as
with inserted as (
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
  status,
  is_urgent,
  visibility,
  field,
  assignment_status,
  operation_status,
  settlement_status
)
select
  format('TEST-JOB-%s', lpad(idx::text, 3, '0')),
  event_name || ' 모집',
  event_name,
  c.company_name,
  location,
  location,
  start_date::text || ' ~ ' || end_date::text,
  start_date::text,
  start_date,
  end_date,
  daily_rate::text,
  '한국어↔일본어',
  level,
  level,
  'AUTO GENERATED TEST DATA',
  '1명',
  1,
  case
    when assignment_status = 'assignment_pending' then 'recruiting'
    when assignment_status = 'assignment_in_progress' then 'assigning'
    when operation_status = 'operation_completed' then 'completed'
    else 'assigned'
  end,
  false,
  'public',
  '테스트',
  assignment_status,
  operation_status,
  case
    when settlement_status = 'settlement_waiting' then 'pending'
    when settlement_status = 'settlement_confirmed' then 'confirmed'
    when settlement_status = 'settlement_paying' then 'confirmed'
    when settlement_status = 'settlement_completed' then 'completed'
    else 'not_required'
  end
from seed_requests r
join seed_companies c on c.key = r.company_key
returning id, job_no, event_name
) select * from inserted;

create temp table request_map as
with inserted as (
insert into public.requests (
  request_no,
  job_id,
  company_auth_user_id,
  company_name,
  manager_name,
  contact_name,
  email,
  phone,
  contact_email_or_phone,
  event_name,
  event_date,
  start_date,
  end_date,
  event_location,
  work_hours,
  urgency,
  estimated_price,
  interpreter_pay,
  request_detail,
  request_details,
  job_description,
  status,
  matching_status,
  contact_status,
  client_price,
  interpreter_price,
  profit,
  payment_status,
  is_public,
  is_job_public,
  required_level,
  requested_level,
  client_visible_name,
  dress_code,
  interpreter_fee,
  job_field,
  required_count,
  requested_people_count,
  preferred_gender,
  interpretation_field,
  company_amount,
  interpreter_payment,
  platform_profit,
  settlement_status,
  assignment_status,
  operation_status,
  request_type,
  admin_checked,
  checked_at,
  estimate_status,
  company_internal_memo,
  language_direction,
  materials_available,
  settlement_work_days,
  settlement_level,
  settlement_base_amount,
  settlement_extra_amount,
  settlement_deduction_amount,
  settlement_final_amount,
  settlement_memo,
  assigned_interpreter_id,
  assigned_interpreter_name,
  matched_interpreter_id,
  matched_interpreter_name
)
select
  format('TEST-REQ-%s', lpad(r.idx::text, 3, '0')),
  j.id,
  c.auth_user_id,
  c.company_name,
  c.contact_name,
  c.contact_name,
  c.contact_email,
  c.contact_phone,
  c.contact_email,
  r.event_name,
  r.start_date,
  r.start_date,
  r.end_date,
  r.location,
  8,
  'normal',
  r.daily_rate * r.work_days + 50000,
  r.daily_rate * r.work_days,
  'AUTO GENERATED TEST DATA',
  'AUTO GENERATED TEST DATA',
  'AUTO GENERATED TEST DATA',
  case
    when r.operation_status = 'operation_completed' then 'completed'
    when r.operation_status = 'operation_in_progress' then 'in_progress'
    when r.assignment_status = 'assignment_completed' then 'assigned'
    else 'draft'
  end,
  case
    when r.operation_status = 'operation_completed' then 'completed'
    when r.operation_status = 'operation_in_progress' then 'in_progress'
    when r.assignment_status = 'assignment_completed' then 'assigned'
    else 'draft'
  end,
  'contacted',
  r.daily_rate * r.work_days + 50000,
  r.daily_rate * r.work_days,
  50000,
  case when r.estimate_status = 'estimate_approved' then 'invoice_sent' else 'unpaid' end,
  true,
  true,
  r.level,
  r.level,
  c.company_name,
  '비즈니스 캐주얼',
  r.daily_rate * r.work_days,
  '테스트',
  1,
  1,
  '무관',
  '테스트',
  r.daily_rate * r.work_days + 50000,
  r.daily_rate * r.work_days,
  50000,
  case
    when r.settlement_status = 'settlement_waiting' then 'pending'
    when r.settlement_status = 'settlement_confirmed' then 'confirmed'
    when r.settlement_status = 'settlement_completed' then 'completed'
    else 'pending'
  end,
  r.assignment_status,
  r.operation_status,
  'general',
  true,
  now(),
  r.estimate_status,
  'AUTO GENERATED TEST DATA',
  'ko-ja',
  true,
  r.work_days,
  r.level,
  r.daily_rate * r.work_days,
  0,
  0,
  r.daily_rate * r.work_days,
  'AUTO GENERATED TEST DATA',
  i.id,
  i.name,
  i.id,
  i.name
from seed_requests r
join seed_companies c on c.key = r.company_key
join seed_interpreters si on si.key = r.interpreter_key
join interpreter_map i on i.interpreter_no = si.interpreter_no
join job_map j on j.job_no = format('TEST-JOB-%s', lpad(r.idx::text, 3, '0'))
returning id, request_no, job_id, event_name, assigned_interpreter_id
) select * from inserted;

create temp table application_map as
with inserted as (
insert into public.job_applications (
  application_no,
  job_id,
  interpreter_id,
  applicant_name,
  applicant_email,
  applicant_phone,
  email,
  phone,
  message,
  status,
  agreed_terms,
  agreed_policy,
  agreed_at,
  agreed_cancel_policy,
  cancel_policy_agreed_at
)
select
  format('TEST-APP-%s', lpad(r.idx::text, 3, '0')),
  j.id,
  i.id,
  i.name,
  i.email,
  i.phone,
  i.email,
  i.phone,
  'AUTO GENERATED TEST DATA',
  r.application_status,
  true,
  true,
  now(),
  true,
  now()
from seed_requests r
join seed_interpreters si on si.key = r.interpreter_key
join interpreter_map i on i.interpreter_no = si.interpreter_no
join job_map j on j.job_no = format('TEST-JOB-%s', lpad(r.idx::text, 3, '0'))
returning id, application_no, job_id, interpreter_id
) select * from inserted;

create temp table assignment_map as
with inserted as (
insert into public.request_interpreters (
  request_id,
  interpreter_id,
  assigned_at,
  is_contact_visible,
  contact_visible
)
select
  rm.id,
  rm.assigned_interpreter_id,
  now(),
  true,
  true
from request_map rm
returning id, request_id, interpreter_id
) select * from inserted;

create temp table settlement_map as
with inserted as (
insert into public.settlements (
  request_id,
  interpreter_id,
  interpreter_auth_user_id,
  assignment_id,
  amount,
  payout_status,
  work_days,
  daily_rate,
  extra_amount,
  deduction_amount,
  paid_at,
  payment_method,
  admin_memo,
  applied_level,
  settlement_status,
  settlement_confirmed_at,
  interpreter_payment_started_at,
  settlement_completed_at
)
select
  rm.id,
  am.interpreter_id,
  i.auth_user_id,
  'request_interpreters:' || am.id::text,
  r.daily_rate * r.work_days,
  case
    when r.settlement_status = 'settlement_completed' then 'paid'
    when r.settlement_status in ('settlement_confirmed', 'settlement_paying') then 'confirmed'
    else 'pending'
  end,
  r.work_days,
  r.daily_rate,
  0,
  0,
  case when r.settlement_status = 'settlement_completed' then now() else null end,
  case when r.settlement_status = 'settlement_completed' then 'bank_transfer' else null end,
  'AUTO GENERATED TEST DATA',
  r.level,
  r.settlement_status,
  case when r.settlement_status in ('settlement_confirmed', 'settlement_paying', 'settlement_completed') then now() else null end,
  case when r.settlement_status in ('settlement_paying', 'settlement_completed') then now() else null end,
  case when r.settlement_status = 'settlement_completed' then now() else null end
from seed_requests r
join request_map rm on rm.request_no = format('TEST-REQ-%s', lpad(r.idx::text, 3, '0'))
join assignment_map am on am.request_id = rm.id
join interpreter_map i on i.id = am.interpreter_id
returning id, request_id, interpreter_id, settlement_status
) select * from inserted;

insert into public.documents (
  document_type,
  document_no,
  status,
  version,
  request_id,
  company_id,
  company_auth_user_id,
  interpreter_id,
  interpreter_auth_user_id,
  settlement_id,
  title,
  amount,
  storage_bucket,
  file_path,
  metadata
)
select
  'estimate',
  format('TEST-EST-%s', lpad(r.idx::text, 3, '0')),
  'issued',
  1,
  rm.id,
  bm.id,
  bm.auth_user_id,
  im.id,
  im.auth_user_id,
  null,
  r.event_name || ' 견적서',
  r.daily_rate * r.work_days + 50000,
  'documents',
  format('test/estimate/TEST-EST-%s.pdf', lpad(r.idx::text, 3, '0')),
  jsonb_build_object('marker', 'AUTO GENERATED TEST DATA', 'document_label', '견적서', 'request_no', rm.request_no)
from seed_requests r
join request_map rm on rm.request_no = format('TEST-REQ-%s', lpad(r.idx::text, 3, '0'))
join seed_companies sc on sc.key = r.company_key
join business_map bm on bm.company_name = sc.company_name
join seed_interpreters si on si.key = r.interpreter_key
join interpreter_map im on im.interpreter_no = si.interpreter_no
union all
select
  'completion',
  format('TEST-COMP-%s', lpad(r.idx::text, 3, '0')),
  'issued',
  1,
  rm.id,
  bm.id,
  bm.auth_user_id,
  im.id,
  im.auth_user_id,
  sm.id::text,
  r.event_name || ' 업무확인서',
  r.daily_rate * r.work_days,
  'documents',
  format('test/completion/TEST-COMP-%s.pdf', lpad(r.idx::text, 3, '0')),
  jsonb_build_object('marker', 'AUTO GENERATED TEST DATA', 'document_label', '업무확인서', 'request_no', rm.request_no)
from seed_requests r
join request_map rm on rm.request_no = format('TEST-REQ-%s', lpad(r.idx::text, 3, '0'))
join seed_companies sc on sc.key = r.company_key
join business_map bm on bm.company_name = sc.company_name
join seed_interpreters si on si.key = r.interpreter_key
join interpreter_map im on im.interpreter_no = si.interpreter_no
join settlement_map sm on sm.request_id = rm.id;

insert into public.payments (
  request_id,
  company_id,
  company_auth_user_id,
  estimate_document_id,
  amount,
  payment_status,
  payment_method,
  paid_at,
  due_date,
  admin_memo
)
select
  rm.id,
  bm.id,
  bm.auth_user_id,
  d.id,
  r.daily_rate * r.work_days + 50000,
  case when r.estimate_status = 'estimate_approved' then 'invoice_sent' else 'unpaid' end,
  null,
  null,
  r.start_date - interval '7 days',
  'AUTO GENERATED TEST DATA'
from seed_requests r
join request_map rm on rm.request_no = format('TEST-REQ-%s', lpad(r.idx::text, 3, '0'))
join seed_companies sc on sc.key = r.company_key
join business_map bm on bm.company_name = sc.company_name
join public.documents d on d.request_id = rm.id and d.document_type = 'estimate';

alter table public.requests enable trigger user;
alter table public.jobs enable trigger user;
alter table public.job_applications enable trigger user;
alter table public.request_interpreters enable trigger user;
alter table public.interpreters enable trigger user;
alter table public.settlements enable trigger user;

commit;

\echo ''
\echo 'Verification'

select '의뢰 10건 생성 완료' as item, count(*) as count, count(*) = 10 as ok
from public.requests
where event_name like '[TEST]%' and company_internal_memo = 'AUTO GENERATED TEST DATA';

select '지원 데이터 생성 완료' as item, count(*) as count, count(*) = 10 as ok
from public.job_applications
where application_no like 'TEST-APP-%';

select '배정 데이터 생성 완료' as item, count(*) as count, count(*) = 10 as ok
from public.request_interpreters ri
join public.requests r on r.id = ri.request_id
where r.event_name like '[TEST]%';

select '정산 데이터 생성 완료' as item, count(*) as count, count(*) = 10 as ok
from public.settlements s
join public.requests r on r.id = s.request_id
where r.event_name like '[TEST]%';

select '문서 데이터 생성 완료' as item, count(*) as count, count(*) = 20 as ok
from public.documents
where metadata->>'marker' = 'AUTO GENERATED TEST DATA'
  and document_type in ('estimate', 'completion')
  and status = 'issued';

select '기업 마이페이지 표시 정상' as item, count(*) as count, count(*) = 10 as ok
from public.requests r
join public.businesses b on b.auth_user_id = r.company_auth_user_id
where r.event_name like '[TEST]%'
  and b.company_name like 'TEST COMPANY%';

select '관리자 의뢰관리 표시 정상' as item, count(*) as count, count(*) = 10 as ok
from public.requests r
join public.jobs j on j.id = r.job_id
where r.event_name like '[TEST]%';

select '관리자 정산관리 표시 정상' as item, count(*) as count, count(*) = 10 as ok
from public.settlements s
join public.requests r on r.id = s.request_id
join public.request_interpreters ri on ri.request_id = r.id and ri.interpreter_id = s.interpreter_id
where r.event_name like '[TEST]%';

select 'FK 오류 0건' as item, count(*) as count, count(*) = 0 as ok
from public.requests r
left join public.jobs j on j.id = r.job_id
left join public.businesses b on b.auth_user_id = r.company_auth_user_id
left join public.interpreters i on i.id = r.assigned_interpreter_id
where r.event_name like '[TEST]%'
  and (j.id is null or b.id is null or i.id is null);

select 'Null 오류 0건' as item, count(*) as count, count(*) = 0 as ok
from public.requests r
where r.event_name like '[TEST]%'
  and (
    r.job_id is null
    or r.company_auth_user_id is null
    or r.assigned_interpreter_id is null
    or r.estimate_status is null
    or r.assignment_status is null
    or r.operation_status is null
  );

select request_no, event_name, company_name, estimate_status, assignment_status, operation_status
from public.requests
where event_name like '[TEST]%'
order by request_no;

select r.request_no, s.settlement_status, s.daily_rate, s.work_days, s.amount
from public.settlements s
join public.requests r on r.id = s.request_id
where r.event_name like '[TEST]%'
order by r.request_no;
`;

const dir = await mkdtemp(join(tmpdir(), "onli-test-requests-"));
const sqlPath = join(dir, "seed.sql");

try {
  await writeFile(sqlPath, sql, "utf8");
  const result = spawnSync("psql", [dbUrl, "-f", sqlPath], {
    env: { ...process.env, PGPASSWORD: password },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`psql exited with status ${result.status}`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
