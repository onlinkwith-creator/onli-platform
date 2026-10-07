# Company Applicant Assignment

## Scope

Approved companies can confirm an applicant on their own request through
`assign_company_applicant(request_id, application_id)`. The caller cannot choose
an unrelated interpreter, expose contacts, cancel assignments, or edit money.
Existing table write policies remain unchanged.

The company applicant tab displays headcount, assigned state and a two-step
assignment confirmation. A successful assignment refreshes both applicants and
the company's requests/assigned interpreters. Failed or ambiguous calls refresh
the list before another attempt; the server returns an existing assignment on
repeat calls instead of duplicating it.

## Server Rules

- The company must remain approved and own the request.
- The application must belong to the linked job and be pending/reviewing/accepted/approved.
- The interpreter must have a published, eligible profile and active activity status.
- Closed, already started, past or undated requests cannot be newly assigned.
- Canonical assignments and legacy active matchings are checked for overlapping dates.
- A shared request/interpreter row lock and capacity trigger coordinate company
  and administrator assignment writes. Administrator deliberate schedule overrides
  remain possible; headcount overbooking is blocked.
- Existing cancelled assignment records require administrator handling.
- New assignments always start with contacts hidden. Existing lifecycle triggers
  synchronize request/job/application state and downstream assignment workflows.

## Rollout

Apply `20261008090000_company_applicant_assignment.sql` before deploying the UI.
Obtain action-time approval for the new company write authority first. Do not
include unrelated pending resume-publication edits in the release.

Run `npm run test:company-assignment`, the existing security suite, and a build.
The focused database fixture loads the actual assignment lifecycle trigger and
checks ownership, approval, write boundaries, capacity, dates, conflict checks,
private contact gating, idempotency and application/job/request synchronization.
Production end-to-end assignment must use a specifically approved test record;
do not assign a real interpreter or send real-customer mail for a smoke test.
