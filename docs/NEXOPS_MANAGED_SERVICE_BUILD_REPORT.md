# Nexops Managed Service — first review checkpoint

## CURRENT STATE
Built on `1657045` (the production reference supplied by the user), on branch `codex/managed-service-mvp`. Scope follows the request's final instruction: Current State Audit → TODAY → Exception Inbox, followed by a review before Action Tracker/agents. The wider 12-step specification remains the roadmap, not a completed deliverable. No production deployment or push was performed. Existing uncommitted work was absent at start; nothing was reset/deleted.

## WHAT WAS IMPLEMENTED
- Default signed-in operational landing tab, while retaining legacy dashboard/heatmap navigation.
- Separate credential-free synthetic demo entry, isolated from Supabase and legacy browser keys.
- TODAY with seven structured-data summary cards and a queue sorted by severity, days to impact, due date and ID.
- Exception Inbox with Customer, Severity, Type, Supplier, Owner, Status and inclusive UTC Due Date filters; empty state and resolved/snoozed visibility.
- Detail dialog with detection explanation, source evidence, data timestamp, potential impact, recommendation and activity history. Accessible dialog with Escape, focus return and labeled controls.
- Manual owner/due-date/status review with browser persistence, invalid-edit rejection, no-op protection and history entries. These are demo annotations, not customer approvals.
- Japanese/English UI. Synthetic scenario explanations remain in English and are labeled accordingly.
- Two fictional customer workspaces, 24 SKUs, four suppliers, eight open POs, an overdue action, pending customer decision and resolved inbound exception. Thirty-five exceptions initially; 34 active.

## ROUTES / SCREENS ADDED
Manual review paths (relative paths, not external preview links):
- `/demo/operations`: TODAY, no credentials required.
- `/demo/operations?view=exceptions`: direct Exception Inbox entry.
- `/`: existing authenticated application. After sign-in, TODAY is the initial tab; Dashboard and Heatmap remain available. Requires real Supabase configuration, which is still absent.

Within the demo, switch to inbox, filter a customer, select an exception type link, change owner/status/date, save, close with Escape, reload and verify the change/history. Test at desktop and 390px mobile width; the wide table scrolls inside its container.

## DATA MODEL CHANGES
New pure `model.js` defines customers, suppliers, synthetic SKUs/POs, exceptions, action/decision fixture inputs, status/severity/type catalogs and activity events. No database migration or changes to existing SQL. No changes to dependency declarations/lockfile. See NEXOPS_OPERATIONS_MODEL.md for exact interfaces and planned tenancy/import models.

## EXISTING FUNCTIONS REUSED
Legacy App, AuthProvider, login, existing language toggle, dashboard and heatmap remain mounted through a thin LegacyApplication wrapper. Forecast, actual consumption, inbound, supplier comparison, reorder/simulation panels, CSV imports/templates/exports and one-product legacy free-demo restriction are unchanged. New records do not pretend to map to legacy SKUs; no misleading deep links are created for synthetic data. Live-data adapters and links to actual inventory records are deferred until source provenance and authorization exist.

## WHAT IS STILL MOCKED
All new operational records are synthetic and visibly labeled. Summaries are derived deterministically from the fixture; no claimed customer outcomes or AI-generated numbers. Browser persistence is a demo convenience, not shared storage. Dataset reference time is retained on reload rather than a live monitor. The action and customer decision records only seed monitoring examples. There is no Action Tracker, approval workflow, weekly report, supplier portal, sending, scheduling, autonomous agent or commercial execution.

All 13 requested types are available as interface/filter values. Current detectors cover stockout, safety stock, excess, late PO, supplier delay/no response, missing fields, overdue actions and pending decisions. Late inbound is a resolved demo example; demand/forecast/LT deviation detection needs a later data integration. Data Health import validation is not added in this checkpoint. Homepage repositioning is deferred: its repository is not available in this workspace.

## SECURITY GAPS
NOT PRODUCTION READY — MULTI-TENANT RBAC REQUIRED.
Demo route exposes only fictional records and lazily avoids loading authentication/database modules. No secrets were read, created or exposed. Legacy authentication is retained. Browser history can be edited by its owner and is not a reliable production audit trail. The legacy application still requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY; missing configuration remains an existing blocker for authenticated validation. API handlers require Vercel rather than Vite, and the minimal webhook remains outside this change.

## MULTI-TENANCY GAPS
Customer filtering is not security. No production workspace isolation or role-based membership exists. Plan server-enforced workspace IDs, composite foreign keys, memberships/assignments, RLS and immutable server events for Nexops Admin/Operator, Customer Admin/Viewer/Approver and eventual Supplier User. Do not put real multi-customer data into this demo.

## AGENT ARCHITECTURE
`detectExceptions(data)` is a pure monitoring-rule boundary. Planned Data Health, Monitoring, Operations, Supplier Follow-Up and Reporting services must validate/detect/recommend/draft only. Human/customer approval and authorized server execution must precede any PO/supplier/spend changes or critical supplier instructions. No advanced learning or autonomous agents were built.

## TEST RESULTS
- `node --test tests/operations.test.js`: 8 tests passed, none skipped. Covers rule evidence, healthy data, missing fields, customer/filter composition, priority, deduplicated counts, resolved/snoozed exclusion and review history/validation.
- `npm run build`: passed; demo and legacy application are separate lazy-loaded chunks.
- `tests/operations.browser.mjs` using system Chromium and an external temporary playwright-core installation: passed against both development Vite and the production-build preview. Covers isolated loading, 34/35 row counts, combined filters, empty state, assignment/status/history save, reload persistence, Escape, 390px overflow containment, direct inbox URL and corrupt-storage recovery. Zero browser runtime errors. Built-preview validation also confirmed that Escape returns focus to the triggering queue button.
- `git diff --check`: passed.
- Lint/typecheck/legacy automated tests: no configured scripts. Existing authenticated functionality and real-data sync were not functionally exercised because Supabase variables are missing; preservation is based on the narrow integration diff and successful build, not an unsupported end-to-end claim.

## FILES CHANGED
- `docs/NEXOPS_CURRENT_STATE.md`: initial audit checkpoint.
- `docs/NEXOPS_OPERATIONS_MODEL.md`: current interfaces and production boundaries.
- `docs/NEXOPS_MANAGED_SERVICE_BUILD_REPORT.md`: this report.
- `src/operations/model.js`: deterministic fixture, detection, filtering, summary and review rules.
- `src/operations/OperationsWorkspace.jsx`: TODAY, inbox and detail/review UI.
- `src/operations/operations.css`: scoped responsive styles.
- `src/LegacyApplication.jsx`: unchanged auth/App composition moved to a lazy wrapper.
- `src/main.jsx`: explicit synthetic route and lazy entry split.
- `src/App.jsx`: default TODAY tab and retained legacy navigation.
- `tests/operations.test.js`, `tests/operations.browser.mjs`: business-rule and optional browser suites.

## HOW TO RUN LOCALLY
From `/workspace/stockwise-app`, use Node.js 24 (tested 24.19.0):

```bash
npm ci --cache /workspace/.npm --no-audit --no-fund
node --test tests/operations.test.js
npm run build
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

Review the relative routes above. The demo needs no environment variables. For the existing authenticated app, enter the real project URL and public anon key securely in environment settings or existing ignored .env.local; do not copy example placeholders or expose service-role/Stripe secrets as VITE_ variables.

Optional browser validation does not add a project dependency:

```bash
npm install --prefix /tmp/nexops-browser --cache /workspace/.npm --no-audit --no-fund playwright-core
NEXOPS_PLAYWRIGHT_PATH=/tmp/nexops-browser/node_modules/playwright-core node tests/operations.browser.mjs
```

The test uses `/usr/bin/chromium` by default; override NEXOPS_CHROMIUM for another supported installation. For built assets, start `npm run preview -- --host 0.0.0.0 --port 4173 --strictPort`, then run with `NEXOPS_TEST_URL=http://127.0.0.1:4173` as well. Test snapshots are written to /tmp, not committed. Clear only `nexops_synthetic_operations_v1` in browser storage to reset the demo. Live processes do not survive environment publication; start them again in each task. Reuse the existing checkout; no worktree is necessary.

## NEXT 10 RECOMMENDED ACTIONS
1. Review TODAY/inbox usability and approve scope for the next phase.
2. Supply Supabase development settings and validate existing authenticated workflows with an authorized test account.
3. Design and implement server-enforced workspace memberships/RLS before real customer data.
4. Add authorized durable exception and immutable activity-event persistence.
5. Add import provenance, Data Health validation and a live inventory/forecast/inbound adapter without sample fallbacks.
6. Implement Action Tracker with related exceptions, assignees, deadlines, blockers and resolution.
7. Implement Customer Decision with Approve/Modify/Reject/Defer and complete server-side decision history.
8. Persist supplier commitments/updates and recalculate affected risks with stable exception lifecycle rules.
9. Add printable structured weekly reporting, with deterministic counts and optional reviewed narrative drafts.
10. Make the homepage repository available; implement managed-service messaging and consultation capture without final pricing or production deployment.

## Checkpoints
Initial audit and implementation are separate local commits. Final documentation/test evidence is committed separately. No production-readiness claim is made.
