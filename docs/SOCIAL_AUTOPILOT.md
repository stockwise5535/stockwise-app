# Stockwise SNS — approved stock, zero AI API calls

This version uses only literal, versioned text in `server/social-stock.json`.
There is no generative/reviewer/model-metadata API call. `server/social-ai.js`
is a disabled legacy adapter: generate/review throw before any transport.
`NEXOPS_SOCIAL_AI_KEY` and `NEXOPS_SOCIAL_AI_PRICING_ACK` are not read or required.
A configured legacy key cannot turn AI back on. This describes the SNS application
path; it does not refund earlier charges or alter other applications/accounts.

## Fixed stock and administrator approval

- 45 literal entries: 15 each for LinkedIn, Threads and X. Five single facts and
  ten fact pairs per service, with neutral headings; no generated claims.
- Facts are restricted to the source-pinned inventory CSV, coverage/reorder,
  13-week forecast, Early Access and inbound CSV features already reviewed against
  the actual application/API. Exact text, allowed facts, shape, length, risk rules
  and globally unique normalized content hashes are validated before use.
- The Growth dashboard displays every exact stock entry and remaining counts.
  Enable requires current `factsVersion`, `acceptAutomaticPublishing:true` and
  `acceptStock:true`. Old `acceptBudget` consent is rejected. The administrator
  must review and explicitly approve this exact version before any dispatch.
- `FACTS_VERSION` includes the complete literal stock and source fingerprints.
  The previous paid-AI version's policy cannot authorize this version. Changing or
  adding stock requires a new administrator approval; no automatic replenishment.
- No private inventory, customer data, metrics, user text or model output is
  inserted into a public post. Performance measurements remain internal.

## Runtime and duplicate prevention

1. Production-only private GET `/api/internal/social-cycle` validates CRON_SECRET,
   fixed organization/channel mapping, publication permission, emergency stop,
   notification configuration and the current administrator policy/version.
2. Existing PostgreSQL daily tick/run reservations limit execution to once per
   organization/UTC date and at most one registration per service/date.
3. Buffer read-only metrics/status retrieval and receipt reconciliation remain.
   Failed or unconfirmed registered-post status blocks new dispatches that cycle.
4. For the fixed catalog's hashes, query all-time `nexops_social_posts` usage under
   the exact organization. This is not the last-90-row history query. The result
   is bounded by catalog size times three services; no date cutoff is used.
   Any matching reserved/used text is excluded globally, including old versions.
5. Select the first unused eligible literal entry per service. The existing
   seven-day same-fact-set cooldown remains. If any service has no unused stock,
   stop all new dispatches, record blocked outcomes and notify `STOCK_EXHAUSTED`.
   Cooldown-only unavailability uses `STOCK_COOLDOWN`. The policy flag may remain
   ON but no exhausted catalog can dispatch; the dashboard shows inventory stop.
   Metrics and reconciliation can still run. Notifications are bounded by the
   daily execution reservation. No original text is recycled or rewritten.
6. Database uniqueness is the final duplicate/race barrier. Recheck policy,
   current stock version, exact text/channel/schedule and durable claim immediately
   before Buffer transport. Schedule text-only posts two minutes ahead, same UTC
   date. Buffer acceptance is not proof of `sent`/published.
7. An uncertain dispatch leaves a durable unknown hold and stops the remaining
   services immediately. Never clear reservations or dedup history to retry it.
   Emergency stop/disable remains available; accepted schedules are not cancelled
   by turning policy OFF. No existing DB objects/data are removed or recreated.

New runs leave `ai_calls=0` and `reserved_cents=0`. No AI reservation RPC is called.
Legacy budget tables/RPCs/history remain intact but are unused by this worker.

## Schedules and OFF behavior

`vercel.json` retains metrics sync at `50 8 * * *` (08:50 UTC) and prepares posting
at `0 9 * * *` (09:00 UTC). Production currently has metrics sync according to the
user; this PR's posting schedule needs merge/deployment. Branch deployment is
excluded. GitHub Actions runs validation only, never production/provider jobs.

Before live verification keep `NEXOPS_SOCIAL_WRITES_ALLOWED=false`,
`NEXOPS_SOCIAL_EMERGENCY_STOP=true`, and administrator policy OFF. Cron registration
alone cannot release those gates. No key/ACK is needed for AI, because AI is absent.

## Required server settings

- Existing Supabase public Auth URL/key; worker `SUPABASE_SERVICE_ROLE_KEY` and
  `SUPABASE_URL` (existing `VITE_SUPABASE_URL` fallback supported).
- `NEXOPS_SOCIAL_ORGANIZATION_ID`, `BUFFER_API_KEY`, `BUFFER_ORGANIZATION_ID`,
  `BUFFER_LINKEDIN_CHANNEL_ID`, `BUFFER_THREADS_CHANNEL_ID`, `BUFFER_X_CHANNEL_ID`.
- `CRON_SECRET`: random, at least 32 characters. Never put it in a URL/browser.
- Fixed HTTPS `NEXOPS_SOCIAL_ALERT_URL`, matching `NEXOPS_SOCIAL_ALERT_HOST`, and
  `NEXOPS_SOCIAL_ALERT_SECRET`. Receiver accepts fixed `{system,code}` JSON and
  must be tested. Known AI service hosts are rejected as notification targets.
- No AI service credentials or pricing ACK. Existing values are ignored; they
  may be removed from this SNS environment without replacing them.

Notification/hosting/Buffer/Supabase plans are independent of the zero-AI-call
claim. Do not label the entire system free merely because its AI API cost is zero.

## Safe release and first batch

1. Review PR #3's latest CI. Deploy with policy/flags OFF. No DB migration is
   required for this change. Do not reapply existing production SQL.
2. Sign in as the confirmed Growth administrator, select the correct workspace,
   refresh state, and review the full stock and remaining counts. Use **Check
   readiness without publishing** while both OFF gates and policy OFF are in place.
   This checks fixed Buffer accounts and a notification test only: no model
   request, content generation, AI billing, policy write or Buffer mutation.
3. Only after readiness/receiver confirmation and approval of the exact stock,
   release environment gates and redeploy, then enable with the two current
   acknowledgments. Do not reuse old policy/catalog approval.
4. For controlled first use, invoke only the private posting cron once outside
   the normal execution window. Wait for three `provider_accepted` results, then
   set policy OFF while confirming each exact Buffer post becomes `sent`.
   Accepted schedules still publish while policy is OFF. If any outcome is
   unknown/error, keep OFF and do not resend. A used daily slot is not reset.
5. After all three publish, enable normal daily use of the remaining stock.
   Once exhausted, approve a new literal stock version rather than recycle text.

## Validation

Tests reject fabricated/changed stock, old paid-mode consent, unauthorized or
cross-org access, AI-host alert targets, preview publication, duplicate races,
unknown-send retries, UTC-boundary schedules, and stock exhaustion. A transport
spy permits only fixed Buffer/notification requests even if old AI credentials
are present. Legacy AI calls always throw before transport. Real PostgreSQL/PGlite
integration consumes 45 unique entries over 15 dates, confirms zero AI counters/
reservations and budget rows, then checks day-16 exhaustion notification/stop.
Browser fixtures cover literal stock consent, $0/OFF controls, existing login,
inventory and Stripe flows. All provider delivery in tests is mocked.
