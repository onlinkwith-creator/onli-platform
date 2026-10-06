# Administrator Action Alerts

Recipient: `onlinkwith@gmail.com` only.

## Scope

Only new database events after rollout are queued: interpreter registration,
business registration, corporate request submission, job application,
resume submission/replacement, settlement-document changes, and company estimate
approval. Existing pending notifications are not imported or sent.

Messages contain the action category and a login-protected administrator link.
They do not include private contacts, resumes, bank documents, or customer data.

## Delivery

`20261006110000_automatic_admin_action_alerts.sql` creates a private queue and
a one-minute Supabase Cron dispatcher. Each dispatch receives a random UUID
nonce. The Edge Function consumes the nonce with an atomic database claim;
anonymous/authenticated clients cannot read the queue or invoke claim/dispatch.
Recipients and message content come from the server, never from the caller.

The shared `notifications` lease prevents concurrent manual/automatic sends.
Only SMTP acceptance with a provider message ID counts as sent. Safe initial
connection failures retry, up to five SMTP attempts / ten dispatches. Ambiguous
SMTP outcomes and stale sending leases require manual verification; automatically
resending these risks duplicate mail.

## Rollout

1. Deploy `supabase/functions/admin-action-alert/index.ts` to `admin-action-alert`.
2. Configure its gateway to use the DB nonce validation in the function instead
   of legacy JWT verification. Other functions and account permissions stay unchanged.
3. Apply the queue migration, then `20261006120000_admin_alert_preferences.sql`
   and `20261006123000_admin_alert_delivery_channel.sql`. The last migration
   overrides legacy internal-channel rules only for this new queue's records.
   Do not run any backfill or bulk-send operation.
4. As an active admin, call `test_admin_action_alert()` once. This creates a
   category-only connection test, not a fake member or customer request.
5. Verify that the test notification has `status = sent`, `sent_at`, and a
   provider message ID. SMTP acceptance is not proof of inbox placement.

Existing SMTP secrets (`GMAIL_USER` / `GMAIL_APP_PASSWORD`, or their supported
aliases) are reused inside the Edge Function. No secrets belong in the frontend,
SQL command, repository, or logs.

## Verification And Recovery

The administrator account modal provides a global switch and seven per-category
switches. Settings are saved by admin-only RPCs; clients cannot change the
recipient. Turning a category off suppresses new queue entries and mutes
unclaimed jobs already queued for that category. Re-enabling starts with future
events only. A message already claimed for SMTP may finish after the switch is
turned off.

Run `npm run test:admin-alerts` for future-only enqueueing, source transitions,
fixed recipient, access denial, nonce replay/concurrency denial, manual-send
coordination, provider confirmation, and ambiguous-delivery handling.

View delivery results in administrator notification history. For an uncertain
result, inspect the sender's Sent folder before manually resending the record.
Exhausted retries are recorded as failed, not as successful deliveries.

To pause automatic mail without deleting data:

```sql
select cron.unschedule('onli-admin-action-alerts');
```

Source triggers continue recording new work while paused. Restart only this
queue's cron job; never automatically drain the older notifications table.
