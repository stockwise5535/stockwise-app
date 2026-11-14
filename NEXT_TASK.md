## Current handoff — 2026-11-14 (0006 review)

main `10e0a86` already contains PR #13. The 0006 research cycle is being reviewed
on `codex/review-0006-sales-research`, not merged or enabled. See
`docs/SALES_RESEARCH_CYCLE.md`. Keep the existing CRM importer and schedule guards.
The ZIP's 20 candidates are distinct from the TEST CRM's existing 20 companies.
Do not import the ZIP's B/C candidates or replay its old TEST CSV blindly.
The TEST CRM already contains 20 companies and 20 unapproved, BLOCKED drafts;
five drafts have publicly sourced candidate email addresses. Sending and follow-up
remain FALSE. Sheets connector access and the Gmail sender identity were verified,
but these are not proof that Apps Script runtime sending/opt-out tests passed.
This review does not write CRM data, send mail, enable a schedule, deploy or migrate.
0005 measurement integration remains incomplete; no matching patch was supplied.

Historical environment notes below are not current connection or CRM state.

## Current Apps Script rollout — 2026-11-08

Existing PR #9 now contains the pushed feature branch feat/apps-script-sales-crm-gmail-bridge-20261107. Keep previous operational notes below as history; do not infer current production state from them.

User reports TEST Environment and both Secrets saved. Confirm their metadata, enable the saved minimal network draft, finish PR CI and register the workflow on main, then run read-only inspect before any source push. Reconcile real manual edits and manifest, approve baseline, bootstrap TEST, execute verifyTestCrmDeployment on Google. Production requires the same tested source plus actual GitHub required-reviewer protection. Code delivery never enables sending.
Mac Google auth and API ON were reported complete. TEST script ID is recorded in DEPLOYMENT.md. No cloud OAuth, remote Apps Script backup, TEST deploy, Gmail/Buffer write or new production activation has occurred.
Reviewed free research sources are empty and the daily research activation variable is unset. Verify Claude Phase 2 ownership before adding sources or enabling the job. Legal/sender/unsubscribe review, max-three-recipient pilot and actual delivery verification are still required before recurring prospect mail. Do not set legacy switches TRUE automatically.

---

# NEXT_TASK — Stockwise / NexOps

Current local integration: codex/integrate-social-autopilot-main, based on main
69e5474, selectively incorporating f797b10. See docs/MAIN_SOCIAL_INTEGRATION.md.

## Completed locally

Protected legacy application/Auth/API/Stripe/CRM files remain byte-identical.
Additive /growth admin dashboard + SNS reader/automatic cycle integrated.
52 Unit/Security tests, 8 local SQL tests, 3 browser suites and Build passed.
Publishing OFF, cron absent. SQL proposals unapplied; no remote writes.

## Latest rollout status — 2026-11-06

Local vercel.json now includes ONLY /api/internal/social-metrics-sync at
`50 8 * * *` (daily 08:50 UTC; 00:50 Los Angeles standard time, execution may
vary by hosting plan). /api/internal/social-cycle is NOT scheduled. Existing
SPA/API rewrites and branch deployment exclusions remain unchanged.

All 9 Unit/Security suites, Build, and 95-file secret scan passed. Production SQL
was NOT executed; latest remote main could NOT be retrieved (proxy:8080 connection
failure); no main merge/push/deploy/cron activation/live sync verification occurred.
Vercel/Supabase admin connections and their API destinations remain unavailable
in this execution environment. Do not repeat completed security audits.

User reports Buffer variables, AI key, NexOps organization and CRON_SECRET are
registered in Vercel Production. That does not make them available in this cloud.
Confirm SUPABASE_URL and server-only SUPABASE_SERVICE_ROLE_KEY are present too.
Maintain NEXOPS_SOCIAL_WRITES_ALLOWED=false, NEXOPS_SOCIAL_EMERGENCY_STOP=true,
and dashboard policy OFF. AI key is not used by the metrics-only cron.

Next: restore GitHub/Vercel/Supabase connectivity and admin access, then apply the
existing UUID-scoped SQL once (its own required preflight stops on drift), reconcile
latest main, deploy the metrics-only config to stockwise-app-1qz9, verify CRON_SECRET
rejection/success and scoped snapshot persistence without secret/body logs. Confirm
hosting/API free-tier eligibility and cost controls before activating anything.

## Autonomous work status — 2026-11-02, for Nov 5 review

Implemented independent private daily metrics sync while posting is OFF, without
AI credentials or consuming publication reservations. Existing snapshots feed the
authorized Growth Dashboard. Added an inactive 08:50 UTC cron proposal; no active
cron or production change. Unit/Security 9 suites + new DB/server integration
passed; Build passed. See DEVELOPMENT_LOG for safety and validation details.

Production status: no new deployment or schema installation; generation/review,
automatic registration/publication and daily sync are NOT running in production.
No real SNS registration/post was made in this session. Buffer read-only attempt
failed without a successful response. Next posting time: NOT SCHEDULED.

GitHub remote check failed because proxy:8080 is unreachable, so no push or remote
CI success is claimed. Local commits preserve the implementation. No background
agent scheduler exists here; a turn ending does not start unattended Nov 3/4 work.

## Human operations — at most three, in priority order

1. Restore managed environment connectivity and allow exact destinations for
   the intended Vercel/Supabase project, api.openai.com and alert host (plus GitHub
   API if needed). Do not bypass proxy restrictions. Current proxy is unreachable.
2. Securely register Vercel/Supabase deployment/DB access and runtime settings:
   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY;
   NEXOPS_SOCIAL_ORGANIZATION_ID=f60bb887-d9d6-42ae-9235-8e7079fb17ef;
   BUFFER_ORGANIZATION_ID and fixed LinkedIn/Threads/X channel IDs, BUFFER_API_KEY;
   NEXOPS_SOCIAL_AI_KEY and reviewed NEXOPS_SOCIAL_AI_PRICING_ACK;
   NEXOPS_SOCIAL_ALERT_URL/HOST/SECRET; CRON_SECRET (32+ chars).
   Put secrets in secure environment/Vercel settings, never chat/Git/VITE variables.
   Check existing production settings before adding/replacing anything. Configure
   provider pricing/budget/alerts and notification receiver; keep posting OFF.
3. Resume the approved rollout once connections exist: apply UUID-scoped SQL,
   reconcile remote main without force, deploy to stockwise-app-1qz9 (not local
   linked project y), verify live Auth/other-org rejection, OFF metrics sync and
   safely budgeted generation/review. Only after all checks pass activate daily
   metrics/publication schedules and explicit admin publication policy. Do not
   force an AI preview by bypassing budget or temporarily enabling live posting.

Approval for rollout already exists. Do not request it again or repeat completed
baseline audits. The SQL is ready with confirmed UUIDs; production readiness is
blocked by access/settings, not by unfinished foundation audit. Never clear
unknown-delivery/dedup/budget history to retry.
