# NEXT_TASK — Stockwise / NexOps

Current local integration: codex/integrate-social-autopilot-main, based on main
69e5474, selectively incorporating f797b10. See docs/MAIN_SOCIAL_INTEGRATION.md.

## Completed locally

Protected legacy application/Auth/API/Stripe/CRM files remain byte-identical.
Additive /growth admin dashboard + SNS reader/automatic cycle integrated.
52 Unit/Security tests, 8 local SQL tests, 3 browser suites and Build passed.
Publishing OFF, cron absent. SQL proposals unapplied; no remote writes.

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
