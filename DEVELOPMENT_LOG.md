# Stockwise / NexOps development log

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
