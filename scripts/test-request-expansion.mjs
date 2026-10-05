import assert from "node:assert/strict";
import { getNewestRequestId, isRequestExpanded } from "../src/utils/requestExpansion.js";

const requests = [
  { id: 75, created_at: "2026-07-20T09:00:00Z" },
  { id: 117, created_at: "2026-10-05T09:00:00Z" },
];
const newest = getNewestRequestId(requests);
assert.equal(newest, "117");
assert.equal(isRequestExpanded(117, newest, {}), true);
assert.equal(isRequestExpanded(75, newest, {}), false);
assert.equal(isRequestExpanded(117, newest, { 117: false }), false);
assert.equal(isRequestExpanded(75, newest, { 75: true }), true);
assert.equal(isRequestExpanded(117, newest, { 75: true }), true);
assert.equal(getNewestRequestId([]), null);
assert.equal(getNewestRequestId([{ id: 1 }, { id: 2 }]), "1");
assert.equal(getNewestRequestId([{ id: 1 }, ...requests]), "117");
assert.equal(getNewestRequestId([...requests, { id: 118, created_at: "2026-10-06" }]), "118");
assert.equal(getNewestRequestId([{ id: 1, created_at: "2026-10-05" }, { id: 2, created_at: "2026-10-05" }]), "1");
console.log("Request expansion: newest default, independent overrides, empty and missing dates passed.");
