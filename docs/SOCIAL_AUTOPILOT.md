# NexOps SNS autopilot — main-based integration, production OFF

Current integration: see MAIN_SOCIAL_INTEGRATION.md for the verified main baseline,
selective import, minimal optional foundation and target stockwise-app-1qz9.


This implements the user's 2026-11-01 policy: after one explicit administrator
activation, posts passing AI review AND fixed rules may publish without a human
approval for every post. It supersedes historical per-post human-review rules
for this specific path only. Email, customer commitments and other outbound
workers are not enabled or granted new authority.

## Independent daily metrics (publication OFF supported)

`GET /api/internal/social-metrics-sync` is a private production-only, CRON_SECRET
protected Buffer-query path. It requires server-side Supabase worker credentials
and the fixed Buffer organization/three-channel mapping, but NO AI key/pricing
ack, publication policy, write gate or emergency-stop release. Emergency stop
continues to block publication while analytics can remain available.

The job reads a bounded 30-day UTC window and all-date bounded post inventory,
then upserts the existing `nexops_social_snapshots` row used by the dashboard's
existing authorized metrics API. It preserves unavailable metrics as null and
partial results as partial. It does not change publication policy, consume daily
posting ticks/runs/budget or call Buffer mutations. Registered-post reconciliation
still belongs to the existing publication cycle; dashboard inventory/status and
metrics come directly from Buffer. No additional DB schema is required.

Same-organization, exact period and channel mapping are checked before reuse of
a persisted snapshot (maximum age 26 hours). Concurrent cold instances can repeat
bounded read queries and an idempotent snapshot upsert; this cannot dispatch posts.
Private credential authentication precedes store creation. Query parameters and
non-production execution are refused. Whole request deadline is 25 seconds;
function maxDuration is 30 seconds. Fixed-code failure/partial notifications use
the existing notification endpoint when configured; platform failed-job monitoring
remains required when an endpoint is not configured or delivery fails.

`docs/proposals/SOCIAL_METRICS_SYNC_CRON.json` proposes daily 08:50 UTC
(00:50 Los Angeles standard time / 01:50 daylight time), before the separate
09:00 UTC publication proposal. Neither is active in `vercel.json`. Initial
production validation should invoke the authorized private read-sync endpoint
manually while publication gates remain OFF; later merge approved cron entries
into existing config without replacing rewrites or deployment protections.

## Implemented flow

1. Private `GET /api/internal/social-cycle` requires a 32+ character CRON_SECRET,
   production runtime, explicit write permission and an unasserted emergency stop.
2. A database primary key atomically reserves ONE execution per organization/UTC
   date before provider reads. Failures and restarts do not automatically retry.
3. Read fixed LinkedIn/Threads/X channels via the existing Buffer reader, store
   the common JSON, reconcile known accepted post IDs and update measured metrics.
   Incomplete list pagination does not prevent an individual registered post read.
   Unknown dispatches without a verified provider ID are never guessed or retried.
4. When policy is OFF or the catalog/channel binding changed, collect metrics only.
   There are no AI generation or publication calls in that state.
5. With policy ON, atomically reserve budget BEFORE each AI call. The generator
   selects network-specific hook/order and verified fact IDs from a source-backed
   public catalog. It cannot supply free-form public claims. Fixed code composes
   the copy and checks shape, sources, size, risk flags and normalized duplicates.
6. An independent AI review request must return exactly `approved: true`.
   Unknown or extra output, invalid usage, failure, insufficient budget and a
   recent same-topic variant all reject the candidate. No repair/retry loop.
7. Atomically reserve the channel/day/content before Buffer transport. Immediately
   before mutation recheck production gates, current policy/revision, exact target,
   copy, run date/lease and durable claim token. Schedule text-only publication
   two minutes ahead in the same UTC date (`needsApproval:false`, not a draft).
8. A valid receipt means provider_accepted, not published. Only a subsequent
   verified Buffer `sent` state marks published. Transport/receipt uncertainty or
   a crash after reservation remains sending/delivery_unknown and blocks further
   automatic runs until independently reconciled. Do not clear these records to retry.
9. Next day's generation receives measured channel metrics and matched prior
   fact-topic/post metrics with freshness metadata. This is an optimization signal,
   not causal evidence. No SNS numbers, private drafts or customer outcomes are
   automatically inserted into public text. Missing measurements remain missing.

English-first public copy follows the existing APAC product direction. This is
constrained AI composition, not unrestricted prose generation. Current safe fact
catalog in this main-based integration: inventory CSV, coverage/reorder review,
13-week forecast, Early Access request and inbound CSV. Development-only demo/PO
claims were removed because those product modules were not imported. Source fingerprints are checked
in Unit tests. Updating reviewed fingerprints/catalog changes FACTS_VERSION and
requires administrator reactivation; do not refresh hashes merely to pass a test.

## Hard bounds and shared state

- One execution and at most one registration per network/UTC date; maximum three
  registrations daily. These are upper bounds, not a promise to post failed copy.
- Fixed three server-side channel IDs only, verified against Buffer service and
  organization. Preview/development Buffer mutations are rejected inside the reused
  provider adapter too, including old caller paths.
- Model pinned to gpt-4.1-mini, no tools, max 8192 input-content bytes, 600 generated
  tokens, validated usage ceilings. Six AI calls maximum daily (generation + review
  per channel). Reserve 20 US cents per call, $1.20/day and $40/calendar month per
  organization; failures/unknown requests consume the reservation, with no refunds.
- Currency reservation assumes reviewed model rates no higher than $10/input and
  $50/output per million tokens, including input-envelope headroom. This is an
  application reservation at approved prices, not control over provider repricing.
  Verify current pricing and provider project budget/alerts before activation.
  NEXOPS_SOCIAL_AI_PRICING_ACK records that operational prerequisite. No paid AI
  request or external billing setting was changed during local validation.
- PostgreSQL unique keys, policy-row locks and worker-only RPC grants enforce
  run, post and budget reservations across instances. Local PGlite exercises SQL
  semantics and duplicate reservations; it does not prove hosted multi-connection
  concurrency, deployment load behavior or end-to-end production operation.
- Exact normalized copies are blocked across retained history; equal fact sets
  with a different hook/order are blocked for seven days per network. Rejections
  are recorded by fixed reason, and safe composed public copy is retained where
  available. Raw untrusted model responses/secrets are not written to logs or DB.
- Whole job deadline 240 seconds, individual provider timeouts, Vercel function
  requests 300 seconds. Validate the target plan supports this and Node 24.

Existing on-demand metrics API still has process-local rate/cache limits for
arbitrary custom periods. Normal daily-window reads can reuse a fresh, scoped
persisted snapshot. Deployment-wide limits for arbitrary manual reads remain a
separate gateway/shared-counter prerequisite if broadly exposed.

## Administrator controls and stop behavior

Internal Growth Dashboard has an SNS autopilot panel. Nothing enables on load.
GET/POST `/api/growth/social-automation` validates Supabase Auth, confirmed user,
Growth Admin, exact internal organization owner/admin and workspace membership.
The enable action requires current catalog version and TWO explicit acknowledgments
(automatic publication without per-post approval and budget/catalog consent).
It read-verifies fixed targets and tests the configured notification endpoint
before writing the actor-bound, versioned enable record. No post is created by
enable itself. If the day's execution slot was used while OFF, publishing starts
on the next UTC date. No browser-provided provider ID/query/role is accepted.

Stop updates the policy using the user's existing auth/RPC, without needing AI,
Buffer or service-role credentials. Future dispatches stop at the next gate.
It cannot cancel an already in-flight provider call or a Buffer-accepted schedule;
such cancellation is a separate, explicitly approved provider operation.
Emergency stop also available via NEXOPS_SOCIAL_EMERGENCY_STOP=true or write gate
OFF; environment changes may require a hosting restart/redeployment to propagate.
There is no UI action to requeue unknown outcomes or expand caps.

Failures notify a fixed HTTPS webhook with fixed labels only; no post body,
customer data, credentials or raw provider errors. Durable alerts record whether
the endpoint accepted notification, not proof of final message delivery. If DB
access fails, the job handler still attempts the webhook. Configure host-level
failed-cron monitoring as well for process kills/platform outages. No Gmail/mail
sender was integrated or exercised.

## Unapplied SQL and inactive schedule

`docs/proposals/SOCIAL_AUTOPILOT.sql` is an unapplied proposal, not a registered
migration. It adds eight social-only tables and scoped functions; it does not
alter existing customer data or activate any scheduler. Existing organization/workspace/admin tables and nexops_is_growth_admin() must
exist, or the separately reviewed minimal SOCIAL_DASHBOARD_FOUNDATION.sql proposal
can be considered after read-only inventory. Do not install unrelated development
email/outbound migrations into production. Default policy is OFF,
authenticated users cannot directly mutate tables, and worker RPCs are service-role
only. Authorize/review application to the exact production project separately.
No hosted SQL or grant was executed. Preserve nonempty ledger/budget rows on rollback;
disable publishing/jobs first and forward-repair rather than deleting dedup history.

`docs/proposals/SOCIAL_AUTOPILOT_CRON.json` is an INACTIVE additive proposal for a
daily 09:00 UTC Vercel cron (01:00 Los Angeles winter / 02:00 summer). It is outside
active vercel.json, not installed. Merge only that property into the reviewed
Vercel configuration after explicit scheduler approval; never replace existing
rewrites/Git deployment protections with the snippet. Production cron uses
Authorization: Bearer CRON_SECRET. The source branch's scheduled internal GitHub workflow was not imported. This
integration introduces no active scheduled workflow; do not later import one blindly.

## Production configuration still required

The current cloud instance has only BUFFER_API_KEY, not a complete production setup.
Secure server settings (never values in chat/source or VITE secrets):

- Existing Supabase public Auth URL/anon key and organization memberships/admin
  assignments, plus NEXOPS_SOCIAL_ORGANIZATION_ID.
- BUFFER_API_KEY and the reviewed BUFFER_ORGANIZATION_ID / BUFFER_LINKEDIN_CHANNEL_ID /
  BUFFER_THREADS_CHANNEL_ID / BUFFER_X_CHANNEL_ID (never infer IDs from names).
- SUPABASE_SERVICE_ROLE_KEY for the private worker only; never browser/client config.
- NEXOPS_SOCIAL_AI_KEY, with access to the pinned model; API destination api.openai.com.
- NEXOPS_SOCIAL_AI_PRICING_ACK exactly
  `gpt-4.1-mini-input10-output50-per-million-v1` after pricing/budget review.
- NEXOPS_SOCIAL_ALERT_URL (HTTPS, no credentials/query/fragment/custom port), exact
  NEXOPS_SOCIAL_ALERT_HOST and NEXOPS_SOCIAL_ALERT_SECRET. Verify receiver delivery.
- CRON_SECRET (at least 32 characters), platform-provided VERCEL_ENV=production.
- Initially keep NEXOPS_SOCIAL_WRITES_ALLOWED=false and policy OFF. After approved
  deployment/configuration verification, allow true and set emergency stop false;
  policy remains OFF until the administrator's explicit dashboard activation.
- HTTPS/proxy/CA trust and exact outbound destinations: Buffer, the specific
  Supabase project, api.openai.com and the notification host. No wildcard expansion.

Release sequence: inspect exact Vercel project/auto-deploy controls; review and
commit local changes; obtain push/deployment authorization; review/approve social
SQL application; supply secure settings; verify hosted Auth/RLS with authorized
and other-org users while publication OFF; approve/install the daily schedule;
approve actual Buffer writing and use the administrator enable action; inspect the
first bounded three-channel run and later receipt/metrics. No per-post human
approval is needed after that activation. Unapproved unknown outcomes stop rather
than silently retry. Production target, credentials and actual writes remain
unverified; this local implementation is not a production readiness claim.

## Validation

Unit/Security suite includes content/evidence pins, production-only writes,
generation/review/budget order, checks rejection, topic/exact dedup, stop, uncertain
results, crash holds, AI shape/token limits, private scheduler auth, admin activation
and organization rejection. Local SQL covers default OFF, RLS/grants, shared daily
reservations, six-call/month budget, immutable dispatch claims and stop invalidation.
Browser fixtures cover double acknowledgment, enable/stop, preview denial, failure,
unknown alerts, mobile, administrator-only panel and existing SNS metric semantics.
Tests use synthetic credentials and mocked provider writes; no live mutation,
notification, AI billing, production DB or scheduler activation occurred. Buffer
input/enums/response types were separately inspected using read-only introspection:
required assets / needsApproval supplied, customScheduled/automatic confirmed,
and success/error fragments checked. Actual write entitlement is still untested.
