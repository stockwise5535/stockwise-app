# Stockwise Development — NEXT TASK

This file is the handoff contract between ChatGPT and Codex for the Stockwise/Nexops application.

## Working branch

`codex/managed-service-mvp`

## Execution rules

Codex should:
- Read this file before starting work.
- Implement only the current task below unless a required dependency is discovered.
- Preserve existing Supabase RLS and `auth.uid()` semantics.
- Never place service-role keys, Gmail secrets, OAuth tokens, or other secrets in browser code.
- Do not change Gmail sending state unless the task explicitly requires it.
- Do not deploy unless the task explicitly says to deploy.
- Run relevant regression tests and the production build before committing.
- Commit completed work to `codex/managed-service-mvp`.
- Report: findings/approach, files changed, tests/build, schema/RLS impact, deployment impact, and commit hash.

## Current task — Pre-production QA and release readiness

Perform a full pre-production readiness pass for the Stockwise/Nexops managed-service application.

### Goal

Determine whether the current `codex/managed-service-mvp` branch is safe and coherent enough to promote from Preview toward Production, without actually deploying it.

This is a verification-and-hardening task first. Fix only concrete defects discovered during QA.

### Scope to verify

1. **Authentication and starter context**
   - New signup / confirmed first login.
   - Existing user login.
   - Logout and login again.
   - Starter organization/workspace/membership/activation bootstrap remains idempotent.
   - Bootstrap failure/retry UX works.

2. **Customer onboarding**
   - Brand-new user sees the concise onboarding prompt.
   - “Start with today's risks” enters the real demo path.
   - TODAY → exception → recommended action progression works.
   - Activation progress persists.
   - Completed users are not forced through onboarding.
   - Separate customer workspaces are not redirected back into starter demo onboarding.

3. **Customer/internal UI separation**
   - Normal customers and workspace owners do not see internal admin tools.
   - Growth Admin sees Internal Growth Dashboard.
   - Assigned reviewer sees Outbound Review.
   - Direct URL access is blocked for unauthorized users.
   - Switching workspaces immediately re-evaluates internal access.

4. **Core demo/product UX**
   - Existing StockWise analytics remains reachable where intended.
   - Demo operations/TODAY/exception/recommended-action flows render without errors.
   - Customer workspace empty-state behavior is clear and does not imply customer data exists.
   - No accidental MIERUKA branding remains in customer-facing UI.

5. **Outbound/email safety — read-only verification only**
   - Verify current sender-test state remains confirmed.
   - Verify existing queued Welcome message remains intact.
   - Verify sending is still disabled:
     - `EMAIL_SEND_MODE=draft_only`
     - `NEXOPS_GMAIL_SEND_ENABLED=false`
     - database mail runtime disabled
   - Do not send any email.
   - Do not change templates, queues, consent, assignments, runtime flags, or OAuth state.

6. **Security and configuration**
   - No service-role/Gmail/OAuth secrets are exposed in browser bundles, tracked files, logs, or documentation.
   - Production build does not leak server-only environment variables.
   - Public client configuration uses only intended `VITE_` values.
   - Existing RLS/RPC boundaries remain intact.
   - No browser path can grant itself Growth Admin or reviewer access.

7. **Routing and release behavior**
   - Growth routes load directly on refresh.
   - Preview deep links work for:
     - `/growth`
     - `/growth?view=product`
     - `/growth?view=activation`
     - authorized internal views
   - Legacy root application still loads and logout remains reliable.
   - Check that Vercel routing configuration supports the routes intended for Production.

8. **Responsive/browser QA**
   - Desktop and mobile flows are usable.
   - No obvious overflow, unreachable CTA, broken nav, or blocking layout regressions.
   - Check loading, empty, error and retry states.

9. **Branding/copy consistency**
   - Product branding is consistently Stockwise/StockWise where appropriate.
   - Nexops managed-service branding is intentional where appropriate.
   - Remove stale accidental MIERUKA references if any remain in rendered customer UI.
   - Do not rename internal database objects merely for branding consistency.

### Testing

Run:
- full relevant unit suite,
- browser/regression suites,
- security-sensitive tests,
- production build.

Add or adjust tests only where coverage is missing for a concrete release risk.

### Deliverable

Create/update a concise release-readiness section in:
`docs/APAC_GROWTH_SYSTEM_REPORT.md`

It must include:
- PASS / BLOCKED recommendation for Production promotion,
- any release blockers,
- any non-blocking follow-ups,
- exact tests/build run,
- confirmation that no email was sent,
- confirmation that no deployment occurred.

If a concrete defect is found, fix it, test it, and include it in the report.

### Do not

- Do not deploy or promote to Production.
- Do not send email.
- Do not enable mail runtime.
- Do not change billing.
- Do not weaken RLS.
- Do not add new product features unrelated to release readiness.

## Status

- State: READY
- Deployment: NOT REQUESTED
- Gmail changes: READ-ONLY VERIFICATION ONLY
- Email sending: FORBIDDEN FOR THIS TASK
