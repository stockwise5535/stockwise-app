# APAC Growth System + real backend foundation

## WHAT WAS IMPLEMENTED
Continued from the completed Phase 2 state (`f3fc26a`) on `codex/managed-service-mvp`. Existing work was clean and preserved. No production deployment, hosted database migration, push or external email sending occurred.

The campaign architecture is English-speaking APAC, consultation-led inbound, with free 30-day access and no new payment wall or Stripe work. The target is Activated Users, not a promise of 10,000 registrations. No load/capacity or business-improvement claim is made.

### Backend first
Two additive Supabase migrations implement account profiles/free trial dates, organizations, organization memberships, demo/customer workspace metadata, workspace memberships, per-user activation, safe event records, consultation leads, qualification, audit metadata, expiring single-use invites, communication state, internal growth admins and deletion requests. Future imports/exceptions/actions/decisions/many-to-many action links/agent-run tables are reserved with client writes denied.

Authenticated confirmed users receive an organization, owner membership and a private demo-workspace **metadata record** atomically on first growth-session bootstrap. Retries return the same workspace. No synthetic SKU, exception, action, decision or browser snapshot is inserted into customer tables. Separate customer workspace creation is explicit and initially empty. Existing legacy schemas, signup trigger and SQL file are untouched. A new signup trigger creates only the account profile/free-access dates and registration event. Existing users receive profiles with their original registration timestamps, not fabricated campaign signups.

RLS and restricted grants guard the new entities. Workspace roles are owner/admin/operator/viewer; lead contact data is limited to managing roles, not viewers. Membership changes are only through constrained invite acceptance. Composite foreign keys protect workspace relationships. Customer-mode triggers prevent operational records in demo workspaces. Internal global metrics require a separate server-assigned growth-admin record; workspace owners cannot self-promote.

### Signup and activation
Reused LoginPage/AuthProvider instead of replacing authentication. Missing Supabase settings now show a clear disabled-auth state instead of crashing on module import. Auth session errors and sign-out identity handling are explicit.

`/signup` uses email/password and free/no-card messaging. The public demo is available immediately, including while email confirmation is pending; saving a private workspace requires confirmed login. Confirmation is never bypassed for conversion. After confirmed sign-in the same completed TODAY/Inbox/Action/Decision/Supplier/Report component is shown; it is not duplicated or rebuilt.

Activation persists when a user views TODAY, opens an exception and sees the visible recommended next action. The database creates activation_completed once per user/workspace. A checklist shows server state. Trial start/end/status are stored; expiry does not trigger charging or an immediate payment block. Customer-data activation requires a customer workspace with a validated import; the existing legacy CSV workflow has not been silently converted into workspace ingestion.

### Measurement and growth dashboard
A small consent-gated PostHog capture adapter uses environment configuration, a safe-property allowlist, pseudonymous identity linking and no autocapture/session replay. Failed analytics do not block product use. Existing operation screens and accepted legacy CSV flows have metadata-only hooks; no filenames or operational contents are sent. Signup/product/consultation/invite event definitions and funnel order are documented.

The internal Growth Dashboard queries authorized Supabase aggregates: registered/activated/CSV/returning users, consultation leads and qualified company counts. Visitor/signup-start values remain unavailable until an actual analytics connection exists. Conversion rates use distinct-user cohort intersections where the sources support them; raw lead rows are not divided by user counts. A separate authorized SQL query set provides weekly reporting. No demo metrics are shown as business results.

### Consultation and qualification
Authenticated consultation requests persist with company/contact, market and optional role/industry/company size/SKU/supplier/tools/hiring/pilot information. Optional profiling is not a signup requirement. Requests use retry-safe UUIDs and explicitly request a reply without enrolling users in marketing. An external Calendar schedule link is shown only if a real permitted Google URL is configured. Submission/click never emits a confirmed-booking event.

The server computes a transparent qualification heuristic from consultation intent, business-domain signal, supplied role, company size and scale. Qualification is not an independently verified assessment. Only Qualified Lead / Consultation / Pilot Candidate records can enter the formula-safe CRM CSV/payload export. There is no automatic export of product users or live CRM synchronization.

### Lifecycle and referrals
A service-only cohort scheduler prepares unique per-user/kind **draft records**, not sent mail. Rules cover welcome, 24h inactivity, 72h activated/no CSV and one abandoned-consultation reminder. Marketing reminders require opt-in; opting out cancels pending marketing drafts. Deletion requests cancel pending communication. Pilot follow-up is a manual draft template. Templates and a server-only Gmail draft adapter exist; OAuth refresh/callback, dispatch/retries and actual sending remain disabled/unconfigured.

Owners/admins can create expiring, single-use viewer links and privately share them. Confirmed users can accept; role escalation and token reuse by another user are rejected. invite_sent means link generated, not email delivery. Referrer/acceptor association is retained in the invite record; no rewards or automated outreach exist.

### Landing, SEO and privacy
English `/en` and Japanese `/ja` copy share one content module and explain sample-based product value plus the Managed Service path. CTAs are Start Free / View Demo / Book a Consultation. The separate homepage repository remains unavailable and unchanged; these routes live in the current app.

Build generates localized static HTML with descriptions, Open Graph metadata and internal links. A configured public HTTPS origin enables canonical/hreflang/sitemap output. Without it, robots disallows indexing and the pages are noindex. Preview and Vercel routing explicitly serve the localized HTML at `/en` and `/ja`; an initial no-JavaScript check exposed SPA fallback on those paths, which was corrected. No deployment occurred.

Privacy/Terms routes are clearly labeled **drafts for owner/legal review**. Analytics is optional, communication preferences are opt-in, and account deletion has a persistent request path. Requests require manual verified handling; deletion is not falsely represented as instantaneous or complete.

## WHAT REQUIRES MANUAL ACCOUNT CONNECTION
See GROWTH_INTEGRATIONS.md for exact steps. Configure a development Supabase project and apply reviewed migrations; provide public client settings securely in environment settings and allow its actual hostname. Connect/test PostHog, configure the real Calendar schedule, review Gmail OAuth/server delivery and any CRM adapter separately. Approve public origin, policies and retention before campaign launch. No secret values should be sent in chat.

## SUPABASE STATUS
- Migrations and repository/UI integration implemented and tested locally on PostgreSQL via PGlite 0.5.11.
- Real row-level security, role checks, triggers and transactions execute in SQL tests.
- Browser connected-flow tests use explicitly simulated Auth/PostgREST with the real local database. They are not hosted Supabase tests.
- No URL/public client key is injected; existing environment draft already declares these requirements. No hosted project is connected, and no production migration was applied.
- Customer operational tables remain empty/reserved; legacy/Phase 2 operational state remains browser-local.

## POSTHOG STATUS
Capture calls, privacy controls, identity handling and event contract implemented/tested with a stub transport. No live project/key, ingestion verification, dashboards or retention policy is configured. Visitor/anonymous conversion metrics remain unavailable. No optional analytics are sent without consent.

## GMAIL STATUS
Templates, eligible-cohort draft rules, duplicate protection and a server-only draft adapter are implemented. No OAuth account, token store, provider callback/refresh, cron, dispatcher or sender is connected/deployed. No emails sent. Permission/consent must be rechecked before any future delivery.

## GOOGLE CALENDAR STATUS
Configured-link support and durable consultation intent are implemented. No booking URL is provided and no Calendar account is connected. Requests do not create events or confirm bookings. Manual in-app review remains necessary.

## CRM STATUS
Qualification, authorized qualified-only CSV export and integration payload interface are implemented. No HubSpot/equivalent credential or live synchronization. Product users stay in Supabase. Operators must review scoring and consent before using exports.

## SEARCH CONSOLE / SEO STATUS
Static localized HTML, titles/descriptions, conditional canonical/hreflang/Open Graph/sitemap and robots are implemented. No production origin is configured; indexing is disabled in current output. Search Console/DNS ownership verification has not occurred. Legal drafts and actual hosting behavior require staging review before indexing.

## ANALYTICS EVENTS AND FUNNEL
See GROWTH_ANALYTICS_EVENTS.md. Funnel: Homepage → Signup → Demo Workspace → TODAY → Exception/recommendation → Activation → optional CSV / Consultation → manually confirmed booking/qualified lead. Core product state is Supabase-backed when configured; operational demo contents stay local. Booking, email delivery and external CRM success are never inferred from clicks or draft creation.

## SECURITY GAPS
**NOT PRODUCTION READY — RLS / MULTI-TENANT SECURITY INCOMPLETE**

New-table RLS is locally verified, but full hosted Auth/JWT/PostgREST behavior and the legacy application's organization/workspace separation are not. Existing operational approvals are still a synthetic demonstration, not server-enforced commercial authorization. New operational tables deny client writes until an approved importer/transition service exists. Do not expose real multi-customer operational data through the demo.

Production prerequisites include two-user hosted security tests, confirmed-email delivery, anti-abuse/rate limiting, invitation revocation/email binding if required, durable service processing/observability, backup/restore, reviewed retention/deletion and server-side operational decision guards. Typed demo approvers remain non-authoritative. Browser-only records are not immutable audits. The 10,000-user goal is a planning target, not a tested capacity or projected outcome.

## TEST RESULTS
- Build: passed, including localized HTML generation.
- Node business/privacy/SEO tests: 28 passing (20 existing operational + 8 growth/SEO/privacy).
- PostgreSQL integration tests: 10 passing (bootstrap/idempotency/trial, cross-tenant RLS, role escalation, activation, private lead qualification, invites, growth-admin gate, lifecycle consent/duplicates, weekly cohort reporting, operational demo separation).
- Existing TODAY/Inbox browser regression: passed against built preview.
- Existing full Phase 2 browser regression: passed against built preview; zero external requests/runtime errors in those flows.
- Growth connected-flow browser test: passed using simulated Auth/PostgREST + real local SQL. Covers signup, bootstrap, reused demo/activation, consultation/qualification, invite, denied global metrics, separate customer workspace, refresh/logout/login and 390px layout.
- Public route browser test: checks English/Japanese static pages without JavaScript, draft legal pages, graceful missing-config signup/login and mobile layout. Passed after localized routing correction; screenshots reviewed for landing and authenticated mobile product layout.
- Optional analytics transport tests: no-consent suppression, safe properties, HTTPS host, pseudonymous identity linking and no contact data.
- Lint/typecheck: not configured. `git diff --check` is required/passed.
- Hosted signup/email confirmation, live PostHog/Gmail/Calendar/CRM, production indexing and load tests: **not run / not configured**.

## EXACT LOCAL ROUTES
| Route | Purpose |
| --- | --- |
| `/en`, `/ja` | Localized campaign landing pages |
| `/signup` | Existing signup component, free campaign copy |
| `/growth` | Authenticated demo / automatic workspace metadata bootstrap |
| `/growth?view=activation` | Persistent first-value checklist |
| `/growth?view=consultation` | Consultation request / optional configured Calendar link |
| `/growth?view=leads` | Authorized workspace requests and qualified export |
| `/growth?view=referrals` | Invitation creation/redemption |
| `/invite?token=…` | Confirmed-sign-in invitation redemption UI |
| `/growth?view=account` | Communication preferences, separate customer workspace, deletion request |
| `/growth?view=dashboard` | Internal growth-admin-only aggregate loader |
| `/privacy`, `/terms` | Draft policy/review pages |
| `/demo/operations` | Existing public Phase 2 synthetic product, unchanged workflows |
| `/` | Existing authenticated StockWise analytics, retained |

All previous `/demo/operations?view=…` Phase 2 paths remain available. No external preview links were created.

## ENVIRONMENT VARIABLES REQUIRED
| Variable | Purpose / state |
| --- | --- |
| `VITE_SUPABASE_URL` | Required real development project URL; missing |
| `VITE_SUPABASE_ANON_KEY` | Required public anon/publishable client key; missing; never a service-role key |
| `VITE_POSTHOG_KEY` | Optional public project capture key; not configured |
| `VITE_POSTHOG_HOST` | Optional HTTPS ingest origin; code default us.i.posthog.com |
| `VITE_BOOKING_URL` | Optional real Google appointment link; missing |
| `VITE_PUBLIC_SITE_URL` | Approved HTTPS origin for canonical/sitemap; missing |

Future Gmail/CRM/service-role credentials belong exclusively in a server vault/runtime; no such credential is required or embedded in the current browser. Dedicated project domains and integration destinations need their actual allowed-host settings when connected. Existing unknown network rules must be preserved.

## HOW TO VERIFY
```bash
cd /workspace/stockwise-app
npm ci --cache /workspace/.npm --no-audit --no-fund
node --test tests/*.test.js
npm run build
npm run preview -- --host 0.0.0.0 --port 4175 --strictPort
```
Optional external test tooling, without adding application dependencies:
```bash
npm install --prefix /tmp/nexops-db-tests --cache /workspace/.npm --no-audit --no-fund @electric-sql/pglite@0.5.11
npm install --prefix /tmp/nexops-browser --cache /workspace/.npm --no-audit --no-fund playwright-core@1.64.1
NEXOPS_PGLITE_PATH=/tmp/nexops-db-tests/node_modules/@electric-sql/pglite node --test supabase/tests/foundation.test.mjs
NEXOPS_TEST_URL=http://127.0.0.1:4175 NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/public-growth.browser.mjs
```
The connected browser test deliberately uses a separate **test-only** Vite process and intercepted local API URL, not real credentials:
```bash
VITE_SUPABASE_URL=http://127.0.0.1:54329 VITE_SUPABASE_ANON_KEY=local-test-public-key npm run dev -- --host 0.0.0.0 --port 5174 --strictPort
# In a second terminal:
NEXOPS_PGLITE_PATH=/tmp/nexops-db-tests/node_modules/@electric-sql/pglite NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/growth.browser.mjs
```
Never save those local fixture values as real project settings. Browser tests default to system `/usr/bin/chromium` and write screenshots only to /tmp. Production/development migrations must use real Supabase tooling; the test harness is not a migration/deployment API.

## NEXT 10 ACTIONS
1. Configure a development Supabase project and supply its public settings securely.
2. Review/apply migrations there; verify legacy signup plus two-user/viewer Auth/PostgREST/RLS isolation with real confirmed accounts.
3. Review the growth flow, English/APAC copy, consultation ownership and actual support response process.
4. Approve privacy/terms/contact/retention and the manual account/organization deletion workflow.
5. Connect a PostHog project, review consent/retention, and verify real event ingestion/cohort funnels.
6. Configure a real Google Calendar schedule and a verified booked-event path if needed.
7. Connect Gmail server OAuth and build reviewed draft/consent revalidation/delivery handling before enabling any reminders.
8. Review lead score thresholds and CRM consent; connect qualified-only synchronization only after manual export review.
9. Build validated customer ingestion and server-authorized operational persistence without copying the synthetic snapshot.
10. Run staging security, anti-abuse, performance/10,000-user workload, restore and indexing checks; obtain separate production deployment authorization only after these pass.

## CHANGED AREAS / CHECKPOINTS
Additive migrations/tests; shared growth repository/analytics/integration interfaces; Auth/Login configuration/error handling; small metadata-only operation/CSV hooks; localized routes/build/SEO routing; supporting documentation. Original operation models/workflow screens, datasets, decision rules and legacy business calculations remain intact. Checkpoint commits separate the database foundation, growth UI/instrumentation and final validation/documentation. All changes remain local on the requested branch.

## REUSABLE CLOUD CONFIGURATION
Updated `start_skill` in the existing environment configuration draft with tested demo/growth routes, build/test commands, missing Supabase settings, and the prohibition on hosted startup migrations or synthetic-data uploads. Draft persistence is confirmed; it is not applied/published and does not execute migrations or deploy the app. Review and save it in environment settings, then publish the environment only when its required configuration and validation are complete. Application production deployment remains separately unauthorized.

## HOSTED DEVELOPMENT VERIFICATION ATTEMPT — 2026-10-24
The current runtime still lacks VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY; environment configuration shows them only as pending requirements. No CLI/link/authentication, database credential or confirmed development test-user bindings are available. `node scripts/check-hosted-supabase.mjs` exits 2 (`blocked_missing_environment`) with **zero network requests**. No hosted migration was applied and no policy was changed. All requested hosted Auth, organization/workspace/membership, activation/consultation/invitation, refresh and cross-organization isolation tests remain **unrun**, not passed.

Added a read-only preflight and a credential-conscious catalog inventory; validated the latter against empty and migrated local PostgreSQL fixtures without changing application systems. Candidate migration status is unknown until remote history and definitions can be inspected; the existing non-idempotent CREATE migrations must not be reapplied blindly. Signup testing must not trigger unapproved external confirmation emails. Existing confirmed development users can unblock the other tests independently once access is supplied.

[HOSTED_SUPABASE_VERIFICATION.md](HOSTED_SUPABASE_VERIFICATION.md) contains exact environment/CLI/dashboard setup, migration-selection rules and the hosted test procedure. No deployment, billing connection, data deletion or message sending occurred during this attempt. The subsequent Gmail safety authorization is being implemented as a separate, initially disabled gate; it does not establish a connected mail provider or hosted database.

## CONDITIONAL GMAIL AUTHORIZATION — SAFETY FOUNDATION
The user's subsequent policy conditionally authorizes automatic Gmail lifecycle communication only after tested OAuth and strict gates. Added a versioned template-first classifier with AUTO_SEND_ALLOWED / HUMAN_REVIEW_REQUIRED / BLOCKED; protected outbound review/delivery history; exact-content human approvals; current consent/suppression; atomic idempotency/claim tokens; conservative sender/recipient limits; and a no-automatic-retry ambiguous-delivery state. The existing lifecycle templates/drafts are reused, not replaced.

New route: `/growth?view=communications`. New additive candidate migration: `202610240003_outbound_safety.sql` (six new RLS-protected tables). It has **not** been applied to a hosted project. Both sender enable gates default off, and automatic delivery also requires a human-reviewed self-addressed provider test confirmed by the sender account owner. No live connection or delivery is claimed. Gmail credentials, server credentials and the hosted project settings remain missing; preparation/verification commands fail closed before network access.

[OUTBOUND_SAFETY.md](OUTBOUND_SAFETY.md) records the full policy, exact server settings, Google OAuth scopes/setup, template/reviewer assignment, self-test procedure and failure/reconciliation rules. Validation for this extension: nine new service tests, seven PostgreSQL tests, review UI smoke, affected growth-unit tests and build. Provider/send success in tests is simulated. No email was sent; no production deployment, billing connection, original RLS weakening or existing application rebuild occurred. The hosted verification checklist above remains blocked until actual project access is supplied.

## EXTERNAL CONNECTION VERIFICATION — 2026-10-24 (latest task)

Scope: verify existing foundations only; no application/sender/schema rebuild. Branch preserved. Runtime/public/server credential presence and saved cloud configuration were inspected without printing credential values. Only .env.example is present; no actual environment file was used.

| Check | Result |
| --- | --- |
| Hosted Supabase connectivity | BLOCKED: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY absent; read-only preflight reports zero requests |
| Remote migration inventory/apply | UNRUN: development admin access/reference absent; no migrations applied and no destructive changes |
| Hosted RLS / cross-organization denial | UNRUN; cannot infer from local tests or anon policy checks |
| Hosted signup/login/logout/session refresh | UNRUN |
| Hosted organizations/workspaces/memberships | UNRUN |
| Hosted activation/leads/invitations | UNRUN |
| Operational demo separation | Existing browser-local synthetic architecture preserved; no upload/migration performed; hosted data contents unverified |
| Gmail OAuth refresh / scopes / sender identity | BLOCKED: server credentials absent; verify worker fails closed before external requests |
| Approved sender / test recipient | Not configured/verified |
| Four requested test emails | 0 sent; no real Gmail audit/delivery result |
| Safety regressions | 28/28 outbound service tests passed, including 19 explicit external-verification examples/scenarios |
| Unknown delivery | Local timeout/missing-confirmation/lost-audit-response simulations held as delivery_unknown (UNKNOWN_DELIVERY semantics), no automatic second attempt |

The request's EMAIL_SEND_MODE=draft_only / test_recipient settings are **not enforced by the current worker**. Both existing send gates remain disabled; no --message command was run. General sending remains unauthorized. Consultation Confirmation and Workspace Invitation are not existing registry templates; consultation_reminder cannot substitute. A restricted mode/recipient enforcement and separately approved missing templates are launch blockers, not configuration steps that this verification task silently implements. Four same-recipient tests must also respect the existing one-per-24-hour cap and sender self-test gate.

Exact missing configuration and safe setup instructions are in the latest section of `docs/OUTBOUND_SAFETY.md`, with migration/admin details in `docs/HOSTED_SUPABASE_VERIFICATION.md`. Required actual values: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXOPS_DEV_PROJECT_REF, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL, VITE_PUBLIC_SITE_URL; administrative access via CLI/token/password, secure DB URL or owner SQL Editor. Keep EMAIL_SEND_MODE=draft_only and NEXOPS_GMAIL_SEND_ENABLED=false; runtime DB gate disabled. An approved test recipient must be supplied separately; no implemented allowlist variable exists. Environment draft still contains pending public requirements only, no injected requirements or secrets.

Local PostgreSQL validation results are recorded below after execution; these do not count as hosted Auth/RLS verification. No production deployment, unrestricted Gmail, billing change, RLS weakening or unrelated data deletion/overwrite occurred.

Local SQL result: `NEXOPS_PGLITE_PATH=/tmp/nexops-db-tests/node_modules/@electric-sql/pglite node --test supabase/tests/foundation.test.mjs supabase/tests/outbound.test.mjs` passed **17/17**. Covers real local PostgreSQL RLS organization/workspace isolation and escalation denial, atomic metadata bootstrap, activation, leads, invitation authorization/expiry, lifecycle consent, outbound default deny, five review decisions/history, immutable approvals, sender/test gates, claims, unknown holds, suppression and quotas. Auth/provider identities remain fixtures; public hosted signup/login/logout/refresh are not validated by this result. No application code changed, so no new build/lint/typecheck was necessary; neither lint nor typecheck script is configured.
