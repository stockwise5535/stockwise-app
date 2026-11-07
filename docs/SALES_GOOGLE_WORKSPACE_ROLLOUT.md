# Google Workspace sales integration: production OFF

Status: **draft-only foundation**. No OAuth tokens, Gmail send calls, subscription endpoint, reply ingestion, delivery ledger or scheduler exist in this branch. Do not merge or enable outbound based on draft generation alone.

## Operator-provided destinations
- Homepage: https://stockwise-homepage.vercel.app/en/
- Application: https://stockwise-app-1qz9.vercel.app/

## Before any send
1. Verify the sending Workspace account/domain and configure SPF, DKIM and DMARC; assess Google Workspace sending limits, Gmail API quotas and bulk-sender requirements.
2. Choose an authorized OAuth setup and securely store refresh token/credentials server-side. Gmail API send scope is sensitive; Google verification and organizational policies may apply. Do not request passwords or tokens in chat.
3. Implement a durable, organization-scoped recipient ledger, suppression table, one-click unsubscribe POST endpoint with signed tokens, and verified unsubscribe processing. Do not claim one-click support until endpoint is live.
4. Record each message's provenance, legal contact basis, jurisdiction, approved copy, sender postal address, idempotency key, and all state transitions. Implement incoming reply detection and bounce/complaint processing; uncertain outcomes must never auto-retry.
5. Re-evaluate suppression and all channel policy checks immediately before each send, with transaction-safe lease and per-domain/per-day caps.
6. Verify permitted sources and lawful outreach by jurisdiction. No automatic scraping or unsolicited platform DMs where prohibited.
7. Run test mailbox and internal dry-run first; inspect provider response and suppression behavior. Enable bounded production pilot only after checks and explicit readiness confirmation.

## AI spend
Use fixed approved text and deterministic rules. No paid AI API calls in this sales foundation. The existing separate SNS PR may still contain billable AI calls and must not be enabled as $0 mode without modification.
