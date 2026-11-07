# Sales autopilot database rollout checklist

**Status: proposed migration in draft PR; NOT applied to production.**

Migration: `supabase/migrations/202611060001_sales_autopilot_foundation.sql`

Tables:
- `sales_contacts`: provenance, lawful basis review flags, suppression and reply timestamps; organization/email unique.
- `sales_outreach_events`: immutable, idempotent events.
- `sales_send_ledger`: unique send idempotency keys and unknown-result state.
- `sales_oauth_credentials`: **encrypted** refresh-token envelope only.
- `sales_oauth_transactions`: short-lived PKCE verifier envelope and hashed OAuth state.

Security: RLS enabled without client policies; browser roles revoked. No secrets in migration. No scheduled sends.

**Before migration deployment:** inspect existing schemas and grants, confirm role permissions and backup; check for naming conflicts. Do not put an OAuth refresh token in SQL editor, GitHub, logs, or chat.

**Still required before production sending:**
1. Atomic server-only SQL functions to consume OAuth state exactly once and to reserve send slots with concurrent daily quotas; do not use SELECT-then-INSERT.
2. Transactional opt-out event ingestion that updates `sales_contacts.suppressed_at` and commits before HTTP success; signed token alone is insufficient.
3. Encrypted token storage key in Vercel, server-only service-role client, mailbox identity verification, OAuth client secret, Google consent publication/expiry plan.
4. Gmail send adapter, explicit send-uncertain recovery, inbound reply/bounce/complaint ingestion, verified physical sender address and unsubscribe page.
5. Authorized business lead source and jurisdiction-specific compliance verification. No scraping or unsolicited social DMs outside provider terms.
6. Independent test suite, CI and Vercel preview smoke tests, then controlled self-addressed test.

**Production sending stays OFF** until all gates are proven. This migration alone does not start any mail.
