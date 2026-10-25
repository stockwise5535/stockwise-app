# Stockwise / Nexops Roadmap

## Purpose

This roadmap turns the product strategy into an ordered development path toward a secure Production launch and eventual APAC scale.

Codex should use this document together with:
- `docs/PRODUCT_STRATEGY.md`
- `docs/NEXT_TASK.md`
- `docs/APAC_GROWTH_SYSTEM_REPORT.md`

`NEXT_TASK.md` always controls the immediate task. This roadmap controls priority after the current task is complete.

## Phase 0 — Foundation completed

Status: substantially complete.

- Managed-service operations demo
- Action tracking
- Customer decision
- Supplier monitoring
- Weekly reporting
- JP/EN support
- Mobile baseline
- Supabase growth foundation
- Signup/profile provisioning
- Starter organization/workspace bootstrap
- Workspace membership and activation
- Growth event foundation
- Consultation requests / qualification
- Invitations
- RLS and tenant isolation verification
- Gmail OAuth connection
- Sender self-test
- Outbound reviewer/admin gates
- Customer/internal UI separation
- First-value onboarding
- Legacy checkout trust-boundary hardening

## Phase 1 — Production blockers

Priority: immediate.

1. Replace placeholder Privacy Policy and Terms with product-accurate publishable-quality drafts.
2. Complete required human/legal placeholders.
3. Complete queued Welcome email delivery test after rate-limit window.
4. Re-run full release-readiness QA.
5. Resolve any BLOCKER/HIGH findings from independent review.
6. Human Preview acceptance.
7. Human approval before Production promotion.

No Production deploy is allowed automatically.

## Phase 2 — Growth instrumentation and funnel quality

After Production blockers are cleared:

- Verify full Visitor → Signup → Activation → First value → Consultation funnel instrumentation.
- Improve source/referral attribution without collecting unnecessary PII.
- Create repeatable activation/conversion reports.
- Identify and improve onboarding drop-off.
- Verify returning-user measurement.
- Add qualified-lead/pilot conversion visibility.
- Review SEO/APAC landing structure.

Success metric focus:
- activation rate
- first-value completion
- return rate
- consultation rate
- qualified opportunity rate

## Phase 3 — Operational reliability

- Improve monitoring and operator visibility.
- Strengthen queue/retry/idempotency behavior.
- Add pagination/large-list safety where needed.
- Add load/performance test harness against non-production data.
- Review RLS/query performance with realistic tenant volumes.
- Review audit-log growth.
- Improve failure recovery and support diagnostics.
- Add safe backup/recovery documentation where appropriate.

## Phase 4 — Email and lifecycle scale

Current Gmail remains low-volume/pilot only.

- Validate lifecycle communication usefulness.
- Keep consent/suppression/reviewer safety model.
- Evaluate dedicated transactional provider when volume warrants it.
- Add bounce/complaint/webhook handling before higher-volume sending.
- Add deliverability monitoring.
- Never treat Gmail as a bulk 10,000-user campaign system.

## Phase 5 — APAC expansion

- Maintain English-first + Japanese support.
- Review locale/timezone architecture.
- Add country/market pages where useful.
- Avoid embedding country-specific assumptions into core workflows.
- Review regulatory/legal requirements per target market before launch in that market.
- Add market-specific configuration only when justified.

## Phase 6 — 1,000–10,000 user readiness

Introduce evidence-based scale work:

- load testing
- concurrency testing
- queue contention testing
- pagination and query plans
- RLS performance
- background processing strategy
- observability
- cost monitoring
- incident response basics
- transactional email provider scale
- operator workload automation

Do not claim this phase complete based only on unit tests.

## AI development workflow

### Codex — Primary Implementer

Responsibilities:
- implement current `NEXT_TASK.md`
- add/adjust tests
- run unit/browser/security/build validation
- update reports
- commit safe work
- fix BLOCKER/HIGH findings from reviewer

### Claude Code — Independent Reviewer

Initial mode: read-only.

Responsibilities:
- review latest Codex commit/PR
- security and authorization review
- RLS/tenant isolation review
- checkout/email/billing trust-boundary review
- regression and edge-case review
- test-coverage gaps
- architecture/maintainability review
- issue severity: BLOCKER/HIGH/MEDIUM/LOW/PASS

Claude should not directly modify the primary branch initially.

### GitHub Actions — Automation target

Planned responsibilities:
- test/build on PR
- defined security checks
- scheduled/nightly regression checks
- documentation consistency checks
- review evidence recording

Night automation should start with safe tasks only.

### Human — Release Control

Explicit approval required for:
- Production promotion
- real external email sending
- billing activation/real charges/refunds
- schema/RLS changes
- secrets/OAuth changes
- destructive customer-data operations
- irreversible production changes

## Overnight automation target

Long-term unattended loop:

schedule/trigger
→ select one safe task
→ Codex implementation
→ tests/build
→ Claude read-only review
→ BLOCKER/HIGH returned to Codex
→ fixes and re-test
→ PR/report ready by morning

If a task crosses a human-approval boundary, the loop must stop and wait.

This workflow is a target architecture, not proof that unattended automation is currently installed.

## Current priority

The immediate task remains whatever is written in `docs/NEXT_TASK.md`.
