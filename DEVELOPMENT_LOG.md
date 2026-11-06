# Stockwise / NexOps development log

## 2026-11-06 — PR validation workflow

- Added a validation-only GitHub Actions workflow for integration-branch pushes
  and PRs targeting main: Unit/Security, disposable DB, Build/secret scan and
  three synthetic local browser suites. Pinned actions/test dependencies, read-only
  token permissions, no workflow cron, deployment or production/provider secrets.
- Workflow explicitly keeps publication write permission false and emergency stop
  true. Production SQL and provider writes are not run by CI.
- Local Unit/Security 9 suites, DB 3 suites, Build and 96-file secret scan passed.
- Latest fetched main remains 69e5474 and is an ancestor of integration HEAD.
- Git connection works using the approved execution permission with unchanged
  proxy/allowlist. api.github.com is separately denied; saved an additive network
  draft for that host, preserving api.buffer.com. Draft is not runtime publication.
- All 3 local browser suites subsequently passed. Fixed workflow test-server
  configuration to supply synthetic Stripe prices required by the unchanged
  checkout UI; no product code or real Stripe connection changed.
- Integration branch push succeeded. Remote CI status is recorded separately
  after actual completion; this entry does not assert PR creation has succeeded.

## 2026-11-06 — prepare metrics-only production cron

- Added exactly one local vercel.json cron: GET /api/internal/social-metrics-sync,
  daily `50 8 * * *`. No publication cron; original rewrites/Git exclusions kept.
- Updated release guard to assert the exact metrics-only schedule and exclude
  /api/internal/social-cycle. Unit/Security 9 suites and Build passed. Existing
  secret-scan logic passed 95 files with shell-generated Git target list.
- No baseline audit repeated or SQL body changed. User-confirmed target UUIDs
  remain configured. Production SQL application was NOT attempted without access.
- GitHub remote main check failed at proxy:8080. No Vercel/Supabase admin connection
  or allowed management API destination exists here. No remote merge, push, deploy,
  active hosted cron, real sync, AI request, SNS post/reservation or live data write.
- User-reported Vercel env registration is distinct from cloud credential availability.
  Supabase worker URL/key and publication OFF flags still require Vercel-side
  confirmation; no secret values requested or emitted.

## 2026-11-02 — independent metrics sync and cross-layer rehearsal

- User authorized autonomous development through Nov 4 and review Nov 5, within
  existing production safety conditions. No persistent agent/task scheduler is
  available; no unattended three-day execution or future report is claimed.
- Implemented private GET /api/internal/social-metrics-sync independent of AI and
  publication activation. Production/CRON_SECRET required; caller targets refused.
  Fixed Buffer queries only; no run/tick/AI-budget/policy mutations. Uses existing
  snapshot schema/ACLs and dashboard read path, so no new SQL migration needed.
- Shared scoped daily cache, 30-day UTC window, bounded inventory/page count,
  25-second cancellation and fixed partial/failure notification labels added.
  Missing metrics remain null and partial channels remain partial. Concurrent
  cold readers may duplicate safe queries/upserts, never Buffer dispatches.
- Added inactive 08:50 UTC metrics cron proposal, separate from 09:00 UTC posting
  proposal. Active vercel.json remains unchanged; all schedulers remain absent.
- Unit/Security: all 9 suites passed, including 7 new sync scenarios plus a scoped
  store lookup test. Build passed. Earlier 15 SQL cases remain passed; added one
  real cycle + production SQL + least-privilege store integration case, passed.
  It proves OFF sync, six AI reservations/three checked mocked registrations,
  durable daily no-replay and stop, using only local synthetic data/transport.
- Secret scanning passed on 95 source/build files using the existing logic with
  shell-generated file list (Node Git spawning restricted). No secret output.
- GitHub remote inspection failed: proxy:8080 unreachable. Buffer read-only
  attempt also returned no successful response. No retry/bypass or mutation.
  Existing security CSV audit was not rerun. No production SQL, main change,
  deployment, active cron, AI billing, SNS reservation/post or external message.
- Results saved locally on integration branch; remote CI/push cannot be verified
  until network access is restored. Production post time remains unassigned.

## 2026-11-02 — target UUIDs finalized; production rollout blocked by access

- User supplied confirmed target admin/org/workspace UUIDs; set the three literals
  in SOCIAL_AUTOPILOT_PRODUCTION.sql. Other executable SQL is byte-equivalent
  after normalizing the target literals. Exact UUID format/static checks passed.
- Three supplied CSVs match existing development authorization function/policy
  hashes and compatible effective table privileges. Schema-addition decision GO,
  without repeating production audits. New SQL tests: 7/7 passed again locally.
- Test fixture binding now replaces either NULL or configured UUIDs, keeping all
  tests on synthetic data in disposable PostgreSQL/PGlite.
- User subsequently authorized hosted SQL, main integration/deployment and cron/
  automatic publication only after successful OFF-state production validation.
  That authorization is recorded; no additional release approval requested.
- Current environment readiness: BUFFER_API_KEY ready only; no Vercel/Supabase
  admin connection, AI key, fixed IDs, alert endpoint/secret or cron secret.
  Network policy does not allow deployment/DB/AI destinations. No relevant
  Vercel/Supabase connector available. Cannot inspect Vercel-side settings.
- Stopped before production changes per the user's missing-credentials condition.
  No push, main change, hosted SQL, deploy, cron, AI call or Buffer mutation.
  Next production post time remains unassigned.

## 2026-11-02 — additive production SQL preparation (not applied)

- Compared the user-reported production audit (PASS 18 / MISSING 24 /
  MISSING_OR_REVIEW 21) and the supplied seven-row REVIEW CSV with the existing
  SOCIAL_AUTOPILOT proposal. All eight social tables/functions are absent.
- Growth-admin table RLS/default deny and no authenticated SELECT are compatible
  with the SECURITY DEFINER admin RPC; no foundation grants or policies added.
  Four policy mismatches and the admin RPC body mismatch remain unproven without
  their actual hashes/metadata. No blanket safety approval from summary counts.
- Added SOCIAL_AUTOPILOT_PRODUCTION.sql: new SNS objects only, default OFF, exact
  existing confirmed admin/org/workspace preflight, known minimal/development
  authorization definitions, fail-closed privilege/ownership/column/TRUNCATE
  checks, least required service-role direct grants and no scheduler.
- Added read-only baseline evidence SQL, empty-only guarded rollback proposal
  (no CASCADE) and a production verification/rollback runbook. Unknown existing
  definitions stop rather than being rewritten. Original application unchanged.
- Local PostgreSQL/PGlite: 7 new production SQL tests plus 8 existing SQL tests
  passed; both compatible foundations re-audited with SNS checks PASS. Tests
  cover preserved baseline definitions/ACLs/data, OFF default, cross-org/browser
  denial, worker quotas/dedup/unknown hold, atomic refusal and safe rollback.
- Local Build passed. Existing secret-scan logic passed on 90 source/build files.
  The standard scanner's Node spawnSync git was denied EPERM by this environment;
  used a shell-generated identical git file list with the unchanged scan logic in
  a temporary runner. No repository scanner changes or permission escalation.
- Production application remains NO-GO pending baseline hash/effective privilege
  evidence, exact confirmed administrator/organization/workspace and external
  Vercel/cron settings. No production access/write, push, deployment, scheduler
  activation, AI/Buffer request or SNS post performed.

## 2026-11-01 — main-based selective SNS integration

- User-confirmed production: stockwise-app-1qz9.vercel.app, main, Ready at 69e5474.
- Fresh fetched main: 69e54742ecca5f3401338a762707a30ab3fe0fa3.
- Source feature commit: f797b105c3fb16e9f815e2b9eed0dc3749f22a79.
- Local integration branch: codex/integrate-social-autopilot-main.
- Selected feature files instead of merging 169-file development branch differences.
  Main's existing application/Auth/Stripe/CRM save handlers and assets win.
- Fourteen protected main files byte-identical: App, AuthContext, supabase client,
  LoginPage, PricingModal, four API handlers, index, Vite config, legacy SQL,
  package-lock and logo. No replacement product/marketing/mail stack imported.
- Added a lazy /growth internal dashboard using the original AuthProvider and
  existing session. No bootstrap/role assignment or customer data mutation on load.
- Integrated fixed-query common-JSON reader, production-only auto cycle and admin
  control routes. Publishing remains OFF and no schedule is registered. Both
  development/integration branches have local Vercel Git deployment exclusions.
- Re-reviewed public facts against main: CSV/coverage/reorder, 13-week forecast,
  Early Access and inbound planning. Development-only demo/PO workflow claims are
  excluded; catalog/source version changed, forcing a future explicit activation.
- Minimal optional five-table foundation proposal refuses pre-existing NexOps
  foundation rather than replacing it. Existing compatible tables/functions can
  be reused. Eight-table social proposal remains unapplied. No legacy migration,
  signup trigger, profile, SKU, subscription or CRM row was changed remotely.
- Local Unit/Security: 52 passed. Includes legacy Stripe/Early Access/SKU API
  contract regression and no-active-cron/rewrite-preservation guards.
- Local SQL: 8 passed, including preserving main's existing signup trigger and
  profile/subscription/SKU data, default OFF, owner/admin isolation, daily/budget
  reservations and no unknown retry. No hosted multi-connection claim.
- Browser: main-integration, social-metrics, social-automation all passed, using
  synthetic Auth, local PGlite and mocked Stripe/provider APIs. Main login/logout,
  heatmap/inventory, Early Access gate, Stripe UI, scoped admin page and mobile
  exercised. Initial harness failure was a navigation-before-logout race; the test
  now awaits completion and the original AuthContext remains unchanged.
- Main's unchanged Vite Build passed. Final source/dist security scan and diff check
  are recorded after document completion. No real external API writes/billing.
- Existing API security caveats remain documented, not certified as repaired by
  this SNS integration. Hosted schema/roles/env/project routing remain unverified.
- Detailed conflict choices, SQL decision tree, settings and rollout bounds:
  docs/MAIN_SOCIAL_INTEGRATION.md.

No push, main integration on GitHub, production deployment, hosted DB/permission
change, cron activation, publishing enable, Buffer mutation, email or AI bill.

Final checks: source/dist secret scan PASS (85 files), git diff --check PASS,
remote main unchanged at 69e5474. Three browser suites passed after harness fix.
Local code is prepared for release review; hosted configuration/authorization
and approved SQL/deployment steps remain outstanding.
