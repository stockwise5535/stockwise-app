# Stockwise / Nexops Product Strategy

## 1. North-star goal

Build Stockwise / Nexops into a secure, scalable managed supply-chain operations platform with an explicit initial growth objective of reaching **10,000 users across APAC within one month of the growth launch**, while preserving customer trust, operational value, security, and manageable operating cost.

The 10,000-user-in-one-month objective is an **aggressive growth target and operating goal**, not a guaranteed forecast. Product, growth, infrastructure, onboarding, analytics, and operations should be designed so that this target can be pursued and measured without weakening safety or data isolation.

The platform should help APAC companies identify supply-chain exceptions, prioritize them, review recommended actions, and move safely from insight to human-approved action.

## 2. Product identity

- **Stockwise / StockWise**: customer-facing product.
- **Nexops**: managed-service / operator context.
- Legacy accidental **MIERUKA** branding must not appear in customer-facing UI.
- Internal database/object names do not need renaming solely for branding.

## 3. Core service model

Customer or demo data flows into the platform, which supports:

- Inventory monitoring
- Purchase Order monitoring
- Supplier Operations
- Exception detection
- Prioritization
- Recommended actions
- Human decisions
- Action tracking
- Supplier monitoring
- Weekly/reporting workflows

Project Operations may be added later, but current development should prioritize Inventory + PO + Supplier Operations.

The product is decision support. It must not automatically modify purchase orders, suppliers, payment terms, contracts, refunds, compensation, or other external commitments without explicit human authorization.

## 4. Growth model

### 30-day APAC growth objective

The initial growth sprint target is **10,000 users in APAC within 30 days**.

This target should shape launch planning, funnel instrumentation, acquisition experiments, onboarding capacity, operational support, and scalability checks.

The team should track daily progress toward this objective and distinguish:
- visitors,
- signups,
- activated users,
- retained/returning users,
- consultation requests,
- qualified managed-service opportunities.

10,000 registered accounts alone is not sufficient evidence of success if activation and retention are weak.


The primary growth funnel is:

Visitor
→ Signup
→ Demo activation
→ First value
→ Return usage
→ Consultation request
→ Qualified lead
→ Pilot / Managed Service

Important measurements include:

- Visitors
- Signup starts
- Registered users
- Activated users
- First-value completion rate
- Returning users
- Consultation requests
- Qualified companies
- Pilot candidates
- Workspace invitations
- Lifecycle communication performance
- Customer workspace adoption

Growth should optimize not only account count, but especially:

- Activated users
- Retained users
- Qualified managed-service opportunities

## 5. APAC readiness

The platform is designed for APAC growth.

Design principles:

- English-first usability.
- Maintain Japanese support.
- Workspace-level market and locale.
- Avoid country-specific assumptions in core logic.
- Do not block future timezone, currency, locale, or regional-policy extensions.
- Do not claim compliance with any jurisdiction unless specifically verified.

## 6. 10,000-user architecture principle

Every meaningful feature should be evaluated not only for a handful of users, but for whether its architecture remains reasonable at roughly 1,000–10,000 users.

Key areas:

- Supabase query scalability
- RLS performance
- Workspace/organization isolation
- Indexing
- Pagination
- Large-list rendering
- Queue processing
- Idempotency
- Retry behavior
- Concurrency
- Rate limits
- Audit-log growth
- Background work
- Monitoring
- Error visibility
- Cost efficiency

Do not prematurely optimize without evidence. Prefer measurable bottlenecks and incremental scaling.

## 7. Acquisition, activation, retention, conversion

### Acquisition

Support the ability to grow through:
- SEO landing pages
- APAC market pages
- referral/invitation
- consultation CTA
- campaign attribution
- source tracking
- approved automated lifecycle email
- automated X publishing through Buffer
- automated Threads publishing through Buffer

### Activation

Target first value within roughly 30–60 seconds:

Demo workspace
→ TODAY
→ Exception
→ Recommended action

### Retention

Measure:
- return visits
- workspace reuse
- activation completion
- operational-action usage
- consultation progression

### Conversion

Track:
Product usage
→ Consultation
→ Qualified Lead
→ Pilot Candidate

## 8. Analytics principles

Use structured product events for decision-making.

Rules:
- Do not collect unnecessary personal data.
- Respect optional analytics consent.
- Do not repurpose customer operational data for marketing analytics without explicit authorization.
- Adding a third-party analytics provider requires explicit approval.
- Do not fabricate metrics or claim instrumentation that is not implemented.

## 9. Email and social publishing strategy

Current Gmail integration is for low-volume pilot/lifecycle communication.

The approved V3 operating target is to allow **unattended real sending** for a narrow allowlist of low-risk lifecycle messages after configuration and controlled live verification.

Eligible automated email categories:
- Welcome
- Activation reminder
- CSV reminder
- Consultation confirmation
- Consultation reminder
- User-requested follow-up
- Weekly summary
- Workspace invitation

Automated email must still enforce:
- consent and communication preferences where applicable
- suppression/unsubscribe state
- duplicate prevention and idempotency
- recipient and sender rate limits
- provider delivery reconciliation
- unknown-delivery no-auto-retry behavior
- approved template/version checks
- audit logging

The following remain human-review or blocked:
- legal commitments or legal advice
- financial commitments
- contracts or commercial commitments
- refunds or compensation
- purchase-order changes
- supplier changes
- payment or banking instructions
- liability admissions
- sensitive/private customer-specific content
- unsupported claims
- ambiguous or low-confidence AI-generated content

Gmail is **not** the long-term bulk delivery system for 10,000 users.

### Social publishing

Buffer is the social publishing hub for V3.

Initial unattended auto-publish channels:
- X
- Threads

Rules:
- Buffer API credentials remain server/local-secret only and never enter browser code or tracked files.
- Channel IDs are discovered from the authenticated Buffer account and stored as configuration, not guessed.
- Auto-publish is limited to pre-approved public content categories related to Stockwise/Nexops growth, product education, product updates, supply-chain education, and approved calls to action.
- Do not auto-publish legal, financial, contractual, confidential, customer-specific, deceptive, or unsupported claims.
- Maintain per-network formatting rather than blindly duplicating the same copy.
- Log provider post IDs, channel, scheduled/sent state, content hash, and errors.
- Prevent duplicate posts through idempotency/content hashing.
- Never expose Buffer credentials in logs or commits.

At higher scale, evaluate a dedicated transactional/lifecycle provider with:
- bounce handling
- complaint handling
- unsubscribe handling
- sender-reputation monitoring
- provider webhooks
- delivery reconciliation
- production-grade throughput

Preserve the existing consent, suppression, review, idempotency, and audit principles when changing providers.

## 10. Operational scalability

Avoid designs that require human manual work for every routine customer event.

Automation candidates:
- account provisioning
- workspace provisioning
- activation tracking
- lifecycle draft generation
- qualification scoring
- internal alerts
- weekly summaries
- safe monitoring
- test/build/review automation

Maintain human-in-the-loop for:
- legal commitments
- financial commitments
- supplier changes
- PO changes
- contractual decisions
- refunds/compensation
- sensitive communications
- ambiguous AI recommendations

## 11. Product development priority

Prioritize work in this order unless a specific production blocker overrides it:

1. Security and data isolation
2. First-value activation
3. Reliability
4. Customer usability
5. Growth measurement
6. Conversion
7. Operational scalability
8. APAC expansion
9. Cost efficiency
10. Additional features

Prefer improving a real funnel bottleneck over adding unrelated features.

## 12. Release dimensions

Production readiness and growth readiness are separate.

Whenever practical, release reports should distinguish:

- Security readiness
- Product readiness
- Operational readiness
- Growth readiness
- 10,000-user scalability readiness

A Production PASS does not automatically imply 10,000-user readiness.

## 13. Human approval boundaries

AI agents may autonomously perform safe development work such as:
- UI/UX improvements
- tests
- bug fixes
- error handling
- security hardening
- documentation
- refactoring
- QA
- release-readiness checks

They may autonomously send/publish only within the explicitly approved outbound allowlists above once the relevant provider configuration has passed controlled live verification.

They must STOP and request explicit human approval before:
- Production deployment or promotion
- any email outside the approved low-risk lifecycle allowlist
- any social content outside the approved public-content allowlist
- enabling billing or creating real charges
- refunds/compensation
- Supabase schema changes
- RLS changes
- OAuth or secret changes
- customer/user data deletion
- irreversible production changes
- scope expansion beyond approved Stockwise/Nexops strategy

## 14. Long-term operating model

Target operating model:

- **Codex**: primary implementer
- **Claude Code**: independent reviewer / security red team
- **GitHub Actions**: reproducible tests, builds, scheduled checks
- **Human**: release authority and high-risk approval

The long-term goal is to allow safe development and review work to continue during unattended periods, including overnight, while hard-stopping on high-risk actions.

This unattended mode is a design target. It must not be represented as configured until the automation is actually installed and verified.
