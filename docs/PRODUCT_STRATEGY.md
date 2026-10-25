# Stockwise / Nexops Product Strategy

## 1. North-star goal

Build Stockwise / Nexops into a secure, scalable managed supply-chain operations platform that can grow toward **up to 10,000 users across APAC** while preserving customer trust, operational value, security, and manageable operating cost.

The 10,000-user figure is a **product, growth, architecture, and operations readiness target**, not a guaranteed business forecast.

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

## 9. Email strategy

Current Gmail integration is for low-volume pilot/lifecycle communication.

Current safety model includes:
- draft-only default
- server send flag disabled by default
- database runtime disabled by default
- reviewed sender test
- consent/suppression checks
- duplicate prevention
- rate limits
- delivery reconciliation
- human review for sensitive content

Gmail is **not** the long-term bulk delivery system for 10,000 users.

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

They must STOP and request explicit human approval before:
- Production deployment or promotion
- real customer/supplier email sending
- enabling Gmail production sending
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
