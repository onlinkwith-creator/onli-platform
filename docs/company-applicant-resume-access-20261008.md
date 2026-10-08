# Company Applicant Resume Access

Approved companies may view the current original resume of a public interpreter
who applied to a job linked to their own request. Assignment and separate admin
resume publication are not required. This applies to existing applications too.

The private `resume-files` bucket stays private. `get_company_applicant_resume`
returns only the current path after server-side ownership and application checks.
Storage RLS enforces the same scope; the client requests a 60-second signed URL.
Other companies, anonymous visitors, unapproved companies, private interpreter
profiles, missing files and unrelated settlement documents remain inaccessible.
Existing signed links can remain usable until their short expiry after revocation.

The PDF is shown unchanged. Removing template fields does not redact uploaded
PDFs or prevent someone adding contact details. The operator explicitly requested
removing resume review; this is not a guarantee that originals contain no PII.
The administrator's separate account/activity approval rules remain unchanged.

Apply only `20261008230000_company_applicant_resume_access.sql` to production.
Do not apply the superseded, uncommitted admin-publication migration afterward.
The migration is rerunnable and does not alter passwords, payments, assignments,
application statuses, files or historical notification queues.

Verification: `node scripts/test-company-applicant-resumes.mjs` and
`npm run test:security`. Source replacements need no republication; removed
applications revoke future access. Legacy separate copies remain admin-only.
