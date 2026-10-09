import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { POLICY_VERSION } from "../../src/utils/policyVersion.js";

export async function testPolicyWorkflowIntegration({ db, login, seed, propose, company, interpreter, uuid }) {
  const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
  await login(""); await db.exec("reset role");
  for (const table of ["interpreters", "requests", "job_applications"]) {
    await db.exec(`alter table ${table} add column agreed_terms boolean, add column agreed_policy boolean, add column agreed_at timestamptz`);
  }
  await db.exec(`alter table job_applications add column agreed_cancel_policy boolean, add column cancel_policy_agreed_at timestamptz;
    create function submit_company_request(jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;`);
  await db.exec(await migration("20261009010000_policy_acceptance_history.sql"));
  await db.exec(await migration("20261009020000_policy_revision_snapshot.sql"));
  await db.exec(await migration("20261009050000_policy_payment_cancellation_snapshot.sql"));
  await db.exec(await migration("20261009030000_bind_policy_acceptance_to_operations.sql"));
  await db.exec("update policy_revisions set published_at=now()-interval '1 day',effective_at=now()-interval '1 hour'");
  await seed(9900, 365);
  await login(company);
  const offer = await propose(9900);
  await login(interpreter);
  const accept = (receipt = null) => db.query("select respond_assignment_offer($1,true,$2) as result", [offer.offer_id, receipt]);
  await assert.rejects(accept(), /POLICY_RECEIPT_REQUIRED/);
  await assert.rejects(db.query("select respond_assignment_offer_without_policy($1,true)", [offer.offer_id]), /permission denied/);
  await login(""); await db.exec("reset role");
  assert.equal((await db.query("select status from assignment_offers where id=$1", [offer.offer_id])).rows[0].status, "pending");
  assert.equal((await db.query("select count(*)::int as n from request_interpreters where request_id=9900")).rows[0].n, 0);
  const beforeEmails = (await db.query("select count(*)::int as n from workflow_action_alerts")).rows[0].n;
  const agreements = JSON.stringify({ common_terms: true, role_terms: true, privacy_notice: true, cancel_policy: true });
  await login(interpreter);
  const receipt = (await db.query("select record_policy_acceptance($1,'assignment_acceptance',$2,$3::jsonb,$4) as receipt",
    [POLICY_VERSION,uuid(99901),agreements,offer.offer_id])).rows[0].receipt.receipt_id;
  const wrong = (await db.query("select record_policy_acceptance($1,'assignment_acceptance',$2,$3::jsonb,$4) as receipt",
    [POLICY_VERSION,uuid(99902),agreements,uuid(123)])).rows[0].receipt.receipt_id;
  await assert.rejects(accept(wrong), /POLICY_RECEIPT_MISMATCH/);
  await login(""); await db.exec("reset role");
  assert.equal((await db.query("select count(*)::int as n from workflow_action_alerts")).rows[0].n, beforeEmails,
    "Policy failure must roll back queued emails and the canonical assignment changes");
  await login(interpreter);
  const accepted = (await accept(receipt)).rows[0].result;
  assert.equal(accepted.status, "accepted");
  assert.equal((await accept(receipt)).rows[0].result.assignment_id, accepted.assignment_id);
  const bindings = (await db.query("select get_my_policy_operations() as result")).rows[0].result;
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].receipt_id, receipt);
  assert.equal(bindings[0].target_id, offer.offer_id);
  await login(""); await db.exec("reset role");
  assert.equal((await db.query("select count(*)::int as n from request_interpreters where request_id=9900")).rows[0].n, 1);
  assert.equal((await db.query("select payment_status from requests where id=9900")).rows[0].payment_status, "unpaid");
  await seed(9901, 366);
  await login(company);
  const declinedOffer = await propose(9901);
  await login(interpreter);
  assert.equal((await db.query("select respond_assignment_offer($1,false) as result", [declinedOffer.offer_id])).rows[0].result.status, "declined");
  assert.equal((await db.query("select jsonb_array_length(get_my_policy_operations()) as n")).rows[0].n, 1,
    "Declining an offer must not require or consume a new agreement receipt");
  console.log("PASS: policy receipts integrate with canonical offer acceptance, rollback assignments and queued alerts on failure, and preserve retry idempotency and manual payments.");
}
