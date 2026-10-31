# Production readiness — 2026-10-31

Baseline: `abcdf77baf70d577199c6ca45a099595224cb551`.
This is an audit/preparation checkpoint, not launch approval.

## GitHub and deployment gate

- Audited the only branch workflow, `.github/workflows/growth-internal.yml` and its entrypoints. Push/PR/manual runs perform local unit/SQL/browser/build/security tests and offline synthetic research/CRM/report generation. No provider publish/send, hosted database mutation, deployment or billing commands. Pinned Actions, read-only contents permission, no persisted checkout credentials, no secret references, Ubuntu hosted runner and 25-minute timeout.
- GitHub API: no workflows on default `main`, no open PRs, no registered Actions workflows/runs for this branch. Cron (`15 1,9,17 * * *`, UTC) is **not running**: schedules require default-branch registration. Do not merge just to activate it.
- Actions permissions, Secret names and repository webhook inspection return HTTP 403 `Resource not accessible by integration`. Repository metadata reports push/admin capability, but that is not proof of endpoint authorization. Secret values were never requested. Actual Actions enablement, spending limits and inherited policies remain unverified. The workflow requires no application secrets.
- Remote branch remains `82821288dd3b19ecd93cd6a8469acfae2a8c14f4`; no CI runs returned. No push performed.
- Critical external integration: this remote commit created four Vercel Preview deployments (`stockwise-app`, `stockwise-app-1qz9`, `stockwise-app5535`, `y`). Eight Preview/Production environments have no GitHub environment protection rules. Such rules alone would not necessarily gate Git-provider deployments.
- Prepared root `vercel.json` branch-specific `git.deploymentEnabled=false` for `codex/managed-service-mvp`, preserving other branches and rewrites. Vercel documents this setting at https://vercel.com/docs/project-configuration/git-configuration . This is defense in depth, **not verified live**: no Vercel runtime credentials are available to inspect four projects' Root Directory or deployment overrides. The first push could still publish if a project does not consume this config. Therefore conditional push authorization has not been exercised.
- Human setup: in each of the four Vercel projects, inspect Settings → Git and Root Directory/build/deployment controls. Disable automatic deployments for this branch in every connected project or temporarily disconnect its Git integration, and verify no alternative webhook/deploy workflow runs on push. Do not disable production/main by accident. Then grant GitHub read access for Actions settings/secrets metadata and repository webhooks (or supply screenshots/settings evidence without secrets). Confirm Actions allowed/pinned Actions policy and hosted-runner budget. With these boundaries verified, push normally (never force), inspect check runs/deployment records, and only separately approve a default-branch scheduler rollout.
- Legacy Mac wrappers now run local `growth-cycle --dry-run`; installed Mac LaunchAgents/runners are not inspectable here. Human must inspect the installed job paths, versions, overlapping schedules and launchctl logs before treating old runners as safe/running. No Mac installation or rollout occurred.

## Buffer — configuration required

No `BUFFER_API_KEY`, `BUFFER_ORGANIZATION_ID`, `BUFFER_X_CHANNEL_ID`, `BUFFER_THREADS_CHANNEL_ID` or `BUFFER_LINKEDIN_CHANNEL_ID` is configured. Consequently no authenticated Buffer request or channel discovery was possible; channel IDs, scopes, plan capabilities and insights remain unverified. A ChatGPT Buffer connection does not provision Codex credentials, and no Buffer connector is available here.

Securely configure the API key in the Cloud Environment, never chat/source. Using the existing server adapter, first perform only `organizations()`; select the intended organization and configure its ID, then perform only `channels()`. Match returned service `twitter`, `threads`, `linkedin`, paused status and organization before storing channel IDs. The adapter uses Bearer authentication against Buffer's GraphQL API; verify the account's current API/channel/analytics entitlements in Buffer, without purchasing a plan or granting new scopes automatically. If granular access is offered, choose organization/channel/analytics read access for this phase; posting/scheduling must remain disabled. No post creation, schedule, channel authorization or permission grant was attempted. Fixture adapter tests are not evidence of a live connection.

## CRM proposal review and migration plan

`docs/proposals/APAC_GROWTH_CRM.sql` proposes seven NEW tables; it is outside `supabase/migrations` and was not applied. Compared with the three existing registered migrations/26-table foundation:

- Existing auth bootstrap, workspace membership, activation/events, consultation/qualification and outbound registry/review/runtime remain authoritative. CRM companies/contacts/campaigns do not replace them. Population classification is additional, not a rewrite of demo state.
- Six workspace tables require BOTH Growth Admin and workspace owner/admin for SELECT; ordinary owner alone is insufficient. Population classification is Growth-Admin-only. All seven enable and force RLS, revoke PUBLIC/anon access and grant authenticated SELECT only. No new browser DML or security-definer functions are supplied. Service role still bypasses RLS: FORCE does not make privileged server code safe by itself.
- Composite workspace foreign keys constrain cross-workspace associations. Unique workspace/domain, workspace/email, approval item/version, attempt identity and source event prevent specific duplicates. Canonical domain normalization (www/IDNA/trailing dots), validation and intentional company/contact merges need a reviewed API. NULL activity source IDs are not deduplicated by the unique constraint.
- **Blockers before application:** no authenticated transactional CRUD/approval/claim API; approval version/hash not constrained to the current payload; immutable actor-bound approval/audit enforcement missing; privileged role can rewrite history; provider claim/quota/suppression concurrency needs database transactions. Payload/details JSON requires allowlisted fields, bounded size and PII redaction. Do not treat client fixture guards as production DB enforcement.
- Contacts contain personal data. Define lawful purpose/country checks, consent evidence and withdrawal, least-privileged retention/export/deletion policy, restricted logs/backups and operator access review before importing real contacts. Public company evidence is not permission to contact individuals. No live contact import occurred.

### Application procedure — human approval required, not executed

1. Resolve the above API/audit/privacy issues in a separately reviewed proposal; approve exact SQL digest and target project ref. Do not apply the current draft as a finished CRM.
2. Verify PITR/backup availability and a tested restore in an isolated project; capture catalog, policies, grants, migration history and counts. Confirm none of the seven names exist. If any exist, stop and review drift; do not use blind IF NOT EXISTS.
3. Copy the approved SQL to a new unique timestamped migration only after approval; retain the three existing migrations unchanged. Rehearse on a disposable project with synthetic data and A/B/anonymous authorization tests, approval tamper checks and concurrent duplicate claims.
4. On the explicitly approved target, `supabase link --project-ref <approved-project-ref>`, `supabase migration list --linked`, `supabase db push --linked --dry-run`; review the exact pending set. Only after approval of that set run `supabase db push --linked`. Never use reset, repair, --include-all or destructive SQL to force alignment.
5. Re-inspect seven tables/grants/RLS/policies and existing 26-table regression; deny anonymous/customer/foreign-workspace reads and all unauthorized writes. Record migration digest/history/results; keep send/publish/production tracking disabled.

### Rollback procedure — no automatic destructive rollback

Disable the new CRM feature/jobs and retain tables/data by default (forward repair preferred). If the migration transaction fails before commit, PostgreSQL rolls it back; inspect migration history before retry. For a committed migration with records, retain/export securely and obtain a separately approved repair/restore plan: never drop data automatically. Only for an approved **empty disposable** target, verify all seven tables empty and no external dependencies; in a transaction remove new tables in dependency order: activity, attempts, approvals, campaign items, contacts, companies, population, without CASCADE. Abort on dependencies/nonempty data. This is a review plan, not an executable production rollback. Original foundation tables/functions/policies must remain untouched.

### Population separation

Existing operational Phase 2 data stays synthetic/browser-local. Tests use disposable PGlite/mock Auth and fixtures marked `environment=fixture`; no demo operations imported into Supabase. A real customer opening a demo is not automatically a test user. Production funnel aggregation must include only explicitly verified `real_customer` records from the production cohort; unknown/test/internal and development records are excluded. Classification schema/API and production read-only aggregates are still proposal/blockers, not running. Missing visitors/source/provider metrics remain **未取得**, never zero. Prior development KPI counts are not acquisition progress. Local SQL/funnel tests verify proposed isolation and cohort rules, not a live CRM deployment.

## Gmail — read-only verified, delivery blocked

With process-local `EMAIL_SEND_MODE=draft_only` and `NEXOPS_GMAIL_SEND_ENABLED=false`, ran `outbound-worker.mjs --verify-oauth`: `oauth_refresh_scopes_and_approved_sender_verified`, emails_sent=0, database_writes=0. OAuth refresh and existing approved sender/scope verification succeeded; no credentials logged and no new scopes granted. Existing implementation uses gmail.send plus gmail.metadata for identity verification; no mailbox reading was added.

Read-only configured-development REST check: database sending disabled; delivery-test marker populated; OAuth verification marker populated but approximately 140 hours old at audit. Successful read-only OAuth verification does NOT refresh this database marker. A separately authorized connection-verification operation would be needed to register the fresh sender/scopes marker; `--verify-connection` also registers templates/writes connection state, so it was deliberately not run. Do not enable sending just to refresh a marker. No consent/template/admin/reviewer/queue changes.

Reply/unsubscribe/bounce plan (not implemented):
- Replies: choose separately approved provider/webhook or Gmail read scope after security/privacy review. Current send/metadata permissions do not support reading reply bodies. Prefer minimal identifiers/stop intent, not retained mailbox content.
- Unsubscribe: signed expiring opaque token, no email in URLs, unauthenticated token verification with replay-safe idempotency, global and per-purpose suppression, immediate gate check before claim/send, minimal append-only evidence; token expiry must not prevent an alternative accessible opt-out.
- Bounces: authenticated provider events/signature/timestamp/replay verification, message/provider ID correlation and hard-bounce suppression. Gmail send acceptance is not delivery confirmation; mailbox bounce ingestion needs separate permissions. Never infer success after timeout or retry UNKNOWN_DELIVERY automatically.
- All inbound events need unique provider event IDs, actor/source audit, redacted logs, retention policy, cross-workspace isolation, retry/dead-letter handling and regression tests before activation. Country-specific legal/sender identity review remains required; do not infer consent from B2B/public addresses.

## Status

Implemented & Tested: branch deployment guard and safety regression; existing internal mock/CI architecture; CRM review and migration/rollback plan.
Configured & Running: only local tests/build and current read-only Gmail OAuth/development runtime check.
Awaiting Human Approval/Configuration: deployment integration verification before push; GitHub settings access; Buffer credentials/IDs/read entitlements; CRM API/privacy proposal; marker-writing verification and any future external operation.
Blocked / Not Implemented: remote CI/cron activation, live Buffer proof, applied CRM backend/population cohort, reply/unsubscribe/bounce integration and production launch.

No push, deployments, emails/DMs, SNS posts/schedules, billing, live schema/RLS changes or hosted writes performed.
