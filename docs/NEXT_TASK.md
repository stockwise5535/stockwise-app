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

## Current task — Harden legacy checkout trust boundary

Fix the production blocker identified in release-readiness QA: legacy checkout currently trusts unauthenticated client-supplied account/plan details.

### Goal

Make checkout safe enough for production by ensuring billing identity, account context, plan/product selection, and price-sensitive values are validated server-side or otherwise derived from trusted configuration/session state.

Do not enable billing or deploy in this task.

### Requirements

1. Inspect the complete legacy checkout flow end-to-end:
   - browser entry point,
   - any API/serverless handler,
   - provider request construction,
   - account/user identifiers,
   - plan/product identifiers,
   - quantity/price-sensitive fields,
   - success/cancel return handling.

2. Identify every client-supplied value that is currently trusted for billing/account decisions.

3. Harden the trust boundary:
   - Require an authenticated user/session before creating a checkout session.
   - Derive the canonical user/account identity from the authenticated session/server-side data, not arbitrary browser parameters.
   - Allow only explicitly configured server-side plan/product/price mappings.
   - Reject unknown or tampered plan/product identifiers.
   - Never trust client-supplied price, currency, account ownership, entitlement, or billing metadata.
   - Bind any provider metadata to canonical server-side identifiers.
   - Keep secrets server-only.

4. Preserve existing application behavior where safe:
   - Do not silently activate billing.
   - If billing is intentionally disabled, keep it disabled and return a clear safe state.
   - Do not create real charges during tests.

5. Add defensive handling for:
   - unauthenticated requests,
   - malformed/tampered plan values,
   - missing server configuration,
   - mismatched account/user context,
   - replay/duplicate checkout creation where relevant.

6. Security review:
   - Confirm no billing secret or privileged key is exposed to the browser bundle.
   - Confirm the browser cannot choose arbitrary product/price IDs that the server accepts.
   - Confirm ordinary users cannot create checkout for another user's account/workspace.

7. Tests
   Add regression coverage for:
   - valid authenticated checkout request using trusted server-side mapping,
   - unauthenticated request rejected,
   - tampered plan/product rejected,
   - arbitrary client price/currency ignored or rejected,
   - cross-account/user attempt rejected,
   - billing-disabled configuration remains safe,
   - no real provider charge/network side effect in tests.

8. Run:
   - relevant unit/security tests,
   - browser regression tests for the legacy checkout entry point,
   - production build.

9. Documentation
   Update `docs/APAC_GROWTH_SYSTEM_REPORT.md` release-readiness section:
   - describe the fixed checkout trust boundary,
   - state whether this blocker is resolved,
   - keep Privacy/Terms draft status as a separate remaining blocker if still unresolved.

### Do not

- Do not deploy.
- Do not enable production billing.
- Do not create real charges.
- Do not change Gmail settings or send email.
- Do not change Supabase schema/RLS unless a concrete defect makes it strictly necessary.
- Do not change legal copy in this task.
- Do not weaken authentication or authorization.

## Status

- State: READY
- Deployment: NOT REQUESTED
- Billing activation: FORBIDDEN FOR THIS TASK
- Email sending: FORBIDDEN FOR THIS TASK
