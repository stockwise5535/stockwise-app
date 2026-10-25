# Gmail automatic sending — gated implementation

The user's later Gmail authorization permits automatic lifecycle mail **only after configured/tested OAuth and the specified safeguards**. It does not authorize mass cold email or bypass hosted database checks. Current status: code implemented locally; hosted Supabase and Gmail remain unconnected; no real email has been sent; no scheduler or production deployment has been installed.

## Pipeline and scope
Existing lifecycle draft → versioned template → verified bounded fields → pre-send classification → current consent/suppression → atomic idempotency/rate reservation → Gmail → protected delivery history.

The existing lifecycle copy is reused from `services/growth-integrations.js`. The original draft-only Gmail adapter is retained. New delivery is a separate server-only adapter and dispatcher in `services/outbound-safety.js`, backed by `services/outbound-store.js`. No OAuth secret or send method is imported into the browser. The transport interface (`verifyConnection`, `send`) permits a future dedicated transactional/lifecycle provider without replacing the policy/queue; no such provider is currently connected.

Initial lifecycle templates: welcome, activation reminder, CSV reminder, consultation reminder and pilot follow-up, plus a dedicated self-addressed sender_test template. Pilot follow-up and every sender self-test always require individual human review. New template versions start as drafts; source code is **not** implicit business approval. Each registry entry has template_id, category, subject/body, allowed_variables, automatic_send_allowed, requires_consent, requires_human_review, version, approved_date and status. The database stores the exact code-version hash and explicit administrator approval. Re-registering a matching version preserves its approval; changing content under that version is rejected. Retired templates cannot send.

The only initial dynamic field is an owner-verified HTTPS site origin. Recipient names, customer results, dates and operational claims are not invented. Additional personalization requires a typed, verified source and a reviewed new template version. Free-form or edited messages never become automatically safe merely because a keyword list found nothing. No AI provider is connected; an optional classifier can only make the outcome stricter. Uncertainty becomes human review.

## Safety outcomes
- **AUTO_SEND_ALLOWED:** exact approved/current template, verified bounded variables, canonical confirmed registered recipient, current permitted communication and no risk flags. Automatic delivery additionally requires completed sender testing, both enable gates and a successful database reservation.
- **HUMAN_REVIEW_REQUIRED:** unknown/edited/free-form content; unverified variables or stale/unsupported free-access claims; legal liability, compensation, financial/contract/supplier commitments, guarantees, unsupported results, sensitive personal data, unclear language, or optional-classifier uncertainty. Human approval is bound to the exact subject/body/recipient hash and rechecked against current reviewer permissions.
- **BLOCKED:** explicit abuse/illegal-content signal, invalid envelope/header injection, retired template, suppression/deletion/category opt-out, absent required consent, recipient mismatch, duplicate/held state, disabled provider, unverified sender or denied rate reservation. A human approval cannot override a current hard block; edits must pass the classifier again.

The deterministic rules are conservative guardrails, **not** a comprehensive legal classifier or compliance certification. Exact-template matching is the boundary for automatic copy. Qualified reviewers remain responsible for legal/commercial decisions on manually approved content. No template issues instructions changing PO quantity, supplier, payment, freight cost or contractual terms automatically.

## Recipients, consent and suppression
The first implementation intentionally supports only canonical, email-confirmed registered users with a membership in the source workspace. It does not automatically email unregistered leads, inferred business contacts or supplier lists. Explicit requests/other legitimate contacts can be supported later through a reviewed identity/permission model; they are not silently treated as registered recipients.

Welcome is transactional, and its free-access claim is checked against current trial state. Marketing reminders require current opt-in and include the account/preference URL. Category/global suppression, known invalid addresses, deletion requests and removed membership block delivery. SQL rechecks these immediately at reservation, including changes after the initial classifier read. No browser-provided permission flag is trusted. There is no claim that an in-flight provider request can be recalled after a concurrent opt-out; the database/provider boundary is not a distributed transaction.

`nexops_email_suppressions` holds per-email/category or global suppression and is server-only. Existing `/growth?view=account` preferences remain the opt-out route. The existing cohort scheduler still creates only lifecycle drafts; the new producer consumes at most ten eligible drafts at a time and generates stable one-time lifecycle idempotency keys. It does not re-enroll product users or prepare unsolicited contacts.

## Queue and human review
Route: `/growth?view=communications` (authenticated).

The queue shows recipient, workspace, category, subject/body, reasons/flags, source event, related action/exception/consultation, creation/proposed time, status, provider reference and history. Owners/admins can read their workspace queue. Only an **explicitly assigned outbound reviewer** can act; workspace ownership alone does not grant send-review authority.

Actions: Approve and Send; Edit and Send; Reject; Cancel; Save as Draft. A review reason is required. Approve queues the exact unchanged snapshot. Edited text requires Edit and Send; Save as Draft retains edits without authorizing delivery. All decisions are append-logged with canonical actor, timestamp and hashes; reviewed bodies are retained in the protected review history. A button response is not a delivery receipt.

Sent/sending/delivery_unknown entries cannot be requeued from this UI. Review permissions, content hashes, source-workspace references, current template status, consent and quotas are rechecked server-side. Ordinary authenticated clients cannot enqueue, claim, complete, assign reviewers, edit suppressions, alter runtime state directly or grant themselves global template approval.

## Sender and delivery verification gates
1. Server OAuth refresh must return verified Gmail send grants plus profile-read grants. The worker checks the returned scope metadata; unknown grants fail closed. Recommended narrow grants for this implementation: gmail.send and gmail.metadata. OAuth tokens stay in server memory/secret storage.
2. A read-only Gmail profile request must match the exact configured sender account. Its verified timestamp is stored through a service-only RPC; changing the sender requires administrative review. Each dispatcher run refreshes identity verification; SQL requires verification within 24 hours.
3. A global template/mail administrator explicitly enables the database runtime. The server environment must independently have `NEXOPS_GMAIL_SEND_ENABLED=true`. Both default to disabled/unset. Neither is enabled by migration, connection verification or preparation.
4. Before automatic external lifecycle delivery, a message with source_event `sender_connection_test`, addressed to the sender's own confirmed Supabase account, must be individually reviewed and sent. Until this succeeds, SQL permits only this self-addressed human-reviewed test. The sender-account owner/global administrator must confirm the provider-accepted test via `nexops_confirm_mail_test`; it checks the sent ledger, provider reference, exact reviewed hash and sender/recipient identity. The UI exposes confirmation in the internal template section. This confirmation itself is logged.
5. Every subsequent dispatch still runs all content, permission and rate gates. A successful Gmail API response means provider acceptance, **not** verified inbox delivery or a guarantee against later bounces.

Current OAuth, sender address and credentials are absent. `--verify-connection` exits before network access. Local positive send tests use a stub transport, and database delivery-test fixtures are explicitly simulated. No live OAuth/send test is claimed.

## Duplicate and rate protections
Idempotency key: workspace + canonical user + source event + template/version + stable campaign/date window. One-time lifecycle drafts use `once`; no arbitrary daily resend loop exists. The database serializes enqueue and send reservations, enforces a unique workspace/key, rejects different content under a reused key, and binds completion to an unguessable claim token.

Default hard caps: **10 attempts/hour, 50/day per sender system, and one attempt per recipient per 24 hours**, including human-approved mail. Database constraints prevent raising these caps silently. Sending/sent/unknown claims consume the quota. An advisory lock makes reservations atomic across workers. A future transactional provider needs separately reviewed limits; Gmail bulk sending is not enabled. These pilot caps are not a delivery plan for 10,000-user campaign email; a separately reviewed transactional provider/deliverability plan would be needed at that scale.

Gmail has no documented transactional idempotency guarantee. Message-ID is deterministic for reconciliation, not a promise of provider deduplication. Timeouts, malformed responses, failed outcome logging or worker crashes after reservation can leave delivery_unknown or sending. These are never automatically retried or requeued. A known provider reference is retained when available. An operator must inspect provider state and reconcile the protected ledger before any separately authorized new attempt. The design trades possible missed mail for duplicate prevention; it does not claim exactly-once delivery.

## Hosted migration and manual configuration
New candidate: `supabase/migrations/202610240003_outbound_safety.sql`. It adds six RLS-protected tables and constrained RPCs, with no provider call, email, cron, destructive DDL or change to existing RLS. Do not apply it blindly. Follow HOSTED_SUPABASE_VERIFICATION.md to identify the real development project, inspect history/catalog and apply only missing migrations in order. All hosted application status remains unknown because public settings and administrative access are still absent.

Server configuration (secure environment settings/vault; never chat values or VITE_ secrets):
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: selected development project only; service key stays server-side.
- NEXOPS_DEV_PROJECT_REF: independently confirmed development reference; the worker rejects a mismatched URL.
- GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN: owner-controlled OAuth client/grant.
- GMAIL_SENDER_EMAIL: dedicated Nexops sender; must match Google's profile.
- VITE_PUBLIC_SITE_URL: approved public origin, needed for message generation, not OAuth verification.
- NEXOPS_GMAIL_SEND_ENABLED: leave absent/false until the reviewed self-test procedure is ready.

Google setup: enable Gmail API in the owner-controlled Cloud project, configure consent/approved server redirect and a reviewed OAuth flow with state/PKCE, and obtain the dedicated account's offline grant for gmail.send + gmail.metadata. The browser OAuth callback/vault integration is **not deployed or implemented by this task**; an existing reviewed server OAuth broker may securely provide the refresh token. No OAuth tokens belong in client code. Token response scopes must verify the required grants, or the worker refuses to continue. Required future server destinations are oauth2.googleapis.com and gmail.googleapis.com, plus the exact development Supabase hostname; preserve other egress rules when configuring them.

After migrations and secure settings are available:
```bash
# Read-only provider identity check + server-side verification record/template registration.
# It does not enable sending or send mail.
node scripts/outbound-worker.mjs --verify-connection

# Prepare up to ten EXISTING eligible lifecycle drafts; never sends.
# Create cohort drafts only via the existing trusted scheduler with an explicit campaign cutoff.
node scripts/outbound-worker.mjs --prepare-lifecycle
```

An owner-controlled database administrator must explicitly assign the intended template/mail administrator through the existing nexops_growth_admins table and the intended workspace reviewer through nexops_outbound_reviewers (the user must already be a workspace member). Never grant direct client writes to these tables or disable RLS. Review/approve exact registry versions in the UI.

For the first self-test, prepare the dedicated template after OAuth identity verification. The sender must already have a confirmed Supabase account and starter workspace. This command resolves those IDs server-side and creates only a queued review record, never an email:
```bash
node scripts/outbound-worker.mjs --prepare-self-test
```
The server chooses the canonical sender account; there is no arbitrary external test-recipient argument. The generic `store.enqueue` API also resolves canonical addresses from Auth. With explicitly enabled runtime/server flag, an assigned reviewer can queue that self-addressed test, and the worker handles that single message:
```bash
node scripts/outbound-worker.mjs --message <reviewed-message-uuid>
```
The sender-account administrator confirms the received/provider-accepted self-test in the queue's template section. Only then can exact approved lifecycle templates take the automatic path. No bulk loop or active schedule is installed. A future scheduler must call the same dispatcher and may not bypass the claim ledger. Disabling the database runtime or removing the server enable flag stops new claims; it cannot recall requests already in flight.

## Validation and current limits
- Nine new service/unit tests: exact matching, flags, missing/expired verification, consent/suppression, identity, idempotency, human hash binding, unknown delivery, fake provider, bounded lifecycle preparation.
- Seven new PostgreSQL tests: RLS/service-only access, canonical recipient/workspace, deduplication, all human decisions, connection/manual test gates, claim tokens, ambiguity, current consent/template checks, suppression and global/recipient quotas. Positive provider records are local fixtures, not real mail evidence.
- Review UI component smoke: all five actions, required reasons, retained edits, history, source fields and mobile. API methods are fixtures; no provider request or email occurs.
- Build and affected existing growth-unit tests pass. The previously passed Phase 2/application suites were preserved rather than rebuilt.
- Hosted RLS/Auth, live OAuth/scopes, actual self-test/delivery, multi-process hosted race/load behavior, bounce/webhook processing, sender-reputation monitoring and legal review remain unverified.

No production deployment, billing integration, synthetic operational data migration or actual email sending occurred.

## External connection verification — 2026-10-24 (latest scope)

This section supersedes the earlier automatic-send enablement instructions for this verification task. **Do not run `--message`, enable the database runtime, set NEXOPS_GMAIL_SEND_ENABLED=true, or begin general sending.** Current task authorizes only a later restricted approved-recipient test after connection and policy checks pass. No production deployment or billing change is authorized.

### Observed external status
- Hosted Supabase: BLOCKED. Runtime has neither VITE_SUPABASE_URL nor VITE_SUPABASE_ANON_KEY; saved environment draft lists them only as pending. No configured administrative access/selected development reference. Read-only preflight exited 2 with zero network requests. No remote migration status was inferred, and no migration was applied.
- Gmail OAuth/token refresh: BLOCKED, not attempted against Google. All required server credentials are absent. Connection worker invoked with EMAIL_SEND_MODE=draft_only exited 2 before external requests.
- Sender identity/approved address: UNVERIFIED. No configured GMAIL_SENDER_EMAIL or independently approved test recipient was available.
- Test messages sent: **0** for Welcome Email, 24-hour Activation Reminder, Consultation Confirmation and Workspace Invitation. No real provider receipt/delivery/audit record was produced.
- Template loading, consent/suppression, deduplication, review/audit and RLS: local tests only; hosted verification remains unrun.

### Important mode/template compatibility blockers
The existing worker **does not read/enforce EMAIL_SEND_MODE**. Setting draft_only alone is not a safety boundary; leave both existing send-enable gates disabled and run only `--verify-connection`. The existing worker has no test_recipient mode or independent approved-recipient allowlist. Therefore changing that variable to test_recipient does **not** authorize or safely restrict `--message`; do not use that command for the requested test phase. No mode implementation was added in this external-verification-only task.

Welcome and activation_reminder exist as draft registry entries; activation timing belongs to the existing lifecycle eligibility logic. Consultation **reminder** is not Consultation **Confirmation**. Consultation Confirmation and Workspace Invitation are not current approved registry templates. Do not substitute similar templates or silently register/approve new copy. Future scoped implementation/review is needed for these two templates and enforced modes before the four-message external test can proceed. Existing one-recipient-per-24-hour cap also prevents all four tests to the same recipient in one day; preserve that cap and schedule separately rather than bypass it. The first-send self-addressed sender-test gate remains in force; an independently approved recipient is not automatically equivalent to the sender.

### Explicit safety and unknown-delivery regression results
`node --test tests/external-verification.test.js tests/outbound.test.js`: 28/28 passed. All requested compensation, refund, damages, legal liability, contract changes, price changes, PO quantity changes, supplier changes, expedite costs, unsupported claims and uncertain free-form AI examples returned HUMAN_REVIEW_REQUIRED or BLOCKED, never AUTO_SEND_ALLOWED. Unsubscribed, suppressed, category opt-out and duplicate cases were BLOCKED. Optional uncertain AI classification also required review. These are bounded regression examples, not exhaustive legal-language coverage.

Timeout, missing provider-confirmation and lost-success-audit-response simulations return the existing internal status `delivery_unknown` (the semantic **UNKNOWN_DELIVERY** outcome requested), retain the no_automatic_retry flag, and refuse a second send. No enum/schema was renamed. Provider interactions and delivery records in these tests are fixtures, not evidence of Gmail connectivity. Existing adapter tests separately verify account mismatch denial and a simulated send transport.

### Exact configuration still needed
Configure settings through Cloud Environment secure settings, never paste credentials into chat or VITE-prefixed secrets:
- Browser: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the confirmed development project.
- Worker: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXOPS_DEV_PROJECT_REF.
- Schema administration: authenticated Supabase CLI via SUPABASE_ACCESS_TOKEN plus project linkage/database password (SUPABASE_DB_PASSWORD), or a secure development database connection (SUPABASE_DB_URL), or owner SQL Editor access. The service key alone does not permit migration DDL. Inspect `supabase/hosted_catalog_inventory.sql` and migration history before selecting missing migrations 001–003; follow `docs/HOSTED_SUPABASE_VERIFICATION.md`.
- Gmail server: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL. Obtain the dedicated account's offline grant with verified gmail.send and gmail.metadata scopes through a reviewed OAuth flow. Never log tokens. Approve the exact sender independently of the profile response.
- Message origin: VITE_PUBLIC_SITE_URL, an approved HTTPS origin.
- Safety intent: EMAIL_SEND_MODE=draft_only; NEXOPS_GMAIL_SEND_ENABLED=false; database runtime disabled. Neither absent mode configuration nor a variable alone establishes enforcement.
- Test recipient: supply an explicitly owner-approved Nexops address securely. NEXOPS_GMAIL_TEST_RECIPIENT is a proposed configuration name, **not currently consumed/enforced**; its presence alone must never enable sending.
- Development test users: two separately confirmed accounts with independent organizations, controlled test mail delivery and approved invitation recipient. Auth confirmation/invitation tests must not create unintended mail.

Allow only the selected development project hostname, oauth2.googleapis.com and gmail.googleapis.com in environment egress rules, preserving existing rules. Restart/recreate the Cloud Environment after saving runtime settings so they are actually injected; pending declarations do not configure the running process. Run the read-only preflight and connection worker first. Do not switch modes or send until enforcement, template approvals, reviewer assignment, recipient approval, required self-test gates and hosted RLS are verified.

Local PostgreSQL foundation + outbound suites passed 17/17 during this verification, including cross-organization denial, invitation permissions, review/history, default-deny RLS, fresh consent, suppression, atomic duplicate/rate checks and unknown-delivery holds. Hosted policies and real Gmail audit logging remain UNRUN. No runtime/schema/UI implementation changed in this verification; only tests and reports were added/updated.
