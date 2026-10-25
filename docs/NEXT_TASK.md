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
- Report: root cause/approach, files changed, tests/build, schema/RLS impact, deployment impact, and commit hash.

## Current task — First-time customer onboarding

Improve the first-time Stockwise/Nexops customer onboarding experience.

### Goal

A newly authenticated customer should understand the product and reach first value within roughly 30–60 seconds by:

1. opening the starter demo workspace,
2. viewing TODAY,
3. opening one exception,
4. reviewing the recommended next action.

Use the existing real demo UI and activation model. Do not create a long tutorial or fake product data.

### Existing foundation

- Starter bootstrap is reliable on confirmed first login.
- Customer-facing and internal admin/reviewer navigation are separated.
- Existing activation tracking includes:
  - `demo_opened_at`
  - `today_viewed_at`
  - `exception_opened_at`
  - `first_value_at`
  - `activated_at`
- The Get started page already displays activation progress.

### Requirements

1. **First authenticated entry**
   - Detect incomplete starter activation.
   - Show a concise customer-facing onboarding state.
   - Explain the product in one short business sentence focused on inventory, PO, and supplier exceptions leading to prioritized action.
   - Provide one primary CTA, preferably: **Start with today's risks**.

2. **Guided first-value path**
   - Guide the user through the four activation steps above.
   - Reuse the existing Product/TODAY/exception/recommended-action UI.
   - Avoid modal tours unless truly necessary.

3. **Progress**
   - Show simple progress such as `1 of 4 completed`.
   - Check off steps using existing activation data.
   - Persist progress across refresh/login through existing stored activation state.
   - Once activation is complete, stop forcing onboarding and show only a lightweight completed state.

4. **Existing customers**
   - Do not force onboarding for users whose activation is already complete.
   - Do not redirect users working in separate customer workspaces back into demo onboarding.
   - Keep Get started manually accessible.

5. **Failure states**
   - Preserve the existing blocking bootstrap recovery behavior.
   - If demo data cannot load, provide a clear retry path.
   - Do not invent operational results.

6. **Customer copy**
   - Keep copy concise and business-focused.
   - Do not expose implementation terms such as bootstrap, RPC, RLS, activation rows, UUIDs, or internal IDs.

7. **Mobile**
   - Ensure onboarding progress and the primary CTA work on mobile.

8. **Analytics**
   - Reuse the existing event model only.
   - Add no third-party tracking and no new personal-data collection.

9. **Do not change**
   - Gmail configuration or lifecycle sending.
   - Growth Admin / outbound-reviewer assignments.
   - Outbound queue contents.
   - Billing.
   - Schema/RLS unless a genuine defect makes it unavoidable.

### Regression coverage

Add tests for:
- brand-new user sees onboarding,
- primary CTA opens the demo/TODAY path,
- progress reflects activation state,
- partial progress survives refresh/login,
- completed users are not forced through onboarding,
- customer-workspace users are not redirected into demo onboarding,
- mobile flow works,
- demo-load failure offers recovery.

### Completion

Run relevant unit/browser tests and production build.

Do **not** deploy.

Update this file's **Status** section after implementation, then commit all implementation changes.

## Status

- State: READY
- Deployment: NOT REQUESTED
- Gmail changes: NOT ALLOWED FOR THIS TASK
