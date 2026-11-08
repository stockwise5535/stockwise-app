# Stockwise Sales CRM: Google Apps Script Gmail bridge (pilot)

This is an **independent, opt-in-only pilot**, not a replacement for the production Supabase sales ledger. No Supabase sync, inbound reply parsing, lead discovery, or unattended follow-up is implemented in this change. Do not enable the production send flags.

## Existing setup

The operator already created a Google Sheet called **Stockwise Sales CRM**, with six tabs: Leads, EmailQueue, ActivityLog, Suppression, Settings, Dashboard. Its ID is stored in the Apps Script project property `STOCKWISE_CRM_ID` by `setupStockwiseSalesCRM`. A self-addressed Gmail send test succeeded.

1. In the **same** Apps Script project as `setupStockwiseSalesCRM`, add a new script file and paste the complete `StockwiseSalesBridge.gs` source. No web-app deployment is needed.
2. In Settings, keep `LIVE_SENDING` = `false` and `FOLLOW_UP_ENABLED` = `false`.
3. Add Settings rows `SENDER_NAME`, `POSTAL_ADDRESS`, `UNSUBSCRIBE_EMAIL` with accurate, non-secret business values. Never invent an address.
4. Add only documented, verified opt-in contacts to Leads. Lead ID must be unique; Email must match EmailQueue; Contact Basis must equal `opt_in`; Approved must equal `true`. An address listed on a website is **not** consent.
5. Add a matching EmailQueue row with status `QUEUED`, Approved `true`, subject and body. Add opt-outs to Suppression *before* running.
6. Run `swDryRun` manually and inspect Execution log. With LIVE_SENDING=false, no message is sent.
7. Only after sender identity, physical postal address, opt-out workflow, opt-in provenance, and manual review are verified should the operator consider a small controlled live pilot. Keep the limit at 5 or fewer. Any row left in `SENDING_REVIEW` must be reconciled manually; **never retry automatically**.

## Safety limitations

- The sender is gated by **two approvals** (Leads and EmailQueue), a verified opt-in basis, suppression, reply/bounce flags, sender disclosures, daily quota and a script lock.
- Google Sheets is not a hardened transactional database. This pilot should not be used for multi-operator or high-volume outreach. The send is claimed before Gmail is called, avoiding automatic retries after uncertain results.
- A reply-to address with unsubscribe instructions is provided, but **incoming unsubscribe replies are not processed automatically**. Until that is implemented and tested, monitor the mailbox and update Suppression immediately; do not run unattended live sends.
- This integration does not synchronize with Supabase. Avoid using both independent senders against the same lead. Production Sales Autopilot remains OFF.
- Apps Script and personal Gmail have provider quotas and terms. Free does not mean unlimited or guaranteed deliverability.
- The old SNS fixed-content catalog in draft PR #3 is unrelated and must not be deployed as part of this change.

## Next slices

1. Read-only CRM reconciliation/export with the existing Supabase sales tables; establish one source of truth and durable cross-system idempotency.
2. Reply/opt-out ingestion with high-confidence handling, bounce suppression and an explicit test suite.
3. A controlled pilot after legal/provider authorization and manual review. Keep autonomous cold outreach OFF.
