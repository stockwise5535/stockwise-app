# Outbound V3 — offline preparation checkpoint

This checkpoint is **not unattended live delivery**. The current user instruction
forbids Gmail enablement, external mail, secret/OAuth changes and schema/RLS changes.
Those instructions override the broader live-delivery goal in NEXT_TASK.

## Run safely

```sh
node scripts/outbound-automation.mjs
```

This command reads NEXT_TASK State and prepares at most ten local work items only
when it is READY. It writes `logs/morning-summary.txt`. It does not load credentials,
import a live provider, invoke Codex, create tasks, prepare hosted queues or send.
There is no live flag. The service fixture injection is for tests only; no runtime
entrypoint connects it to Buffer or Gmail. Social copy remains review-required.

The atomic directory lock excludes overlapping runs using the same checkout/log
directory. It is never expired automatically: after a crash, an operator must
establish that the process is stopped before removing the lock. The fixture ledger
reserves logical identity and network/content hash before calling the mock. Held,
accepted and unknown records are never retried. Corrupt ledgers fail closed.
Writes use private temporary files, fsync and atomic rename. Logs contain fixed
statuses rather than raw errors, payloads or credentials. No secret-value log
redactor is relied upon. State/log files are ignored by Git.

This is a **single-host local fixture ledger**, not a distributed production queue.
Do not delete/copy/reset it to retry a possibly accepted post. Production execution
requires a separately reviewed durable shared claim/audit design, provider-status
reconciliation, approved public-copy versions and channel approval. No migrations
or RLS changes are supplied here. No scheduler has been installed or run.

## Boundaries

Email categories are enumerated for routing only. Welcome, activation/CSV reminders,
consultation confirmation/reminder, user-requested follow-up, weekly summary and
workspace invitation still require the existing protected email pipeline. No
category label grants permission. Existing template hashes, individual review,
confirmed canonical recipient/membership, consent/suppression, self-test, runtime
gates, atomic SQL quota and unknown-delivery holds are unchanged. Weekly summary and
user-requested follow-up are not implemented as sendable templates in this checkpoint.
Existing consultation/invitation templates retain their review requirement.

Only exact static public product-education variants are prepared for X and Threads.
Unknown categories, arbitrary/edited copy, extra customer data fields, commitments,
metrics/testimonials and confidential content cannot pass this preparation classifier.
Other requested social categories and threaded posts remain future reviewed additions;
the work-item shape leaves room for versioned extensions without permitting arbitrary
provider metadata today. No customer or demo operational records are read.

## Buffer configuration and verification plan — do not execute live yet

The server-only adapter follows the official GraphQL API:
[channels](https://developers.buffer.com/examples/get-channels.html),
[text posts](https://developers.buffer.com/examples/create-text-post.html) and
[scheduling](https://developers.buffer.com/guides/posts-and-scheduling.html).
It uses `https://api.buffer.com`, Bearer auth, discovered organization channels,
`twitter` for X and `threads` for Threads. Configured channel identity/service and
unpaused queue must match before mutation. Mutation uncertainty is static-error,
no-retry. Acceptance records a provider ID and schedule, not confirmed publication.
No provider idempotency guarantee is assumed.

CONFIGURATION REQUIRED: `BUFFER_API_KEY`, `BUFFER_ORGANIZATION_ID`,
`BUFFER_X_CHANNEL_ID`, `BUFFER_THREADS_CHANNEL_ID`. All were absent from the process
environment during this task. Supply only through an approved secure server/local
secret mechanism in a later authorized task; never through chat/source or VITE_.
First query the authenticated account's organizations, select the approved one,
then discover its actual channels. Do not infer approval from discovery alone.

Before a later live test, obtain explicit approval of one exact public test copy,
test channel and schedule per network. Validate IDs against discovery, reserve a
durable claim, submit once, retain the returned ID and inspect the final provider
state. Timeout or missing receipt means stop and reconcile, not retry. This task
does not provide a live runner or claim live schema compatibility from mocks.

## Gmail controlled verification plan — preparation only

Current process lacks GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN,
GMAIL_SENDER_EMAIL, NEXOPS_GMAIL_APPROVED_SENDER and SUPABASE_SERVICE_ROLE_KEY.
No .env values were loaded, OAuth refreshed or hosted runtime inspected.
Historical successful tests do not establish current freshness.

Keep default draft_only, server send disabled and database gates unchanged.
Follow OUTBOUND_SAFETY.md for a later authorized read-only identity/scope check.
Before any separately authorized one-message verification, use the confirmed
sender-owned development recipient/workspace, exact approved sender_test version,
assigned review and protected ledger; honor the existing one-recipient/24-hour,
10/hour and 50/day limits. Do not use a customer address or change gates to make
this task pass. Any future automatic mode requires separate implementation/review;
the present worker accepts only draft_only/test_recipient.

The pre-existing untracked `automation/codex-nightly-v2.sh` contains
`--approve-for-me`. It was not executed, edited or included in this commit. Do not
use it as the V3 scheduler; approval bypass conflicts with NEXT_TASK's requirements.
