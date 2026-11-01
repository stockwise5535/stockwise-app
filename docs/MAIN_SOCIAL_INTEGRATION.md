# main-based production integration — prepared locally, not deployed

Target supplied by the user: Vercel `stockwise-app-1qz9`,
https://stockwise-app-1qz9.vercel.app, production branch main, Ready at 69e5474.
Fresh remote main fetched as `69e54742ecca5f3401338a762707a30ab3fe0fa3`.
Integration branch: `codex/integrate-social-autopilot-main`.
Feature source: `f797b105c3fb16e9f815e2b9eed0dc3749f22a79`.

## Conflict resolution / scope

Do not merge the whole development branch: it also replaces the inventory app,
Auth/billing flow, marketing routes and other unrelated features. This branch
selectively integrates the SNS reader, automatic cycle, fixed Buffer adapter,
admin/organization authorization, common JSON, durable-claim SQL proposal and
SNS panels. Development mail/CRM workers, launchd scripts, SEO/landing rewrite,
operations-demo replacement and scheduled GitHub workflow were NOT imported.

Main wins for App.jsx, AuthContext.jsx, supabase.js, LoginPage, PricingModal,
all four existing API handlers, public assets/logo, index.html, vite.config.js,
SUPABASE_SQL.sql and package-lock.json. Fourteen protected main files were byte-
compared with origin/main, with no difference. Existing login/logout, inventory,
heatmap, Early Access form/save route and Stripe UI/API contract remain in place.
The only frontend entry change is a lazy, isolated `/growth` route under the same
existing AuthProvider. All other paths keep main's original App. CSS is scoped to
the new dashboard. No new runtime dependency or legacy database trigger change.

The internal dashboard is SNS-focused; it does not claim to import the development
branch's entire lead CRM or customer demo/operations product. Workspace/admin
queries are read-only; no bootstrap RPC, user creation or role assignment occurs.
Missing permissions/schema show an error and no privileged panels. The server
still validates Auth, Growth Admin, the fixed organization and membership again.

The old public fact catalog described development-only synthetic PO/demo features.
It was replaced with facts actually supported by main: inventory CSV, coverage/
reorder review, 13-week forecast, Early Access and inbound CSV. Fact IDs and source
fingerprints changed deliberately. Old approval hashes cannot activate this new
catalog; first activation must review the new version. Pure risk rules were
extracted unchanged, avoiding unused email/provider dependency imports.

## OFF invariants

- No crons property in active vercel.json, no scheduled workflow copied to main.
- Automatic Git deployments disabled for both development/integration branches;
  main's original API/SPA rewrites are unchanged. This local config is not proof
  of all hosted Vercel project settings; inspect the actual target before a push.
- Missing production opt-ins or emergency-stop=false rejects Buffer mutation.
  Policy starts OFF; no scheduler, role, database record or secret is provisioned.
- SQL and cron JSON remain under docs/proposals, outside registered migrations
  and active deployment config. Local tests apply them only to disposable PGlite.

## Supabase preparation — never blindly apply development migrations

First run `docs/proposals/SOCIAL_INTEGRATION_READONLY.sql` only against the verified
production project with existing inspection access. Confirm legacy schemas and
identify which NexOps tables/functions already exist; anonymous REST denial is
not evidence of absence. Preserve existing CRM rows, memberships, Auth triggers,
profiles, inventory, subscriptions and RLS.

Decision after read-only inventory:

1. If the five organization/workspace/admin tables AND nexops_is_growth_admin()
   already exist, reuse them after checking columns, signatures, policies and
   grants. Do not apply the bootstrap proposal.
2. If NONE of those tables/functions exists, the optional
   `SOCIAL_DASHBOARD_FOUNDATION.sql` creates only five required metadata tables,
   RLS/SELECT grants and the Growth Admin check. It refuses any existing foundation,
   preventing silent replacement. No users/memberships/admins are seeded.
3. Partial or incompatible existing schemas require an individually reviewed
   additive migration. Do not drop, reset or overwrite them to make tests pass.
4. Only after that prerequisite is verified and separately approved, apply the
   `SOCIAL_AUTOPILOT.sql` proposal (eight social tables + scoped RPCs). If social
   objects already exist, inspect/upgrade them rather than rerunning CREATE SQL.
5. Existing confirmed Auth user UUID, internal organization UUID and workspace UUID
   must be explicitly selected. Provision missing owner/admin + workspace membership
   and Growth Admin rows only under separate database-write approval. Keep policy
   OFF. No automatically promoted customer or newly created test account.

There is no requirement to install development email/lifecycle/CRM migrations,
triggers, signup bootstrap, mail gates or customer seed data for this minimum UI.
The optional foundation was tested on main's legacy SQL including its on_signup
trigger, preserving two existing profile/subscription rows and a SKU value.

## Vercel configuration checklist (values must stay secure)

Verify actual Project/Team IDs, Root Directory, Git branch mapping, Node 24 and
function duration support (private job asks for 300s, internal deadline 240s).
The checked-in `.vercel/project.json` belongs to `y`, NOT the confirmed production
target. Do not run `vercel deploy` using that link or assume it identifies 1qz9.
No deployment/link change was made here.

Preserve current Production variables used by main: VITE_SUPABASE_URL,
VITE_SUPABASE_ANON_KEY, Stripe price/key/webhook and existing app URL settings.
Do not replace them with test values or another Supabase project.

Additional server settings for this integration:

| Setting | Source / requirement |
| --- | --- |
| SUPABASE_URL / SUPABASE_ANON_KEY | Same verified project as existing browser Auth; public-key fallbacks remain supported |
| SUPABASE_SERVICE_ROLE_KEY | Worker only; same project, never a VITE variable |
| NEXOPS_SOCIAL_ORGANIZATION_ID | Approved internal organization UUID, not every customer org |
| BUFFER_API_KEY | Existing secure server secret with needed read/write entitlement; actual writes untested |
| BUFFER_ORGANIZATION_ID | Reviewed organization ID from read-only Buffer discovery |
| BUFFER_LINKEDIN_CHANNEL_ID / BUFFER_THREADS_CHANNEL_ID / BUFFER_X_CHANNEL_ID | Fixed reviewed IDs matched to network and organization |
| NEXOPS_SOCIAL_AI_KEY | Server-only key for pinned gpt-4.1-mini |
| NEXOPS_SOCIAL_AI_PRICING_ACK | Reviewed price ceiling acknowledgment in SOCIAL_AUTOPILOT.md |
| NEXOPS_SOCIAL_ALERT_URL / HOST / SECRET | Approved fixed HTTPS notification receiver and credential |
| CRON_SECRET | Private scheduler bearer secret, at least 32 characters; no cron enabled now |
| NEXOPS_SOCIAL_WRITES_ALLOWED | **false** for initial integration/release |
| NEXOPS_SOCIAL_EMERGENCY_STOP | **true** for initial integration/release |
| VERCEL_ENV | Hosting-provided production marker; never spoof locally |

Auth and database project settings/assignments have NOT been verified remotely.
No environment-variable values were changed in this task. Actual hosted RLS and
an authorized-vs-other-org request must be verified before publication activation.

## Validation and limitations

Run `npm run test:unit`, `npm run build`, `npm run test:security`, local SQL tests
and main-integration/social-metrics/social-automation browser suites. Test-only
dependencies stay outside application package-lock (same pinned PGlite/Playwright
as the source branch). All transports/auth are local fixtures or mocks; no Stripe
charge, CRM write, AI bill, notification or Buffer mutation occurs remotely.
The new main-integration browser suite covers original login/logout, legacy
inventory/heatmap/Early Access gate, original Stripe modal and the new admin-only
route, workspace reset, access failure, OFF state and mobile layout.

Legacy API caveats are preserved, not newly solved: main's SKU/Early Access handlers
trust body user IDs with service-role access; its Stripe handler trusts browser
price/user fields and its webhook only acknowledges receipt. This integration
does not certify those pre-existing endpoints as hardened production billing/CRM.
Review them separately before claiming whole-site security readiness.

Status: local code integration can be reviewed for release; production GO still
requires correct hosted project/root/runtime/env, read-only schema/permission
inventory and explicit SQL/provisioning/deployment approval. No live entitlement,
hosted concurrency/load or paid provider result was tested. See SOCIAL_AUTOPILOT.md
for quotas, unknown-result holds, stop limitations and inactive schedule proposal.

No main/integration push, production DB change, deployment, active cron, publication
enable or Buffer write was performed. No unrelated code was merged from development.


## Recorded local result

52 Unit/Security cases, 8 disposable SQL cases and all three integration browser
suites passed. Vite production Build passed and final secret scan inspected 85
source/dist files with zero findings. Protected main-file comparison: 14/14
unchanged. Remote main rechecked at 69e5474 after validation. These counts apply to
the selected main-based integration, not the unrelated 193-case development suite.

Rollback preparation: revert the additive code/route integration to the verified
main baseline if needed. If a later approved release applies SQL, turn publication
and the job OFF before rollback and preserve ledger/budget/unknown rows; never drop
or clear dedup history to restore operation. No rollback or production action was
performed in this task.
