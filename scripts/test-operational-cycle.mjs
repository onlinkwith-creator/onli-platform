import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { getApplicationAvailability, hasEventPassed } from "../src/utils/jobStatus.js";
import { getRecruitmentCountDisplay } from "../src/utils/jobRecruitment.js";
import { getWorkTimeDisplay, isPreparationAssignment } from "../src/utils/assignmentDisplay.js";
import { buildJobPayloadFromRequest } from "../src/utils/requestJobPayload.js";
import { getRequestProgressLabel, REQUEST_PROGRESS_STEPS, OPERATION_STATUS_OPTIONS, getOperationCompanyStatusLabel } from "../src/utils/operationsStatus.js";

assert.deepEqual(REQUEST_PROGRESS_STEPS, ["접수 완료", "검토중", "모집중", "배정중", "배정완료", "운영 준비중", "운영 예정", "운영중", "업무완료"]);
assert.equal(getRequestProgressLabel({}), "접수 완료");
assert.equal(getRequestProgressLabel({admin_checked:true}), "검토중");
assert.equal(getRequestProgressLabel({job_id:"job",assignment_status:"assignment_pending"}), "모집중");
assert.equal(getRequestProgressLabel({assignment_status:"assignment_in_progress",operation_status:"operation_before"}), "배정중");
assert.equal(getRequestProgressLabel({assignment_status:"assigned"}), "배정완료");
for (const option of OPERATION_STATUS_OPTIONS.slice(1)) {
  assert.equal(getRequestProgressLabel({operation_status:option.value}), option.label);
  assert.equal(getOperationCompanyStatusLabel(option.value), option.label);
}
assert.equal(getRequestProgressLabel({operation_status:"operation_completed",settlement_status:"pending"}), "업무완료");
assert.equal(getRequestProgressLabel({operation_status:"operation_before",settlement_status:"completed"}), "접수 완료");
assert.equal(getRequestProgressLabel({status:"cancelled",operation_status:"operation_completed"}), "취소됨");

const now = new Date("2026-10-05T03:00:00Z");
const open = { id: "job", status: "open", start_date: "2026-10-12", assigned_count: 0, people_count: 2 };
assert.equal(getApplicationAvailability(open, { now }).allowed, true);
assert.equal(getApplicationAvailability({ ...open, start_date: "2026-09-03" }, { now }).reason, "event_passed");
assert.equal(hasEventPassed({ start_date: "2026-10-05" }, now), false);
assert.equal(hasEventPassed({ start_date: "2026-10-05" }, "2026-10-05T15:00:00Z"), true);
assert.equal(getApplicationAvailability({ ...open, deadline: "2026-10-04" }, { now }).reason, "deadline_passed");
assert.equal(getApplicationAvailability({ ...open, assigned_count: 2 }, { now }).reason, "capacity_full");
assert.equal(getRecruitmentCountDisplay({ assigned_count: 1, requested_people_count: 2 }), "1/2");
assert.equal(getRecruitmentCountDisplay({ people_count: 2 }), "-/2");
assert.equal(getWorkTimeDisplay({ event_start_time: "10:00:00", event_end_time: "12:00:00" }), "10:00 ~ 12:00");
assert.equal(getWorkTimeDisplay({ work_hours: "2시간" }), "2시간");
assert.equal(isPreparationAssignment({ operation_status: "operation_completed" }), false);
assert.equal(isPreparationAssignment({ operation_status: "operation_in_progress" }), false);
assert.equal(isPreparationAssignment({ operation_status: "operation_preparing" }), true);
const requestJob = buildJobPayloadFromRequest({ event_name: "TEST", start_date: "2026-10-12", end_date: "2026-10-12", requested_people_count: 2 });
assert.equal(requestJob.start_date, "2026-10-12");
assert.equal(requestJob.people_count, 2);
for (const key of ["request_type", "selected_interpreter_id", "interpreter_id"]) assert.equal(key in requestJob, false);
assert.throws(() => buildJobPayloadFromRequest({ event_name: "Missing dates" }), /일정과 필요 인원/);

const db = new PGlite();
const publicId = "00000000-0000-0000-0000-000000000001";
const privateId = "00000000-0000-0000-0000-000000000002";
try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function portal_pick(row_data jsonb,allowed text[]) returns jsonb language sql as
      $$select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(row_data) where key=any(allowed)$$;
    create function portal_owns_request(bigint) returns boolean language sql as
      $$select auth.uid()='${publicId}'::uuid and $1=75$$;
    create function portal_assigned(bigint) returns boolean language sql as
      $$select auth.uid()='${privateId}'::uuid and $1=75$$;
    create table jobs(id uuid primary key,job_no text,start_date date,event_date text,date text,deadline date,visibility text);
    create view public_jobs as select * from jobs where visibility='public';
    create table requests(id bigint primary key,job_id uuid,company_auth_user_id uuid,created_at timestamptz default now(),
      event_start_time text,event_end_time text,requested_people_count integer,operation_status text);
    create table businesses(auth_user_id uuid,company_name text,contact_name text,contact_phone text,contact_email text);
    create table request_interpreters(request_id bigint,interpreter_id bigint,status text);
    create table job_applications(job_id uuid);
    insert into jobs values('${publicId}','ONLI-JOB-001','9999-10-12',null,null,null,'public'),
      ('${privateId}','PRIVATE','2000-01-01',null,null,null,'private');
    insert into requests(id,job_id,company_auth_user_id,event_start_time,event_end_time,requested_people_count,operation_status)
      values(75,'${publicId}','${publicId}','10:00','12:00',2,'operation_completed'),(115,'${privateId}','${privateId}',null,null,1,null);
    insert into request_interpreters values(75,87,'assigned'),(75,87,'assigned'),(75,88,'cancelled'),(115,99,'assigned');
    grant usage on schema public,auth to anon,authenticated;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261005090000_fix_operational_cycle_display.sql", import.meta.url), "utf8"));
  await db.exec("set role anon");
  const counts = (await db.query("select * from get_public_job_counts($1::uuid[])", [[publicId, privateId]])).rows;
  assert.deepEqual(counts, [{ job_id: publicId, assigned_count: 1 }]);
  await assert.rejects(db.query("select * from get_portal_requests()"));
  await assert.rejects(db.query("select * from request_interpreters"));
  await db.exec("reset role");
  await db.query("select set_config('test.uid',$1,false)", [privateId]);
  await db.exec("set role authenticated");
  const portal = (await db.query("select get_portal_requests() as data")).rows;
  assert.equal(portal.length, 1);
  assert.equal(portal[0].data.job_no, "ONLI-JOB-001");
  assert.equal(portal[0].data.assigned_count, 1);
  assert.equal(portal[0].data.requested_people_count, 2);
  assert.equal(portal[0].data.event_start_time, "10:00");
  await db.exec("reset role");
  await assert.rejects(db.query("insert into job_applications values($1)", [privateId]), /지난 행사/);
  await db.query("insert into job_applications values($1)", [publicId]);
  await db.query("update jobs set deadline='2000-01-01' where id=$1", [publicId]);
  await assert.rejects(db.query("insert into job_applications values($1)", [publicId]), /마감일/);
} finally {
  await db.close();
}
const admin = await readFile(new URL("../src/pages/Admin.jsx", import.meta.url), "utf8");
assert.match(admin, /settlementsResult, paymentsResult/);
assert.match(admin, /disabled=\{!paymentReady \|\|/);
assert.match(admin, /select\("\*"\)\.eq\("request_id", requestId\)\.maybeSingle/);
assert.match(admin, /existingPayment\?\.updated_at !== cachedPayment.updated_at/);
console.log("PASS: operational dates, counts, portal metadata, privacy, and payment query guards");
