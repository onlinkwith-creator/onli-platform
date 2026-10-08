# Workflow Follow-Ups and Linked Numbers

## Scope

Pre-event participation reconfirmation is deliberately excluded. Payment receipts,
settlement approval/amounts and payout completion remain administrator-controlled.
The worker continues using the original shared ON-LI email form and verified Auth
recipients. Historical pending email is never drained.

## Automation

- Pending offers created after activation: one reminder in the final six hours.
  Existing expiry processing notifies the company/interpreter on expiration.
- Upcoming requests within three days: one missing-headcount notice per start date
  to the company; within one day, an administrator exception notice.
- Assigned upcoming work within three days with no materials: one upload reminder
  per start date. New material uploads notify assigned interpreters, batched to
  one email per request/recipient/local calendar day.
- Events ending on/after activation: one completion submission reminder from the
  next day, up to seven days after the scheduled end. New completion submissions
  still unreviewed after 24 hours trigger a company reminder; three days trigger
  an administrator exception notice. No automatic completion approval or payout.
- Full confirmed headcount closes recruiting. Cancellation/status changes update
  active headcount and can reopen only an automatically capacity-closed job.
  Started jobs stop accepting applications. Applicant counts alone never impose
  a quota; pending offers do not automatically reject further applicants.
- New general publications can notify active, publicly approved interpreters who
  explicitly enabled discovery mail, have a matching registered region/minimum
  level, and have no conflicting canonical assignment. No opt-in means no mail.
- Reopened recruiting can notify opted-in existing nonwithdrawn applicants.
  This is an invitation to inspect the latest conditions, never an assignment.
- Companies can sort safe applicant profiles by region/minimum-level fit; ties
  use application date and ID. No private or demographic scoring is introduced.
- Administrators have a compact exceptions list for missing headcount, overdue
  completion reviews and assignment date conflicts, plus a separate alert toggle.

Follow-up/exception scans run every ten minutes. Delivery retains the existing
one-minute worker. Reminder claims recheck actionable state; handled, cancelled,
fully staffed or opted-out items are cancelled before SMTP submission. Original
event receipts retain their original behavior. Dedupe keys prevent repeated scans
creating repeated messages. Login return targets allow only fixed internal tabs
for the authenticated role, with no arbitrary redirect destination.

## Numbers

Example: `ONLI-REQ-016` → `ONLI-REQ-016-1` →
`ONLI-REQ-016-1-APP-001` / `ONLI-REQ-016-1-ASG-001`.

UUIDs, numeric primary keys, relationships, file paths and document records are
unchanged. A private number registry preserves previous display numbers and uses
transactional advisory locks to allocate stable, unique sequences. Deleted IDs
do not make old suffixes available again. Separate legacy matching-history rows
get separate ASG suffixes; the latest eligible matching can share its canonical
assignment's number. Company/interpreter projections keep their existing access
boundaries. Canonical assignment numbers take precedence in the admin/interpreter
views. Unlinked standalone jobs retain legacy numbering. Ambiguous shared-job
request links are skipped for manual review, not guessed.

## Verification

Self-service tests cover linked-number backfill, duplicate legacy matching history,
stable assignment IDs, ownership/anonymous denial, opt-in/opt-out, matching filters,
offer/material/completion reminders, stale-claim cancellation, dedupe, auto-close/
reopen, application capacity/start guards, safe redirects and unchanged financial
states. Existing security/admin-alert tests and production build pass; the existing
bundle-size warning remains. No real offer acceptance, completion approval or
payment was submitted as a test.
