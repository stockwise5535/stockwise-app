# Stockwise Development — NEXT TASK

This file is the handoff contract between ChatGPT and Codex for the Stockwise/Nexops application.

## Working branch

`codex/managed-service-mvp`

## Execution rules

Before starting any task, Codex must read:
- `docs/PRODUCT_STRATEGY.md`
- `docs/ROADMAP.md`
- this `docs/NEXT_TASK.md`
- the latest relevant section of `docs/APAC_GROWTH_SYSTEM_REPORT.md`

The documents have different roles:
- `PRODUCT_STRATEGY.md` = long-term product, APAC growth, 10,000-user, safety, and operating goals.
- `ROADMAP.md` = ordered development priorities and phased path.
- `NEXT_TASK.md` = the immediate approved task and scope.
- `APAC_GROWTH_SYSTEM_REPORT.md` = verified current state, evidence, blockers, and test results.

If these documents conflict, STOP and report the conflict rather than guessing. The immediate task must remain consistent with the product strategy and roadmap.

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

## Current task — Prepare production-ready Privacy Policy and Terms drafts

Replace the current placeholder/draft legal pages with accurate product-specific drafts for Stockwise / Nexops, based strictly on the application’s actual behavior and current implementation.

This is a product/legal-document hardening task, not a legal-certification task.

### Goal

Produce clear, publishable-quality Privacy Policy and Terms of Service drafts that accurately describe the current Stockwise/Nexops service and remove the current release blocker caused by placeholder legal copy.

The documents must remain explicitly suitable for later professional legal review. Do not claim legal compliance or certification that has not been verified.

### Product facts to reflect accurately

Use the repository and current implementation as the source of truth.

At minimum verify and reflect, where applicable:
- Stockwise is the customer-facing product.
- Nexops is the managed-service/operator context.
- The service includes demo/synthetic operational data and separate customer workspaces.
- Customer operational data must not be implied to exist before import/connection.
- Supabase is used for authentication/database infrastructure.
- Gmail/OAuth infrastructure exists for permitted lifecycle communications.
- Optional product analytics requires consent.
- Marketing/optional reminder preferences can be changed by the user.
- Transactional/service communications may be distinct from optional marketing reminders.
- Users may request account/data deletion, with the current implementation using an administrative workflow.
- The service currently offers a free 30-day access period and no payment wall is enabled in the current managed-service flow.
- Billing/checkout code exists but production billing remains disabled unless explicitly activated later.
- Consultations are requests only; submitting a request does not guarantee or confirm an appointment, scope, engagement, result, or commercial commitment.
- Managed-service recommendations are decision-support and do not automatically change purchase orders, suppliers, contractual terms, payments, or other external systems.
- Internal human review and authorization gates exist for sensitive outbound actions.
- The service is not represented as guaranteeing inventory, supply-chain, financial, operational, or commercial outcomes.

### Privacy Policy requirements

Draft a clear Privacy Policy that covers, as supported by the actual implementation:

1. Information collected
   - account/authentication information
   - profile/workspace information
   - operational/customer data when intentionally provided
   - consultation form information
   - product usage/event information
   - optional analytics consent
   - communication preferences
   - technical/security logs where supported

2. How information is used
   - provide and secure the service
   - operate workspaces/demo
   - support managed-service operations
   - respond to consultation requests
   - permitted lifecycle/service communications
   - optional analytics/product improvement where consented
   - security, abuse prevention and auditing

3. Data separation
   - synthetic demo data vs customer-provided data
   - workspace/organization access controls

4. Service providers/processors actually used or clearly supported by implementation
   - Supabase
   - Google/Gmail for authorized email sending
   - Vercel if the deployed architecture uses it
   - Do not invent vendors.

5. Email/communications
   - distinguish transactional/service communications from optional marketing/reminder communications where appropriate
   - explain communication preference controls
   - do not promise instant recall of already in-flight messages

6. Retention/deletion
   - describe the current deletion-request workflow accurately
   - do not promise immediate or automatic deletion if the implementation is manual

7. Security
   - describe reasonable technical/organizational safeguards at a high level
   - do not claim absolute security

8. International use/data processing
   - use conservative language suitable for a US-operated cloud service with APAC ambitions
   - do not invent specific legal mechanisms or certifications not implemented/verified

9. Children
   - if the product is not intended for children, state that conservatively without inventing age-verification controls not present

10. Policy changes/contact
   - provide configurable placeholders only where repository/config lacks a verified legal entity name/address/contact
   - clearly identify any remaining placeholders for human completion

### Terms of Service requirements

Draft Terms covering:

1. Service description
   - Stockwise software + Nexops managed-service context
   - demo, workspace, decision-support, consultation functionality

2. Account responsibilities
   - accurate account information
   - credential/security responsibility
   - authorized use only

3. Acceptable use
   - no abuse, unauthorized access, interference, unlawful use, credential sharing or attempts to bypass security controls

4. Customer data
   - customer retains responsibility/rights for data they provide
   - customer represents they are authorized to provide/use such data
   - service may process it only to provide/support the service as described
   - do not invent broad ownership claims over customer data

5. Demo/synthetic data
   - demo content is illustrative and not customer operational truth

6. Decision-support disclaimer
   - recommendations require human judgment
   - no automatic authority to modify POs, suppliers, payments, contracts or external systems
   - no guarantee of operational/business results

7. Consultation/managed service
   - requests do not guarantee engagement, appointment, scope, service level or result
   - separate commercial agreements may be required for paid managed services

8. Free access/trial
   - describe the current 30-day free access accurately
   - no credit card/payment wall in the current flow
   - do not promise permanent free access

9. Billing
   - because production billing is currently disabled, do not falsely present active paid checkout terms
   - allow for future paid services subject to clearly disclosed terms/pricing and separate activation

10. Intellectual property
   - reasonable product/software ownership language
   - customer retains ownership of customer-provided data/content

11. Service availability/change
   - no promise of uninterrupted availability
   - permit reasonable service updates/changes

12. Warranty/disclaimer/limitation language
   - keep conservative and readable
   - do not invent jurisdiction-specific clauses beyond what can responsibly be drafted without verified legal-entity/jurisdiction facts
   - clearly mark provisions requiring professional legal review

13. Suspension/termination
   - misuse/security reasons
   - user-requested deletion/account closure
   - do not claim automated deletion if it is manual

14. Governing law / legal entity / contact
   - do not guess.
   - If not verified in repository/config, use a clearly marked human-completion placeholder and list it in the final report as a release/legal follow-up.

### UX and implementation

- Replace placeholder legal-page copy in the actual application routes/components.
- Keep pages readable on desktop and mobile.
- Include an effective-date placeholder or generated date only if appropriate and clearly managed.
- Preserve working links from signup/account/footer.
- Do not add consent checkboxes or acceptance flows unless already required by the current product behavior.
- Do not make legal acceptance a new authentication blocker in this task.

### Verification

1. Search rendered customer-facing UI for stale legal placeholder/draft language.
2. Verify Privacy and Terms routes load directly and from existing footer/account links.
3. Verify mobile readability.
4. Verify no secrets/internal IDs/debug text appear in the legal pages.
5. Run relevant tests, browser regressions and production build.

### Documentation

Update `docs/APAC_GROWTH_SYSTEM_REPORT.md` with:
- what legal drafts were replaced,
- exact remaining human/legal-review placeholders,
- whether the previous Privacy/Terms placeholder blocker is resolved from a product-readiness perspective,
- a clear statement that professional legal review is still recommended before public Production launch.

### Do not

- Do not claim attorney review or legal compliance certification.
- Do not invent company legal name, registered address, governing jurisdiction, DPO, regulator registrations, certifications, subprocessors or contractual commitments.
- Do not deploy.
- Do not enable billing.
- Do not send email.
- Do not change Gmail configuration.
- Do not change Supabase schema/RLS.
- Do not add unrelated product features.

## Status

- State: COMPLETE — product-specific Privacy/Terms drafts implemented; publication details and professional review remain human follow-ups
- Completed: 2026-10-25
- Validation: 106 unit/security tests, 17 SQL tests, legal/public/Growth/release browser regressions and production build passed.
- Product-readiness result: obsolete placeholder-copy blocker resolved; public launch still requires the seven publication settings and professional review documented in docs/APAC_GROWTH_SYSTEM_REPORT.md.
- Deployment: NOT REQUESTED
- Billing activation: FORBIDDEN FOR THIS TASK
- Email sending: FORBIDDEN FOR THIS TASK
- Legal certification: NOT CLAIMED; PROFESSIONAL REVIEW STILL REQUIRED
