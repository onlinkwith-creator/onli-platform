import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchInterpreterSettlements } from "../src/services/interpreterSettlementService.js";
import { getInterpreterSettlementStatusLabel, normalizeAdminSettlementStatus } from "../src/utils/settlementStatus.js";
import { formatDocumentAmount } from "../src/utils/documents.js";

function fixture({ assignments = [], requests = [], settlements = [], errors = {} } = {}) {
  const calls = [];
  const client = {
    from(table) {
      calls.push(table);
      const query = {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() { return this; },
        then(resolve, reject) {
          return Promise.resolve({ data: table === "settlements" ? settlements : assignments, error: errors[table] }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: requests, error: errors.requests };
    },
  };
  return { client, calls };
}

const assignment = { id: 10, interpreter_id: 87, request_id: 75, status: "assigned" };
const request = { id: 75, request_no: "ONLI-REQ-015", event_name: "Settlement test", start_date: "2026-07-28", end_date: "2026-07-30" };
const settlement = { id: "settlement-1", interpreter_id: 87, request_id: 75, amount: 540000, work_days: 3, settlement_status: "settlement_completed", settlement_completed_at: "2026-07-21" };
const base = { assignments: [assignment], requests: [request], settlements: [settlement] };

const rows = await fetchInterpreterSettlements(fixture(base).client, 87);
assert.equal(rows.length, 1);
assert.equal(rows[0].amount, 540000);
assert.equal(rows[0].publicJobCode, "ONLI-REQ-015");
assert.equal(getInterpreterSettlementStatusLabel(rows[0].settlementStatus), "지급완료");
assert.equal(rows[0].completedAt, "2026-07-21");
assert.equal(rows[0].workDays, 3);

const missingMetadata = await fetchInterpreterSettlements(fixture({ ...base, requests: [] }).client, 87);
assert.equal(missingMetadata.length, 1, "owned settlement must not disappear when request metadata is absent");
assert.equal(missingMetadata[0].amount, 540000);
assert.equal(missingMetadata[0].title, "배정된 통역");

const duplicates = await fetchInterpreterSettlements(fixture({ ...base, assignments: [assignment, { ...assignment, id: 9 }], settlements: [settlement, { ...settlement, id: "older", amount: 100 }] }).client, 87);
assert.equal(duplicates.length, 1);
assert.equal(duplicates[0].amount, 540000);
const zero = await fetchInterpreterSettlements(fixture({ ...base, settlements: [{ ...settlement, amount: 0 }] }).client, 87);
assert.equal(zero[0].amount, 0);

for (const errorKey of ["request_interpreters", "settlements", "requests"]) {
  await assert.rejects(fetchInterpreterSettlements(fixture({ ...base, errors: { [errorKey]: new Error("query failed") } }).client, 87), /query failed/);
}
const empty = fixture();
assert.deepEqual(await fetchInterpreterSettlements(empty.client, 87), []);
assert.deepEqual(empty.calls, ["request_interpreters"]);
assert.deepEqual(await fetchInterpreterSettlements(fixture({ ...base, assignments: [{ ...assignment, status: "cancelled" }] }).client, 87), []);
assert.deepEqual(await fetchInterpreterSettlements(fixture({ ...base, assignments: [{ ...assignment, interpreter_id: 88 }] }).client, 87), []);
const foreign = await fetchInterpreterSettlements(fixture({ ...base, settlements: [{ ...settlement, interpreter_id: 88, amount: 999999 }] }).client, 87);
assert.equal(foreign[0].amount, 0, "must not display another interpreter's payout");

for (const status of ["settlement_completed", "paid", "completed", "settled", "정산완료", "지급완료"]) {
  assert.equal(getInterpreterSettlementStatusLabel(status), "지급완료");
  assert.equal(normalizeAdminSettlementStatus(status), "settlement_completed");
}
assert.equal(getInterpreterSettlementStatusLabel("settlement_waiting"), "정산대기");
assert.equal(getInterpreterSettlementStatusLabel("settlement_confirmed"), "정산확정");
assert.equal(getInterpreterSettlementStatusLabel("settlement_paying"), "지급중");
assert.equal(getInterpreterSettlementStatusLabel("withheld"), "보류");
assert.equal(getInterpreterSettlementStatusLabel("cancelled"), "취소");
assert.equal(formatDocumentAmount(540000), "540,000원");
assert.equal(formatDocumentAmount(0), "0원");

const adminSource = await readFile(new URL("../src/pages/Admin.jsx", import.meta.url), "utf8");
assert.equal(adminSource.includes("formatJPY"), false);
assert.equal(adminSource.includes("¥"), false);
assert.ok(adminSource.includes("return formatDocumentAmount(value)"));
const interpreterSource = await readFile(new URL("../src/pages/InterpreterMypage.jsx", import.meta.url), "utf8");
assert.ok(interpreterSource.includes("Promise.allSettled"));
assert.ok(interpreterSource.includes("settlementsLoadError ?"));
assert.ok(interpreterSource.includes('if (tab.id === "settlements") loadSettlements(interpreter.id)'));
console.log("PASS: settlement visibility, query failures, ownership filtering, deduplication, completion statuses and KRW formatting");
