# Stockwise Development — NEXT TASK

This file is the handoff contract between ChatGPT and Codex for the Stockwise/Nexops application.

## Working branch

`codex/managed-service-mvp`

## Mandatory context

Before starting, read:
- `docs/PRODUCT_STRATEGY.md`
- `docs/ROADMAP.md`
- this `docs/NEXT_TASK.md`
- the latest relevant section of `docs/APAC_GROWTH_SYSTEM_REPORT.md`

The top-level growth objective is **10,000 APAC users within 30 days of growth launch**.

## Current task — Build Outbound Automation V3

Implement the next outbound automation layer so Stockwise/Nexops can run approved lifecycle email plus X and Threads publishing unattended, while retaining hard safety boundaries for high-risk external actions.

### Goal

Create a production-quality automation framework that can:

1. Send approved low-risk lifecycle email through the existing Nexops Gmail/OAuth infrastructure without per-message human approval.
2. Create/schedule/publish approved X content through Buffer.
3. Create/schedule/publish approved Threads content through Buffer.
4. Prevent duplicate sends/posts, preserve auditability, respect preferences/suppression/rate limits, and stop on high-risk or ambiguous content.
5. Produce clear logs and a morning summary suitable for unattended morning/day/night operation.

Do not deploy the application in this task.

### Buffer integration

Use Buffer's current GraphQL API architecture.

Requirements:
- Buffer API key must come only from an environment variable/secret such as `BUFFER_API_KEY`.
- Never commit or log the key.
- Query the Buffer account for connected channels rather than guessing channel IDs.
- Support configuration for the selected X and Threads channels.
- If credentials/channels are missing, implement and test the integration with mocks/local fixtures, then STOP before live publication and report the exact one-time configuration needed.
- Support single posts and architecture that does not block future threaded posts.
- Record Buffer provider post ID, channel/service, content hash, requested/scheduled time, final known state and error.
- Use idempotency/content hashing so the same logical post is not automatically published twice.
- Do not automatically retry an ambiguous provider result.

### Approved automated email categories

Only these may run without individual human review:
- welcome
- activation reminder
- CSV reminder
- consultation confirmation
- consultation reminder
- user-requested follow-up
- weekly summary
- workspace invitation

Requirements:
- retain template/version approval
- retain recipient consent/preferences where applicable
- retain suppression/unsubscribe behavior
- retain per-recipient and sender rate limits
- retain idempotency and duplicate prevention
- retain delivery reconciliation
- unknown delivery must not be blindly retried
- preserve audit logs
- do not send arbitrary free-form AI email automatically

### Approved unattended social categories

X/Threads auto-publish may include only public, non-sensitive content such as:
- Stockwise/Nexops product education
- feature/product updates that are actually implemented
- supply-chain educational insights
- demo/how-it-works content
- approved 30-day free-access messaging
- consultation CTA
- public build-in-progress updates
- non-confidential APAC growth content

Network-specific copy is required. Do not blindly reuse identical text if platform norms differ.

### Must remain blocked / human reviewed

Never auto-send or auto-publish:
- legal advice or legal commitments
- contract terms/commitments
- payment/banking instructions
- refunds or compensation
- PO changes
- supplier changes
- liability admissions
- confidential/customer-specific data
- private operational data
- unsupported performance claims
- fabricated metrics/testimonials
- ambiguous or low-confidence AI content
- anything requiring a secret/OAuth/schema/RLS change

### V3 automation runner

Create or harden the automation structure so it can later be scheduled morning/day/night.

Target responsibilities:
- inspect current task/state
- generate approved outbound work items
- run safety classification
- execute only allowlisted email/social items
- log outcomes
- write/update a concise `logs/morning-summary.txt`
- avoid overlapping runs with a lock
- exit safely if another run is active
- never recursively create unbounded new tasks

Do not install a permanent scheduler in this task unless a scheduler already exists and can be modified without elevated privileges. Prepare scripts/config so scheduling is the next step.

### Safety / secrets

- No secrets in browser code.
- No secrets in tracked files.
- Redact secrets from logs/errors.
- No `danger-full-access` or approval-bypass mode.
- Preserve workspace-write sandbox compatibility for Codex automation.
- No Production deployment.
- No billing activation or charges.
- No Supabase schema/RLS changes.
- No customer-data deletion.

### Testing

Add tests for at least:
- email allowlisted category accepted
- non-allowlisted/high-risk email blocked
- suppression/opt-out blocked
- duplicate email blocked
- rate-limit behavior retained
- Buffer X mapping
- Buffer Threads mapping
- missing Buffer credentials safe failure
- wrong/missing channel safe failure
- duplicate social content blocked
- ambiguous provider response not automatically retried
- high-risk/confidential social content blocked
- secret redaction in logs
- concurrent/overlapping automation run lock
- morning summary output

Use provider mocks. Tests must not create real email or social posts.

Run:
- relevant unit/security tests
- relevant database tests
- relevant browser regressions if UI is touched
- production build

### Controlled live verification

After implementation/tests pass:
- Do not invent credentials or ask for secrets to be pasted into source/chat.
- If Gmail runtime configuration is already available, prepare the exact controlled verification plan for one approved test-recipient message before broad unattended sending.
- If Buffer credentials/channels are configured, prepare the exact controlled verification plan for one X test post and one Threads test post.
- If live credentials are not configured, report this as CONFIGURATION REQUIRED, not a code failure.
- Do not publish/send a live test in this task unless the existing runtime configuration clearly identifies an approved test recipient/channel and the operation is explicitly bounded as a test.

### Documentation

Update `docs/APAC_GROWTH_SYSTEM_REPORT.md` with:
- V3 outbound architecture
- automated allowlists and hard blocks
- Gmail runtime readiness
- Buffer X/Threads readiness
- remaining configuration/live-verification steps
- 30-day APAC 10k growth implications
- scale limitation that Gmail is not the 10k bulk-email solution

### Status

- State: READY
- Deployment: NOT REQUESTED
- Production promotion: FORBIDDEN
- Billing: FORBIDDEN
- Schema/RLS changes: FORBIDDEN
- Approved lifecycle/social automation: TARGET OF THIS TASK

### 2026-10-25 implementation checkpoint

Safe offline preparation is implemented and tested; **V3 live/unattended delivery is not
complete**. See `docs/OUTBOUND_AUTOMATION_V3.md` and the latest report section.
The user now explicitly authorizes unattended execution only for the lifecycle-email
allowlist and the approved public X/Threads social allowlist defined above, once the
existing safety gates and a bounded live verification succeed. High-risk categories,
OAuth/secret changes, schema/RLS changes, production deployment, billing, customer-data
deletion and irreversible production changes remain blocked.
Buffer and Gmail credentials may be supplied only through secure runtime configuration;
missing credentials are CONFIGURATION REQUIRED, not a code failure.
Remaining implementation includes automatic-email mode/versioned templates and source
verification, durable social claims/reconciliation, public-copy approval/versioning,
runner overlap protection, and explicit one-message / one-X / one-Threads controlled
live verification before broad unattended operation. Do not mark COMPLETE or claim
10,000-user delivery readiness from mock/local tests alone.
