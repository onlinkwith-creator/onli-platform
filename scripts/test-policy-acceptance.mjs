import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { loadPolicyBundle } from "./lib/loadPolicyBundle.mjs";
import { recordPolicyAcceptance } from "../src/services/policyAcceptance.js";
import { POLICY_VERSION } from "../src/utils/policyVersion.js";

const db = new PGlite();
const uuid = (id) => `00000000-0000-0000-0000-${String(id).padStart(12, "0")}`;
const agreements = { common_terms: true, role_terms: true, privacy_notice: true, cancel_policy: true };
const login = async (id, role = "authenticated") => {
  await db.exec("reset role");
  await db.query("select set_config('test.uid',$1,false)", [id || ""]);
  await db.exec(`set role ${role}`);
};
const accept = async (options = {}) => (await db.query(
  "select public.record_policy_acceptance($1,$2,$3,$4::jsonb,$5) as receipt",
  [options.version || POLICY_VERSION, options.action || "job_application", options.nonce || uuid(10),
    JSON.stringify(options.agreements || agreements), options.subject === undefined ? uuid(99) : options.subject],
)).rows[0].receipt;

try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261009010000_policy_acceptance_history.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261009020000_policy_revision_snapshot.sql", import.meta.url), "utf8"));
  const previous = (await db.query("select * from public.policy_revisions where version='2026-10-09-v1'")).rows[0];
  assert.equal(previous.content_sha256, "715a2613bea56911ef44a580cdd45888d05a1ded726dd23ddc91493f597ccafe");
  await db.exec(await readFile(new URL("../supabase/migrations/20261009050000_policy_payment_cancellation_snapshot.sql", import.meta.url), "utf8"));
  assert.deepEqual((await db.query("select * from public.policy_revisions where version='2026-10-09-v1'")).rows[0], previous);
  const { POLICY_PAGES } = await loadPolicyBundle();
  const snapshot = (await db.query("select * from public.policy_revisions where version=$1", [POLICY_VERSION])).rows[0];
  assert.deepEqual(snapshot.documents, POLICY_PAGES, "Regenerate snapshot after changing policy source");
  assert.equal(snapshot.content_sha256, createHash("sha256").update(JSON.stringify(POLICY_PAGES)).digest("hex"));
  assert.equal(snapshot.effective_at, null);
  await login(uuid(1));
  await assert.rejects(accept(), /POLICY_VERSION_NOT_ACTIVE/);
  await login(null, "anon");
  await assert.rejects(accept(), /permission denied/);
  await login(null);
  await assert.rejects(accept(), /POLICY_AUTH_REQUIRED/);
  await db.exec("reset role");
  await db.query("update policy_revisions set published_at=now()-interval '1 day',effective_at=now()+interval '1 day'");
  await login(uuid(1));
  await assert.rejects(accept(), /POLICY_VERSION_NOT_ACTIVE/);
  await db.exec("reset role");
  await db.exec("update policy_revisions set effective_at=now()-interval '1 hour'");
  await login(uuid(1));
  await assert.rejects(accept({ agreements: { ...agreements, common_terms: false } }), /POLICY_ACKNOWLEDGEMENT_REQUIRED/);
  await assert.rejects(accept({ agreements: { ...agreements, privacy_notice: false } }), /POLICY_ACKNOWLEDGEMENT_REQUIRED/);
  await assert.rejects(accept({ agreements: { ...agreements, cancel_policy: false } }), /POLICY_CANCEL_ACKNOWLEDGEMENT_REQUIRED/);
  await assert.rejects(accept({ subject: null }), /POLICY_INVALID_CONTEXT/);
  await assert.rejects(accept({ action: "other" }), /POLICY_INVALID_CONTEXT/);
  const receipt = await accept();
  assert.equal((await accept()).receipt_id, receipt.receipt_id, "Nonce retry must be idempotent");
  await assert.rejects(accept({ subject: uuid(98) }), /POLICY_NONCE_CONFLICT/);
  await assert.rejects(db.exec("select * from policy_acceptance_history"), /permission denied/);
  const own = (await db.query("select get_my_policy_acceptances() as history")).rows[0].history;
  assert.equal(own.length, 1);
  assert.deepEqual(own[0].agreed_documents, ["commonTerms", "interpreterPolicy"]);
  assert.deepEqual(own[0].acknowledged_notices, ["privacy"]);
  assert.ok(own[0].recorded_at);
  assert.deepEqual((await db.query("select get_my_policy_revision($1) as snapshot", [receipt.receipt_id])).rows[0].snapshot.documents, POLICY_PAGES);
  await login(uuid(2));
  assert.deepEqual((await db.query("select get_my_policy_acceptances() as history")).rows[0].history, []);
  assert.equal((await db.query("select get_my_policy_revision($1) as snapshot", [receipt.receipt_id])).rows[0].snapshot, null);
  const company = await accept({ action: "company_request", subject: null, nonce: uuid(11) });
  assert.ok(company.receipt_id);
  await db.exec("reset role");
  assert.deepEqual((await db.query("select agreed_documents from policy_acceptance_history where id=$1", [company.receipt_id])).rows[0].agreed_documents,
    ["commonTerms", "clientPolicy", "refundPolicy"]);
  await assert.rejects(db.exec("update policy_acceptance_history set actor_id=gen_random_uuid()"), /POLICY_ACCEPTANCE_IMMUTABLE/);
  await assert.rejects(db.exec("update policy_revisions set documents='{}'::jsonb"), /POLICY_REVISION_IMMUTABLE/);
  await db.exec("update policy_revisions set retired_at=now()-interval '1 second'");
  await login(uuid(1));
  await assert.rejects(accept({ nonce: uuid(12) }), /POLICY_VERSION_NOT_ACTIVE/);
  assert.equal((await db.query("select get_my_policy_acceptances() as history")).rows[0].history.length, 1);

  let payload;
  const fakeClient = { rpc: async (name, args) => {
    assert.equal(name, "record_policy_acceptance"); payload = args;
    return { data: { receipt_id: uuid(20) }, error: null };
  } };
  assert.equal((await recordPolicyAcceptance(fakeClient, { action: "company_request", agreements: {
    agreedPolicy: true, agreedTerms: true, agreedCancelPolicy: false,
  } })).ok, true);
  assert.equal(payload.p_version, POLICY_VERSION);
  assert.ok(payload.p_nonce);
  assert.equal(payload.p_agreements.privacy_notice, true);
  assert.ok(!Object.hasOwn(payload, "actor_id"));
  assert.equal((await recordPolicyAcceptance({ rpc: async () => ({ error: new Error("unavailable") }) }, {
    action: "company_request", agreements: {},
  })).ok, false);
  assert.equal((await recordPolicyAcceptance({ rpc: async () => { throw new Error("network"); } }, {
    action: "company_request", agreements: {},
  })).ok, false);
  console.log("PASS: draft/future/retired gates, immutable source and receipts, authenticated identity, own-history isolation, retries and fail-closed UI recording.");
} finally {
  await db.close();
}
