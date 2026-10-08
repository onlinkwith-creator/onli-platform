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

Company/interpreter workflow emails now use the original ON-LI branded form
through `supabase/functions/_shared/email-template.js`, shared with `send-email`.
The original form's generated HTML was verified byte-for-byte for representative
workflow and settlement inputs. The workflow worker's bundled equivalent was
deployed through the Supabase Code editor; delivery authentication, recipients,
plain-text fallback and historical queue behavior are unchanged. Administrator
approval emails retain their existing form. Previously delivered emails are not
resent to apply presentation changes.

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

Production activation was explicitly approved and completed on 2026-10-08:
both migrations, the shared Edge worker, and release commit `6503926` deployed.
Both Vercel deployment checks succeeded. A clean archive build of the committed
release also passed, excluding unrelated pending resume-publication edits.

Live company/interpreter read RPCs succeeded; anonymous workflow reads, company
administrator preferences and direct private mail-queue reads were denied. A
zero-amount proposal was rejected without creating an offer. The company browser
shows an existing pending offer without the original assignment error and the
new completion review tab loads. No commercial offer or completion was submitted
by the verification process.

One explicitly labeled connection-test email to the owner's verified mailbox
was processed by cron: queue `79229b3a-a97e-4008-ba13-41a13d24e2e6` is `sent`,
attempts `1`, no error, and a provider message ID is present. This confirms SMTP
acceptance, not inbox delivery. No historical pending mail was dispatched and
no payment/payout states or passwords were changed.

Not yet verified: live company/interpreter E2E state changes, multi-connection
concurrency and mobile screenshots. An unauthenticated company email deep link
currently returns to the default request tab after login; already authenticated
links select the requested tab. Login return-target preservation remains a UX gap.
