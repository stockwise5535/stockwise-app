# Internal Growth Dashboard — Buffer read-only metrics

Implemented on `codex/managed-service-mvp`, based on `5ea4dec`. No deployment,
hosted DB mutation, push or scheduled job activation was performed.

## Request and trust boundary

`GET /api/growth/social-metrics?workspaceId=<uuid>&start=YYYY-MM-DD&end=YYYY-MM-DD`
requires `Authorization: Bearer <Supabase user access token>`. Dates are UTC;
end is exclusive, at most 31 days per request, within the past 366 days and not
in the future. The default UI ends at today's UTC midnight.
Only those three parameters are accepted, once each. Provider IDs, arbitrary
queries, caller identity/role overrides and pagination controls are rejected.

The server validates the user through Supabase Auth `getUser`, requires an
authenticated role and confirmed email, invokes `nexops_is_growth_admin` using
the user's token, and reads existing RLS-protected workspace and membership rows.
The selected workspace must belong to the configured Stockwise organization;
the verified user must be a workspace member AND organization owner/admin.
Permission errors or unavailable checks deny access, including on cache hits.
The anon/publishable client and user token are used; no service-role key is needed.

## Required server configuration (values are not stored here)

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (existing public `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` may also supply these public Auth settings).
- `NEXOPS_SOCIAL_ORGANIZATION_ID`: existing authorized NexOps organization UUID.
- `BUFFER_API_KEY`: server secret only; never VITE-prefixed.
- `BUFFER_ORGANIZATION_ID`, `BUFFER_LINKEDIN_CHANNEL_ID`,
  `BUFFER_THREADS_CHANNEL_ID`, `BUFFER_X_CHANNEL_ID`: previously discovered and
  reviewed provider IDs, pinned server-side. No automatic name matching.

The mapping represents one internal organization, not every customer workspace.
All three configured channel IDs must match their expected service in the
configured Buffer organization before any posts or aggregate queries execute.
The old `services/buffer-adapter.js` supports approval-gated publication and is
deliberately not imported by this route. Only the fixed-query
`server/buffer-growth.js` reader is used.

The configured Supabase project must already have the relevant existing
foundation/outbound functions, memberships and admin assignments. Their hosted
existence and assignments have NOT been verified in this Buffer-only environment.
Do not apply migrations or grant roles implicitly to make the endpoint pass.

## Bounds and caching

- Total request deadline: 25 seconds, propagated through Auth and Buffer calls;
  each Buffer call also has its own timeout and redirects are refused.
- At most 20 active requests per handler process, 10 authenticated requests per
  user per minute (cache hits included), and 10 upstream snapshot starts per minute.
- At most 2 concurrent provider snapshots; same-scope concurrent requests share
  a snapshot only after each caller independently passes authorization.
- Three configured channels; at most 4 pages × 50 posts = 200 posts per channel.
  Overflow is explicit; the UI never labels a partial inventory as a total.
- Complete snapshots cached for 60 seconds; at most 64 scope/period entries.
  Scope includes internal organization, provider organization and fixed channels.
  Partial/failed snapshots are not cached. Auth is rechecked before every hit.
- Rate-limit identity storage is bounded to 256 unexpired users and fails closed
  at capacity. Browser/CDN responses are `no-store`, varying on Authorization.

These bounds, counters, cache and single-flight are process-local, not distributed.
Multiple Vercel instances/restarts do not share them. Before scaling, enforce
deployment-wide rate/concurrency limits with an approved shared store or gateway.
No shared service or DB write was introduced in this task.

## JSON and UI semantics

The route projects the existing common JSON into a dashboard DTO: period,
fetchedAt, status, missingServices and each channel's name/service, connectivity,
metricsUpdatedAt, normalized metrics, separate metrics/posts errors and bounded
postInventory state counts. It omits raw post IDs, post content and provider
organization discovery results. It never returns credentials or upstream errors.

`available / 0` displays 0. `not_fetched / null` displays 未取得 / Not fetched.
A failed aggregate displays 取得失敗 / Fetch failed, independently of post-list
errors. Loading and request-level failure have separate states. Available extra
metrics returned by Buffer are also shown with their API units preserved.
All-date scanned inventory is separate from period `postCount` (published posts).
The API's `complete` status is not a guarantee of all-metric support or freshness.
No values are imputed and engagement rates are not combined across networks.
User/workspace changes unmount the panel; date changes clear results; aborted or
superseded requests cannot repopulate the old view. Browser tokens are never logged.

## Local validation and release prerequisites

Use `npm run test:unit`, `npm run build`, `npm run test:security`.
Existing CI's local PGlite and five browser suites remain applicable.
`npm run test:browser:social` additionally checks the new panel with a local
synthetic session and intercepted API responses; it makes no external API calls.
`tests/growth.browser.mjs` checks that only the administrator dashboard mounts it.
Node 24 and the existing CI's pinned test dependencies are used; keep them outside
the application dependency/lockfile as existing CI does.

Current live configuration has only BUFFER_API_KEY. Fixed IDs, Supabase settings
and internal organization mapping remain unset. Local tests prove behavior with
fixtures, not hosted authentication, role assignments or production routing.
Before an approved release: securely supply the mapping, verify existing Auth/RLS
and admin assignments read-only with an authorized user, check the hosting runtime
deadline and HTTPS/proxy/CA setup, decide deployment-wide quota enforcement, and
review monitoring/key rotation. Current implementation creates no database audit
rows and has no autonomous refresh job. Keep publication features disconnected.

Commit `bbf5f77` was not found locally or in the inspected development history;
its GitHub patch lookup returned 404 in the earlier investigation. It was not used
as a baseline. Existing source/tests and the current fixed-query reader were
reviewed and supplemented instead; this uncertainty did not block implementation.


## Autopilot integration (2026-11-01)

The optional approved social schema supplies scoped daily snapshots to this GET
route when their period, organization, channel binding and freshness match. Missing
schema/data falls back to the existing read-only reader. Publishing is isolated in
the production-only private job and explicit administrator control API; this GET
metrics route never posts or activates anything. See SOCIAL_AUTOPILOT.md.
