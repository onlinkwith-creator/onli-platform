import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { POLICY_VERSION } from "../src/utils/policyVersion.js";

const db = new PGlite();
const uuid = (id) => `00000000-0000-0000-0000-${String(id).padStart(12, "0")}`;
const migration = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const login = async (id, role = "authenticated") => {
  await db.exec("reset role");
  await db.query("select set_config('test.uid',$1,false)", [id || ""]);
  await db.exec(`set role ${role}`);
};
let nonce = 100;
const receipt = async (action, subject = null) => (await db.query(
  "select record_policy_acceptance($1,$2,$3,$4::jsonb,$5) as receipt",
  [POLICY_VERSION, action, uuid(nonce++), JSON.stringify({ common_terms: true, role_terms: true, privacy_notice: true, cancel_policy: true }), subject],
)).rows[0].receipt.receipt_id;
const count = async () => (await db.query("select jsonb_array_length(get_my_policy_operations()) as n")).rows[0].n;
const request = (id, name = "Conference") => db.query("select submit_company_request($1::jsonb) as result", [JSON.stringify({
  event_name: name, start_date: "2027-01-01", end_date: "2027-01-01", requested_people_count: 1,
  agreed_terms: true, agreed_policy: true, policy_receipt_id: id,
})]);
try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('test.role',true),''),'authenticated')$$;
    create function is_active_admin() returns boolean language sql stable as $$select false$$;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    insert into auth.users values('${uuid(1)}','company@example.invalid',now()),('${uuid(2)}','interpreter@example.invalid',now()),('${uuid(3)}','other@example.invalid',now());
    create table businesses(id bigserial primary key,auth_user_id uuid,status text,company_name text,contact_name text,contact_email text,contact_phone text);
    insert into businesses(auth_user_id,status,company_name) values('${uuid(1)}','승인 완료','Company');
    create table interpreters(id bigserial primary key,auth_user_id uuid,name text,approved boolean,is_public boolean,withdrawn_at timestamptz,
      agreed_terms boolean,agreed_policy boolean,agreed_at timestamptz);
    insert into interpreters(auth_user_id,name) values('${uuid(2)}','Interpreter');
    create table requests(id bigserial primary key,event_name text check(event_name<>'FAIL'),start_date date,end_date date,
      requested_people_count integer,request_type text,matching_status text,assignment_status text,company_auth_user_id uuid,
      company_id bigint,company_name text,agreed_terms boolean,agreed_policy boolean,agreed_at timestamptz,
      created_at timestamptz default now(),payment_status text default 'unpaid');
    create table job_applications(id uuid primary key default gen_random_uuid(),job_id uuid,interpreter_id bigint,
      agreed_terms boolean,agreed_policy boolean,agreed_cancel_policy boolean,agreed_at timestamptz,cancel_policy_agreed_at timestamptz);
    create function portal_owns_interpreter(p_id bigint) returns boolean language sql stable security definer as
      $$select exists(select 1 from interpreters where id=p_id and auth_user_id=auth.uid())$$;
    create function portal_pick(j jsonb,keys text[]) returns jsonb language sql immutable as
      $$select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(j) where key=any(keys)$$;
    create function respond_assignment_offer(uuid,boolean) returns jsonb language sql as $$select '{}'::jsonb$$;
    grant usage on schema public,auth to authenticated,anon;
    grant insert,update,select on interpreters,job_applications to authenticated;
    grant usage on sequence interpreters_id_seq to authenticated;
  `);
  const canonicalSource = await migration("20260913090000_portal_security_boundaries.sql");
  const start = canonicalSource.indexOf("create or replace function public.submit_company_request(");
  const end = canonicalSource.indexOf("\n$$;", start);
  assert.ok(start >= 0 && end > start);
  await db.exec(canonicalSource.slice(start, end + 4));
  await db.exec(await migration("20261009010000_policy_acceptance_history.sql"));
  await db.exec(await migration("20261009020000_policy_revision_snapshot.sql"));
  await db.exec(await migration("20261009050000_policy_payment_cancellation_snapshot.sql"));
  await db.exec(await migration("20261009030000_bind_policy_acceptance_to_operations.sql"));
  await db.exec("update policy_revisions set published_at=now()-interval '1 day',effective_at=now()-interval '1 hour'");

  await login(uuid(1));
  await assert.rejects(request(null), /POLICY_RECEIPT_REQUIRED/);
  await assert.rejects(db.query("select submit_company_request_without_policy('{}'::jsonb)"), /permission denied/);
  const valid = await receipt("company_request");
  const before = await count();
  await assert.rejects(request(valid, "FAIL"), /check constraint/);
  assert.equal(await count(), before, "Failed parent insert must not consume receipt");
  const result = (await request(valid)).rows[0].result;
  assert.ok(result.id);
  assert.equal(await count(), before + 1);
  await assert.rejects(request(valid), /POLICY_RECEIPT_ALREADY_USED/);
  const ownOperations = (await db.query("select get_my_policy_operations() as operations")).rows[0].operations;
  assert.equal(ownOperations[0].target_id, String(result.id));
  await db.exec("reset role");
  const row = (await db.query("select * from requests where id=$1", [result.id])).rows[0];
  assert.equal(row.policy_receipt_id, valid);
  assert.equal(row.payment_status, "unpaid");
  assert.equal(row.agreed_at.getTime(), (await db.query("select recorded_at from policy_acceptance_history where id=$1", [valid])).rows[0].recorded_at.getTime());

  await login(uuid(2));
  assert.equal(await count(), 0);
  const foreign = await receipt("company_request");
  await login(uuid(1));
  await assert.rejects(request(foreign), /POLICY_RECEIPT_MISMATCH/);
  await login(uuid(2));
  const appReceipt = await receipt("job_application", uuid(50));
  const application = (job, interpreter, id = appReceipt, appId = uuid(60)) => db.query(`insert into job_applications
    (id,job_id,interpreter_id,agreed_terms,agreed_policy,agreed_cancel_policy,agreed_at,policy_receipt_id)
    values($1,$2,$3,true,true,true,'2000-01-01',$4) returning *`, [appId,job,interpreter,id]);
  await assert.rejects(application(uuid(51), 1), /POLICY_RECEIPT_MISMATCH/);
  await assert.rejects(application(uuid(50), 999), /POLICY_RECEIPT_MISMATCH/);
  await assert.rejects(application(uuid(50), 1, null), /POLICY_RECEIPT_REQUIRED/);
  const app = (await application(uuid(50), 1)).rows[0];
  assert.notEqual(app.agreed_at.getUTCFullYear(), 2000);
  assert.equal(app.agreed_at.getTime(), app.cancel_policy_agreed_at.getTime());
  await assert.rejects(application(uuid(50), 1, appReceipt, uuid(61)), /POLICY_RECEIPT_ALREADY_USED/);
  await assert.rejects(db.query("update job_applications set agreed_at=now() where id=$1", [uuid(60)]), /POLICY_FRESH_RECEIPT_REQUIRED/);
  await assert.rejects(db.query("update job_applications set agreed_cancel_policy=false where id=$1", [uuid(60)]), /POLICY_FRESH_RECEIPT_REQUIRED/);
  await assert.rejects(db.query("update job_applications set job_id=$2 where id=$1", [uuid(60),uuid(51)]), /POLICY_FRESH_RECEIPT_REQUIRED/);

  const registration = await receipt("interpreter_registration");
  await db.query("update interpreters set agreed_terms=true,agreed_policy=true,policy_receipt_id=$1 where id=1", [registration]);
  const registration2 = await receipt("interpreter_registration");
  await db.query("update interpreters set policy_receipt_id=$1 where id=1", [registration2]);
  await assert.rejects(db.query("update interpreters set policy_receipt_id=$1 where id=1", [registration]), /POLICY_RECEIPT_ALREADY_USED/);
  await db.query("update interpreters set name='Updated profile' where id=1");
  await assert.rejects(db.query("select bind_policy_operation($1,'job_application',$2,'job_applications','60')", [appReceipt,uuid(50)]), /permission denied/);
  await assert.rejects(db.exec("select * from policy_operation_bindings"), /permission denied/);
  console.log("PASS: canonical company submission, receipt ownership/action/subject, atomic rollback, one-time binding, server consent timestamps, profile updates and private operations.");
} finally { await db.close(); }
