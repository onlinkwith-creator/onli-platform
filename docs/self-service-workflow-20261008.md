# Self-service workflow

## Changes

- Approved companies propose a whole-schedule pretax KRW amount to applicants.
- A 24-hour pending offer reserves a position but does not assign the interpreter.
- Only the interpreter's acceptance creates the canonical assignment. Ownership,
  publication/activity eligibility, application state, unchanged schedule and
  location, capacity and overlapping assignments are rechecked on the server.
- Decline, company cancellation and expiry release the reservation. Confirmed
  assignment cancellation remains an administrator exception.
- New valid general requests from approved companies create public jobs atomically.
  Urgent, designated, invalid and past requests stay on the existing review path.
  No historical requests are published. Contact details, notes and reference files
  are excluded from the publication payload.
- Interpreters report completion only after the event ends. The owning approved
  company confirms or requests revision. All active assignments confirmed marks
  the request/job completed; individual confirmed work counts toward certification.
- Settlement work confirmation is recorded separately. Payment status, payout
  status and existing financial amounts are not changed. This is not automated
  payment processing.

## Security

Offer and completion tables are private. Authenticated users act through scoped
RPCs only. The old immediate company assignment RPC loses authenticated execution.
Legacy protection triggers retain their bodies. Separate company-publication,
interpreter-acceptance and company-completion contexts require the corresponding
actor to own the affected data and restrict changed columns to that specific
action. No administrator role or general write authority is granted. Money and
company-ownership edits stay forbidden even in a workflow context. Context is
restored before returning.

Company and interpreter inboxes poll while visible every 60 seconds. New workflow
events also enter a dedicated email queue: offers, acceptance, decline, cancellation,
expiry, new applicants, publication, completion reports, revisions and confirmation.
Recipients come from confirmed Auth accounts, not client-supplied contact fields.
Emails contain only fixed status/action text and a login link, not compensation,
private contact details, reports or resumes. Existing historical notification rows
are never drained. SMS and push delivery are not included.

The existing nonce-authenticated worker handles a separate workflow scope with its
own event and URL allowlists. Private claims consume the nonce and share the manual
sender's notification lease. SMTP acceptance and a provider message ID are required
before marking sent; ambiguous sends are not retried automatically.

## Assignment Error Regression

The production protection functions were read from Supabase on 2026-10-08. The
company's immediate assignment RPC updates applicant review and request fields,
but these guard triggers reject every non-admin UPDATE, including the trusted
assignment RPC. The UI therefore displayed a generic assignment failure.

The local fixture now reproduces this exact failure before loading the migration,
using the production guards' conditions, and verifies that acceptance succeeds
after applying the private transaction-local context. General client table writes
and the old immediate-assignment RPC remain denied.

## Verification

`npm run test:self-service` loads the new migration and real assignment lifecycle
and certification migrations in PGlite with protected-write guard fixtures.
It covers ownership, anonymous/direct access denial, idempotency, reservations,
expiry, cancellation/decline, term changes, conflicts, withdrawn applicants,
safe public payloads, completion revisions, individual credit, deduplication,
test exclusions, rescheduled events and unchanged financial data. It also exercises
the email queue and worker with stubbed HTTP/SMTP: future-only events, verified
recipients, private claim/replay denial and provider-confirmed sent status.

Existing security, operations, certification, company assignment and admin alert
tests also pass. Production build passes with the existing bundle size warning.
New components/test have clean focused ESLint. Dashboard files still have existing
lint errors/warnings unrelated to this workflow.

Not yet verified: production migration/worker deployment, real SMTP delivery,
live company/interpreter E2E state changes, multi-connection concurrency and mobile
screenshots. Activation requires action-time confirmation of public event fields,
new scoped user authorities and automatic recipient email delivery. No real
assignment, payment or customer notification has been created for this verification.
