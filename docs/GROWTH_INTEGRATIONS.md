# Manual connections and operating requirements

## Supabase (required to persist real accounts)
Create/select a **development** Supabase project. Configure email/password Auth, Site URL and redirect allowlist for the actual development origin. Keep email confirmation enabled for private workspaces. Configure delivery/rate limits/captcha as appropriate; do not disable confirmation just to make a test pass. Registration can open the public sample demo while confirmation is pending; private workspace bootstrap requires confirmed sign-in.

Apply migrations `202610240001_growth_foundation.sql` then `202610240002_growth_lifecycle.sql` to a reviewed development database using Supabase CLI migrations or the authenticated SQL editor. Do not reapply the legacy SUPABASE_SQL.sql or reset an existing database. Verify the existing signup trigger and auth flows alongside the new additive trigger. Apply no migration to production without separate authorization.

Provide `VITE_SUPABASE_URL` and the public anon/publishable client key as `VITE_SUPABASE_ANON_KEY` in environment settings. Neither is supplied now. Allow the **specific project hostname** in the cloud network policy; do not replace other allowed domains. Never place a service-role key in VITE_ variables. Run hosted Auth/PostgREST/RLS checks with two distinct real test accounts and a viewer before claiming a configured integration. Local tests emulate Auth/PostgREST but execute real PostgreSQL/RLS logic.

Assign a growth administrator through owner-controlled SQL: `insert into public.nexops_growth_admins(user_id) values ('<verified-admin-user-uuid>');`. Never expose that write as a client UI. No growth-admin membership is automatically granted. Workspace owner is not global growth admin.

Customer operational tables are reserved and client writes are denied. Customer-mode triggers and composite foreign keys protect the future import/action chain. No demo rows are migrated. A real customer import/validation service and server-side commercial approval transitions still need a future implementation; the existing operational demo remains browser-local.

## PostHog
Create the project in the chosen region. Set public `VITE_POSTHOG_KEY` and HTTPS `VITE_POSTHOG_HOST` (the code defaults to https://us.i.posthog.com). Allow the actual configured ingest hostname if network policy requires it. No personal API key is needed in the browser. Optional analytics remain off until consent. Configure funnels using GROWTH_ANALYTICS_EVENTS.md, validate actual ingestion in staging, and document retention/privacy settings. No live project is connected.

## Gmail / lifecycle preparation
The code provides server-only email templates and a **draft-only** Gmail adapter. Nothing sends emails, runs a scheduled job or stores OAuth tokens client-side.

1. In an owner-controlled Google Cloud project, enable Gmail API, configure OAuth consent and an approved HTTPS redirect URI for a future server OAuth endpoint.
2. Connect the dedicated Nexops Gmail account with the minimum appropriate draft-composition scope (gmail.compose); store client secret and refresh/access tokens in a server secret store. Values must never appear in chat, browser code or VITE_ variables.
3. Wire a reviewed server `getAccessToken()` callback into `createGmailDraftAdapter`. The OAuth callback/refresh implementation is **not** provided or deployed here. Document consent-screen verification/testing-user restrictions as needed.
4. For an explicitly chosen campaign start, a trusted service-role scheduler can call `nexops_prepare_lifecycle(start_timestamp)`. It prepares drafts only for confirmed registered contacts in that cohort; marketing reminders require opt-in. The unique user/kind key prevents repeats. Welcome is transactional; pilot follow-up remains manual.
5. Before each real draft/send, re-read consent, deletion state and current activation to cancel obsolete reminders. Template eligibility is rechecked by lifecycleDraft; a future dispatcher must also handle provider idempotency, retries, bounces, unsubscribe and delivery audit.
6. Add an authenticated operator review flow before enabling any actual sender. No bulk unsolicited outreach or external critical instructions are implemented.

Rules prepared: welcome; 24h inactive reminder; 72h activated/no CSV reminder; one consultation-click/no-submission reminder; manual pilot follow-up. A queued draft is not a delivery claim. Users opt out in `/growth?view=account`; pending marketing drafts are cancelled. No real account has been emailed.

## Google Calendar
Create the appointment schedule in the dedicated account, configure availability/timezone and copy its real booking link into `VITE_BOOKING_URL`. Only configured HTTPS calendar.google.com or calendar.app.google links are used. Without it, the consultation request form persists intent in Supabase; a request does not confirm a booking or send a notification automatically. Consultation requests need an operator to review them in-app until a separate routing service is connected. A future verified Calendar webhook/operator confirmation is required before emitting consultation_booked. No booking URL is invented and no Calendar account is connected.

## CRM
Product users stay in Supabase. Only qualification statuses Qualified Lead / Consultation / Pilot Candidate are exported. The UI has a formula-safe CSV export for authorized workspace operators; the server module defines CRM payload shape but performs no external upsert. Review the heuristic score before using exported contacts. To connect HubSpot later, provision a server-only private app/OAuth credential and define deduplication, allowed fields, consent and operator review. Do not enroll all registered users in CRM.

## Privacy, deletion and launch gates
Privacy/Terms routes are drafts. Set privacy contact, retention, controller/subprocessor details, acceptable use and governing terms before launch; no legal-compliance claim is made. Account deletion records an authenticated request, opts out and cancels pending communication. An administrator must verify identity, transfer/delete owned/shared organizations as appropriate, remove associated lead/event data under the approved retention policy, remove provider identifiers and finally delete the Auth account. Foreign keys intentionally prevent silently orphaning owned organizations; the request button does not assert that deletion already occurred.

No production deployment or full 10,000-user load test has occurred. Per-user bootstrap locks, indexed memberships/events and paginated future APIs prepare the structure; rate limits, spam controls, quotas, workload benchmarks, backup/restore, retention jobs and hosted security review remain required before a large campaign.
