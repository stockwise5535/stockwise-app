# NEXT_TASK — Stockwise / NexOps

Current local integration: codex/integrate-social-autopilot-main, based on main
69e5474, selectively incorporating f797b10. See docs/MAIN_SOCIAL_INTEGRATION.md.

## Completed locally

Protected legacy application/Auth/API/Stripe/CRM files remain byte-identical.
Additive /growth admin dashboard + SNS reader/automatic cycle integrated.
52 Unit/Security tests, 8 local SQL tests, 3 browser suites and Build passed.
Publishing OFF, cron absent. SQL proposals unapplied; no remote writes.

## Next task

Perform authorized read-only release preflight on the verified production project:
stockwise-app-1qz9 and its actual Supabase project. Inspect existing NexOps schema,
RLS/functions and the intended administrator/org/workspace; confirm Vercel root,
Node/runtime limits and env variable registration without displaying secret values.
Choose reuse vs optional minimal foundation vs separately reviewed partial-schema
migration. Do not install the development branch's full mail/CRM/operations schema.

Approval remains required for any integration/main push, hosted SQL/data/role
provisioning, production deployment, scheduler activation, automatic publishing ON
or actual Buffer write. Keep NEXOPS_SOCIAL_WRITES_ALLOWED=false and emergency
stop=true at initial release. Do not use the local Vercel link (project y) to deploy
the actual 1qz9 production project. No credentials are requested in chat.
