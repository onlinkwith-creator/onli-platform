import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const admin = readFileSync(new URL("../src/pages/Admin.jsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const aliases = admin.match(/const ADMIN_TAB_ALIASES = \{[\s\S]*?\n\};/)[0];
const routing = admin.slice(admin.indexOf("function normalizeAdminSubTabId("), admin.indexOf("function getAdminPathForSubTab("));
const navigation = admin.slice(admin.indexOf("const MAIN_TABS ="), admin.indexOf("const SUB_TAB_TO_MAIN_TAB ="));
const context = vm.createContext({ URLSearchParams });
vm.runInContext(`${aliases}\n${routing}\n${navigation}`, context);

for (const [pathname, search, expected] of [
  ["/admin/jobs", "", "all_requests"],
  ["/admin/requests", "?tab=jobs", "all_requests"],
  ["/admin", "?subTab=jobs", "all_requests"],
  ["/admin/requests", "?tab=applications", "applications"],
  ["/admin/requests", "?tab=assignments", "assignments"],
  ["/admin/requests", "", "all_requests"],
]) {
  context.window = { location: { pathname, search } };
  assert.equal(vm.runInContext("getInitialAdminSubTab()", context), expected);
}
assert.equal(vm.runInContext("SUB_TABS.requests.some(tab => tab.id === 'jobs')", context), false);
assert.equal(vm.runInContext("SUB_TABS.requests.length", context), 3);
assert.ok(admin.includes('activeTab === "jobs" && ('), "Request detail job tab must remain");
assert.ok(admin.includes("<RequestJobManagement"), "Request-scoped management must remain");
assert.ok(!admin.includes('activeSubTab === "jobs"'), "Standalone management must be removed");
assert.ok(!admin.includes("switchToJobsTab"), "No navigation to removed tab");
assert.ok(app.includes('"/admin/requests?tab=all_requests"'));
console.log("PASS: removed duplicate job tab, preserved request detail management, legacy URL aliases and applicant/assignment navigation");
