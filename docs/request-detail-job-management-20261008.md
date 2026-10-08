# Request Detail Job Management

The administrator's request detail now includes a Job Management tab. Existing
AdminJobs edit, visibility and applicant handlers are reused with controlled data.
No schema, RLS, authentication or financial permissions change.

Only explicit request.job_id and job.request_id relationships select jobs. Display
numbers, company names and emails never select a job. Conflicting cross-request
links or a missing referenced job block editing and creation. A genuinely unlinked
request uses the existing request-to-public-job action with confirmation. The
existing global job page is retained for compatibility and cross-request overview.

Scoped editing and applicants render inline rather than nesting dialogs. Focus and
Escape return to the job list without closing the request. Unlinked standalone
creation, deletion and settlement edits are not exposed in this tab. Existing
settlement views remain unchanged. Save and status updates refresh shared admin
data so the request list and global job page use the same records.

## Validation

`node scripts/test-request-job-scope.mjs` covers forward/reverse links, multiple
jobs, string/number IDs, missing links, conflicting ownership and display-number
collision exclusion. The local fixture stubs all writes and authentication; it is
not a production entry point. Browser checks cover inline save, cancellation,
Escape, per-job applicants, mobile layout and empty/conflicting states. Real
production publication, edit, applicant decisions, deletion and financial actions
are not submitted as testing operations.

Targeted ESLint passes for the changed job manager and new files. Admin.jsx has
pre-existing lint errors outside this change; they are not silently refactored.
The existing large production bundle warning remains.
