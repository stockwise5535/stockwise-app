# Growth analytics contract

English-speaking APAC; consultation-led inbound. Primary KPI: distinct Activated Users. No growth outcome is promised. Supabase owns product accounts and essential activation records; PostHog is an optional consent-gated analytics destination. CRM receives only qualified exports.

| Event | Definition / source |
| --- | --- |
| homepage_view | English/Japanese landing rendered; PostHog only with analytics consent. |
| signup_started | Signup CTA or form submitted. Count unique visitors in funnels, not raw repeated clicks. |
| signup_completed | Auth created the account; authoritative SQL signup trigger. PostHog client records successful signup response separately (not proof of verified email). |
| login_completed | Successful sign-in / authenticated growth session; backend role checked. |
| demo_workspace_opened | Explicitly synthetic product workspace opened. |
| today_viewed | Existing TODAY screen mounted. |
| exception_opened | Existing exception detail opened. No exception content/ID is sent to PostHog. |
| recommended_action_viewed | Detail with visible recommended next action rendered. Combined with TODAY and exception open defines first value. |
| csv_upload_started | Legacy CSV selection; no filename or file contents. |
| csv_upload_completed | Legacy accepted local parsing/import update. Not a claim of new workspace ingestion or validated durable customer data. |
| consultation_clicked | Consultation navigation/calendar intent. |
| consultation_submitted | Supabase committed a private request; server event is idempotent with request UUID. |
| consultation_booked | Reserved for confirmed scheduling; **never emitted by a link click or form submission**. |
| user_returned | Server detects a new authenticated growth session after activity on a previous UTC day. No fabricated return rate. |
| activation_completed | Server sets activated_at once after TODAY + exception + recommended action. Optional client PostHog event is session-deduplicated; use distinct users, not raw count. |
| supplier_monitoring_viewed | Existing supplier screen rendered. |
| invite_sent | A private invite link was generated, not an email sent. |
| invite_accepted | Authenticated, email-confirmed user redeemed an unexpired invite; idempotent per invite. |

## Properties and privacy
Only allowlisted short strings: locale, market, workspace_type, data_mode, screen, referral_source. No email, name, company text, tokens, passwords, user-entered notes, SKU names, files or operational payloads. The authenticated UUID is a pseudonymous analytics distinct ID after consent. `$identify` links the consenting anonymous ID to that UUID; sign-out clears local analytics identity. No autocapture, session replay or fingerprinting SDK is installed. Event failures do not block product use.

Consent defaults to off. The small capture adapter posts to PostHog's `/capture/` API using a **public project key**, with cookies omitted. No actual PostHog key is configured/tested against a live project. A declined consent is retained locally. Essential per-user activation metadata remains in Supabase to provide onboarding; legal basis and policy need owner review before launch.

## Activation and scope
Activated = all three required server timestamps exist for a user/workspace. Stronger CSV activation is reserved for a customer workspace with a validated import record; demo or unvalidated CSV events are rejected. Current legacy CSV functionality is not yet a validated workspace ingestion service, so do not claim stronger durable data activation from it. Standalone public demo interaction remains public/anonymous; confirmed growth sessions save activation metadata but never save synthetic exception/action contents.

Client analytics and interaction events are self-reported signals, not authorization, billing proof or audit-grade commercial outcomes. Repeated screen tracking in one mounted workspace is deduplicated. SQL activation event is emitted exactly once per user/workspace. Do not infer a booked consultation or sales conversion from intent.

## Funnels / PostHog configuration
Use distinct persons in a common time window and filter bots/internal tests after configuring the project:
1. homepage_view → signup_started → signup_completed.
2. signup_completed → demo_workspace_opened → today_viewed → exception_opened → recommended_action_viewed → activation_completed.
3. activation_completed → csv_upload_completed (filter `workspace_type=legacy` until customer ingestion exists; do not blend with validated-import KPI).
4. activation_completed → consultation_submitted → consultation_booked (last stage unconfigured).

Internal `/growth?view=dashboard` calls a growth-admin-only SQL aggregate. Visitors/signup starts are null because the backend does not impersonate visitor tracking. Backend activation/CSV/consultation conversion denominators count distinct users/intersections, not raw events or lead rows. PostHog visitor attribution is a separate source; never divide unrelated cohort/time-window totals. Product-user CSV uploads do not create CRM contacts automatically.

The SQL query set `supabase/weekly_growth_report.sql` is for authorized SQL/admin execution and supplies weekly new/activated/return/CSV/consultation counts, locale/source, screen and drop-off context. It is not exposed to ordinary members. No sample metrics are substituted when connections are unavailable.
