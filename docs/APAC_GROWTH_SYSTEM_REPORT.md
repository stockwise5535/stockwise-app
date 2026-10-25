# APAC Growth System + real backend foundation

> Latest hosted result (2026-10-24): **124 checks passed, 0 failed, 2 raw-event-count checks blocked by intentional access restrictions.** Hosted Auth, workspace/lead/activation persistence, invitations and tested isolation now pass. See the final “HOSTED FOUNDATION VERIFICATION — SUCCESSFUL API RUN” section; earlier failure sections are historical. No deployment or email sending.

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

## HOSTED RETRY AFTER PUBLIC VARIABLES SAVED — 2026-10-24

The two public settings are now present in the running Cloud Environment. Their values, project reference and HTTP response bodies were withheld from logs/chat. Saved network configuration is unrestricted; no network configuration was changed.

The initial Node fetch failed with ECONNREFUSED because it did not use this environment's configured HTTP proxy. A read-only curl request using the configured proxy returned HTTP 200. Re-running the existing preflight with Node's `--use-env-proxy` completed four read-only requests:

| Hosted check | Observed result |
| --- | --- |
| Auth `/auth/v1/settings` | HTTP 200; connectivity/public key accepted |
| Email confirmation setting | Required; unchanged |
| Anonymous profiles probe | HTTP 404: missing or not exposed |
| Anonymous workspaces probe | HTTP 404: missing or not exposed |
| Anonymous consultation-leads probe | HTTP 404: missing or not exposed |
| Migration history / exact required migrations | BLOCKED pending catalog/admin access; 404 does not establish unapplied migrations |
| RLS policy definitions / authenticated isolation | UNRUN; no catalog or user sessions available |
| Signup/login/logout/session refresh | UNRUN; no confirmed test-account credentials; signup mail/hooks not inspected |
| Organization/workspace/membership creation | UNRUN; requires confirmed development target and authenticated sessions |
| Activation/consultation/invitation persistence | UNRUN for the same reason |
| Cross-organization denial | UNRUN; must use two distinct ordinary authenticated identities, not an admin bypass |
| Demo/customer separation | No synthetic operational data uploaded; hosted separation remains unverified |

No hosted migration, RPC write, account creation, email, production deployment, billing operation, RLS change or deletion occurred. Existing local passing tests are not substituted for these hosted checks.

### Remaining setup, now narrowed
Do not re-enter the two working public settings. In secure Cloud Environment settings add independently confirmed development target `NEXOPS_DEV_PROJECT_REF`. For catalog/migrations supply either `SUPABASE_DB_URL` (secure development PostgreSQL connection), or `SUPABASE_ACCESS_TOKEN` plus `SUPABASE_DB_PASSWORD` for official CLI linkage; owner SQL Editor access is an alternative. Public anon credentials cannot perform schema administration. No CLI link/config or stored CLI token exists in this runtime.

For authenticated checks securely supply `NEXOPS_TEST_USER_A_EMAIL`, `NEXOPS_TEST_USER_A_PASSWORD`, `NEXOPS_TEST_USER_B_EMAIL`, `NEXOPS_TEST_USER_B_PASSWORD` for two distinct confirmed development accounts. Inspect development Auth hooks/email delivery before public signup tests; do not disable confirmation/RLS. Run `supabase/hosted_catalog_inventory.sql` read-only before selecting among migration candidates 001–003; compare actual schema/history and apply only required additive migrations. Never infer missing migrations solely from the above 404 responses.

When retrying Node hosted requests in this environment use `node --use-env-proxy` (or the equivalent supported environment-proxy configuration); do not disable TLS verification or print raw transport errors that may contain the configured URL. No application source/schema/test changes were needed for this retry.

## HOSTED RETRY WITH DEVELOPMENT DB AND TEST ACCOUNTS — 2026-10-24

### Configuration and target checks
The runtime now contains the public settings, SUPABASE_DB_URL, NEXOPS_DEV_PROJECT_REF and both test-account email/password bindings. Values, hostnames, account identifiers, tokens and response bodies were not printed. The API hostname matches the independently supplied development reference; the database hostname/username also identifies that reference. No production endpoint was selected. SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD remain absent, but are not required if the supplied database URI becomes reachable.

### Live hosted results
| Check | Result |
| --- | --- |
| Test User A password login | PASS; confirmed email |
| Test User B password login | PASS; confirmed email |
| Two distinct authenticated identities | PASS; IDs compared in memory, not logged |
| Session refresh, both users | PASS |
| Session restoration into new SDK clients + server getUser identity validation, both users | PASS; tokens held only in memory |
| Auth signOut with local scope and local session removal, both users | PASS; not a browser restart/storage test or proof that issued JWTs immediately expire |
| Authenticated profiles/workspaces/consultation-leads probes, both users | HTTP 404 / PGRST205 (resource absent from schema cache); not a policy-denial test |
| Owner database/catalog inspection | BLOCKED: direct database endpoint has IPv6 only; IPv4 DNS lookup has no record; PostgreSQL client returned ENETUNREACH |
| Required migration determination | BLOCKED by catalog access; no migration inferred missing from REST cache responses |
| Migration application | NOT RUN; zero migrations applied |
| Hosted RLS definitions / grants / function inspection | NOT RUN |
| Organization/workspace creation, activation and consultation persistence | NOT RUN; schema/catalog prerequisites unresolved |
| Invitation creation/acceptance/role denial | NOT RUN; requires functioning foundation schema |
| Cross-organization read/write denial with A/B | NOT RUN; distinct identities verified, but unavailable resources cannot establish isolation |
| Public signup | NOT RUN; no emails authorized, delivery/hooks remain uninspected |
| Synthetic demo separation | No browser snapshot/operational demo records uploaded; hosted enforcement still not verified |

The PostgreSQL probe used pg 8.16.3 installed outside the repository with TLS certificate validation enabled and a bounded timeout. DNS diagnostics recorded only address-family counts/error codes. The existing HTTPS proxy supports API checks; it does not make the direct PostgreSQL IPv6 endpoint reachable. No TLS bypass, RLS weakening, signup/resend/recovery/Auth invite endpoint, Gmail send, schema write, application RPC mutation or unrelated data deletion occurred. Login/refresh/logout naturally updated the test accounts' Auth sessions; no existing application customer records were changed.

### Exact remaining setup
In the **development Supabase dashboard → Connect**, select the **Session pooler** connection string (IPv4-compatible; usually port 5432). Copy the dashboard-provided URI for this exact project, fill in the database password there, and replace **SUPABASE_DB_URL** through secure Cloud Environment settings. Use the dashboard's actual pooler host/user; do not guess a region/hostname, paste values into chat, or put the connection string in a VITE_ variable. Save/apply the setting so it reaches the runtime, then confirm it is saved. Keep certificate validation enabled and permit the exact pooler hostname/port through any applicable network controls. A reachable approved IPv4 direct connection is also acceptable.

Alternative: owner SQL Editor can run `supabase/hosted_catalog_inventory.sql` read-only and supply sanitized metadata, or securely configure management CLI access; neither alternative was used here. Once catalog/history access works, inspect existing objects and only then determine/apply missing additive migrations 001–003 to the confirmed development project. Never reset, overwrite unrelated schema, infer absent migrations from PGRST205, or disable RLS for tests. Existing test-user bindings work and do not need replacing.

No application implementation changes were made. Harnesses/dependencies stayed under /tmp and credentials were neither written to files nor included in reports. These hosted observations supersede the previous missing-test-account/admin-credential status; the remaining DB blocker is network reachability, not absent SUPABASE_DB_URL.

## HOSTED SESSION-POOLER RETRY — 2026-10-24

The updated SUPABASE_DB_URL is injected. Target checks, performed without displaying values, confirm a Session pooler hostname, port 5432, a pooler username associated with NEXOPS_DEV_PROJECT_REF, and matching development API identity. DNS now returns three IPv4 addresses and no IPv6 addresses. This resolves the previous IPv6-only endpoint issue; it does not establish a working database session or valid database credentials.

### Transport and schema status
- Direct PostgreSQL client connection: **ECONNREFUSED**; no SQL session established.
- Configured HTTP proxy CONNECT to the pooler: HTTP 200 tunnel established. A subsequent PostgreSQL SSL/TLS/authentication startup over that tunnel terminated before connection completion. No SQL statements ran. TLS validation was retained; no plaintext database authentication or certificate bypass was attempted. The precise network/provider-side reason is unconfirmed.
- Catalog inventory and migration-history query: **UNRUN** because database connection never completed. No required migration set can be established yet. No migrations applied; no schema/RLS changes made. Pooler password validity remains unverified.
- No SUPABASE_ACCESS_TOKEN is configured for a separate HTTPS management route.

### Independent HTTPS retest
Both confirmed Test User A and B again passed hosted password login, session refresh, session restoration in a new SDK client with server getUser identity verification, and local-scope logout/session clearing. Their IDs were compared in memory and are distinct. No account email, ID, token or password was displayed or written to a harness file.

For both users, profiles/workspaces/consultation-leads probes still return HTTP 404 / PGRST205. These are schema-cache availability failures, not evidence of successful RLS denial. Organization/workspace creation, memberships, activation persistence, consultation persistence, invitation flows and cross-organization read/write denial remain **UNRUN**, pending schema access/verification. Public signup remains unrun to avoid emails. No synthetic operational data was copied or uploaded, and no customer/application records were mutated. Auth test sessions were created/refreshed/logged out only.

### Remaining access options
Do not repeatedly replace the correctly targeted IPv4 pooler URI without new evidence. Choose one supported administrative path:
1. Provide a network path that supports PostgreSQL traffic to the dashboard-selected Session pooler on port 5432. The current direct path refuses TCP and the configured proxy does not complete PostgreSQL startup. Preserve TLS verification and validate server-side/network policy with the environment/provider administrator; CONNECT 200 alone is insufficient.
2. Securely configure **SUPABASE_ACCESS_TOKEN** for an owner-authorized account with access to this development project. Then the Supabase HTTPS management database-query API can be tested for read-only catalog/history access over the already working HTTPS proxy path before any migration is selected. A token's presence alone will not count as access verification. Do not expose it in chat or use a service/anon key as a management token.
3. Use the development dashboard SQL Editor to run `supabase/hosted_catalog_inventory.sql` read-only and inspect available migration-history metadata. Sanitized metadata must be compared against local candidates before any additive SQL is applied. No blind reapplication, reset, unrelated replacement or RLS weakening is permitted.

Pooler retry/auth harnesses stayed outside the checkout under /tmp. No application implementation was rebuilt. No email, deployment, billing operation, production modification or destructive migration occurred. This section supersedes the earlier instruction to switch from direct IPv6 to the Session pooler: that switch is now confirmed, while actual PostgreSQL connectivity remains blocked.

## MANAGEMENT API ATTEMPT — 2026-10-24
SUPABASE_ACCESS_TOKEN has reached the runtime. The API origin matches the explicit development reference; no secret values or target identifiers were logged. HTTPS Management API project metadata returned **HTTP 500** twice. A separate read-only `SELECT 1` transaction through the database-query endpoint with read_only=true also returned **HTTP 500**. Raw response bodies were withheld; neither valid administrative authorization nor a provider/proxy root cause can be inferred from these responses.

No project metadata/schema/catalog/history could be retrieved, and no migration was selected or applied. Hosted RLS, workflow persistence, invitation flows and cross-organization denial therefore remain **UNRUN**. The preceding real A/B Auth passes remain historical evidence and were not rerun in this attempt. Public signup is excluded under the no-email constraint. No application writes, synthetic operational upload, production data operation, RLS change, email, billing operation or deployment occurred.

Per the user's instruction, remote database operations stopped after bounded non-writing probes. Exact local Supabase CLI/psql inspection, dry-run and gated application commands are now in `docs/HOSTED_SUPABASE_VERIFICATION.md` under “HTTPS Management API retry.” They require the confirmed development reference, secure local token/URI, verified TLS, schema/history comparison and review of missing additive candidates before any db push. Do not blindly apply/repair migrations or treat API 404/500 as migration status. No application/schema source was rebuilt in this task.

## API VERIFICATION AFTER USER-REPORTED LOCAL CLI SUCCESS — 2026-10-24

User-reported local evidence: `supabase link` and `migration list --linked` succeeded; `db push --linked --dry-run` returned “Remote database is up to date”; no migrations were applied. This is recorded as user-provided evidence, not an independently inspected schema/history result. Up-to-date migration bookkeeping alone does not prove actual object definitions, API exposure or that the local checkout/link targets the same project as this runtime.

### Independently observed HTTPS checks
The configured API still matches NEXOPS_DEV_PROJECT_REF; values/identifiers were withheld. Both confirmed accounts again passed password login, refresh, new-client session restoration with server identity validation, local-scope logout/session removal, and distinct-identity comparison.

All **26 expected Nexops tables**, queried as Test A using authenticated GET requests with `limit=0` (no customer rows fetched), returned **HTTP 404 / PGRST205**. The checks covered the 20 foundation and six outbound tables listed in `supabase/hosted_catalog_inventory.sql`. No table presence, grants or RLS policy was established by these responses. Initial HEAD probes returned 204, but these contradicted real GETs; HEAD responses are inconclusive and are not counted as successful table inspection. Authenticated OpenAPI discovery returned 401; expected RPC exposure cannot be inferred from this failed discovery.

The authorized `nexops_bootstrap` RPC was attempted once for each A/B identity to verify organization/starter-workspace creation. Both returned **HTTP 404 / PGRST202**, with no workspace returned. The API could not resolve the function; no successful foundation mutation occurred. Subsequent workspace GETs also returned PGRST205 for both users. No other mutating application RPC was attempted.

### Result boundaries
- Organization/workspace creation: attempted, **blocked by unresolved bootstrap RPC**, not passed.
- Membership, activation and consultation persistence: **UNRUN**, dependent resources unavailable.
- Invitation behavior: **UNRUN**, source workspace cannot be created/verified.
- Cross-organization read/write denial: **UNRUN**, not a pass. Resource-not-found responses are not RLS enforcement evidence.
- Hosted RLS definitions/grants and actual catalog/history: still **unverified** from this runtime.
- Signup: **UNRUN** to avoid emails. Synthetic operational data was not uploaded or migrated.
- Migrations: **none applied**. No verified missing additive change has been established. No RLS changes, production data modification, email, billing action or deployment occurred.

### Next diagnosis needed
Compare the local checkout's migration files and linked project against this runtime's intended development reference, then run the read-only catalog inventory locally or in that development project's SQL Editor. Exact commands are in the latest HOSTED_SUPABASE_VERIFICATION section. Possible explanations include local project/checkout mismatch, schema/cache/exposure differences or migration-history/schema drift; none is proven. Do not reapply migrations, repair history, weaken grants/RLS or reload configuration blindly based on these symptoms. Sanitized catalog flags, migration version/name metadata and project-match booleans are sufficient; no secrets or customer records are needed.

## HOSTED FOUNDATION VERIFICATION — SUCCESSFUL API RUN — 2026-10-24

User-supplied local administrative evidence: the intended development reference is linked; migrations 202610240001, 202610240002 and 202610240003 are applied; all 26 tables exist with RLS enabled; policies/functions and migration history are present. These catalog/history observations remain attributed to the user's local Mac verification. This agent applied **no** migrations. The HTTPS Management API metadata retry still returned HTTP 500, so live catalog definitions were not independently fetched here.

Independent hosted behavioral verification used the real configured development HTTPS API, public anon key, and the two confirmed test-user accounts. API origin matched NEXOPS_DEV_PROJECT_REF before any mutation. Returned user JWTs were checked for the authenticated role and canonical subject; server getUser verified restored identities. No service-role or management token was used in any behavioral/isolation check. No browser API simulation or local database substituted for these hosted results. Credentials, JWTs, user IDs, invitation tokens and project URL/reference values were never printed or written to the report/harness. The run identifier below is only a synthetic fixture label.

**Result: 124 PASS, 0 FAIL, 2 BLOCKED.** The blocked checks are independent raw-event row/count reads for A/B; their denial is expected under the existing permissions. Event durability was additionally verified through observable cross-session idempotency without granting access. All independent requested behavioral scenarios ran despite the administrative-query limitation.

Fixture label: `hosted-verification-c692f33b-e5b8-4e35-8ee6-2ff300782c95`. Four clearly labeled DEVELOPMENT VERIFICATION customer workspaces (private/shared per user), four consultation fixtures with example.test contact email, and two viewer invitations were created/retained. Starter demo metadata/activation was persisted for the test accounts. No customer operational dataset, synthetic Phase 2 SKU/PO/exception/action/decision snapshot, imported CSV or supplier record was uploaded. Test records were not deleted or disguised as real customer leads. No real customer data was read/exported. These fixtures must be excluded from business analytics/CRM and any future mail campaign.

### Requested scenarios and interpretation
| Requested check | Hosted result |
| --- | --- |
| Login, refresh, session restoration, logout | PASS for A/B; fresh SDK clients restored sessions and server identity; restoration tested in memory, not browser restart/localStorage; logout tested local scope/session clearing, not immediate revocation of already-issued access JWTs |
| Organization bootstrap | PASS for A/B; distinct organizations, ownership and retry idempotency |
| Demo metadata / customer workspace creation | PASS; bootstrap is demo metadata only; labeled private/shared customer workspace creation and idempotency checked |
| Organization/workspace membership persistence | PASS; owner roles and accepted viewer/member roles verified through reads; own memberships survived fresh login |
| Activation persistence | PASS; demo/TODAY/exception/recommendation timestamps, activated_at and stable reread; confirmed again after fresh login |
| Event persistence | PASS via cross-session durable event-ID deduplication and activation effects; raw event-log row/count inspection remains BLOCKED by intentional SELECT revocation |
| Consultation persistence | PASS for four labeled fixtures; same request ID returns same lead; reread and fresh-login persistence |
| Lead qualification | PASS; each fixture scored 90 and Qualified Lead as expected |
| Invitation create/accept | PASS both directions; viewer-only scope, persisted acceptance, same-recipient retry, invalid/reused-token rejection and owner-role invitation rejection |
| Cross-organization reads before explicit sharing | PASS both directions: profiles, organizations, organization memberships, workspaces, memberships, activation, leads, qualification |
| Cross-organization/workspace modifications | PASS: direct organization/workspace edits, membership escalation and foreign track/consult/invite RPCs denied; owner rereads confirmed organization/workspace names unchanged |
| Cross-workspace after explicit sharing | PASS: granted shared workspace readable; private sibling workspace still hidden; viewer cannot read lead PII/invite tokens, submit leads, invite or self-promote |
| Unauthenticated access | PASS: SELECT permission denied with 42501 for all 26 tables; bootstrap and invitation acceptance also denied |
| RLS/grant bypass | No bypass used; ordinary authenticated/anon sessions only. Denials test combined grants/policies/RPC guards; exact live policy definitions remain local-admin evidence, not independently inspected here |
| Synthetic operational separation | Local browser-only Phase 2 storage remains unchanged; authenticated demo import/action INSERT attempts denied. No operational rows uploaded by the harness. Global/privileged operational row counts and trigger internals remain unverified from these sessions |

**Invitation semantics:** isolation checks ran before sharing. Accepting an invitation intentionally adds organization membership as well as viewer workspace membership. After that explicit grant, the invitee can read the shared organization's metadata under org_member; this was separately verified in both directions. That access is authorized sharing, not an isolation failure. Private sibling workspaces stay hidden. The report does not claim that organization metadata remains hidden from an explicitly invited organization member.

**Event evidence:** for each user, a fresh private verification workspace began with null today/first-value timestamps. A today event with a fresh event ID persisted its timestamp. In an independently authenticated session, reusing that ID with recommended_action_viewed did not set first_value_at; a new ID did. The original timestamp remained unchanged. This verifies persistent deduplication behavior across sessions and event side effects, but not the exact raw stored event JSON/count. Raw SELECT on nexops_events correctly returned 42501. No SELECT grant or policy was added to make an inspection pass.

### Every hosted check
Expected policy names below refer to the checked-in migration design; live behavior was observed without privileged access. No individual behavioral failure occurred. Blocked entries identify the exact table/access limitation rather than being counted as passes.

| Check | Result | Endpoint/table | Expected policy, where relevant |
| --- | --- | --- | --- |
| development_target_and_public_key_guard | PASS | configuration |  |
| A login | PASS | /auth/v1/token?grant_type=password |  |
| A refresh | PASS | /auth/v1/token?grant_type=refresh_token |  |
| A restore session and verify server identity | PASS | /auth/v1/user |  |
| A organization/demo bootstrap and idempotency | PASS | /rest/v1/rpc/nexops_bootstrap |  |
| A organization membership persistence | PASS | /rest/v1/nexops_organization_memberships | org_members |
| A starter workspace membership persistence | PASS | /rest/v1/nexops_workspace_memberships | workspace_members |
| A private customer workspace creation/persistence/idempotency | PASS | /rest/v1/rpc/nexops_create_workspace |  |
| A shared customer workspace creation/persistence/idempotency | PASS | /rest/v1/rpc/nexops_create_workspace |  |
| A demo activation event RPCs and activation persistence | PASS | /rest/v1/rpc/nexops_track_event + nexops_activation | activation_self |
| A raw event SELECT denied (server-owned event log) | PASS | /rest/v1/nexops_events |  |
| A independent raw event persistence/count verification | BLOCKED | public.nexops_events |  |
| A private consultation persistence and idempotency | PASS | /rest/v1/rpc/nexops_submit_consultation + nexops_consultation_leads | lead_member |
| A private lead qualification | PASS | /rest/v1/nexops_lead_qualification | qualification_member |
| A shared consultation persistence and idempotency | PASS | /rest/v1/rpc/nexops_submit_consultation + nexops_consultation_leads | lead_member |
| A shared lead qualification | PASS | /rest/v1/nexops_lead_qualification | qualification_member |
| A demo operational import writes denied | PASS | /rest/v1/nexops_data_imports |  |
| A demo operational action writes denied | PASS | /rest/v1/nexops_actions |  |
| B login | PASS | /auth/v1/token?grant_type=password |  |
| B refresh | PASS | /auth/v1/token?grant_type=refresh_token |  |
| B restore session and verify server identity | PASS | /auth/v1/user |  |
| B organization/demo bootstrap and idempotency | PASS | /rest/v1/rpc/nexops_bootstrap |  |
| B organization membership persistence | PASS | /rest/v1/nexops_organization_memberships | org_members |
| B starter workspace membership persistence | PASS | /rest/v1/nexops_workspace_memberships | workspace_members |
| B private customer workspace creation/persistence/idempotency | PASS | /rest/v1/rpc/nexops_create_workspace |  |
| B shared customer workspace creation/persistence/idempotency | PASS | /rest/v1/rpc/nexops_create_workspace |  |
| B demo activation event RPCs and activation persistence | PASS | /rest/v1/rpc/nexops_track_event + nexops_activation | activation_self |
| B raw event SELECT denied (server-owned event log) | PASS | /rest/v1/nexops_events |  |
| B independent raw event persistence/count verification | BLOCKED | public.nexops_events |  |
| B private consultation persistence and idempotency | PASS | /rest/v1/rpc/nexops_submit_consultation + nexops_consultation_leads | lead_member |
| B private lead qualification | PASS | /rest/v1/nexops_lead_qualification | qualification_member |
| B shared consultation persistence and idempotency | PASS | /rest/v1/rpc/nexops_submit_consultation + nexops_consultation_leads | lead_member |
| B shared lead qualification | PASS | /rest/v1/nexops_lead_qualification | qualification_member |
| B demo operational import writes denied | PASS | /rest/v1/nexops_data_imports |  |
| B demo operational action writes denied | PASS | /rest/v1/nexops_actions |  |
| distinct test identities | PASS | /auth/v1/user |  |
| distinct starter organizations | PASS | nexops_organizations |  |
| A cannot access B nexops_profiles read | PASS | /rest/v1/nexops_profiles | profile_self |
| A cannot access B nexops_organizations read | PASS | /rest/v1/nexops_organizations | org_member |
| A cannot access B nexops_organization_memberships read | PASS | /rest/v1/nexops_organization_memberships | org_members |
| A cannot access B nexops_workspaces read | PASS | /rest/v1/nexops_workspaces | workspace_member |
| A cannot access B nexops_workspace_memberships read | PASS | /rest/v1/nexops_workspace_memberships | workspace_members |
| A cannot access B nexops_activation read | PASS | /rest/v1/nexops_activation | activation_self |
| A cannot access B nexops_consultation_leads read | PASS | /rest/v1/nexops_consultation_leads | lead_member |
| A cannot access B nexops_lead_qualification read | PASS | /rest/v1/nexops_lead_qualification | qualification_member |
| A cannot access B nexops_organizations modification | PASS | /rest/v1/nexops_organizations |  |
| A cannot access B nexops_workspaces modification | PASS | /rest/v1/nexops_workspaces |  |
| A cannot access B nexops_track_event write | PASS | /rest/v1/rpc/nexops_track_event |  |
| A cannot access B nexops_submit_consultation write | PASS | /rest/v1/rpc/nexops_submit_consultation |  |
| A cannot access B nexops_create_invite write | PASS | /rest/v1/rpc/nexops_create_invite |  |
| A cannot access B membership self-escalation | PASS | /rest/v1/nexops_workspace_memberships |  |
| B cannot access A nexops_profiles read | PASS | /rest/v1/nexops_profiles | profile_self |
| B cannot access A nexops_organizations read | PASS | /rest/v1/nexops_organizations | org_member |
| B cannot access A nexops_organization_memberships read | PASS | /rest/v1/nexops_organization_memberships | org_members |
| B cannot access A nexops_workspaces read | PASS | /rest/v1/nexops_workspaces | workspace_member |
| B cannot access A nexops_workspace_memberships read | PASS | /rest/v1/nexops_workspace_memberships | workspace_members |
| B cannot access A nexops_activation read | PASS | /rest/v1/nexops_activation | activation_self |
| B cannot access A nexops_consultation_leads read | PASS | /rest/v1/nexops_consultation_leads | lead_member |
| B cannot access A nexops_lead_qualification read | PASS | /rest/v1/nexops_lead_qualification | qualification_member |
| B cannot access A nexops_organizations modification | PASS | /rest/v1/nexops_organizations |  |
| B cannot access A nexops_workspaces modification | PASS | /rest/v1/nexops_workspaces |  |
| B cannot access A nexops_track_event write | PASS | /rest/v1/rpc/nexops_track_event |  |
| B cannot access A nexops_submit_consultation write | PASS | /rest/v1/rpc/nexops_submit_consultation |  |
| B cannot access A nexops_create_invite write | PASS | /rest/v1/rpc/nexops_create_invite |  |
| B cannot access A membership self-escalation | PASS | /rest/v1/nexops_workspace_memberships |  |
| anonymous protected nexops_profiles denied | PASS | /rest/v1/nexops_profiles |  |
| anonymous protected nexops_organizations denied | PASS | /rest/v1/nexops_organizations |  |
| anonymous protected nexops_organization_memberships denied | PASS | /rest/v1/nexops_organization_memberships |  |
| anonymous protected nexops_workspaces denied | PASS | /rest/v1/nexops_workspaces |  |
| anonymous protected nexops_workspace_memberships denied | PASS | /rest/v1/nexops_workspace_memberships |  |
| anonymous protected nexops_activation denied | PASS | /rest/v1/nexops_activation |  |
| anonymous protected nexops_events denied | PASS | /rest/v1/nexops_events |  |
| anonymous protected nexops_consultation_leads denied | PASS | /rest/v1/nexops_consultation_leads |  |
| anonymous protected nexops_lead_qualification denied | PASS | /rest/v1/nexops_lead_qualification |  |
| anonymous protected nexops_invitations denied | PASS | /rest/v1/nexops_invitations |  |
| anonymous bootstrap denied | PASS | /rest/v1/rpc/nexops_bootstrap |  |
| A invitation creation/persistence | PASS | /rest/v1/rpc/nexops_create_invite + nexops_invitations | invite_manager |
| A owner-role invitation rejected | PASS | /rest/v1/rpc/nexops_create_invite |  |
| B anonymous invitation acceptance denied | PASS | /rest/v1/rpc/nexops_accept_invite |  |
| B invitation acceptance/idempotency | PASS | /rest/v1/rpc/nexops_accept_invite |  |
| B accepted membership persistence | PASS | /rest/v1/nexops_workspace_memberships + nexops_organization_memberships |  |
| A used invitation cannot be accepted by another identity | PASS | /rest/v1/rpc/nexops_accept_invite |  |
| B viewer cannot see invitation token | PASS | /rest/v1/nexops_invitations | invite_manager |
| B viewer cannot read shared lead PII | PASS | /rest/v1/nexops_consultation_leads | lead_member |
| B viewer cannot submit shared lead | PASS | /rest/v1/rpc/nexops_submit_consultation |  |
| B viewer cannot invite | PASS | /rest/v1/rpc/nexops_create_invite |  |
| B viewer cannot self-promote | PASS | /rest/v1/nexops_workspace_memberships |  |
| B shared org membership does not expose private workspace | PASS | /rest/v1/nexops_workspaces | workspace_member |
| B invalid invitation rejected | PASS | /rest/v1/rpc/nexops_accept_invite |  |
| B invitation creation/persistence | PASS | /rest/v1/rpc/nexops_create_invite + nexops_invitations | invite_manager |
| B owner-role invitation rejected | PASS | /rest/v1/rpc/nexops_create_invite |  |
| A anonymous invitation acceptance denied | PASS | /rest/v1/rpc/nexops_accept_invite |  |
| A invitation acceptance/idempotency | PASS | /rest/v1/rpc/nexops_accept_invite |  |
| A accepted membership persistence | PASS | /rest/v1/nexops_workspace_memberships + nexops_organization_memberships |  |
| B used invitation cannot be accepted by another identity | PASS | /rest/v1/rpc/nexops_accept_invite |  |
| A viewer cannot see invitation token | PASS | /rest/v1/nexops_invitations | invite_manager |
| A viewer cannot read shared lead PII | PASS | /rest/v1/nexops_consultation_leads | lead_member |
| A viewer cannot submit shared lead | PASS | /rest/v1/rpc/nexops_submit_consultation |  |
| A viewer cannot invite | PASS | /rest/v1/rpc/nexops_create_invite |  |
| A viewer cannot self-promote | PASS | /rest/v1/nexops_workspace_memberships |  |
| A shared org membership does not expose private workspace | PASS | /rest/v1/nexops_workspaces | workspace_member |
| A invalid invitation rejected | PASS | /rest/v1/rpc/nexops_accept_invite |  |
| A persisted records after fresh login | PASS | /auth/v1/token + foundation GET |  |
| B persisted records after fresh login | PASS | /auth/v1/token + foundation GET |  |
| A logout and session clearing | PASS | /auth/v1/logout?scope=local |  |
| B logout and session clearing | PASS | /auth/v1/logout?scope=local |  |
| A event durability across independent sessions via persistent idempotency | PASS | /rest/v1/rpc/nexops_track_event + nexops_activation |  |
| B event durability across independent sessions via persistent idempotency | PASS | /rest/v1/rpc/nexops_track_event + nexops_activation |  |
| anonymous protected nexops_audit denied | PASS | /rest/v1/nexops_audit |  |
| anonymous protected nexops_communication_state denied | PASS | /rest/v1/nexops_communication_state |  |
| anonymous protected nexops_growth_admins denied | PASS | /rest/v1/nexops_growth_admins |  |
| anonymous protected nexops_deletion_requests denied | PASS | /rest/v1/nexops_deletion_requests |  |
| anonymous protected nexops_data_imports denied | PASS | /rest/v1/nexops_data_imports |  |
| anonymous protected nexops_exceptions denied | PASS | /rest/v1/nexops_exceptions |  |
| anonymous protected nexops_actions denied | PASS | /rest/v1/nexops_actions |  |
| anonymous protected nexops_action_exceptions denied | PASS | /rest/v1/nexops_action_exceptions |  |
| anonymous protected nexops_decisions denied | PASS | /rest/v1/nexops_decisions |  |
| anonymous protected nexops_agent_runs denied | PASS | /rest/v1/nexops_agent_runs |  |
| anonymous protected nexops_email_templates denied | PASS | /rest/v1/nexops_email_templates |  |
| anonymous protected nexops_outbound_reviewers denied | PASS | /rest/v1/nexops_outbound_reviewers |  |
| anonymous protected nexops_email_suppressions denied | PASS | /rest/v1/nexops_email_suppressions |  |
| anonymous protected nexops_mail_runtime denied | PASS | /rest/v1/nexops_mail_runtime |  |
| anonymous protected nexops_outbound_messages denied | PASS | /rest/v1/nexops_outbound_messages |  |
| anonymous protected nexops_outbound_history denied | PASS | /rest/v1/nexops_outbound_history |  |
| A explicit invitation organization membership allows organization metadata | PASS | /rest/v1/nexops_organizations | org_member |
| B explicit invitation organization membership allows organization metadata | PASS | /rest/v1/nexops_organizations | org_member |

### Reproduction, remaining limits and safeguards
The consolidated explicit opt-in harness is `scripts/verify-hosted-growth.mjs`:
`node --use-env-proxy scripts/verify-hosted-growth.mjs --run`.
It requires the existing secure public settings, NEXOPS_DEV_PROJECT_REF and A/B account variables. It creates new labeled fixtures and retains them. Output is sanitized result metadata; the machine-readable result stays at /tmp/nexops-hosted-growth-results.json. The observed run consisted of the primary harness plus independent event-durability, remaining anonymous-table and authorized-org-read follow-ups, now consolidated in that script. The consolidated source was syntax-checked; it was not rerun solely to create duplicate hosted fixtures. Prior invitations leave legitimate org memberships; a later run with the same accounts reports preexisting shared-organization read-denial scenarios as BLOCKED rather than mislabeling permitted access a vulnerability. Use a fresh unshared pair for a clean repeat of those specific checks; do not delete memberships or weaken RLS to reset tests.

Optional independent owner count evidence: run `supabase/hosted_verification_evidence.sql` locally against the same development database using psql and `-v verification_run='hosted-verification-c692f33b-e5b8-4e35-8ee6-2ff300782c95'`. This read-only file returns only event/operational counts for the run's fixtures, not contact/user records. For this run, the tagged event expectation is 12 rows, 2 users, 12 event IDs (demo_workspace_opened=2, exception_opened=2, today_viewed=4, recommended_action_viewed=4). Operational fixture/demo tables should have zero rows. These expectations are **not claimed as hosted count observations**; the optional query has not run on hosted DB. Its syntax/count behavior passed a separate local PostgreSQL fixture check, which is not hosted evidence. Existing arbitrary operational records outside the scope are not inspected or changed.

Public signup was intentionally not invoked under the no-email requirement. Expiry/concurrency/load behavior, browser restart/session-storage behavior, immediate JWT revocation, every possible role/policy combination, legacy StockWise tenant isolation, real customer ingestion, and production readiness are not established by this scoped run. Gmail safety/mode/template/test-recipient launch blockers remain unchanged. No scheduler, CRM export, lifecycle draft producer, email API, billing, production deploy, migration or RLS modification was invoked. No application implementation was rebuilt. Fixture creation and authorized test membership grants were the only persistent application mutations.

## GMAIL PHASE — RESTRICTED MODES IMPLEMENTED; LIVE SETTINGS BLOCKED — 2026-10-24

Existing Supabase foundation remains unchanged; no schema/migration/RLS update was made. Existing 124/0/2 hosted results are retained. The existing queue, safety classifier, canonical recipient resolution, atomic quotas/idempotency and history ledger were reused rather than rebuilt.

The actual worker now enforces EMAIL_SEND_MODE with draft_only as the default and test_recipient as the only send-capable mode. Unknown/production modes fail closed; the dispatcher and Gmail adapter independently enforce the restricted envelope. Only the four named template IDs (welcome, activation_reminder, consultation_confirmation, workspace_invitation) can test-send, plus a separately reviewed self-addressed sender_test. Every test requires approved exact template/hash/content, an individual review, explicit opt-in, canonical confirmed account/membership, approved sender and exact configured test recipient; original suppression/safety/atomic rate/claim/history gates remain in place. Consultation and invitation source records and 24-hour/unactivated reminder eligibility are revalidated server-side. New transactional templates are draft registry entries, not automatic business approvals. No general production delivery mode exists.

Live configuration inspection found no Gmail credentials/sender/recipient, no backend service-role key and no approved public origin. `--verify-oauth` and `--verify-connection` both ran in draft_only and stopped on missing settings before provider requests. OAuth refresh, scope verification, sender identity, template registry/approval and queue/audit operations are implemented/tested locally, but **not live verified**. Sender self-test and the four template emails: **zero sent, all live tests blocked**. No mode transition or Cloud-setting change occurred; effective runtime mode remains draft_only.

Required secure settings, stages and commands are in the latest OUTBOUND_SAFETY.md section: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL, NEXOPS_GMAIL_APPROVED_SENDER, NEXOPS_GMAIL_TEST_RECIPIENT, SUPABASE_SERVICE_ROLE_KEY, VITE_PUBLIC_SITE_URL; set EMAIL_SEND_MODE=draft_only and NEXOPS_GMAIL_SEND_ENABLED=false initially. Existing VITE_SUPABASE_URL/NEXOPS_DEV_PROJECT_REF are reused. Never paste secrets into chat or VITE_ secret fields. The explicit test recipient must be a confirmed opted-in Nexops development account with source-workspace membership, never a real customer. Existing administrator/reviewer grants, exact template approvals and confirmed sender-test delivery are additional prerequisites, not silently granted permissions.

Validation: **44 targeted Node tests + 7 local PostgreSQL tests passed; build passed**. Includes the complete requested risk matrix, actual worker/transport draft/recipient enforcement, unknown-mode denial, approval/consent/suppression/duplicate/review guards, source/reminder eligibility, mock OAuth refresh/expiry/grants, actual-adapter ambiguous delivery holds and no retry, unchanged SQL audit/quota protection, and fixture-secret non-disclosure checks. Raw provider bodies/credential values are never logged. No lint/typecheck script is configured. Optional hosted preparation/source queries could not run without the backend server key. Positive Gmail cases in tests are fake transports only; no real sender/inbox/audit claim is made.

A reviewed self-test cannot run in draft_only, since that mode has no send exception. Prepare/review it there; the first explicitly enabled test_recipient stage must target only the approved sender itself, and no four-template test can send until the recorded self-test is confirmed. Original one-recipient-per-24-hours limits are preserved, so four same-recipient emails require separate time slots. No sleeps/scheduler/quota/date/consent bypass was added. No real-customer email, unrestricted sending, deployment, billing change or synthetic operational upload occurred.

## FIRST AUTHENTICATED ENTRY BOOTSTRAP FIX — 2026-10-25

### Root cause and reproduction
The browser's signup call previously supplied no emailRedirectTo, leaving confirmation navigation to the Supabase project's configured default. The application's `/` route renders LegacyApplication; only `/growth`, `/signup` and `/invite` mounted GrowthApplication, whose local effect was the only caller of nexops_bootstrap. Legacy/root authenticated entry therefore never provisioned Nexops starter records. The Auth signup trigger correctly creates a profile only, so the observed confirmed-user/profile-without-context state follows from entering through the root/legacy path. A local browser/PostgreSQL regression now reproduces exactly that initial state and verifies a direct root sign-in invokes the RPC and provisions the five missing record types. This identifies a concrete code path; the user's original browser navigation/network history is unavailable, so its exact historical route/error cannot be proven.

A second reliability gap existed on growth routes: setup was a one-shot mount effect, with no retry control or validation of complete starter state. After failure it stopped the busy indicator but retained workspace navigation without context. AuthProvider exposed only a user rather than the session, and a stale getSession rejection could still overwrite restoration state after a newer auth event.

### Final implementation
- AuthContext exposes the session and a logout epoch, retains synchronous-only Auth event callbacks, ignores stale restoration failures, and requests the same-origin `/growth` confirmation redirect for new signups. Add that application URL to the project's Auth allowed Redirect URLs during configuration review; no dashboard configuration was changed here. Root entry is covered too for older/default links or redirect fallback.
- Shared StarterContext gates **both GrowthApplication and LegacyApplication**. It waits for restored credentials, checks the active session and server-validated confirmed user, and only then invokes the existing nexops_bootstrap RPC. No organization/workspace/membership/activation rows are inserted by browser code; no service-role/admin token is imported.
- A browser-safe coordinator shares in-flight setup per client/user (including React StrictMode remounts), never caches completed context across logins, bounds each request stage, retries transient network/408/429/5xx/setup-cache failures at most twice, and does not automatically retry permission/confirmation/incomplete-context failures. Lost RPC responses can safely repeat only the existing idempotent server bootstrap. Timed-out requests may finish server-side; late results cannot publish stale UI state.
- Readiness requires the owned starter demo workspace and organization, both owner memberships, own profile and activation row. Workspace screens/navigation are blocked until these reads pass. Failures show a setup-specific recoverable error, Retry workspace setup and Sign out. Stale completions after logout/account changes are ignored. GrowthWorkspace consumes this validated context rather than running a second bootstrap effect.
- Two read-only service methods load organizations and organization memberships, and HTTP/error classification is retained for bounded retry decisions. Existing supplier/operations/Gmail/lifecycle functionality is not rebuilt.

### Verification and scope
- `node --test tests/*.test.js`: **85 passed, 0 failed**, including seven new bootstrap coordinator tests for valid-session gating, complete context, concurrent deduplication, retries/permission failures, explicit recovery, missing membership/activation and bounded timeout recovery.
- Updated `tests/growth.browser.mjs` uses actual local PostgreSQL migrations/RLS and simulated Auth/PostgREST. It tests signup pending email confirmation (zero bootstrap calls), configured confirmation redirect, confirmation-link session restoration, a deliberate setup denial with hidden workspace navigation, explicit Retry recovery, context/data persistence and one starter under StrictMode/reloads, logout/login, legacy-root restoration, and a second confirmed profile-only user signing in directly at `/`. That user receives exactly one organization, org membership, starter workspace, workspace membership and activation row. Existing consultation/qualification/invite/customer-workspace/mobile assertions also run. No real signup or email was sent; this is not a fresh hosted email-confirmation test.
- `npm run build` passes; `git diff --check` passes. No lint/typecheck script is configured. Public demo remains synthetic/browser-local. No new hosted users or hosted data were created for testing, and no hosted worker/migration was run.
- **No migration/schema/RLS/RPC change necessary.** The existing database bootstrap already creates its context atomically and idempotently using auth.uid(); the defect was client entry coverage and recovery. Gmail code/templates/sending, reviewer/admin assignments and mail-runtime settings were untouched. No deployment occurred.

Changed files: src/AuthContext.jsx, src/LegacyApplication.jsx, src/growth/GrowthApplication.jsx, src/growth/service.js, new src/growth/StarterContext.jsx and src/growth/bootstrap.js, new tests/bootstrap.test.js, updated tests/growth.browser.mjs, and this report. The test Vite instance uses only child-process loopback fixture settings, not real project values.

## CUSTOMER / INTERNAL GROWTH UI SEPARATION — 2026-10-25

Authenticated Growth navigation previously rendered internal entries unconditionally and mounted their pages from the untrusted view query string. Existing backend grants/RLS/RPC checks protected their operations, but customers saw administrator/reviewer UI and confusing permission errors.

### Authorization and final behavior
New `src/growth/internalAccess.js` obtains strict boolean results through the existing authenticated `nexops_is_growth_admin()` and `nexops_can_review_outbound(w)` RPCs. Checks run for the active authenticated user/workspace/role; no localStorage, email domain, client-provided user metadata, workspace ownership alone or service-role credential determines internal access. Permission errors/unknown values fail closed. Asynchronous responses for a previous workspace/user are discarded, and permissions from the previous scope cannot appear for even one render after a workspace change. An access retry reloads the RPC results. Backend RLS/grants and action RPC authorization remain the final boundary; the UI does not grant any new rights.

- Customer navigation: Product, Get started, Book a Consultation, Invite a colleague, Account, and intentionally retained Existing StockWise analytics. Consultation requests appears only for the server-loaded owner/admin/operator workspace roles already permitted by lead_member/qualification_member. The existing invitation creation/acceptance role restrictions remain intact.
- Internal Growth Dashboard appears/renders only when the server's Growth Admin RPC returns true.
- Outbound Review appears/renders for an explicitly assigned reviewer of the selected workspace. A Growth Admin may also access it **only when the server-loaded owner/admin workspace role already permits queue reads** under outbound_queue_reader. Global administrator status alone does not grant arbitrary workspace data access; an operator/viewer administrator without assignment cannot read that queue through this UI.
- Growth Admin status does not imply a message-review assignment. A permitted administrator without one gets disabled message inputs and no decision buttons, while its existing template-administration controls remain available. Only assigned reviewers get the existing five message-review actions. Reviewer-only users neither query nor render template-admin controls.
- Manual `?view=dashboard` / `?view=communications` URLs never mount/fetch the protected component when unauthorized or while permission checks are pending. The customer sees an access-checking/clear unavailable state, Return to Product and a retry action. A failed RPC reports that access could not be verified. Authorized deep links still work. Viewer `?view=leads` is likewise denied without rendering consultation records.
- Desktop and mobile share the same navigation/route predicates; there is no separate permissive mobile menu.

### Validation
`node --test tests/*.test.js`: **90 passed, 0 failed**, including five new internal-access tests for ordinary owner/admin/operator/viewer denial, strict server booleans, independent failure handling, authorized admin/reviewer decisions and exact-workspace RPC lookup.

Updated growth browser integration uses simulated Auth/PostgREST with actual local PostgreSQL/RLS and all three unchanged migrations. It verifies ordinary owner/customer internal items are absent on desktop/mobile; both internal direct links deny without any internal data/metrics request; Growth Admin dashboard direct entry and metrics work; administrator queue entry works without review actions; reviewer-only queue direct entry works without dashboard navigation; changing to an unassigned workspace immediately hides the queue; viewer consultation navigation/direct access is denied; permission-query failure denies and explicit retry recovers. Existing signup/confirmation/bootstrap/retry/root-login, activation, consultation, qualification, invitation, customer workspace, reload and logout/login regressions continue to pass. Test-only administrator/reviewer/role fixtures are created/changed in the isolated local database, never in the hosted project.

Updated outbound component browser smoke passes all five reviewer decisions, required reason/edit binding/history, mobile and administrator-without-reviewer read-only controls; no external requests occur. `npm run build` and `git diff --check` passed. No lint/typecheck scripts are configured. These UI tests are local integration/component evidence, not new hosted account/mail verification.

### Scope / changed files
Changed: src/growth/GrowthApplication.jsx, src/growth/OutboundReview.jsx, src/growth/service.js; new src/growth/internalAccess.js; new tests/internal-access.test.js; updated tests/growth.browser.mjs and tests/outbound.browser.mjs; this report.

**No migration/schema/RLS/RPC change necessary.** Existing permissions already express the distinctions; only UI lookup/navigation/component gating was needed. No hosted reviewer/admin assignment, lifecycle queue row, Gmail sender/configuration/template/send gate, or operational data was modified. No email or deployment occurred.

## CUSTOMER FIRST-VALUE ONBOARDING — 2026-10-25

### Customer experience
An incomplete, unopened starter demo now begins with a single customer-facing card: “Nexops turns inventory, PO and supplier exceptions into prioritized action.” Its primary CTA is “Start with today's risks,” positioned before the short progress list and visible on the tested 390px mobile first screen. The demo is mounted only when the customer starts it; no long tutorial, new modal sequence, upload or configuration is required.

The CTA opens the existing TODAY demo. A compact guide shows four persisted steps and a native progress indicator (for example, 2 of 4 completed). A shortcut opens the actual highest-priority exception in the current real demo queue, using the existing exception detail dialog and recommended next action. It never selects fabricated operational results or marks any risk resolved. If the queue has no active matching exceptions, it explains how to clear filters or use the Exception Inbox rather than inventing one.

Once the server's existing activated_at is populated, the long guide becomes a lightweight completed message without remounting/interrupting the demo. Refresh/login restores saved timestamps; completed users never get the first-entry CTA forced on them. Get started remains available manually and shows the same starter progress, including while another workspace is selected. Customer workspaces receive no automatic guide/redirect, even when starter-demo progress is incomplete; opening the demo from Get started is an explicit customer choice. Customer empty-state/footer copy now describes data/setup in business terms instead of implementation readiness details.

### Existing model, tracking and recovery
`firstValue.js` derives the four checks directly from demo_opened_at, today_viewed_at, exception_opened_at and first_value_at; completion uses the existing activated_at. There is no new activation field/model/storage key or inferred completion. The temporary CTA-intent flag is only UI state while the demo opens, not saved progress. Starter progress is held separately from another selected workspace's scope so workspace selection never clears or substitutes it.

The existing OperationsWorkspace emits demo_workspace_opened and today_viewed when it actually mounts; the earlier parent emission on mere workspace selection was removed so the intro does not mark an unopened demo complete. Opening an exception still uses the existing exception_opened/recommended_action_viewed instrumentation and detail content. No new event names, tracking provider, personal data or optional-analytics consent change was introduced. No timer/claim that a human necessarily finishes within a minute is fabricated.

Failed activity saves show “Retry saving progress” and retain the original event ID for explicit retry through the existing track RPC, preserving its idempotency. Checkmarks update only from persisted server reads. Demo render failures have a local recovery boundary with Retry demo and an explicit Reset demo and retry option. The latter clears only the existing synthetic-demo localStorage snapshot after the customer's click, explains loss of browser demo edits, and does not reset account/server progress. It reloads the existing canonical synthetic dataset, not real customer inventory/PO/supplier results. Existing blocking starter-context/session recovery remains unchanged.

### Verification
- `node --test tests/*.test.js`: **93 passed, zero failed**; three new progress tests cover initial state, persisted replay without mutation, and authoritative completion without inventing missing milestones.
- Growth browser integration passed with simulated Auth/PostgREST plus actual local PostgreSQL/RLS. It covers initial 0-of-4 intro with no prematurely mounted TODAY, mobile CTA, real TODAY at 2-of-4, mid-flow reload/resume without repeated intro, highest-priority exception/recommended-action display, a forced save failure at 3-of-4, exact event-ID retry, completed state at 4-of-4, manual Get started, malformed saved-demo retry/reset with progress preserved, reload/login persistence, completed customers and incomplete second-user customer-workspace non-interruption. All preceding bootstrap/auth/internal-navigation/consultation/invitation/mobile regressions remain passing.
- Existing operations browser smoke passed: isolated demo, queue/filter/empty states, assignment/history, local persistence, focus/Escape, mobile and corrupt-storage recovery.
- Existing Phase 2 workflow browser suite passed: actions/approval decisions/history/resolution, supplier updates, reporting/baselines/print, direct routes, scope and mobile.
- Production build and `git diff --check` passed. Mobile screenshot `/tmp/nexops-onboarding-mobile.png` was visually inspected. No lint/typecheck scripts are configured. Browser/SQL fixtures are local-only; no fresh real signup, hosted data mutation or email was used for validation.

### Files and unchanged boundaries
Changed: src/growth/GrowthApplication.jsx, src/growth/growth.css, src/operations/OperationsWorkspace.jsx; new src/growth/FirstValueGuide.jsx, src/growth/DemoRecovery.jsx, src/growth/firstValue.js; updated tests/growth.browser.mjs; new tests/first-value.test.js; this report.

No migration/schema/RLS/bootstrap-RPC change was necessary. Existing activation storage/events, operational calculations and synthetic demo state structures are preserved. Gmail configuration, templates, sending/lifecycle queues, reviewer/admin assignments and third-party analytics configuration were untouched. No production deployment or actual email sending occurred.

## PRE-PRODUCTION RELEASE READINESS — 2026-10-25

**Recommendation: BLOCKED for Production promotion.** The tested customer/demo flows pass. This is a local release-candidate QA result with a narrowly scoped hosted read-only mail check, not approval of an untested production environment.

### Release blockers

1. **Placeholder-copy implementation resolved by the subsequent Privacy/Terms task below.** Both routes now contain product-specific documents rather than the original short placeholders. Verified operator/contact/publication details and professional legal review remain necessary before public launch; this is not a legal certification or unconditional release approval.
2. **Resolved in the subsequent checkout-hardening task below.** The original legacy endpoint accepted unauthenticated browser identity/price/plan metadata, later trusted by the webhook. The release-readiness QA itself did not change billing; the subsequently authorized fix replaces that contract and keeps billing disabled. No deployed endpoint or real payment was exercised.

### Verification results

| Area | Result / evidence |
| --- | --- |
| Auth / starter context | PASS locally: pending signup does not bootstrap; confirmation entry, existing/profile-only user sign-in, root fallback, blocked setup/retry, idempotent starter records, refresh and logout/login. Auth/PostgREST simulated; actual PostgreSQL functions/RLS execute. No hosted signup or confirmation email was triggered. |
| First value | PASS: initial concise 0-of-4 prompt, real TODAY/exception/recommendation, saved progress across reload/login, same-event-ID retry, completed state, manual Get started and separate customer workspace without interruption. |
| Customer/internal separation | PASS: ordinary owner lacks internal navigation; server-authorized admin/reviewer views work; unauthorized direct URLs do not mount internal components; workspace changes and permission errors deny access until verified. Desktop/mobile covered. |
| Operations / legacy | PASS: all seven operational views, exception/action/decision/history/report/supplier workflows, empty filters, recovery, local synthetic persistence and responsive layout. Existing StockWise analytics link/root and logout/login remain usable. Customer workspace empty state does not claim operational customer data exists. |
| Outbound read-only hosted check | PASS: configured URL matches NEXOPS_DEV_PROJECT_REF; sender test `496a2939-9f15-4513-815c-7bd3de9290ae` remains sent with provider ID and recorded delivery confirmation; Welcome `3416b1a4-0929-4ee2-a5c5-dd2d2bf7bf00` remains queued, correct recipient/category/source and equal content/review hashes. |
| Send gates | PASS: current process EMAIL_SEND_MODE=draft_only; NEXOPS_GMAIL_SEND_ENABLED=false; hosted nexops_mail_runtime.sending_enabled=false. Only two REST GETs were used; no worker, OAuth refresh/verification, registration, approval or runtime RPC was invoked. |
| Safety / isolation | PASS: 17 local SQL tests plus unit safety matrix cover membership/admin escalation denial, isolation, consent, reviewer/template authorization, suppression, quotas, claim tokens and ambiguous-delivery no-retry behavior. Existing migrations/RPC/RLS unchanged. Hosted cross-tenant tests were not rerun; prior 124/0/2 hosted evidence above remains the hosted baseline. |
| Credentials / browser build | PASS for inspected scope: exact matching against five available configured secret values plus service-role JWT detection found no exposure across 116 current tracked/build/release-log files at scan time. No secret contents were printed. Browser source imports only public VITE_ configuration; server API/worker modules are not browser entry points. This is not a historical Git/third-party log audit or proof about unconfigured secrets. |
| Routing | PASS locally against a production build: authenticated regression flow, root fallback and internal deep links; dedicated preview smoke checks 19 direct routes at desktop/mobile sizes, including /growth, product, activation, internal views, invite, signup, localized/legal pages and seven demo views. Vercel localized and SPA rewrites checked statically; no hosted Vercel Preview/Production deployment was exercised. |
| Branding / responsive | PASS: no MIERUKA references found in customer source/assets or rendered tested routes. Stockwise/StockWise analytics and intentional Nexops managed-service branding retained. Mobile 390px and desktop checks found no page overflow or unreachable primary onboarding CTA. |

### Exact checks run

All commands ran from the repository unless noted; optional test dependencies remained outside the repository.

```sh
node --test tests/*.test.js
NEXOPS_PGLITE_PATH=/tmp/nexops-db-tests/node_modules/@electric-sql/pglite node --test supabase/tests/*.test.mjs
npm run build
NEXOPS_GROWTH_TEST_URL=http://127.0.0.1:5176 NEXOPS_PGLITE_PATH=/tmp/nexops-db-tests/node_modules/@electric-sql/pglite NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/growth.browser.mjs
NEXOPS_TEST_URL=http://127.0.0.1:5176 NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/operations.browser.mjs
NEXOPS_TEST_URL=http://127.0.0.1:5176 NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/workflow.browser.mjs
NEXOPS_TEST_URL=http://127.0.0.1:5176 NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/outbound.browser.mjs
NEXOPS_GROWTH_TEST_URL=http://127.0.0.1:4178 NEXOPS_PGLITE_PATH=/tmp/nexops-db-tests/node_modules/@electric-sql/pglite NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/growth.browser.mjs
NEXOPS_TEST_URL=http://127.0.0.1:4178 NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/release.browser.mjs
NEXOPS_TEST_URL=http://127.0.0.1:4179 NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/public-growth.browser.mjs
git diff --check
```

Results: **93 unit + 17 SQL tests passed, zero failures**; seven browser executions passed (six suites, growth run on both dev and production-preview assets). Production build passed. No configured lint/type-check commands exist. Local fixture builds used `VITE_SUPABASE_URL=http://127.0.0.1:54329 VITE_SUPABASE_ANON_KEY=local-test-public-key VITE_PUBLIC_SITE_URL='' npx vite build --outDir /tmp/nexops-release-preview/dist`, and empty Supabase variables for `/tmp/nexops-release-public/dist`; SEO generation ran in each fixture directory with empty VITE_PUBLIC_SITE_URL. Separate local Vite preview processes served these at 4178/4179. These fixtures do not alter secure Cloud settings or contact hosted Auth. Hosted read-only check and credential scan ran from temporary local scripts; no credentials were written to files or reports.

### Follow-ups / scope

After resolving blockers, verify the intended production project/configuration, approved public origin, Supabase Site URL/confirmation redirect allowlist and deployed Vercel deep links before promotion. Legal approval and a release-specific billing decision are required; do not silently enable checkout. Customer operational ingestion remains unimplemented; operational demo records remain explicitly synthetic/browser-local. Sender OAuth freshness and other approved template delivery tests were deliberately not refreshed/sent in this read-only task. Older chronological Gmail/configuration findings above are historical; the current hosted status is the read-only result in this section.

New coverage: `tests/release.browser.mjs` protects production-preview route/branding/mobile/unauthenticated internal-page behavior, rejects non-local targets and aborts unexpected external requests. No new product features or speculative refactors were added. No defect surfaced in the tested onboarding/navigation/operations paths; billing findings were documented rather than changed outside scope.

**Hosted database writes: 0. Emails sent: 0. No deployment or promotion.** No schema, RLS, RPC definition, billing, Gmail/OAuth state, consent, reviewer/admin assignment, template, lifecycle/message queue or runtime-flag change occurred. Remote task-file commits were merged into the local working branch to preserve both histories; nothing was merged into main, rewritten or pushed.

## LEGACY CHECKOUT TRUST-BOUNDARY HARDENING — 2026-10-25

**Checkout trust-boundary blocker: RESOLVED in code and mocked regression coverage. Production promotion remains BLOCKED by the unchanged Privacy/Terms drafts. Billing remains disabled; this is not authorization to activate payments.**

### Findings and fixed contract

The legacy `PricingModal.jsx` component previously supplied `userId`, `userEmail`, `priceId` and `planId`; price configuration came from `VITE_STRIPE_PRICE_*`. The API copied those fields into Stripe customer/price/subscription metadata without authentication. Quantity (1) and legacy trial length (14 days) were already server constants; return URLs came from VITE_APP_URL. The signed webhook verified provider authenticity but accepted the resulting untrusted user/plan metadata. Repository inspection found the pricing component is currently **not mounted by any application route**; no new billing entry point was introduced to activate it. Browser regression mounts the existing component only in a local fixture.

- Both checkout and webhook now fail closed with HTTP 503 / BILLING_DISABLED unless the **server-only** `NEXOPS_BILLING_ENABLED` is exactly `true`. Current environment/default-export smoke checks returned BILLING_DISABLED for both endpoints, before any external operation. No environment setting was changed.
- Checkout accepts exactly `{planId, requestId}` plus an Authorization bearer. Supabase Auth `getUser(token)` verifies the session server-side; canonical confirmed user UUID/email come from that response, never body fields or user metadata. The existing subscriptions lookup uses the same ordinary user bearer with RLS and filters by the canonical user ID. No service-role key is used to authenticate/read checkout accounts.
- Only basic/pro map to server-owned STRIPE_PRICE_BASIC / STRIPE_PRICE_PRO. Unknown plans and extra price, product, currency, quantity, account, user, workspace, entitlement or metadata fields are rejected. Stripe receives the configured price and fixed quantity 1; currency/amount/product are defined by that Stripe price. Metadata/client reference bind canonical Auth identity and the server-selected plan, with an authenticated_v1 marker. This remains **per-user legacy billing**, not organization/workspace billing; selecting a workspace/account is unsupported and rejected.
- Return destinations are constructed from validated HTTPS origin-only BILLING_RETURN_ORIGIN, never browser input or request Host. The success/cancel query parameters are informational only: no browser return path grants entitlement. Redirects are restricted to HTTPS checkout.stripe.com on both server and client.
- Retry keys are hashed from canonical user + request UUID and passed as Stripe idempotency keys. Changed payload reuse yields a safe conflict. The browser retains its per-user/per-plan request UUID for up to 23 hours in sessionStorage (in-memory fallback), including retry/reload; no token is stored there. Both plan buttons lock while a request is pending. Existing active/unresolved subscriptions block another checkout; unreadable billing records fail closed. Stripe calls have bounded timeouts and no automatic SDK retries; Auth/database requests also have bounded timeouts. Provider/configuration exceptions are sanitized, with no credential or raw provider output.
- Webhooks remain signature-verified against the raw, size-bounded request; a regression also uses the actual Stripe signature verifier. They retrieve current subscription state, require the new server-issued metadata format, derive the plan from the allowlisted provider price, require one recurring item/quantity 1 and a confirmed canonical Auth account, and reject subscription/customer ownership conflicts. Old-format/unmapped events require billing review instead of silently granting a plan. Database persistence errors no longer return successful acknowledgment. Sequential duplicate/delayed fixtures use current provider state rather than stale event payloads.

### Server configuration / activation boundaries

Keep NEXOPS_BILLING_ENABLED unset or `false`. Merely setting Stripe keys/prices cannot enable checkout or webhook writes. No new VITE_ billing variables are required; the browser no longer reads public Stripe price variables or selects Stripe price IDs.

For a separately authorized future activation, required **server** configuration is STRIPE_SECRET_KEY, STRIPE_PRICE_BASIC, STRIPE_PRICE_PRO, BILLING_RETURN_ORIGIN, SUPABASE_URL (existing VITE_SUPABASE_URL fallback), and SUPABASE_ANON_KEY (existing VITE_SUPABASE_ANON_KEY fallback). The webhook additionally requires STRIPE_WEBHOOK_SECRET and existing SUPABASE_SERVICE_ROLE_KEY. Never put secret/service-role values in VITE_ fields. The return origin must be HTTPS without credentials, a path, query or fragment; both configured prices must be distinct valid price IDs. No values were requested in chat or written into source.

Before enabling billing, verify the intended Stripe environment/product/recurring-price mappings, signed webhook delivery, and the legacy subscriptions table's existing columns/unique user key/self-read RLS in an authorized provider test environment. These legacy billing tables are separate from nexops_* and were not created or modified here; inability to read/write them fails safely. Review any historical subscriptions without authenticated_v1 metadata and price-map changes explicitly; no automatic metadata backfill was performed. Request idempotency is scoped to the same user/request and Stripe's retention window, not a permanent global lock across independent requests/tabs; broader concurrent subscription reconciliation requires provider test-mode validation before billing activation. No live billing/provider readiness is claimed by mocked tests.

### Validation and changed files

```sh
node --test tests/*.test.js
NEXOPS_PGLITE_PATH=/tmp/nexops-db-tests/node_modules/@electric-sql/pglite node --test supabase/tests/*.test.mjs
NEXOPS_TEST_URL=http://127.0.0.1:5176 NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/checkout.browser.mjs
NEXOPS_GROWTH_TEST_URL=http://127.0.0.1:5176 NEXOPS_PGLITE_PATH=/tmp/nexops-db-tests/node_modules/@electric-sql/pglite NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/growth.browser.mjs
npm run build
git diff --check
```

**106 unit/security tests + 17 SQL tests passed, zero failures.** Thirteen new tests exercise canonical authenticated checkout, expired/unconfirmed/missing auth, malformed/tampered/extra fields and cross-account overrides, missing/disabled configuration, safe origin/price validation, active-account conflicts, user-scoped retry keys, sanitized provider uncertainty, browser request shape and redirect denial, signed webhook mapping/identity, ownership/legacy-format rejection, duplicate/current-state handling and actual signature tamper detection. All Auth/Stripe/database billing operations are injected mocks; unexpected fetches are prohibited. Existing SQL isolation/outbound tests use local PostgreSQL only. No lint/type-check commands are configured.

Checkout browser regression passed: signed-out error without API request, bearer + plan/request-only payload (ignoring a forged user prop), disabled-billing recovery, duplicate-click prevention, stable retry/reload ID, mobile, unsafe redirect denial and a fully intercepted successful Stripe redirect. No provider request leaves the test. Growth browser regression passed including confirmed first entry, setup failure/retry, root fallback, onboarding/persisted progress, internal authorization, workspace switching, consultations, invitations and logout/login.

Production build passed. A scan of 119 current repository/build/test-log files against five configured secret values plus service-role JWT detection found no exposure; no values were printed. Server billing modules are not imported by browser modules. This scan does not claim to audit historical Git blobs or external logs. The unmounted pricing component is separately covered through the local browser fixture.

Files: api/create-checkout-session.js; api/stripe-webhook.js; new services/billing-config.js; src/components/PricingModal.jsx; new src/billing/checkout.js; new tests/checkout.test.js and tests/checkout.browser.mjs; this report and docs/NEXT_TASK.md Status.

**No schema/RLS/RPC/migration change was necessary. No hosted database writes, real provider calls, checkout sessions, charges, emails or deployment occurred.** Billing activation/configuration, Gmail sending/settings/templates/queues/assignments and legal copy were unchanged. Only tests use explicit enabled fixture configuration; the actual runtime remains disabled. Work is committed locally without pushing or merging into main.

## PRODUCT-SPECIFIC PRIVACY POLICY AND TERMS — 2026-10-25

**Product-readiness result: the obsolete legal placeholder-copy blocker is RESOLVED.** `/privacy` and `/terms` now provide substantive, product-specific drafts. **Public Production publication is still pending verified operator details and professional legal review.** This work does not claim attorney approval, legal compliance/certification or an enforceable jurisdiction-specific liability allocation.

### What changed and evidence used

Replaced the short inline “draft for review” blocks with Privacy Policy (11 sections) and Terms of Service (14 sections). Shared public publication settings and structured document content live in src/growth/legalContent.js; src/growth/LegalDocument.jsx renders headings, a keyboard-operable contents list, section anchors, visible pending-publication details and Account/other-document/product links. Legal pages use Stockwise product branding with the Nexops managed-service context, document-specific titles/descriptions, readable line widths, wrapping and mobile/print styles. Existing signup/account/footer links remain usable; Account and preferences returns to the actual account view. No acceptance checkbox or new auth gate was added.

| Product statement | Repository evidence / reflected limits |
| --- | --- |
| Account/workspace/profile data and essential progress events | AuthContext.jsx, growth/service.js and the existing foundation/lifecycle migrations. Signed-in progress is distinct from consented optional analytics. Roles scope access; a customer owner is not automatically an internal administrator. |
| Operational data separation | operations/OperationsWorkspace.jsx stores synthetic demo edits locally; GrowthApplication.jsx creates empty customer workspaces. Legacy App.jsx supports intentional CSV/local planning inputs and inventory persistence to Supabase. Documents distinguish those existing inputs from unimplemented managed-service ingestion/ERP connections. Sign-out does not automatically clear local demo data. |
| Consultation information and qualification | GrowthApplication.jsx consultation fields and nexops_submit_consultation persist submitted business details and heuristic qualification. Requests/acknowledgments do not confirm bookings, scope, outcomes or engagements. Permitted contact export is described without claiming automatic CRM integration. |
| Analytics/storage choices | growth/analytics.js, AnalyticsConsent.jsx and cleanProperties: optional PostHog requires consent; limited event context and browser/account identifiers may be linked. Contact/form/file data is excluded from analytics payloads. Withdrawal is prospective and browser-specific, not deletion of essential service events. |
| Providers and communications | Supabase Auth/database, Vercel architecture, operator-controlled Google/Gmail sender and optional PostHog are described according to current support. A configured Google Calendar link is a separate chosen service. No customer-mailbox synchronization, blanket vendor certification or verified processor/transfer contract is invented. Restricted Gmail tests, consent/suppression/review controls and disabled-default sending are distinguished from a general production mail service. |
| Deletion/retention | nexops_request_deletion and Account record a request for an administrator; they do not claim immediate account closure, automatic purge, a fixed response SLA or backup erasure. Shared ownership and local copies require follow-up. No automatic retention schedule exists in the current implementation. |
| Free access and billing | Foundation profile dates run 30 days from registration; the managed-service flow has no card/payment wall or automatic paid conversion. Checkout remains separately gated/disabled; its legacy code is not presented as an active paid offer. No permanent free access or automatic expiry/deletion behavior is promised. |
| Decision support and safeguards | Existing operations actions/decisions, internal permissions and outbound review gates. Recommendations do not authorize PO/supplier/payment/contract changes, guarantee results or establish a service-level commitment. |

### Exact human-completion fields

No verified public legal settings were found in the current product configuration or corresponding environment-variable names. The following **seven public publication settings** are centralized in legalPublication in src/growth/legalContent.js and visibly marked where relevant. Complete them only with verified facts and approved wording; test Gmail addresses and cloud-region guesses are not legal contacts/jurisdictions.

| Marker | Required human completion |
| --- | --- |
| LEGAL_ENTITY_NAME | Actual service operator's legal name |
| BUSINESS_ADDRESS | Verified operator business/registered contact address |
| PRIVACY_CONTACT | Verified channel for privacy questions/requests |
| SERVICE_LEGAL_CONTACT | Verified service/security/legal contact channel |
| EFFECTIVE_DATE | Approved publication/effective date, not a generated development date |
| GOVERNING_LAW_AND_FORUM | Applicable governing law and forum selected with professional review |
| RETENTION_SCHEDULE | Approved retention periods, deletion handling, provider logs/backups and applicable exceptions |

Professional review must also settle any appropriate warranty/liability allocation and international-processing disclosures/arrangements. The drafts deliberately contain no invented monetary cap, indemnity, age-verification process, DPO, regulator registration, residency guarantee, transfer mechanism or certification. The operator's country/jurisdiction is not inferred from Vercel, Supabase or a US cloud processing possibility. These are explicit publication follow-ups, not silent product features or facts claimed complete. **Professional legal review is recommended and remains required by the publication notice before public Production launch.**

### Verification

```sh
node --test tests/*.test.js
NEXOPS_PGLITE_PATH=/tmp/nexops-db-tests/node_modules/@electric-sql/pglite node --test supabase/tests/*.test.mjs
NEXOPS_TEST_URL=http://127.0.0.1:5176 NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/legal.browser.mjs
NEXOPS_GROWTH_TEST_URL=http://127.0.0.1:5176 NEXOPS_PGLITE_PATH=/tmp/nexops-db-tests/node_modules/@electric-sql/pglite NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/growth.browser.mjs
NEXOPS_TEST_URL=http://127.0.0.1:4180 NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/legal.browser.mjs
NEXOPS_TEST_URL=http://127.0.0.1:4180 NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/public-growth.browser.mjs
NEXOPS_TEST_URL=http://127.0.0.1:4180 NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/release.browser.mjs
npm run build
NEXOPS_TEST_URL=http://127.0.0.1:4181 NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/legal.browser.mjs
git diff --check
```

**106 unit/security tests and 17 SQL tests passed, zero failures.** Browser checks passed for direct/refreshed legal routes, signup/footer links, authenticated Account → legal document → Account, document metadata, publication fields, keyboard section navigation, 320px/390px/desktop layout, no new acceptance gate, no internal IDs/debug terms and no external requests on the public legal suite. Existing Growth signup/confirmation/retry/onboarding/internal permissions/consultation/invitation/logout-login regressions passed. Public localized/static/no-JS landing checks, missing-config signup/login and the 19-route production-preview smoke passed. The legal pages themselves remain client-rendered under existing SPA routing; no new no-JS legal rendering claim is made. Privacy/Terms mobile screenshots in /tmp were visually inspected.

Production build passed. Port 5176 used an isolated local public-key fixture; port 4180 served an unconfigured fixture production build (empty VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and VITE_PUBLIC_SITE_URL; outDir /tmp/nexops-legal-public/dist, with SEO generation in that directory). Port 4181 served the final npm production build after the last prose refinement. Test dependencies remain in /tmp; these are local previews, not Vercel deployment verification. No lint/type-check script exists.

Search found no old inline legal-placeholder phrases in customer source/rendered documents. The intentional human-completion fields and publication-review notice remain visible. A scan of 126 current source/build/test-log files against five configured secret values and service-role JWT detection found no exposure; values were not printed. This does not audit historical Git blobs or external logs. Public document checks also reject operational UUIDs and internal environment/RPC/RLS identifiers.

Files changed: src/growth/Landing.jsx, new src/growth/LegalDocument.jsx, new src/growth/legalContent.js, src/growth/growth.css, new tests/legal.browser.mjs, tests/growth.browser.mjs, tests/public-growth.browser.mjs, docs/APAC_GROWTH_SYSTEM_REPORT.md and docs/NEXT_TASK.md Status.

**Schema/RLS/RPC/migrations unchanged. No hosted database writes, email, billing activation, Gmail/configuration/template/queue changes, deployment or push.** No legal entity/contact/governing law was guessed, no new personal-data collection/tracker was added and no legal certification is claimed.


## OUTBOUND V3 — SAFE OFFLINE PREPARATION; LIVE AUTOMATION BLOCKED — 2026-10-25

**Not COMPLETE.** Current user prohibitions override the task's broader unattended
delivery target. No Gmail enablement, external mail/social publication, credentials,
OAuth, schema or RLS changes were performed. NEXT_TASK State is BLOCKED.

Implemented server-only Buffer GraphQL adapter (authenticated organization channel
discovery, selected X/twitter and Threads identity checks, unpaused queues, bounded
requests, schedule validation, acceptance receipt, static errors and no retry).
Official contracts checked: https://developers.buffer.com/examples/get-channels.html,
https://developers.buffer.com/examples/create-text-post.html and
https://developers.buffer.com/guides/posts-and-scheduling.html. Only mocked requests
were executed. Provider acceptance is not final publication evidence.

Added offline-only runner with task-state inspection, two distinct static public
product-education variants, strict exact-copy classification, at most ten items,
exclusive directory lock, local fixture claim ledger and atomic morning summary.
There is no live execution flag, runtime provider injection, child Codex process,
recursive task generation or scheduler. Social copy is review-required, not
business-approved for publication. Unknown/arbitrary/confidential copy and extra
customer payload fields are blocked; other social categories/threads are deferred.
Fixture claim records reserve logical identity plus network/content hash before
provider invocation. Accepted, sending and unknown outcomes remain held on rerun.
A crashed lock requires operator investigation; no automatic lock expiry exists.
This is single-host local preparation, not a distributed durable production queue.

Email allowlist routing enumerates all eight requested categories but grants no
send permission. Existing draft_only/test_recipient policy, individual review,
template hashes, canonical Auth/membership, consent/suppression, delivery-test gate,
10/hour, 50/day and one-recipient/24-hour SQL quotas remain unchanged. No automatic
mode was enabled or added. Consultation/invitation retain individual review; weekly
summary/requested-follow-up sendable templates and source verification remain work.
Do not claim category enumeration implements their delivery.

Current process configuration check printed names/presence only: BUFFER_API_KEY,
BUFFER_ORGANIZATION_ID, BUFFER_X_CHANNEL_ID, BUFFER_THREADS_CHANNEL_ID,
GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL,
NEXOPS_GMAIL_APPROVED_SENDER and SUPABASE_SERVICE_ROLE_KEY were absent. No .env
values were loaded or hosted runtime inferred. Gmail freshness and Buffer live
readiness are unverified / CONFIGURATION REQUIRED. Exact later secure configuration
and controlled one-test-per-network / sender-owned email verification plans are in
docs/OUTBOUND_AUTOMATION_V3.md; none was executed.

### Executed verification

- `node --test tests/*.test.js`: **115 passed / 0 failed** (nine new V3 tests).
  Initial sandbox run failed existing OAuth loopback listener tests; rerun with
  local-listener permission passed. Provider transports are mocks, not real OAuth.
- `NEXOPS_PGLITE_PATH=/tmp/nexops-v3-test-deps/node_modules/@electric-sql/pglite node --test supabase/tests/*.test.mjs`:
  **17 passed / 0 failed**. Initial run could not load PGlite; installed this existing
  test dependency in /tmp only, then reran. Includes RLS/tenant separation, consent,
  suppression, quotas, claims and unknown-delivery regressions; no hosted database.
- `npm run build`: **passed**. SEO generator correctly reports noindex without
  VITE_PUBLIC_SITE_URL. No deployment or indexing claim.
- `node scripts/outbound-automation.mjs` while State was READY: **passed**, two offline
  prepared statuses in logs/morning-summary.txt, zero email/social operations.
- `git diff --check`: passed. Source/build search found no Buffer API key identifier,
  new server-module import or fixture secret in src/dist. Logs use fixed statuses;
  tests verify raw provider errors containing a fake secret never enter logs/ledger.
  This is not a historical Git/external-log secret audit.
- No UI changed. Mobile/browser regressions were **not run**; no mobile PASS claimed.

Authorization/RLS/workspace boundaries and customer/internal UI remain unchanged.
New preparation reads no user/workspace/operational data, so synthetic demo/customer
separation is preserved by scope. Existing local SQL tests pass; hosted Auth/RLS,
production concurrency, load/capacity and provider delivery remain unverified. No
analytics collection or funnel events changed. The framework can reduce future
operator work, but does not increase proven acquisition/delivery capacity or establish
30-day APAC 10,000-user readiness. Gmail is still a low-volume pilot transport, not
the 10,000-user bulk solution. A later separately approved provider/deliverability
plan, durable shared processing, monitoring and measured funnel/load tests are needed.

Remaining BLOCKER/HIGH: forbidden Gmail activation/live-configuration boundary;
unimplemented production automatic-email mode/templates and durable shared social
claims/reconciliation/copy approval; absent live credentials and verification.
The pre-existing untracked automation/codex-nightly-v2.sh contains --approve-for-me;
it was not executed, edited or committed and must not be used as the V3 scheduler.
Previously recorded legal publication placeholders/review remain unresolved by this
work. No new production vulnerability is claimed from these readiness gaps.

Changed: .gitignore; services/buffer-adapter.js; services/outbound-automation.js;
scripts/outbound-automation.mjs; tests/outbound-automation.test.js;
docs/OUTBOUND_AUTOMATION_V3.md; docs/NEXT_TASK.md; this report. Pre-existing untracked
automation/, logs/ and supabase/.temp/ artifacts are preserved and excluded from commit.
No deployment/promotion, email, social post, billing/charge, hosted write, schema/RLS,
OAuth/secret change or push.
