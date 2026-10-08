# Recruiting Automation Safety

## Behavior

- Existing offers expire after 24 hours, capped by event start. The existing
  one-minute workflow dispatcher releases expired reservations and queues one
  notification for each party. Decline/cancel immediately releases reservations.
- Pending offers reserve assignment capacity, not application capacity. Applicants
  can continue applying until confirmed assignments fill the required headcount,
  the published deadline passes, or the event starts.
- Confirmed capacity closes recruiting. Cancellation or increased headcount
  reopens only capacity closures owned by automation. Manual closed/cancelled jobs
  are not reopened. Cancelled/completed requests are not reset by lifecycle sync.
- Confirmed-assignment cancellation is still an administrator exception. This
  release automates the aftermath, not unilateral cancellation or replacement.
  No alternative interpreter is selected automatically.
- A published date-only deadline remains valid through 23:59:59 Asia/Seoul. The
  server denies late applications immediately; the ten-minute follow-up scan
  updates the persisted job status. Deadline/start closures require manual review
  before reopening, even if rescheduled. Ambiguous shared-job links are skipped.
- New confirmed-assignment cancellations on open future recruiting queue a
  company vacancy email using the existing ON-LI template. Refilled, cancelled,
  manually closed or past-deadline vacancies are suppressed before sending.
  Existing interpreter discovery opt-in is preserved. No historical mail backfill.
- Company buttons distinguish confirmed capacity from capacity reserved by
  pending offers. Publication visibility, financial states and passwords do not
  change. Event participation reconfirmation remains excluded.

## Verification

The PGlite workflow suite applies the actual migration and tests scheduled expiry,
reservation release, continued applications with pending offers, automatic
close/reopen, company vacancy delivery claims, stale claim cancellation, manual
closure protection, deadline-day semantics, immediate capacity changes, private
helper denial and unchanged financial/historical-notification data. Live financial
or assignment changes are not performed for verification. Concurrency protection
continues using request-first row locks; multi-connection production race tests
are not claimed.
