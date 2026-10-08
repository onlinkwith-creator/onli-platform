# Request Messages

## Scope

Company and interpreter portals have an `의뢰 메시지` tab. Conversations are
one-to-one per canonical assignment and account pair. Same-request interpreters
never share a conversation. Only accepted/current assignments create conversations;
applicants and pending assignment offers cannot send messages.

The first version supports plain text, unread counts, peer read receipts, cursor
pagination, per-conversation drafts, explicit send/retry and visible-page polling
every 15 seconds. Files continue to use the existing scoped materials workflow.
No contact fields, resume access, automatic assignment, completion confirmation or
financial changes are introduced. Message text is rendered as text, never HTML.

## Authorization

All three tables have RLS and no public/anon/authenticated table or sequence grants.
Only narrowly scoped authenticated RPCs expose safe projections. Each access
rechecks the account pair, current company ownership and approval, interpreter
identity/withdrawal, and assignment. Cancellation makes an existing conversation
read-only; ownership/account transfers cannot read the previous pair's history.
Administrators do not receive blanket message access.

Sending locks the request and assignment, has account-wide transactional rate
limits (20/minute, 200/day), and an immutable client nonce for retry deduplication.
Messages cannot be edited/deleted through portal APIs. Read markers only advance
to an existing message in that conversation, never to unseen concurrent messages.
Messages/history cascade with existing hard-deleted requests/assignments; this
feature does not add a user deletion or data-retention schedule.

## Email

`onli-request-message-alerts` scans every five minutes. Unread messages must have
settled for two minutes before a generic nudge is queued. Alerts are deduplicated
by conversation/recipient/latest incoming ID, with a 30-minute burst cooldown.
Unchanged unread messages do not cause periodic reminder spam. Messages older
than seven days do not trigger a new nudge. Delivery rechecks read/access/write
state, so read or cancelled messages are suppressed before SMTP claim.

Verified Auth emails and the existing shared ON-LI template are used. Message
content, names, phone numbers, resumes and remuneration are not in emails. The
fixed messages-tab paths are role-scoped in login return-target validation.
Historical pending notifications are not drained.

## Release And Verification

Apply `20261008180000_request_messages.sql`, update `admin-action-alert` using its
shared-template bundle, and deploy the frontend. Do not expose the UI against a
database without these RPCs. All SQL changes are transactional.

`npm run test:messages` executes the migration on PGlite and exercises anonymous/
cross-company/colleague denials, account transfer and withdrawal, cancellation,
retry nonces, limits, cursor/read semantics, and coalesced/suppressed emails.
Existing workflow/security tests and production build remain release gates.
Real-message browser checks must use designated test accounts and not commercial
assignments; live SMTP delivery is not implied by isolated queue tests.
