# Post-assignment Automation

## 1. Condition Changes

Companies propose date, venue and working-time changes from the Condition Changes
tab. Required active assignments are snapshotted; every assigned interpreter must
accept before the request, public job and active matching dates change atomically.
Compensation, payment, settlement, ownership and document fields cannot be changed.
Until unanimous agreement, or on rejection/cancellation/expiry, current terms stay
unchanged. No replacement interpreter is selected automatically.

The response deadline is 48 hours, capped by the earlier original/proposed event
start. The existing ten-minute scan expires requests. The final acceptance checks
unchanged original terms, roster, current company ownership and approval, current
interpreter accounts, canonical/legacy assignment conflicts and event timing.
Changed rosters require cancellation and reproposal. Ownership transfer cancels
pending changes and never exposes the former company's change notes to a new owner.
Proposal nonce retries and accepted responses are idempotent. No contact/resume/
compensation/change-note details are included in email. The original branded ON-LI
form and private queue/nonce delivery claims remain in use.

## 2. Materials

Existing missing-material reminders and upload emails remain. An explicit Material
Reviewed action records the current material metadata version and assignment/auth
account. Opening/downloading a file is not represented as reading its contents.
Companies see acknowledgement status; each interpreter sees only their own status.
Replacement metadata/path changes invalidate prior acknowledgement. Storage files
are unchanged; this is a metadata version, not a content hash for administrator
overwrites at the same path with identical metadata. Company uploads use new paths.

## 3. Work Completion

The existing ended-event reminder, interpreter submission, company confirmation/
revision, individual certification credit and completion-review exception flow is
retained and regression-tested. Completion is never auto-approved on a timer.
Settlement approval, receipt confirmation, amounts and payout remain manual.

## 4. Repeat Requests

The existing duplicate action now passes an explicit allowlist of event/industry/
staffing conditions. New event dates are blank and current business contacts load
from the current account. Assignment IDs, request/job numbers, payment/quotation
state, amounts, old materials, reference uploads and previous contacts are excluded.
The company still reviews and submits a new request through the existing terms and
privacy agreement flow. This is not automatic contract acceptance or submission.

## 5. Administrator Exceptions

The exception list supports filters and adds delayed/stale condition changes and
terminal/uncertain workflow email deliveries. Uncertain deliveries are never
automatically resent. New exceptions use the existing administrator workflow alert
toggle and ten-minute scan, with dedupe. The release activation cutoff excludes old
failed mail from new admin emails; historical pending notifications are untouched.

## Validation

The actual migrations run in PGlite, including protected-write triggers and private
email claims. Tests cover unanimous/partial agreement, retries, rejected/expired/
cancelled/stale changes, forbidden money writes, conflicting final schedules and
rolled-back consent, owner transfer, role isolation, version-bound acknowledgements,
safe repeat templates, existing completion credits and manual financial states.
Worker HTTP/SMTP stubs confirm the new type/link allowlist and original template.
Local fixtures exercise company/interpreter actions and 320/390/768/1280-pixel
layouts without horizontal overflow. Fixture files are development-only and are
not production entry points. Multi-connection production race tests and live email
inbox receipt are not claimed. No real assignment, consent, completion or payment
is submitted as a verification action.

## Production Rollout

Migration 20261008220000 applied successfully on 2026-10-08. The deployed worker
source matches the release bundle; an invalid delivery nonce returns HTTP 401.
Vercel deployments for both onli-platform and onli-platform-itus succeeded for
commit 6c04a8a. Read-only production checks confirm private table access is blocked,
authenticated portal RPC access is enabled, anonymous RPC access is blocked and
both existing scheduler jobs are active with successful recent runs.

The company and interpreter accounts opened Condition Changes without load errors.
The company's existing request material shows the assigned interpreter's pending
acknowledgement. These accounts currently have no future confirmed assignment
eligible for a new change, so live proposal/consent submission and inbox receipt
remain unverified. Screenshots are in /Users/kang-sangin/outputs. Test accounts were
logged out; normal browser account state was not changed.
