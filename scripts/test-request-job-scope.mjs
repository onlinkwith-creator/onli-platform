import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getRequestJobScope } from "../src/utils/requestJobScope.js";

const request = { id: 16, job_id: "job-a", request_no: "ONLI-REQ-016" };
const jobs = [
  { id: "job-a", request_id: "16" },
  { id: "job-b", request_id: 17, request_no: "ONLI-REQ-016" },
  { id: "job-c", request_id: 16 },
];
assert.deepEqual(getRequestJobScope(request, jobs, [request]).jobs.map((job) => job.id), ["job-a", "job-c"]);
assert.deepEqual(getRequestJobScope({ id: "16" }, jobs, [request]).jobs.map((job) => job.id), ["job-a", "job-c"]);
assert.equal(getRequestJobScope(request, [{ id: "job-a" }], [request]).jobs.length, 1);
assert.equal(getRequestJobScope({ id: 18 }, jobs).jobs.length, 0);
assert.ok(getRequestJobScope(null, jobs).error);
assert.ok(getRequestJobScope(request, [], [request]).error);
assert.ok(getRequestJobScope(request, [{ id: "job-a", request_id: 17 }], [request]).error);
assert.ok(getRequestJobScope(request, jobs, [request, { id: 17, job_id: "job-a" }]).error);
assert.equal(getRequestJobScope({ id: 16 }, [{ id: "other", request_no: "ONLI-REQ-016" }]).jobs.length, 0);

const admin = readFileSync(new URL("../src/pages/Admin.jsx", import.meta.url), "utf8");
const manager = readFileSync(new URL("../src/pages/AdminJobs.jsx", import.meta.url), "utf8");
assert.match(admin, /id: "jobs", label: "공고 관리"/);
assert.match(admin, /jobManagement=\{jobManagement\}/);
assert.match(manager, /inline=\{requestScoped\}/);
assert.match(manager, /if \(!requestScoped && editingId && form\.settlement_status\)/);
assert.match(manager, /if \(requestScoped\) return;/);
console.log("PASS: request-scoped job IDs, conflicting/missing links, inline editing and separate settlements");
