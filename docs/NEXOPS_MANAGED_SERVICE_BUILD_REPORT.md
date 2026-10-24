# Nexops Managed Service — Phase 2 and APAC backend foundation

## CURRENT APAC EXTENSION
The completed Phase 2 product is retained. The next-phase backend/growth work adds Supabase organization/workspace/activation/lead migrations, reusable signup integration, consent-gated analytics, consultation/qualification, invitations, lifecycle draft preparation and English/Japanese landing/SEO routes. No synthetic operational data is migrated. New customer operational tables remain client-write-denied; the existing Phase 2 demo still runs from its local snapshot.

See [APAC_GROWTH_SYSTEM_REPORT.md](APAC_GROWTH_SYSTEM_REPORT.md) for current implementation, exact routes, validation, environment requirements and manual connections. Supabase/PostHog/Gmail/Calendar/CRM are **not** connected to live accounts. Local SQL/RLS and simulated connected browser tests are distinguished from hosted verification. No deployment or external email sending occurred.

**NOT PRODUCTION READY — RLS / MULTI-TENANT SECURITY INCOMPLETE**: new-table policies are locally tested, while full hosted/legacy operational tenancy and server commercial transitions remain outstanding. The sections below retain the Phase 2 delivery record and its historical scope.

## PHASE 2 DELIVERY STATE
Work continues on `codex/managed-service-mvp` from Phase 1 commit `7e5989b`, which is based on the requested production-reference commit `1657045`. The worktree was clean before Phase 2. All Phase 1 work and legacy application functionality have been retained. No reset, push, deployment, production configuration changes, or external service integrations were performed.

Phase 2 scope: Action Tracker, Customer Decisions, Decision History, Weekly Operations Report, and Buyer-side Supplier Monitoring. This remains an explicitly synthetic, browser-local prototype; no production multi-tenancy has been added.

## WHAT WAS IMPLEMENTED

### Shared store and Phase 1 integration
The same snapshot now holds `rows` (existing exceptions) and `data.actions`, `data.decisions`, `data.pos`, plus immutable-by-convention report comparison snapshots in `reports`. Screens do not keep separate copies of operational collections. Form drafts and filters are local UI state only. Selectors derive links, latest decisions, counts and history from the shared records.

The existing `nexops_synthetic_operations_v1` browser key is retained; its payload migrates from version 1 to version 2. Valid Phase 1 exception IDs, evidence, review history and existing edits are preserved. Existing seeded action/decision IDs are retained and enriched. Migration is idempotent. No legacy StockWise browser key is changed.

### Action Tracker
Every exception detail offers both action creation and linking to an existing action for the same fictional customer. An exception can have multiple actions; one action can reference multiple exceptions. Duplicate links are ignored; cross-customer links are rejected as demo data-integrity checks, not access controls.

Actions show ID, customer, related exceptions, type, SKU/PO, supplier, description, owner, created date, due date, priority, status, customer approval requirement, latest customer decision, last update, resolution and activity. Users can edit owner/date/priority/status/approval requirement/resolution. Links return to exception details. Resolution requires explanatory text.

### Customer Decision workflow and history
Actions requiring approval create a pending decision. Other actions can request one later. The proposal captures recommendation, reason, supporting data and expected impact. Approve / Modify / Reject / Defer each records the demo approver, timestamp, reason, original recommendation, previous/new decision, modified option and final option. Modify requires a modified decision; approver and reason are required for every review.

Only the latest proposal can be reviewed. New proposals supersede earlier ones without deleting their history. An outstanding pending/deferred proposal must be reviewed before requesting a new proposal. Approval-required actions cannot enter Approved/In Progress/Resolved without an Approved or Modified latest decision, and their approval requirement cannot be removed. Revised proposals invalidate readiness by returning the action to Waiting Customer. Reject puts the action on hold; Defer keeps it waiting. Decisions on resolved actions require reopening first.

Approval does **not** execute or start an action. It records an option and sets the action back to Open. Separate operator review is required for progress/resolution. Decision History exposes all proposals and revisions, plus the action's current resolution. Linked exception activity and action history reflect decision changes. Workflow-generated overdue/decision exceptions reconcile with the shared action/decision records. TODAY's decision counts use actual latest pending/deferred decision records, so a manual exception annotation cannot manufacture approval or hide a pending decision count.

### Weekly Operations Report
Structured demo records generate:
- Executive summary with deterministic counts.
- Current critical risks, selected-week new/resolved risks.
- Open actions and customer decisions needed.
- At-risk POs, supplier issues and inventory risks.
- Upcoming seven-day deadlines and overdue actions.
- Added/changed exception, action, decision and supplier-record counts against a selected saved report baseline.

The week is an inclusive seven-day UTC window ending on the selected date. The screen explicitly distinguishes the **current backlog** from activity in that window; it does not claim to reconstruct historical inventory. Users can save comparison baselines, then select one after subsequent edits. Comparisons are customer-scoped and include meaningful record fields/history counts, not just timestamps. No previous report or improvement numbers are fabricated when no baseline exists. At-risk PO counts use the same selector as TODAY, deduplicated by PO ID.

Print uses browser printing and scoped print CSS. Controls and navigation are hidden; report sections use a white background and avoid splitting cards where possible. No PDF library was added. Chromium print validation produced a five-page A4 PDF in /tmp as a test artifact.

### Supplier Monitoring foundation
Buyer-side cards show customer/supplier/SKU/PO, open PO count for that customer/supplier, promised date, expected date, calculated delay days, confirmed and available quantity, last supplier update, delay reason, follow-up status and risk level. Users can record synthetic commitment/follow-up updates. Updates retain before/after history and re-evaluate the affected PO's late-PO, delay and no-response exceptions, preserving unrelated records. New conditions create exceptions; cleared conditions resolve them. Related exception links open the existing detail panel. No supplier login or external sending exists.

## ROUTES / SCREENS ADDED
All routes below are relative to the running application. No external preview or deployment links were created.

| Route | Screen |
| --- | --- |
| `/demo/operations` | TODAY (retained) |
| `/demo/operations?view=exceptions` | Exception Inbox (retained) |
| `/demo/operations?view=actions` | Action Tracker |
| `/demo/operations?view=decisions` | Customer Decisions |
| `/demo/operations?view=history` | Decision History |
| `/demo/operations?view=suppliers` | Supplier Monitoring |
| `/demo/operations?view=report` | Weekly Operations Report |

Standalone navigation updates the URL and supports direct entry, refresh and browser history. The signed-in application retains TODAY plus Dashboard/Heatmap; its TODAY workspace contains the same Phase 2 navigation. `/` still uses the original Supabase authentication, which cannot be fully exercised until development settings are supplied.

Manual review sequence: open Exception Inbox → select an exception → create an approval-required action → link it to another same-customer exception → inspect Action Tracker → record each customer decision choice → inspect Decision History → progress/resolve the approved action → save a weekly baseline → update a supplier commitment → select the baseline and compare → print the report. Review the five new direct routes at desktop and mobile widths.

## DATA MODEL CHANGES
New `workflow.js` contains pure migration, action/link/review, decision request/review, supplier update, history and report operations. Existing model types and records are reused. The store remains synthetic with the original two fictional customers, 24 SKUs, four suppliers and eight open POs. No SQL schema changes, dependency/lockfile changes, backend persistence, credentials or production membership models were added. Detailed current interfaces and boundaries are in NEXOPS_OPERATIONS_MODEL.md.

## EXISTING FUNCTIONS REUSED
The existing TODAY cards, exception filters, priorities, details, evidence and activity history are extended. The same `detectExceptions` rules reconcile action/decision-generated exceptions and supplier-update risks. Legacy inventory, 13-week forecast, actual consumption, inbound, supplier comparison, heatmap, simulation, suggested orders, CSV imports/exports and authentication code remain unchanged in Phase 2. Legacy free-demo restrictions are unchanged. Regression browser coverage continues to verify TODAY/Inbox behavior.

## WHAT REMAINS MOCKED
All customer, SKU, supplier, PO, action and decision records are synthetic and visibly labeled. Persistence and report baselines live only in this browser; they are not shared across operators/devices. Demo approver names are typed annotations, not authenticated customer identity. Timestamps describe demo activity, not externally verified supplier responses. Browser owners can alter history and snapshots; these are not immutable audit logs. Future outcomes are not invented.

Data Health, live inventory adapters/import provenance, automatic inventory recalculation after supplier changes, demand/forecast/lead-time deviation detectors, supplier login, autonomous agents, email/ERP integrations and homepage repositioning remain outside Phase 2. Supplier updates recalculate PO exception conditions only; they do not change the legacy forecasting engine or inventory. No exact commercial pricing or business improvements are claimed.

## SECURITY AND MULTI-TENANCY GAPS
NOT PRODUCTION READY — MULTI-TENANT RBAC REQUIRED.
The demo route loads no Supabase/auth modules and makes no external requests in the tested flows. Customer filtering/link validation is a prototype data-integrity feature, not authorization. No production tenancy or RBAC was added. Production would require server-verified identities and approvers, workspace-scoped authorization/RLS, durable action/decision state, immutable server audit events, transactional approval gates and concurrency controls. Do not place real multi-customer or confidential data into this demo.

The legacy authenticated app remains blocked for end-to-end validation by missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Vite does not execute Vercel API handlers. The existing minimal webhook and server credentials remain outside this change. No secret values were inspected or exposed.

## AGENT ARCHITECTURE
No autonomous agent was implemented. Monitoring uses deterministic rules, actions require explicit operator input, customer decision records never execute commercial operations, and reports summarize structured counts. Future agent work may validate, detect, recommend or draft only until authenticated human approval and authorized server execution are implemented.

## TEST RESULTS
- `node --test tests/*.test.js`: **20 passed**, zero failures/skips (8 Phase 1 and 12 Phase 2).
- `npm run build`: passed; demo and legacy application remain separately lazy-loaded.
- Phase 1 browser smoke suite: passed after integration against development Vite and built preview. Checks queue/filter behavior, detail edits/history, persistence, direct inbox route, Escape/focus, mobile containment and corrupt-storage recovery.
- Phase 2 browser suite: passed against development Vite and built preview. Checks create/link action, approval rejection before progress, all four customer decision flows plus revised approval, decision history, action resolution, supplier update and exception recalculation, saved report comparison, print invocation/PDF generation, reload persistence, direct entry to all five new routes, customer scope and 390px layout. Zero runtime errors and zero external network requests in tested Phase 2 flows.
- Visual inspection: Action Tracker and Weekly Report desktop screenshots reviewed; screenshots also captured for all five new routes. Print artifact inspected with pdfinfo (five A4 pages).
- `git diff --check`: passed.
- Lint/typecheck: no scripts configured. No existing legacy test runner exists beyond the added Node/browser suites. Authenticated legacy workflows were preserved by narrow integration but remain **unverified end-to-end** without Supabase settings.

## FILES CHANGED IN PHASE 2
- `src/operations/workflow.js`: shared pure store operations, migration, history, reports and supplier selectors.
- `src/operations/WorkflowScreens.jsx`: five Phase 2 screens and exception/action creation/linking controls.
- `src/operations/OperationsWorkspace.jsx`: shared-store integration and navigation.
- `src/operations/model.js`: shared pending-decision/at-risk-PO selectors and TODAY summary integration.
- `src/operations/operations.css`: responsive workflow forms/cards and print styling.
- `src/main.jsx`: direct Phase 2 view selection.
- `tests/workflow.test.js`: Phase 2 business-rule and migration tests.
- `tests/workflow.browser.mjs`: complete browser workflow coverage.
- `tests/operations.browser.mjs`: Phase 1 regression expectation updated for refresh-preserved view URL.
- `docs/NEXOPS_OPERATIONS_MODEL.md`, `docs/NEXOPS_MANAGED_SERVICE_BUILD_REPORT.md`: current model and implementation report.

## HOW TO RUN LOCALLY
From `/workspace/stockwise-app`, using the provided Node.js 24 runtime:

```bash
npm ci --cache /workspace/.npm --no-audit --no-fund
node --test tests/*.test.js
npm run build
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

Open the relative demo routes listed above. No environment variables are needed for this synthetic workflow. Do not copy placeholder credentials from .env.example. Real Supabase settings remain necessary only for the existing authenticated application.

Optional browser verification uses a temporary tooling installation outside the repository:

```bash
npm install --prefix /tmp/nexops-browser --cache /workspace/.npm --no-audit --no-fund playwright-core
NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/operations.browser.mjs
NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/workflow.browser.mjs
```

Chromium defaults to `/usr/bin/chromium`; override NEXOPS_CHROMIUM if needed. To test built assets, start `npm run preview -- --host 0.0.0.0 --port 4173 --strictPort`, then also set NEXOPS_TEST_URL to that local origin when running browser suites. Browser suites use isolated test contexts and write screenshots/PDF only to /tmp. Reuse the existing checkout; do not create a worktree. Processes must be restarted in each future task.

## NEXT RECOMMENDED STEPS
1. Review the five Phase 2 screens and exception-to-action/decision lifecycle using only synthetic data.
2. Validate the exact approval semantics, operator responsibilities and escalation/snooze rules with intended users.
3. Define import provenance/Data Health and explicit units before adapting live inventory or forecasts.
4. Design durable transactional persistence and optimistic concurrency for actions, decisions and report baselines in a separately authorized phase.
5. Implement verified customer identity, workspace isolation and server approval gates before any real multi-customer use; none was added here.
6. Add report history reconstruction and durable printable report archives if historical as-of reporting is required.
7. Extend PO lifecycle/receipt status, supplier update validation and inventory recalculation with authorized source data.
8. Supply development Supabase settings for an end-to-end legacy regression pass.
9. Improve localized scenario narratives and add operational filters once users review the workflows.
10. Consider integrations or homepage repositioning only as separate approved work; no deployment is part of this task.

## CHECKPOINT COMMITS
Phase 1 commits remain intact. Phase 2 includes a shared-workflow/domain checkpoint, followed by UI/browser integration and final documentation/test evidence checkpoints. All are local on the requested branch. No production-readiness claim is made.

## Hosted verification and gated outbound extension
Hosted development integration was attempted but public Supabase settings/admin access are still missing; no network requests or migrations were made against a hosted project. See HOSTED_SUPABASE_VERIFICATION.md and the current APAC report for exact prerequisites and unrun checks.

The later conditional Gmail authorization adds a separate, disabled-by-default outbound safety/review layer at `/growth?view=communications`, reusing existing lifecycle copy and draft state. It does not replace Phase 2, migrate synthetic operations, enable billing or deploy anything. OUTBOUND_SAFETY.md documents the new unapplied migration, approval/consent/rate/idempotency gates and required sender self-test. Actual Gmail and hosted database verification remain outstanding; no emails were sent.
